import type {
  Album,
  Artist,
  EpisodeItem,
  Page,
  PlaylistItem,
  PlaylistSummary,
  Track,
} from "./domain"
import type {
  RawAlbum,
  RawArtist,
  RawPlaylist,
  RawPlaylistItem,
  RawTrack,
} from "./spotifySchemas"
import { Predicate } from "effect"

const firstImage = (images: readonly { readonly url: string }[] | undefined) =>
  images?.[0]?.url ?? null

export const normalizeArtist = (raw: RawArtist): Artist => ({
  kind: "artist",
  id: raw.id ?? null,
  name: raw.name,
})

export const normalizeAlbum = (raw: RawAlbum): Album => ({
  kind: "album",
  id: raw.id ?? null,
  name: raw.name,
  artists: (raw.artists ?? []).map(normalizeArtist),
  imageUrl: firstImage(raw.images),
})

export const normalizeTrack = (raw: RawTrack): Track => ({
  kind: "track",
  id: raw.id ?? null,
  name: raw.name,
  uri: raw.uri ?? null,
  durationMs: raw.duration_ms ?? null,
  artists: (raw.artists ?? []).map(normalizeArtist),
  album: raw.album ? normalizeAlbum(raw.album) : null,
})

export const normalizePlaylist = (raw: RawPlaylist): PlaylistSummary => ({
  kind: "playlist",
  id: raw.id,
  name: raw.name,
  imageUrl: firstImage(raw.images),
  itemCount: raw.tracks?.total ?? null,
})

export const normalizePlaylistItem = (
  raw: RawPlaylistItem,
  playlistId: string,
  position: number
): PlaylistItem => {
  const key = `${playlistId}:${position}`
  const item = raw.item ?? raw.track
  if (!Predicate.isObject(item)) {
    return { kind: "unavailable", key, id: null, name: null, reason: "missing" }
  }

  if (item.type === "episode") {
    return {
      kind: "episode",
      key,
      id: typeof item.id === "string" ? item.id : null,
      name: typeof item.name === "string" ? item.name : "Unavailable episode",
    } satisfies EpisodeItem
  }

  if (item.is_local === true || item.type === "local") {
    return {
      kind: "local",
      key,
      name: typeof item.name === "string" ? item.name : "Local file",
    }
  }

  if (typeof item.name === "string" && "artists" in item) {
    return { ...normalizeTrack(item as RawTrack), key }
  }

  return {
    kind: "unavailable",
    key,
    id: typeof item.id === "string" ? item.id : null,
    name: typeof item.name === "string" ? item.name : null,
    reason: "unsupported",
  }
}

export const pageFromOffset = <T>(
  items: readonly T[],
  input: { readonly offset: number; readonly limit: number; readonly total?: number },
  sourceCount = items.length
): Page<T> => {
  const nextOffset = input.offset + sourceCount
  const hasMore = input.total === undefined ? sourceCount >= input.limit : nextOffset < input.total
  return {
    items,
    total: input.total ?? null,
    continuation: hasMore
      ? { kind: "offset", offset: nextOffset, limit: input.limit }
      : null,
  }
}

export const pageFromFollowing = <T>(
  items: readonly T[],
  input: { readonly after: string | null; readonly limit: number; readonly total?: number }
): Page<T> => ({
  items,
  total: input.total ?? null,
  continuation: input.after
    ? { kind: "cursor", after: input.after, limit: input.limit }
    : null,
})
