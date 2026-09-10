import { Context, Effect, Layer, Schema } from "effect"
import { dirname } from "node:path"
import { chmod, mkdir, rename } from "node:fs/promises"

import { CurlRunner, CurlRunnerLive, type CurlProcessError } from "./curl"
import type { SpotifyCredentials } from "./config"

export const AUTHORIZATION_ENDPOINT = "https://accounts.spotify.com/authorize"
export const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"
export const USER_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-follow-read",
] as const

export interface PkcePair {
  readonly verifier: string
  readonly challenge: string
}

export interface BearerToken {
  readonly accessToken: string
  readonly expiresAt: number
  readonly refreshToken: string | null
}

const RawTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number,
  refresh_token: Schema.optionalKey(Schema.String),
})

export class AuthError extends Schema.TaggedError<AuthError>()("SpotUI/AuthError", {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export const buildAuthorizationUrl = (input: {
  readonly clientId: string
  readonly redirectUri: string
  readonly state: string
  readonly challenge: string
  readonly scopes?: readonly string[]
}) => {
  const url = new URL(AUTHORIZATION_ENDPOINT)
  url.searchParams.set("client_id", input.clientId)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("state", input.state)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("code_challenge", input.challenge)
  url.searchParams.set("scope", (input.scopes ?? USER_SCOPES).join(" "))
  return url.toString()
}

const base64Url = (bytes: ArrayBuffer) =>
  Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")

export const createPkcePair = async (): Promise<PkcePair> => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const verifier = base64Url(bytes.buffer as ArrayBuffer)
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return { verifier, challenge: base64Url(digest) }
}

export const refreshTokenRequest = (credentials: SpotifyCredentials) => ({
  method: "POST" as const,
  url: TOKEN_ENDPOINT,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  form: {
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    refresh_token: credentials.refreshToken,
  },
})

const toBearerToken = (response: Schema.Schema.Type<typeof RawTokenResponseSchema>) => ({
  accessToken: response.access_token,
  expiresAt: Date.now() + response.expires_in * 1000,
  refreshToken: response.refresh_token ?? null,
})

export interface AuthServiceShape {
  readonly refresh: (
    credentials: SpotifyCredentials
  ) => Effect.Effect<BearerToken, AuthError | CurlProcessError | Schema.SchemaError>
}

export class AuthService extends Context.Service<AuthService, AuthServiceShape>()(
  "SpotUI/AuthService"
) {}

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const curl = yield* CurlRunner
    const refresh = Effect.fn("AuthService/refresh")((credentials: SpotifyCredentials) =>
      curl.runJson(RawTokenResponseSchema, refreshTokenRequest(credentials)).pipe(
        Effect.map(toBearerToken),
        Effect.mapError((cause) =>
          cause instanceof AuthError
            ? cause
            : new AuthError({ message: "Spotify authorization could not be refreshed.", cause })
        )
      )
    )
    return AuthService.of({ refresh })
  }).pipe(Effect.provide(CurlRunnerLive))
)

export const writeSpotifyConfig = (path: string, credentials: SpotifyCredentials) =>
  Effect.tryPromise({
    try: async () => {
      const directory = dirname(path)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const contents = `[spotify]\nclient_id = ${JSON.stringify(credentials.clientId)}\nrefresh_token = ${JSON.stringify(credentials.refreshToken)}\n`
      const temporaryPath = `${path}.${process.pid}.tmp`
      await Bun.write(temporaryPath, contents)
      if (process.platform !== "win32") {
        await chmod(temporaryPath, 0o600)
      }
      await rename(temporaryPath, path)
      if (process.platform !== "win32") {
        await chmod(path, 0o600)
      }
    },
    catch: (cause) =>
      new AuthError({
        message: "Spotify credentials could not be saved securely.",
        cause,
      }),
  })
