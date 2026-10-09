import * as Schema from "effect/Schema"

export const Offset = Schema.Struct({
  kind: Schema.Literal("offset"),
  offset: Schema.Number,
  limit: Schema.Number,
})
export type Offset = typeof Offset.Type

export const Cursor = Schema.Struct({
  kind: Schema.Literal("cursor"),
  after: Schema.Number,
  limit: Schema.Number,
})
export type Cursor = typeof Cursor.Type

export const Continuation = Schema.Union([Offset, Cursor])
export type Continuation = typeof Continuation.Type

export interface Page<T> {
  readonly items: readonly T[]
  readonly total: number | null
  readonly continuation: Continuation | null
}

export const Aritst = Schema.Struct({
  kind: Schema.Literal("artist"),
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
})
export type Artist = typeof Aritst.Type

export const Album = Schema.Struct({
  kind: Schema.Literal("album"),
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  artists: Schema.Array(Aritst),
  imageUrl: Schema.NullOr(Schema.String),
})
export type Album = typeof Album.Type

export const Track = Schema.Struct({
  kind: Schema.Literal("track"),
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  uri: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(Schema.Number),
  album: Schema.NullOr(Album),
})
export type Track = typeof Track.Type

export const PlaylistSummary = Schema.Struct({
  kind: Schema.Literal("playlist"),
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  itemCount: Schema.NullOr(Schema.Number),
})
export type PlaylistSummary = typeof PlaylistSummary.Type

export type PlayListItem = Track

export const LibraryCollection = Schema.Literals([
  "playlists",
  "saved-tracks",
  "saved-albums",
  "followed-artists",
])
export type LibraryCollection = typeof LibraryCollection.Type
