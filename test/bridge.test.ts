import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  beginCollectionLoad,
  completeCollectionLoad,
  failCollectionLoad,
  initialCollectionState,
} from "../src/bridge"
import { SpotifyBridge } from "../src/bridge"

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
      },
    })

    await bridge.start()

    expect(bridge.getSnapshot().auth).toBe("ready")
    expect(bridge.getSnapshot().collections.playlists.items).toEqual([
      { kind: "playlist", id: "playlist-1", name: "Mix", imageUrl: null, itemCount: 1 },
    ])
  })
})
