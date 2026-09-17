import { Context, Effect, Layer, Schema } from "effect"

import type {
  Continuation,
  Page,
  PlayListItem,
  PlaylistSummary,
  Track,
  Album,
  Artist,
} from "#/service/domain"
import { CurlService, CurlServiceLive } from "#/service/curl"
import { CurlProcessError } from "#/service/curl/error"
import {
  RawAlbumTracksResponseSchema,
  RawFollowingPageSchema,
  RawPlaylistItemsResponseSchema,
  RawPlaylistsResponseSchema,
  RawSavedAlbumsResponseSchema,
  RawSavedTracksResponseSchema,
} from "../spotifySchemas"
import {
  normalizeAlbum,
  normalizeArtist,
  normalizePlaylist,
  normalizePlaylistItem,
  normalizeTrack,
  pageFromFollowing,
  pageFromOffset,
} from "../spotifyNormalize"

const API_BASE = "https://api.spotify.com/v1"

export class SpotifyApiError extends Schema.TaggedError<SpotifyApiError>()(
  "SpotUI/SpotifyApiError",
  {
    message: Schema.String,
    cause: Schema.Unknown,
    statusCode: Schema.NullOr(Schema.Number),
  }
) {}

export interface SpotifyApiShape {
  readonly listPlaylists: (
    token: string,
    continuation?: Continuation | null
  ) => Effect.Effect<Page<PlaylistSummary>, SpotifyApiError | CurlProcessError>
  readonly listPlaylistItems: (
    token: string,
    playlistId: string,
    continuation?: Continuation | null
  ) => Effect.Effect<Page<PlayListItem>, SpotifyApiError | CurlProcessError>
  readonly listSavedTracks: (
    token: string,
    continuation?: Continuation | null
  ) => Effect.Effect<Page<Track>, SpotifyApiError | CurlProcessError>
  readonly listSavedAlbums: (
    token: string,
    continuation?: Continuation | null
  ) => Effect.Effect<Page<Album>, SpotifyApiError | CurlProcessError>
  readonly listFollowedArtists: (
    token: string,
    continuation?: Continuation | null
  ) => Effect.Effect<Page<Artist>, SpotifyApiError | CurlProcessError>
  readonly listAlbumTracks: (
    token: string,
    albumId: string,
    continuation?: Continuation | null
  ) => Effect.Effect<Page<Track>, SpotifyApiError | CurlProcessError>
}

export class SpotifyApi extends Context.Service<SpotifyApi, SpotifyApiShape>()(
  "SpotUI/SpotifyApi"
) {}

const query = (
  values: Readonly<Record<string, string | number | undefined>>
) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ""
}

const urlForContinuation = (
  base: string,
  continuation: Continuation | null | undefined
) => {
  if (!continuation) return `${base}${query({ limit: 25, offset: 0 })}`
  return continuation.kind === "offset"
    ? `${base}${query({ limit: continuation.limit, offset: continuation.offset })}`
    : `${base}${query({ limit: continuation.limit, after: continuation.after })}`
}

const get = (token: string, url: string) => ({
  method: "GET" as const,
  url,
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  },
})

export const SpotifyApiLive = Layer.effect(
  SpotifyApi,
  Effect.gen(function* () {
    const curl = yield* CurlService

    const listPlaylists = Effect.fn("SpotifyApi/listPlaylists")(
      (token: string, continuation?: Continuation | null) =>
        curl
          .runJson(
            RawPlaylistsResponseSchema,
            get(
              token,
              urlForContinuation(`${API_BASE}/me/playlists`, continuation)
            )
          )
          .pipe(
            Effect.map((response) =>
              pageFromOffset(response.items.map(normalizePlaylist), response)
            ),
            Effect.mapError((cause) =>
              cause instanceof SpotifyApiError
                ? cause
                : new SpotifyApiError({
                    message: "Could not load playlists.",
                    cause,
                    statusCode:
                      cause instanceof CurlProcessError
                        ? cause.statusCode
                        : null,
                  })
            )
          )
    )

    const listPlaylistItems = Effect.fn("SpotifyApi/listPlaylistItems")(
      (token: string, playlistId: string, continuation?: Continuation | null) =>
        curl
          .runJson(
            RawPlaylistItemsResponseSchema,
            get(
              token,
              urlForContinuation(
                `${API_BASE}/playlists/${encodeURIComponent(playlistId)}/items`,
                continuation
              )
            )
          )
          .pipe(
            Effect.map((response) =>
              pageFromOffset(
                response.items.map((item, index) =>
                  normalizePlaylistItem(
                    item,
                    playlistId,
                    (continuation?.kind === "offset"
                      ? continuation.offset
                      : 0) + index
                  )
                ),
                response,
                response.items.length
              )
            ),
            Effect.mapError(
              (cause) =>
                new SpotifyApiError({
                  message: "Could not load playlist items.",
                  cause,
                  statusCode:
                    cause instanceof CurlProcessError ? cause.statusCode : null,
                })
            )
          )
    )

    const listSavedTracks = Effect.fn("SpotifyApi/listSavedTracks")(
      (token: string, continuation?: Continuation | null) =>
        curl
          .runJson(
            RawSavedTracksResponseSchema,
            get(
              token,
              urlForContinuation(`${API_BASE}/me/tracks`, continuation)
            )
          )
          .pipe(
            Effect.map((response) =>
              pageFromOffset(
                response.items.flatMap(({ track }) =>
                  track ? [normalizeTrack(track)] : []
                ),
                response,
                response.items.length
              )
            ),
            Effect.mapError(
              (cause) =>
                new SpotifyApiError({
                  message: "Could not load saved tracks.",
                  cause,
                  statusCode:
                    cause instanceof CurlProcessError ? cause.statusCode : null,
                })
            )
          )
    )

    const listSavedAlbums = Effect.fn("SpotifyApi/listSavedAlbums")(
      (token: string, continuation?: Continuation | null) =>
        curl
          .runJson(
            RawSavedAlbumsResponseSchema,
            get(
              token,
              urlForContinuation(`${API_BASE}/me/albums`, continuation)
            )
          )
          .pipe(
            Effect.map((response) =>
              pageFromOffset(
                response.items.flatMap(({ album }) =>
                  album ? [normalizeAlbum(album)] : []
                ),
                response,
                response.items.length
              )
            ),
            Effect.mapError(
              (cause) =>
                new SpotifyApiError({
                  message: "Could not load saved albums.",
                  cause,
                  statusCode:
                    cause instanceof CurlProcessError ? cause.statusCode : null,
                })
            )
          )
    )

    const listFollowedArtists = Effect.fn("SpotifyApi/listFollowedArtists")((
      token: string,
      continuation?: Continuation | null
    ) => {
      const after =
        continuation?.kind === "cursor" ? continuation.after : undefined
      return curl
        .runJson(
          RawFollowingPageSchema,
          get(
            token,
            `${API_BASE}/me/following${query({ type: "artist", limit: 25, after })}`
          )
        )
        .pipe(
          Effect.map((response) =>
            pageFromFollowing(response.artists.items.map(normalizeArtist), {
              after: response.artists.cursors.after,
              limit: response.artists.limit,
              total: response.artists.total,
            })
          ),
          Effect.mapError(
            (cause) =>
              new SpotifyApiError({
                message: "Could not load followed artists.",
                cause,
                statusCode:
                  cause instanceof CurlProcessError ? cause.statusCode : null,
              })
          )
        )
    })

    const listAlbumTracks = Effect.fn("SpotifyApi/listAlbumTracks")(
      (token: string, albumId: string, continuation?: Continuation | null) =>
        curl
          .runJson(
            RawAlbumTracksResponseSchema,
            get(
              token,
              urlForContinuation(
                `${API_BASE}/albums/${albumId}/tracks`,
                continuation
              )
            )
          )
          .pipe(
            Effect.map((response) =>
              pageFromOffset(response.items.map(normalizeTrack), response)
            ),
            Effect.mapError(
              (cause) =>
                new SpotifyApiError({
                  message: "Could not load the album's tracks.",
                  cause,
                  statusCode:
                    cause instanceof CurlProcessError ? cause.statusCode : null,
                })
            )
          )
    )

    return SpotifyApi.of({
      listPlaylists,
      listPlaylistItems,
      listSavedTracks,
      listSavedAlbums,
      listFollowedArtists,
      listAlbumTracks,
    })
  }).pipe(Effect.provide(CurlServiceLive))
)
