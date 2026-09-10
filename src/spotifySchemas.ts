import { Schema } from "effect"

const NullableString = Schema.NullOr(Schema.String)

export const RawImageSchema = Schema.Struct({ url: Schema.String })

export const RawArtistSchema = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
})

export const RawAlbumSchema = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
  artists: Schema.optionalKey(Schema.Array(RawArtistSchema)),
  images: Schema.optionalKey(Schema.Array(RawImageSchema)),
})

export const RawTrackSchema = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
  uri: Schema.optionalKey(NullableString),
  duration_ms: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  artists: Schema.optionalKey(Schema.Array(RawArtistSchema)),
  album: Schema.optionalKey(Schema.NullOr(RawAlbumSchema)),
  type: Schema.optionalKey(Schema.String),
  is_local: Schema.optionalKey(Schema.Boolean),
})

export const RawEpisodeSchema = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
  type: Schema.optionalKey(Schema.String),
})

export const RawPlaylistSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  images: Schema.optionalKey(Schema.Array(RawImageSchema)),
  tracks: Schema.optionalKey(
    Schema.Struct({ total: Schema.optionalKey(Schema.Number) })
  ),
})

export const RawPlaylistItemSchema = Schema.Struct({
  added_at: Schema.optionalKey(NullableString),
  added_by: Schema.optionalKey(Schema.Unknown),
  item: Schema.optionalKey(Schema.NullOr(Schema.Unknown)),
  track: Schema.optionalKey(Schema.NullOr(Schema.Unknown)),
})

export const RawOffsetPageSchema = Schema.Struct({
  items: Schema.Array(Schema.Unknown),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})

export const RawFollowingPageSchema = Schema.Struct({
  artists: Schema.Struct({
    items: Schema.Array(RawArtistSchema),
    limit: Schema.Number,
    total: Schema.optionalKey(Schema.Number),
    cursors: Schema.Struct({ after: Schema.NullOr(Schema.String) }),
  }),
})

export const RawPlaylistsResponseSchema = Schema.Struct({
  items: Schema.Array(RawPlaylistSchema),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})

export const RawPlaylistItemsResponseSchema = Schema.Struct({
  items: Schema.Array(RawPlaylistItemSchema),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})

export const RawSavedTracksResponseSchema = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({ track: Schema.NullOr(RawTrackSchema) })
  ),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})

export const RawSavedAlbumsResponseSchema = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({ album: Schema.NullOr(RawAlbumSchema) })
  ),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})

export type RawArtist = Schema.Schema.Type<typeof RawArtistSchema>
export type RawAlbum = Schema.Schema.Type<typeof RawAlbumSchema>
export type RawTrack = Schema.Schema.Type<typeof RawTrackSchema>
export type RawPlaylist = Schema.Schema.Type<typeof RawPlaylistSchema>
export type RawPlaylistItem = Schema.Schema.Type<typeof RawPlaylistItemSchema>
