import { DateTime, Effect } from "effect"
import type { SpotifyCredentials } from "./config"
import type { BearerToken } from "./auth"
import type { Continuation, LibraryCollection, Page, PlaylistItem, PlaylistSummary, Track, Album, Artist } from "./domain"
import type { SpotifyApiShape } from "./spotifyApi"
import type { PlaybackEvent, PlaybackHandle, PlaybackHost } from "./player"

export type CollectionStatus = "idle" | "loading" | "refreshing" | "ready" | "error"

export interface CollectionState<T> {
  readonly status: CollectionStatus
  readonly items: readonly T[]
  readonly continuation: Continuation | null
  readonly error: string | null
  readonly generation: number
  readonly loadingMore: boolean
}

export const initialCollectionState = <T>(): CollectionState<T> => ({
  status: "idle",
  items: [],
  continuation: null,
  error: null,
  generation: 0,
  loadingMore: false,
})

export const beginCollectionLoad = <T>(
  state: CollectionState<T>,
  generation: number
): CollectionState<T> => ({
  ...state,
  status: state.items.length > 0 ? "refreshing" : "loading",
  error: null,
  generation,
  loadingMore: false,
})

export const completeCollectionLoad = <T>(
  state: CollectionState<T>,
  generation: number,
  page: Pick<Page<T>, "items" | "continuation">
): CollectionState<T> =>
  state.generation !== generation
    ? state
    : {
        ...state,
        status: "ready",
        items: page.items,
        continuation: page.continuation,
        error: null,
        loadingMore: false,
      }

export const failCollectionLoad = <T>(
  state: CollectionState<T>,
  generation: number,
  error: string
): CollectionState<T> =>
  state.generation !== generation
    ? state
    : {
        ...state,
        status: "error",
        error,
        loadingMore: false,
      }

export const beginLoadMore = <T>(state: CollectionState<T>) =>
  state.loadingMore || state.continuation === null
    ? state
    : { ...state, loadingMore: true, error: null }

export const completeLoadMore = <T>(
  state: CollectionState<T>,
  page: Pick<Page<T>, "items" | "continuation">
): CollectionState<T> => ({
  ...state,
  status: "ready",
  items: [...state.items, ...page.items],
  continuation: page.continuation,
  error: null,
  loadingMore: false,
})

export const failLoadMore = <T>(state: CollectionState<T>, error: string) => ({
  ...state,
  error,
  loadingMore: false,
})

export type BridgeCollection =
  | PlaylistSummary
  | Track
  | Album
  | Artist
  | PlaylistItem

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error"

export interface NowPlaying {
  readonly uri: string | null
  readonly title: string | null
  readonly artist: string | null
}

export interface PlaybackState {
  readonly status: PlaybackStatus
  readonly track: NowPlaying | null
  readonly error: string | null
  readonly output: "local" | "none"
}

export interface BridgeSnapshot {
  readonly auth: "loading" | "login" | "ready" | "error"
  readonly authError: string | null
  readonly activeCollection: LibraryCollection
  readonly selectedIndex: number
  readonly playlistId: string | null
  readonly playlistItems: CollectionState<PlaylistItem> | null
  readonly playback: PlaybackState
  readonly collections: {
    readonly playlists: CollectionState<PlaylistSummary>
    readonly "saved-tracks": CollectionState<Track>
    readonly "saved-albums": CollectionState<Album>
    readonly "followed-artists": CollectionState<Artist>
  }
}

export interface BridgeDependencies {
  readonly credentials: SpotifyCredentials
  readonly refreshToken: (
    credentials: SpotifyCredentials
  ) => Promise<BearerToken>
  readonly persistCredentials?: (credentials: SpotifyCredentials) => Promise<void>
  readonly api: SpotifyApiShape
  readonly player: PlaybackHost
  readonly deviceName?: string
  readonly deviceId?: string
}

const initialSnapshot = (): BridgeSnapshot => ({
  auth: "loading",
  authError: null,
  activeCollection: "playlists",
  selectedIndex: 0,
  playlistId: null,
  playlistItems: null,
  playback: {
    status: "idle",
    track: null,
    error: null,
    output: "local",
  },
  collections: {
    playlists: initialCollectionState(),
    "saved-tracks": initialCollectionState(),
    "saved-albums": initialCollectionState(),
    "followed-artists": initialCollectionState(),
  },
})

export class SpotifyBridge {
  private snapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()
  private token: BearerToken | null = null
  private tokenRefresh: Promise<BearerToken> | null = null
  private generation = 0
  private viewGeneration = 0
  private playbackHandle: PlaybackHandle | null = null
  private credentials: SpotifyCredentials

  constructor(private readonly dependencies: BridgeDependencies) {
    this.credentials = dependencies.credentials
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update = (update: (current: BridgeSnapshot) => BridgeSnapshot) => {
    this.snapshot = update(this.snapshot)
    for (const listener of this.listeners) listener()
  }

  private accessToken = async () => {
    if (this.token && this.token.expiresAt > DateTime.nowUnsafe().epochMilliseconds + 30_000) return this.token.accessToken
    if (!this.tokenRefresh) {
      this.tokenRefresh = this.dependencies.refreshToken(this.credentials).finally(() => {
        this.tokenRefresh = null
      })
    }
    const nextToken = await this.tokenRefresh
    if (nextToken.refreshToken && nextToken.refreshToken !== this.credentials.refreshToken) {
      const nextCredentials = {
        ...this.credentials,
        refreshToken: nextToken.refreshToken,
      }
      this.credentials = nextCredentials
      await this.dependencies.persistCredentials?.(nextCredentials).catch(() => undefined)
    }
    this.token = nextToken
    return this.token.accessToken
  }

  start = async () => {
    this.update((current) => ({ ...current, auth: "loading", authError: null }))
    try {
      await this.accessToken()
      this.update((current) => ({ ...current, auth: "ready" }))
      await Promise.all([
        this.loadCollection("playlists"),
        this.loadCollection("saved-tracks"),
        this.loadCollection("saved-albums"),
        this.loadCollection("followed-artists"),
      ])
    } catch (error) {
      this.update((current) => ({
        ...current,
        auth: "error",
        authError: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  selectCollection = (collection: LibraryCollection) =>
    this.update((current) => {
      this.generation += 1
      this.viewGeneration += 1
      return {
        ...current,
        activeCollection: collection,
        selectedIndex: 0,
        playlistId: null,
        playlistItems: null,
      }
    })

  moveSelection = (delta: -1 | 1) =>
    this.update((current) => {
      const items = current.playlistItems?.items ?? current.collections[current.activeCollection].items
      const next = items.length === 0 ? 0 : (current.selectedIndex + delta + items.length) % items.length
      return { ...current, selectedIndex: next }
    })

  back = () =>
    this.update((current) => {
      this.generation += 1
      this.viewGeneration += 1
      return {
        ...current,
        playlistId: null,
        playlistItems: null,
        selectedIndex: 0,
      }
    })

  openSelected = async () => {
    const current = this.snapshot
    if (current.playlistId === null && current.activeCollection === "playlists") {
      const playlist = current.collections.playlists.items[current.selectedIndex]
      if (playlist) {
        const generation = ++this.generation
        const viewGeneration = this.viewGeneration
        this.update((state) => ({ ...state, playlistId: playlist.id, playlistItems: beginCollectionLoad(initialCollectionState(), generation) }))
        try {
          const page = await this.runApi((api, token) => api.listPlaylistItems(token, playlist.id))
          this.update((state) =>
            this.viewGeneration === viewGeneration && state.playlistId === playlist.id && state.playlistItems
              ? { ...state, playlistItems: completeCollectionLoad(state.playlistItems, generation, page) }
              : state
          )
        } catch (error) {
          this.update((state) =>
            this.viewGeneration === viewGeneration && state.playlistId === playlist.id && state.playlistItems
              ? { ...state, playlistItems: failCollectionLoad(state.playlistItems, generation, String(error)) }
              : state
          )
        }
        return
      }
    }
    await this.playSelected()
  }

  private playbackDeviceId = () => this.dependencies.deviceId ?? "spotui-local"

  private playbackDeviceName = () => this.dependencies.deviceName ?? "SpotUI"

  private updatePlayback = (patch: Partial<PlaybackState>) =>
    this.update((current) => ({
      ...current,
      playback: { ...current.playback, ...patch },
    }))

  private ensurePlaybackDevice = async () => {
    const deviceId = this.playbackDeviceId()
    if (!this.playbackHandle) {
      const token = await this.accessToken()
      const handle = await this.dependencies.player.start({
        accessToken: token,
        clientId: this.credentials.clientId,
        deviceName: this.playbackDeviceName(),
        deviceId,
      })
      this.playbackHandle = handle
      handle.subscribe(this.handlePlaybackEvent)
      if (handle.output === "none") {
        this.updatePlayback({
          error: "No local PCM player found (install pacat or aplay); audio will be silent.",
        })
      }
    }
    return deviceId
  }

  private playableTarget = (
    current: BridgeSnapshot
  ): { contextUri?: string; uris?: string[] } | null => {
    if (current.playlistId !== null && current.playlistItems) {
      const item = current.playlistItems.items[current.selectedIndex]
      if (item?.kind === "track" && item.uri) return { uris: [item.uri] }
      return null
    }
    const item = current.collections[current.activeCollection].items[current.selectedIndex]
    if (!item) return null
    if (item.kind === "track" && "uri" in item && item.uri) return { uris: [item.uri] }
    if (item.kind === "playlist") return { contextUri: `spotify:playlist:${item.id}` }
    if (item.kind === "album" && item.id) return { contextUri: `spotify:album:${item.id}` }
    return null
  }

  playSelected = async () => {
    if (this.snapshot.auth !== "ready") return
    const body = this.playableTarget(this.snapshot)
    if (!body) {
      this.updatePlayback({
        status: "error",
        error: "The selected item cannot be played from here.",
      })
      return
    }
    try {
      const deviceId = await this.ensurePlaybackDevice()
      this.updatePlayback({ status: "loading", error: null })
      await this.runApi((api, token) =>
        api.play(token, { deviceId, ...body })
      )
    } catch (error) {
      this.playbackHandle = null
      this.updatePlayback({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  pausePlayback = async () => {
    try {
      await this.runApi((api, token) =>
        api.pause(token, this.playbackDeviceId())
      )
      this.updatePlayback({ status: "paused" })
    } catch (error) {
      this.updatePlayback({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  resumePlayback = async () => {
    try {
      const deviceId = await this.ensurePlaybackDevice()
      await this.runApi((api, token) => api.play(token, { deviceId }))
    } catch (error) {
      this.playbackHandle = null
      this.updatePlayback({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  togglePlayback = async () => {
    if (this.snapshot.playback.status === "playing") return this.pausePlayback()
    if (this.snapshot.playback.status === "paused") return this.resumePlayback()
    return this.playSelected()
  }

  stopPlayback = async () => {
    try {
      await this.runApi((api, token) =>
        api.pause(token, this.playbackDeviceId())
      )
    } catch (error) {
      void error
    }
    this.updatePlayback({ status: "idle", track: null, error: null })
  }

  nextTrack = async () => {
    try {
      const deviceId = await this.ensurePlaybackDevice()
      await this.runApi((api, token) => api.next(token, deviceId))
    } catch (error) {
      this.playbackHandle = null
      this.updatePlayback({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  previousTrack = async () => {
    try {
      const deviceId = await this.ensurePlaybackDevice()
      await this.runApi((api, token) => api.previous(token, deviceId))
    } catch (error) {
      this.playbackHandle = null
      this.updatePlayback({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private handlePlaybackEvent = (event: PlaybackEvent) => {
    const nowPlaying = {
      uri: event.uri,
      title: event.title,
      artist: event.artist,
    }
    switch (event.type) {
      case "loading":
        this.updatePlayback({ status: "loading", error: null, track: nowPlaying })
        return
      case "playing":
        this.updatePlayback({ status: "playing", error: null, track: nowPlaying })
        return
      case "paused":
        this.updatePlayback({ status: "paused", track: nowPlaying })
        return
      case "stopped":
        this.updatePlayback({ status: "idle", error: null })
        return
      case "end_of_track":
        this.updatePlayback({ status: "idle" })
        return
      case "error":
        this.playbackHandle = null
        this.updatePlayback({
          status: "error",
          error: event.message ?? "Playback failed.",
          track: nowPlaying,
        })
    }
  }

  loadMore = async () => {
    const current = this.snapshot
    if (current.playlistItems) {
      if (current.playlistItems.continuation === null || current.playlistItems.loadingMore || current.playlistId === null) return
      const playlistId = current.playlistId
      const continuation = current.playlistItems.continuation
      const viewGeneration = this.viewGeneration
      this.update((state) => ({ ...state, playlistItems: beginLoadMore(state.playlistItems!) }))
      try {
        const page = await this.runApi((api, token) => api.listPlaylistItems(token, playlistId, continuation))
        this.update((state) =>
          this.viewGeneration === viewGeneration && state.playlistId === playlistId && state.playlistItems
            ? { ...state, playlistItems: completeLoadMore(state.playlistItems, page) }
            : state
        )
      } catch (error) {
        this.update((state) =>
          this.viewGeneration === viewGeneration && state.playlistId === playlistId && state.playlistItems
            ? { ...state, playlistItems: failLoadMore(state.playlistItems, String(error)) }
            : state
        )
      }
      return
    }
    const collection = current.activeCollection
    const state = current.collections[collection] as CollectionState<any>
    if (state.continuation === null || state.loadingMore) return
    this.update((snapshot) => ({ ...snapshot, collections: { ...snapshot.collections, [collection]: beginLoadMore(snapshot.collections[collection] as CollectionState<any>) } }))
    try {
      const page = await this.runCollectionApi(collection, state.continuation)
      this.update((snapshot) => ({ ...snapshot, collections: { ...snapshot.collections, [collection]: completeLoadMore(snapshot.collections[collection] as CollectionState<any>, page) } }))
    } catch (error) {
      this.update((snapshot) => ({ ...snapshot, collections: { ...snapshot.collections, [collection]: failLoadMore(snapshot.collections[collection] as CollectionState<any>, String(error)) } }))
    }
  }

  refresh = async () => {
    if (this.snapshot.playlistId && this.snapshot.playlistItems) {
      const playlistId = this.snapshot.playlistId
      const generation = ++this.generation
      const viewGeneration = this.viewGeneration
      this.update((state) => ({
        ...state,
        playlistItems: beginCollectionLoad(state.playlistItems!, generation),
      }))
      try {
        const page = await this.runApi((api, token) => api.listPlaylistItems(token, playlistId))
        this.update((state) =>
          this.viewGeneration === viewGeneration && state.playlistId === playlistId && state.playlistItems
            ? { ...state, playlistItems: completeCollectionLoad(state.playlistItems, generation, page) }
            : state
        )
      } catch (error) {
        this.update((state) =>
          this.viewGeneration === viewGeneration && state.playlistId === playlistId && state.playlistItems
            ? { ...state, playlistItems: failCollectionLoad(state.playlistItems, generation, String(error)) }
            : state
        )
      }
      return
    }
    const collection = this.snapshot.activeCollection
    await this.loadCollection(collection)
  }

  private loadCollection = async (collection: LibraryCollection) => {
    const generation = ++this.generation
    const viewGeneration = this.viewGeneration
    this.update((snapshot) => ({
      ...snapshot,
      collections: {
        ...snapshot.collections,
        [collection]: beginCollectionLoad(snapshot.collections[collection] as CollectionState<any>, generation),
      },
    }))
    try {
      const page = await this.runCollectionApi(collection)
      this.update((snapshot) => this.viewGeneration === viewGeneration ? {
        ...snapshot,
        collections: {
          ...snapshot.collections,
          [collection]: completeCollectionLoad(snapshot.collections[collection] as CollectionState<any>, generation, page),
        },
      } : snapshot)
    } catch (error) {
      this.update((snapshot) => this.viewGeneration === viewGeneration ? {
        ...snapshot,
        collections: {
          ...snapshot.collections,
          [collection]: failCollectionLoad(snapshot.collections[collection] as CollectionState<any>, generation, String(error)),
        },
      } : snapshot)
    }
  }

  private runApi = async <A>(
    operation: (api: SpotifyApiShape, token: string) => Effect.Effect<A, unknown>
  ) => {
    const execute = async () => operation(this.dependencies.api, await this.accessToken()).pipe(Effect.runPromise)
    try {
      return await execute()
    } catch (error) {
      if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 401) {
        this.token = null
        return execute()
      }
      throw error
    }
  }

  private runCollectionApi = (collection: LibraryCollection, continuation?: Continuation | null) => {
    switch (collection) {
      case "playlists":
        return this.runApi((api, token) => api.listPlaylists(token, continuation))
      case "saved-tracks":
        return this.runApi((api, token) => api.listSavedTracks(token, continuation))
      case "saved-albums":
        return this.runApi((api, token) => api.listSavedAlbums(token, continuation))
      case "followed-artists":
        return this.runApi((api, token) => api.listFollowedArtists(token, continuation))
    }
  }
}
