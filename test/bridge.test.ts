import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  beginCollectionLoad,
  completeCollectionLoad,
  failCollectionLoad,
  initialCollectionState,
} from "../src/bridge"
import { SpotifyBridge } from "../src/bridge"
import type { PlaybackEvent, PlaybackHost } from "../src/player"
import type { SpotifyApiShape } from "../src/spotifyApi"

const fakePlayer = (): PlaybackHost => ({
  start: async () => ({
    output: "local",
    subscribe: () => () => void 0,
    play: async () => void 0,
    pause: async () => void 0,
    resume: async () => void 0,
    stop: async () => void 0,
    next: async () => void 0,
    previous: async () => void 0,
    close: async () => void 0,
  }),
})

describe("bridge collection state", () => {
  test("keeps existing data visible during refresh", () => {
    const current = {
      ...initialCollectionState<string>(),
      status: "ready" as const,
      items: ["old"],
    }

    expect(beginCollectionLoad(current, 2)).toEqual({
      status: "refreshing",
      items: ["old"],
      continuation: null,
      error: null,
      generation: 2,
      loadingMore: false,
    })
  })

  test("discards a stale completion", () => {
    const current = beginCollectionLoad(
      beginCollectionLoad(initialCollectionState<string>(), 1),
      2
    )

    expect(
      completeCollectionLoad(current, 1, { items: ["stale"], continuation: null })
    ).toBe(current)
  })

  test("retains items and continuation after a refresh failure", () => {
    const current = beginCollectionLoad(
      {
        ...initialCollectionState<string>(),
        status: "ready" as const,
        items: ["old"],
        continuation: { kind: "offset" as const, offset: 1, limit: 1 },
      },
      3
    )

    expect(failCollectionLoad(current, 3, "network")).toEqual({
      status: "error",
      items: ["old"],
      continuation: { kind: "offset", offset: 1, limit: 1 },
      error: "network",
      generation: 3,
      loadingMore: false,
    })
  })

  test("loads the authenticated library through the typed bridge", async () => {
    const bridge = new SpotifyBridge({
      credentials: { clientId: "client", refreshToken: "refresh" },
      refreshToken: async () => ({
        accessToken: "access",
        expiresAt: Date.now() + 60_000,
        refreshToken: null,
      }),
      api: {
        listPlaylists: () =>
          Effect.succeed({
            items: [{ kind: "playlist" as const, id: "playlist-1", name: "Mix", imageUrl: null, itemCount: 1 }],
            total: 1,
            continuation: null,
          }),
        listPlaylistItems: () => Effect.succeed({ items: [], total: 0, continuation: null }),
        listSavedTracks: () => Effect.succeed({ items: [], total: 0, continuation: null }),
        listSavedAlbums: () => Effect.succeed({ items: [], total: 0, continuation: null }),
        listFollowedArtists: () => Effect.succeed({ items: [], total: 0, continuation: null }),
        listAlbumTracks: () => Effect.succeed({ items: [], total: 0, continuation: null }),
      },
      player: fakePlayer(),
    })

    await bridge.start()

    expect(bridge.getSnapshot().auth).toBe("ready")
    expect(bridge.getSnapshot().collections.playlists.items).toEqual([
      { kind: "playlist", id: "playlist-1", name: "Mix", imageUrl: null, itemCount: 1 },
    ])
  })
})

describe("bridge playback", () => {
  const track = {
    kind: "track",
    id: "track-1",
    name: "Morning",
    uri: "spotify:track:track-1",
    durationMs: 240_000,
    artists: [{ kind: "artist", id: "artist-1", name: "Singer" }],
    album: null,
  } as const

  const baseApi = () =>
    ({
      listPlaylists: () =>
        Effect.succeed({
          items: [],
          total: 0,
          continuation: null,
        }),
      listPlaylistItems: () =>
        Effect.succeed({ items: [], total: 0, continuation: null }),
      listSavedTracks: () =>
        Effect.succeed({ items: [track], total: 1, continuation: null }),
      listSavedAlbums: () =>
        Effect.succeed({ items: [], total: 0, continuation: null }),
      listFollowedArtists: () =>
        Effect.succeed({ items: [], total: 0, continuation: null }),
      listAlbumTracks: () => Effect.succeed({ items: [], total: 0, continuation: null }),
    }) satisfies SpotifyApiShape

  const recordedPlayer = () => {
    const listeners: Array<(event: PlaybackEvent) => void> = []
    const calls: Array<{ method: string; args: unknown[] }> = []
    const host: PlaybackHost = {
      start: async () => {
        calls.push({ method: "start", args: [] })
        return {
          output: "local",
          subscribe: (listener) => {
            listeners.push(listener)
            return () => void 0
          },
          play: async (target) => void calls.push({ method: "play", args: [target] }),
          pause: async () => void calls.push({ method: "pause", args: [] }),
          resume: async () => void calls.push({ method: "resume", args: [] }),
          stop: async () => void calls.push({ method: "stop", args: [] }),
          next: async () => void calls.push({ method: "next", args: [] }),
          previous: async () => void calls.push({ method: "previous", args: [] }),
          close: async () => void calls.push({ method: "close", args: [] }),
        }
      },
    }
    return { host, listeners, calls }
  }

  const makeBridge = (api: SpotifyApiShape, player: PlaybackHost) => {
    const bridge = new SpotifyBridge({
      credentials: { clientId: "client", refreshToken: "refresh" },
      refreshToken: async () => ({
        accessToken: "access",
        expiresAt: Date.now() + 60_000,
        refreshToken: null,
      }),
      api,
      player,
    })
    return bridge
  }

  test("plays the selected track through the local session", async () => {
    const { host, calls } = recordedPlayer()
    const bridge = makeBridge(baseApi(), host)

    await bridge.start()
    bridge.selectCollection("saved-tracks")
    await bridge.playSelected()

    expect(calls).toEqual([
      { method: "start", args: [] },
      { method: "play", args: [{ uris: ["spotify:track:track-1"] }] },
    ])
    expect(bridge.getSnapshot().playback.status).toBe("loading")
  })

  test("resolves an album into its tracks and plays them", async () => {
    const albumTrack = {
      kind: "track",
      id: "album-track-1",
      name: "Opening",
      uri: "spotify:track:album-track-1",
      durationMs: 180_000,
      artists: [],
      album: null,
    } as const
    const api = {
      ...baseApi(),
      listSavedAlbums: () =>
        Effect.succeed({
          items: [
            {
              kind: "album",
              id: "album-1",
              name: "The Album",
              artists: [],
              imageUrl: null,
            },
          ],
          total: 1,
          continuation: null,
        }),
      listAlbumTracks: (_token: string, albumId: string) => {
        expect(albumId).toBe("album-1")
        return Effect.succeed({
          items: [albumTrack],
          total: 1,
          continuation: null,
        })
      },
    } satisfies SpotifyApiShape
    const { host, calls } = recordedPlayer()
    const bridge = makeBridge(api, host)

    await bridge.start()
    bridge.selectCollection("saved-albums")
    await bridge.playSelected()

    expect(calls).toEqual([
      { method: "start", args: [] },
      { method: "play", args: [{ uris: ["spotify:track:album-track-1"] }] },
    ])
  })

  test("reports an error for unplayable selections", async () => {
    const api = {
      ...baseApi(),
      listFollowedArtists: () =>
        Effect.succeed({
          items: [{ kind: "artist", id: "artist-1", name: "Singer" }],
          total: 1,
          continuation: null,
        }),
    } satisfies SpotifyApiShape
    const bridge = makeBridge(api, recordedPlayer().host)

    await bridge.start()
    bridge.selectCollection("followed-artists")
    await bridge.playSelected()

    expect(bridge.getSnapshot().playback.status).toBe("error")
    expect(bridge.getSnapshot().playback.error).toContain("cannot be played")
  })

  test("asks the user to open a playlist before playing it", async () => {
    const api = {
      ...baseApi(),
      listPlaylists: () =>
        Effect.succeed({
          items: [
            { kind: "playlist", id: "playlist-1", name: "Mix", imageUrl: null, itemCount: 3 },
          ],
          total: 1,
          continuation: null,
        }),
    } satisfies SpotifyApiShape
    const bridge = makeBridge(api, recordedPlayer().host)

    await bridge.start()
    bridge.selectCollection("playlists")
    await bridge.playSelected()

    expect(bridge.getSnapshot().playback.status).toBe("error")
    expect(bridge.getSnapshot().playback.error).toContain("Open the playlist first")
  })

  test("pauses through the host when playing", async () => {
    const { host, listeners, calls } = recordedPlayer()
    const bridge = makeBridge(baseApi(), host)

    await bridge.start()
    bridge.selectCollection("saved-tracks")
    await bridge.playSelected()
    listeners[0]!({
      type: "playing",
      uri: null,
      title: null,
      artist: null,
      album: null,
      positionMs: null,
      durationMs: null,
      message: null,
    })

    await bridge.togglePlayback()
    listeners[0]!({
      type: "paused",
      uri: null,
      title: null,
      artist: null,
      album: null,
      positionMs: 1200,
      durationMs: null,
      message: null,
    })

    expect(calls.map((call) => call.method)).toEqual([
      "start",
      "play",
      "pause",
    ])
    expect(bridge.getSnapshot().playback.status).toBe("paused")
  })

  test("tracks now playing from the host events", async () => {
    const { host, listeners } = recordedPlayer()
    const bridge = makeBridge(baseApi(), host)

    await bridge.start()
    bridge.selectCollection("saved-tracks")
    await bridge.playSelected()
    listeners[0]!({
      type: "playing",
      uri: "spotify:track:track-1",
      title: "Morning",
      artist: "Singer",
      album: null,
      positionMs: 1000,
      durationMs: 240_000,
      message: null,
    })

    expect(bridge.getSnapshot().playback.status).toBe("playing")
    expect(bridge.getSnapshot().playback.track).toEqual({
      uri: "spotify:track:track-1",
      title: "Morning",
      artist: "Singer",
    })
  })
})
