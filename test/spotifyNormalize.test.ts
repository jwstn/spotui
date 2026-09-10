import { describe, expect, test } from "bun:test"
import {
  normalizeAlbum,
  normalizeArtist,
  normalizePlaylistItem,
  normalizeTrack,
  pageFromOffset,
  pageFromFollowing,
} from "../src/spotifyNormalize"

describe("Spotify response normalization", () => {
  test("normalizes a track into the application shape", () => {
    expect(
      normalizeTrack({
        id: "track-1",
        name: "Teardrop",
        uri: "spotify:track:track-1",
        duration_ms: 330000,
        artists: [{ id: "artist-1", name: "Massive Attack" }],
        album: {
          id: "album-1",
          name: "Mezzanine",
          images: [{ url: "https://example.com/cover.jpg" }],
        },
      })
    ).toEqual({
      kind: "track",
      id: "track-1",
      name: "Teardrop",
      uri: "spotify:track:track-1",
      durationMs: 330000,
      artists: [{ kind: "artist", id: "artist-1", name: "Massive Attack" }],
      album: {
        kind: "album",
        id: "album-1",
        name: "Mezzanine",
        artists: [],
        imageUrl: "https://example.com/cover.jpg",
      },
    })
  })

  test("preserves unavailable and unsupported playlist occurrences", () => {
    expect(
      [
        normalizePlaylistItem(
          { added_at: null, added_by: null, item: null },
          "playlist-1",
          3
        ),
        normalizePlaylistItem(
          {
            added_at: null,
            added_by: null,
            item: { type: "episode", id: "episode-1", name: "Episode" },
          },
          "playlist-1",
          4
        ),
      ]
    ).toEqual([
      {
        kind: "unavailable",
        key: "playlist-1:3",
        id: null,
        name: null,
        reason: "missing",
      },
      {
        kind: "episode",
        key: "playlist-1:4",
        id: "episode-1",
        name: "Episode",
      },
    ])
  })

  test("keeps offset and cursor continuation opaque to callers", () => {
    expect(
      pageFromOffset(
        [{ id: "album-1", name: "Album", artists: [], images: [] }],
        { offset: 0, limit: 1, total: 2 }
      ).continuation
    ).toEqual({ kind: "offset", offset: 1, limit: 1 })

    expect(
      pageFromFollowing(
        [normalizeArtist({ id: "artist-1", name: "Artist" })],
        { after: "artist-1", total: 2, limit: 1 }
      ).continuation
    ).toEqual({ kind: "cursor", after: "artist-1", limit: 1 })
  })

  test("normalizes an album and artist without profile data", () => {
    expect(
      normalizeAlbum({
        id: "album-1",
        name: "Mezzanine",
        artists: [{ id: "artist-1", name: "Massive Attack" }],
        images: [],
      })
    ).toEqual({
      kind: "album",
      id: "album-1",
      name: "Mezzanine",
      artists: [{ kind: "artist", id: "artist-1", name: "Massive Attack" }],
      imageUrl: null,
    })
  })
})
