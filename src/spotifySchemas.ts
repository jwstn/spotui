import { Schema } from "effect"

const NullableString = Schema.NullOr(Schema.String)

export const RawImage = Schema.Struct({ url: Schema.String })
export type RawImage = typeof RawImage.Type

export const RawArtist = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
})
export type RawArtist = Schema.Schema.Type<typeof RawArtist>

export const RawAlbum = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
  artists: Schema.optionalKey(Schema.Array(RawArtist)),
  images: Schema.optionalKey(Schema.Array(RawImage)),
})
export type RawAlbum = Schema.Schema.Type<typeof RawAlbum>

export const RawTrack = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
  uri: Schema.optionalKey(NullableString),
  duration_ms: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  artists: Schema.optionalKey(Schema.Array(RawArtist)),
  album: Schema.optionalKey(Schema.NullOr(RawAlbum)),
  type: Schema.optionalKey(Schema.String),
  is_local: Schema.optionalKey(Schema.Boolean),
})
export type RawTrack = Schema.Schema.Type<typeof RawTrack>

export const RawEpisode = Schema.Struct({
  id: Schema.optionalKey(NullableString),
  name: Schema.String,
  type: Schema.optionalKey(Schema.String),
})
export type RawEpisode = typeof RawEpisode.Type

export const RawPlaylist = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  images: Schema.optionalKey(Schema.Array(RawImage)),
  tracks: Schema.optionalKey(
    Schema.Struct({ total: Schema.optionalKey(Schema.Number) })
  ),
})
export type RawPlaylist = typeof RawPlaylist.Type

export const RawPlaylistItem = Schema.Struct({
  added_at: Schema.optionalKey(NullableString),
  added_by: Schema.optionalKey(Schema.Unknown),
  item: Schema.optionalKey(Schema.NullOr(Schema.Unknown)),
  track: Schema.optionalKey(Schema.NullOr(Schema.Unknown)),
})
export type RawPlaylistItem = Schema.Schema.Type<typeof RawPlaylistItem>

export const RawOffsetPage = Schema.Struct({
  items: Schema.Array(Schema.Unknown),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})
export type RawOffsetPage = typeof RawOffsetPage.Type

export const RawFollowingPage = Schema.Struct({
  artists: Schema.Struct({
    items: Schema.Array(RawArtist),
    limit: Schema.Number,
    total: Schema.optionalKey(Schema.Number),
    cursors: Schema.Struct({ after: Schema.NullOr(Schema.String) }),
  }),
})
export type RawFollowingPage = typeof RawFollowingPage.Type

export const RawAlbumTracksResponse = Schema.Struct({
  items: Schema.Array(RawTrack),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})
export type RawAlbumTracksResponse = typeof RawAlbumTracksResponse.Type

export const RawPlaylistsResponse = Schema.Struct({
  items: Schema.Array(RawPlaylist),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})
export type RawPlaylistsResponse = typeof RawPlaylistsResponse.Type

export const RawPlaylistItemsResponse = Schema.Struct({
  items: Schema.Array(RawPlaylistItem),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})
export type RawPlaylistItemsResponse = typeof RawPlaylistItemsResponse.Type

export const RawSavedTracksResponse = Schema.Struct({
  items: Schema.Array(Schema.Struct({ track: Schema.NullOr(RawTrack) })),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})
export type RawSavedTracksResponse = typeof RawSavedTracksResponse.Type

export const RawSavedAlbumsResponse = Schema.Struct({
  items: Schema.Array(Schema.Struct({ album: Schema.NullOr(RawAlbum) })),
  limit: Schema.Number,
  offset: Schema.Number,
  total: Schema.optionalKey(Schema.Number),
})
export type RawSavedAlbumsResponse = typeof RawSavedAlbumsResponse.Type
