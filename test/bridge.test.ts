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

const fakePlayer = () => ({
  start: async () => ({
    output: "local" as const,
    subscribe: () => () => {
      void 0
    },
    stop: async () => {
      void 0
    },
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
        listDevices: () => Effect.succeed([]),
        play: () => Effect.void,
        pause: () => Effect.void,
        next: () => Effect.void,
        previous: () => Effect.void,
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
      listDevices: () => Effect.succeed([]),
      play: () => Effect.void,
      pause: () => Effect.void,
      next: () => Effect.void,
      previous: () => Effect.void,
    }) satisfies SpotifyApiShape

  const trackedPlayer = () => {
    const starts: Array<{ accessToken: string; deviceId: string }> = []
    const listeners: Array<(event: PlaybackEvent) => void> = []
    const host: PlaybackHost = {
      start: async (input) => {
        starts.push({ accessToken: input.accessToken, deviceId: input.deviceId })
        return {
          output: "local",
          subscribe: (listener) => {
            listeners.push(listener)
            return () => void 0
          },
          stop: async () => void 0,
        }
      },
    }
    return { host, starts, listeners }
  }

  const makeBridge = (
    api: SpotifyApiShape,
    player: PlaybackHost,
    deviceId = "spotui-local"
  ) => {
    const bridge = new SpotifyBridge({
      credentials: { clientId: "client", refreshToken: "refresh" },
      deviceId,
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

  test("plays the selected track through the local device", async () => {
    const playCalls: Array<{
      readonly uris?: readonly string[]
      readonly contextUri?: string
      readonly deviceId?: string
    }> = []
    const api = {
      ...baseApi(),
      play: (
        _token: string,
        input: {
          readonly uris?: readonly string[]
          readonly contextUri?: string
          readonly deviceId?: string
        }
      ) => {
        playCalls.push(input)
        return Effect.void
      },
    } satisfies SpotifyApiShape
    const { host, starts } = trackedPlayer()
    const bridge = makeBridge(api, host)

    await bridge.start()
    bridge.selectCollection("saved-tracks")
    await bridge.playSelected()

    expect(starts).toEqual([{ accessToken: "access", deviceId: "spotui-local" }])
    expect(playCalls).toEqual([
      { deviceId: "spotui-local", uris: ["spotify:track:track-1"] },
    ])
    expect(bridge.getSnapshot().playback.status).toBe("loading")
  })

  test("plays an album as a context", async () => {
    const playCalls: Array<{
      readonly uris?: readonly string[]
      readonly contextUri?: string
      readonly deviceId?: string
    }> = []
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
      play: (
        _token: string,
        input: {
          readonly uris?: readonly string[]
          readonly contextUri?: string
          readonly deviceId?: string
        }
      ) => {
        playCalls.push(input)
        return Effect.void
      },
    } satisfies SpotifyApiShape
    const bridge = makeBridge(api, trackedPlayer().host)

    await bridge.start()
    bridge.selectCollection("saved-albums")
    await bridge.playSelected()

    expect(playCalls).toEqual([
      { deviceId: "spotui-local", contextUri: "spotify:album:album-1" },
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
    const bridge = makeBridge(api, trackedPlayer().host)

    await bridge.start()
    bridge.selectCollection("followed-artists")
    await bridge.playSelected()

    expect(bridge.getSnapshot().playback.status).toBe("error")
    expect(bridge.getSnapshot().playback.error).toContain("cannot be played")
  })

  test("toggles pause when the device is playing", async () => {
    const pauseCalls: string[] = []
    const api = {
      ...baseApi(),
      pause: (_token: string, deviceId: string) => {
        pauseCalls.push(deviceId)
        return Effect.void
      },
    } satisfies SpotifyApiShape
    const { host, listeners } = trackedPlayer()
    const bridge = makeBridge(api, host)

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

    expect(pauseCalls).toEqual(["spotui-local"])
    expect(bridge.getSnapshot().playback.status).toBe("paused")
  })

  test("tracks now playing from the device events", async () => {
    const { host, listeners } = trackedPlayer()
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
