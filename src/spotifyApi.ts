import { Context, Effect, Layer, Schema } from "effect"

import type {
  Continuation,
  Page,
  PlaylistItem,
  PlaylistSummary,
  Track,
  Album,
  Artist,
  Device,
} from "./domain"
import { CurlProcessError, CurlRunner, CurlRunnerLive } from "./curl"
import {
  RawAlbumSchema,
  RawDevicesSchema,
  RawFollowingPageSchema,
  RawPlaylistItemsResponseSchema,
  RawPlaylistsResponseSchema,
  RawSavedAlbumsResponseSchema,
  RawSavedTracksResponseSchema,
  RawTrackSchema,
} from "./spotifySchemas"
import {
  normalizeAlbum,
  normalizeArtist,
  normalizeDevice,
  normalizePlaylist,
  normalizePlaylistItem,
  normalizeTrack,
  pageFromFollowing,
  pageFromOffset,
} from "./spotifyNormalize"

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
  ) => Effect.Effect<Page<PlaylistItem>, SpotifyApiError | CurlProcessError>
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
  readonly listDevices: (
    token: string
  ) => Effect.Effect<readonly Device[], SpotifyApiError | CurlProcessError>
  readonly play: (
    token: string,
    input: {
      readonly deviceId: string
      readonly contextUri?: string
      readonly uris?: readonly string[]
    }
  ) => Effect.Effect<void, SpotifyApiError | CurlProcessError>
  readonly pause: (
    token: string,
    deviceId: string
  ) => Effect.Effect<void, SpotifyApiError | CurlProcessError>
  readonly next: (
    token: string,
    deviceId: string
  ) => Effect.Effect<void, SpotifyApiError | CurlProcessError>
  readonly previous: (
    token: string,
    deviceId: string
  ) => Effect.Effect<void, SpotifyApiError | CurlProcessError>
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

const bearer = (token: string) => ({
  Accept: "application/json",
  Authorization: `Bearer ${token}`,
})

export const SpotifyApiLive = Layer.effect(
  SpotifyApi,
  Effect.gen(function* () {
    const curl = yield* CurlRunner

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

    const listDevices = Effect.fn("SpotifyApi/listDevices")((token: string) =>
      curl
        .runJson(
          RawDevicesSchema,
          get(token, `${API_BASE}/me/player/devices`)
        )
        .pipe(
          Effect.map((response) =>
            response.devices.flatMap((device) => {
              const normalized = normalizeDevice(device)
              return normalized ? [normalized] : []
            })
          ),
          Effect.mapError(
            (cause) =>
              new SpotifyApiError({
                message: "Could not load playback devices.",
                cause,
                statusCode:
                  cause instanceof CurlProcessError ? cause.statusCode : null,
              })
          )
        )
    )

    const controlPlayer = Effect.fn("SpotifyApi/controlPlayer")(
      (input: {
        readonly token: string
        readonly url: string
        readonly method: "PUT" | "POST"
        readonly json?: unknown
      }) =>
        curl
          .run({
            method: input.method,
            url: input.url,
            headers: bearer(input.token),
            ...(input.json !== undefined ? { json: input.json } : {}),
          })
          .pipe(
            Effect.map(() => undefined),
            Effect.mapError(
              (cause) =>
                new SpotifyApiError({
                  message: "Spotify could not be controlled.",
                  cause,
                  statusCode:
                    cause instanceof CurlProcessError ? cause.statusCode : null,
                })
            )
          )
    )

    const play = Effect.fn("SpotifyApi/play")(
      (token: string, input: {
        readonly deviceId: string
        readonly contextUri?: string
        readonly uris?: readonly string[]
      }) => {
        const body =
          input.contextUri !== undefined
            ? { context_uri: input.contextUri }
            : input.uris !== undefined && input.uris.length > 0
              ? { uris: [...input.uris] }
              : undefined
        return controlPlayer({
          token,
          method: "PUT",
          url: `${API_BASE}/me/player/play${query({ device_id: input.deviceId })}`,
          ...(body !== undefined ? { json: body } : {}),
        })
      }
    )

    const pause = Effect.fn("SpotifyApi/pause")(
      (token: string, deviceId: string) =>
        controlPlayer({
          token,
          method: "PUT",
          url: `${API_BASE}/me/player/pause${query({ device_id: deviceId })}`,
        })
    )

    const next = Effect.fn("SpotifyApi/next")(
      (token: string, deviceId: string) =>
        controlPlayer({
          token,
          method: "POST",
          url: `${API_BASE}/me/player/next${query({ device_id: deviceId })}`,
        })
    )

    const previous = Effect.fn("SpotifyApi/previous")(
      (token: string, deviceId: string) =>
        controlPlayer({
          token,
          method: "POST",
          url: `${API_BASE}/me/player/previous${query({ device_id: deviceId })}`,
        })
    )

    return SpotifyApi.of({
      listPlaylists,
      listPlaylistItems,
      listSavedTracks,
      listSavedAlbums,
      listFollowedArtists,
      listDevices,
      play,
      pause,
      next,
      previous,
    })
  }).pipe(Effect.provide(CurlRunnerLive))
)
