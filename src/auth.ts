import { Clock, Context, Effect, Layer, Schema } from "effect"
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
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
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

export const authorizationCodeRequest = (input: {
  readonly clientId: string
  readonly code: string
  readonly redirectUri: string
  readonly verifier: string
}) => ({
  method: "POST" as const,
  url: TOKEN_ENDPOINT,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  form: {
    grant_type: "authorization_code",
    client_id: input.clientId,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  },
})

const toBearerToken = (
  response: Schema.Schema.Type<typeof RawTokenResponseSchema>,
  now: number
) => ({
  accessToken: response.access_token,
  expiresAt: now + response.expires_in * 1000,
  refreshToken: response.refresh_token ?? null,
})

export interface AuthServiceShape {
  readonly refresh: (
    credentials: SpotifyCredentials
  ) => Effect.Effect<BearerToken, AuthError | CurlProcessError | Schema.SchemaError>
  readonly authorize: (
    clientId: string,
    configPath: string
  ) => Effect.Effect<SpotifyCredentials, AuthError | CurlProcessError | Schema.SchemaError>
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
        Effect.flatMap((response) =>
          Clock.currentTimeMillis.pipe(Effect.map((now) => toBearerToken(response, now)))
        ),
        Effect.mapError((cause) =>
          new AuthError({
            message: "Spotify authorization could not be refreshed.",
            cause,
          })
        )
      )
    )

    const authorize = Effect.fn("AuthService/authorize")(function* (clientId: string, configPath: string) {
      const pair = yield* Effect.tryPromise({
        try: createPkcePair,
        catch: (cause) => new AuthError({ message: "PKCE could not be initialized.", cause }),
      })
      const state = base64Url(crypto.getRandomValues(new Uint8Array(24)).buffer as ArrayBuffer)
      const callback = yield* waitForAuthorizationCode({ clientId, pair, state })
      const response = yield* curl
        .runJson(
          RawTokenResponseSchema,
          authorizationCodeRequest({
            clientId,
            code: callback.code,
            redirectUri: callback.redirectUri,
            verifier: pair.verifier,
          })
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new AuthError({
                message: "Spotify authorization code exchange failed.",
                cause,
              })
          )
        )
      if (!response.refresh_token) {
        return yield* new AuthError({
          message: "Spotify did not return a refresh token.",
          cause: response,
        })
      }
      const credentials = { clientId, refreshToken: response.refresh_token }
      yield* writeSpotifyConfig(configPath, credentials)
      return credentials
    })

    return AuthService.of({ refresh, authorize })
  }).pipe(Effect.provide(CurlRunnerLive))
)

const openBrowser = (url: string) => {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  Bun.spawn({ cmd: [command, url], stdout: "ignore", stderr: "ignore" })
}

const waitForAuthorizationCode = (input: {
  readonly clientId: string
  readonly pair: PkcePair
  readonly state: string
}) =>
  Effect.tryPromise({
    try: async () => {
      let server: ReturnType<typeof Bun.serve> | undefined
      let settle: ((value: { readonly code: string; readonly redirectUri: string }) => void) | undefined
      let reject: ((reason: unknown) => void) | undefined
      const result = new Promise<{ readonly code: string; readonly redirectUri: string }>((resolve, fail) => {
        settle = resolve
        reject = fail
      })

      server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
          const url = new URL(request.url)
          const redirectUri = `http://127.0.0.1:${server?.port}/callback`
          if (url.pathname !== "/callback") return new Response("Not found", { status: 404 })
          if (url.searchParams.get("state") !== input.state) {
            reject?.(new Error("OAuth state did not match."))
            return new Response("State mismatch. You can close this window.", { status: 400 })
          }
          const error = url.searchParams.get("error")
          if (error) {
            reject?.(new Error(`Spotify authorization failed: ${error}`))
            return new Response("Authorization failed. You can close this window.", { status: 400 })
          }
          const code = url.searchParams.get("code")
          if (!code) {
            reject?.(new Error("Spotify authorization did not return a code."))
            return new Response("Missing authorization code. You can close this window.", { status: 400 })
          }
          settle?.({ code, redirectUri })
          return new Response("SpotUI authorization complete. You can close this window.")
        },
      })

      const redirectUri = `http://127.0.0.1:${server.port}/callback`
      openBrowser(
        buildAuthorizationUrl({
          clientId: input.clientId,
          redirectUri,
          state: input.state,
          challenge: input.pair.challenge,
        })
      )

      try {
        return await Promise.race([
          result,
          new Promise<never>((_, fail) =>
            globalThis.setTimeout(() => fail(new Error("Spotify authorization timed out.")), 300_000)
          ),
        ])
      } finally {
        server.stop()
      }
    },
    catch: (cause) =>
      new AuthError({
        message: "Spotify authorization could not be completed.",
        cause,
      }),
  })

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
