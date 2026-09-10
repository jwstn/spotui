import { Effect } from "effect"

import { AuthService, AuthServiceLive, writeSpotifyConfig } from "./auth"
import { createLibrespotHost } from "./player"
import {
  playbackCredentialsPathFor,
  readPlaybackCredentials,
  type SpotifyCredentials,
} from "./config"
import { SpotifyBridge } from "./bridge"
import { CurlProcessError } from "./curl"
import { SpotifyApi, SpotifyApiError, SpotifyApiLive } from "./spotifyApi"

export const createLiveBridge = (
  credentials: SpotifyCredentials,
  configPath?: string
) => {
  const refreshToken = (input: SpotifyCredentials) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.refresh(input)
      }).pipe(Effect.provide(AuthServiceLive))
    )

  const runApi = Effect.fn("SpotifyRuntime/runApi")(
    <A>(
      operation: (
        api: SpotifyApi["Service"]
      ) => Effect.Effect<A, CurlProcessError | SpotifyApiError>
    ) =>
      Effect.gen(function* () {
        return yield* operation(yield* SpotifyApi)
      }).pipe(Effect.provide(SpotifyApiLive))
  )

  return new SpotifyBridge({
    credentials,
    refreshToken,
    ...(configPath
      ? {
          persistCredentials: (next: SpotifyCredentials) =>
            Effect.runPromise(writeSpotifyConfig(configPath, next)),
        }
      : {}),
    api: {
      listPlaylists: (token, continuation) =>
        runApi((api) => api.listPlaylists(token, continuation)),
      listPlaylistItems: (token, playlistId, continuation) =>
        runApi((api) => api.listPlaylistItems(token, playlistId, continuation)),
      listSavedTracks: (token, continuation) =>
        runApi((api) => api.listSavedTracks(token, continuation)),
      listSavedAlbums: (token, continuation) =>
        runApi((api) => api.listSavedAlbums(token, continuation)),
      listFollowedArtists: (token, continuation) =>
        runApi((api) => api.listFollowedArtists(token, continuation)),
      listAlbumTracks: (token, albumId, continuation) =>
        runApi((api) => api.listAlbumTracks(token, albumId, continuation)),
    },
    player: createLibrespotHost({
      deviceName: "SpotUI",
      loadCredentials: () => {
        if (!configPath) return Promise.resolve(null)
        return Effect.runPromise(
          readPlaybackCredentials(playbackCredentialsPathFor(configPath))
        )
      },
    }),
  })
}

export const authorizeWithPkce = (clientId: string, configPath: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      return yield* auth.authorize(clientId, configPath)
    }).pipe(Effect.provide(AuthServiceLive))
  )
