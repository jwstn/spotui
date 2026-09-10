export type Continuation =
  | { readonly kind: "offset"; readonly offset: number; readonly limit: number }
  | { readonly kind: "cursor"; readonly after: string; readonly limit: number }

export interface Page<T> {
  readonly items: readonly T[]
  readonly total: number | null
  readonly continuation: Continuation | null
}

export interface Artist {
  readonly kind: "artist"
  readonly id: string | null
  readonly name: string
}

export interface Album {
  readonly kind: "album"
  readonly id: string | null
  readonly name: string
  readonly artists: readonly Artist[]
  readonly imageUrl: string | null
}

export interface Track {
  readonly kind: "track"
  readonly id: string | null
  readonly name: string
  readonly uri: string | null
  readonly durationMs: number | null
  readonly artists: readonly Artist[]
  readonly album: Album | null
}

export interface PlaylistSummary {
  readonly kind: "playlist"
  readonly id: string
  readonly name: string
  readonly imageUrl: string | null
  readonly itemCount: number | null
}

export interface EpisodeItem {
  readonly kind: "episode"
  readonly key: string
  readonly id: string | null
  readonly name: string
}

export interface LocalItem {
  readonly kind: "local"
  readonly key: string
  readonly name: string
}

export interface UnavailableItem {
  readonly kind: "unavailable"
  readonly key: string
  readonly id: string | null
  readonly name: string | null
  readonly reason: "missing" | "unsupported" | "restricted"
}

export type PlaylistItem =
  | (Track & { readonly key: string })
  | EpisodeItem
  | LocalItem
  | UnavailableItem

export type LibraryCollection =
  | "playlists"
  | "saved-tracks"
  | "saved-albums"
  | "followed-artists"
