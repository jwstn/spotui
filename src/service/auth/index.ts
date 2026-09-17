import { Clock, Context, Effect, Layer, Schema } from "effect"
import { dirname } from "node:path"
import { chmod, mkdir, rename } from "node:fs/promises"

import { CurlService, CurlServiceLive } from "#/service/curl"
import type { CurlProcessError } from "#/service/curl/error"
import { KEYMASTER_CLIENT_ID, type SpotifyCredentials } from "#/service/config"
import {
  RawTokenResponseSchema,
  type BearerToken,
  type PkcePair,
} from "#/service/auth/types"
import { AuthError } from "#/service/auth/error"

export const AUTHORIZATION_ENDPOINT = "https://accounts.spotify.com/authorize"
export const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"

export const USER_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-follow-read",
] as const
export const PLAYBACK_SCOPES = ["streaming"] as const

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

const base64Url = (bytes: ArrayBuffer) => {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

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

const toBearerToken = (response: RawTokenResponseSchema, now: number) => ({
  accessToken: response.access_token,
  expiresAt: now + response.expires_in * 1000,
  refreshToken: response.refresh_token ?? null,
})

export interface Interface {
  readonly refresh: (
    credentials: SpotifyCredentials
  ) => Effect.Effect<
    BearerToken,
    AuthError | CurlProcessError | Schema.SchemaError
  >
  readonly authorize: (
    clientId: string,
    configPath: string
  ) => Effect.Effect<
    SpotifyCredentials,
    AuthError | CurlProcessError | Schema.SchemaError
  >
}

export class AuthService extends Context.Service<AuthService, Interface>()(
  "SpotUI/AuthService"
) {}

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const curl = yield* CurlService

    const refresh = Effect.fn("AuthService/refresh")(
      (credentials: SpotifyCredentials) =>
        curl
          .runJson(RawTokenResponseSchema, refreshTokenRequest(credentials))
          .pipe(
            Effect.flatMap((response) =>
              Clock.currentTimeMillis.pipe(
                Effect.map((now) => toBearerToken(response, now))
              )
            ),
            Effect.mapError(
              (cause) =>
                new AuthError({
                  message: "Spotify authorization could not be refreshed.",
                  cause,
                })
            )
          )
    )

    const runAuthorizationJourney = Effect.fn(
      "AuthService/runAuthorizationJourney"
    )(function* (
      flows: ReadonlyArray<{
        readonly clientId: string
        readonly scopes: readonly string[]
        readonly redirectPath: "/callback" | "/login"
      }>
    ) {
      const prepared = yield* Effect.all(
        flows.map((flow) =>
          Effect.tryPromise({
            try: async () => {
              const pair = await createPkcePair()
              const state = base64Url(
                crypto.getRandomValues(new Uint8Array(24)).buffer as ArrayBuffer
              )
              return { ...flow, pair, state }
            },
            catch: (cause) =>
              new AuthError({
                message: "PKCE could not be initialized.",
                cause,
              }),
          })
        )
      )

      const callback = yield* Effect.tryPromise({
        try: async () => {
          let server: ReturnType<typeof Bun.serve> | undefined
          let settle: (() => void) | undefined
          let reject: ((reason: unknown) => void) | undefined
          const received = new Map<string, string>()
          const result = new Promise<void>((resolve, fail) => {
            settle = resolve
            reject = fail
          })

          server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch(request) {
              const url = new URL(request.url)
              const state = url.searchParams.get("state") ?? ""
              const index = prepared.findIndex((entry) => entry.state === state)
              const flow = prepared[index]
              if (!flow || url.pathname !== flow.redirectPath) {
                return new Response("Not found", { status: 404 })
              }
              const error = url.searchParams.get("error")
              if (error) {
                reject?.(new Error(`Spotify authorization failed: ${error}`))
                return new Response(
                  `Spotify authorization failed: ${error}. You can close this window.`,
                  { status: 400 }
                )
              }
              const code = url.searchParams.get("code")
              if (!code) {
                reject?.(
                  new Error("Spotify authorization did not return a code.")
                )
                return new Response(
                  "Missing authorization code. You can close this window.",
                  { status: 400 }
                )
              }
              received.set(state, code)
              const next = prepared[index + 1]
              if (next) {
                return Response.redirect(
                  buildAuthorizationUrl({
                    clientId: next.clientId,
                    redirectUri: `http://127.0.0.1:${server?.port}${next.redirectPath}`,
                    state: next.state,
                    challenge: next.pair.challenge,
                  }),
                  302
                )
              }
              settle?.()
              return new Response(
                "SpotUI authorization complete. You can close this window."
              )
            },
          })

          const baseUri = `http://127.0.0.1:${server.port}`
          openBrowser(
            buildAuthorizationUrl({
              clientId: prepared[0]!.clientId,
              redirectUri: `${baseUri}${prepared[0]!.redirectPath}`,
              state: prepared[0]!.state,
              challenge: prepared[0]!.pair.challenge,
            })
          )

          try {
            await Promise.race([
              result,
              new Promise<never>((_, fail) =>
                globalThis.setTimeout(
                  () => fail(new Error("Spotify authorization timed out.")),
                  300_000
                )
              ),
            ])
          } finally {
            server.stop()
          }
          return { baseUri, prepared, received }
        },
        catch: (cause) =>
          new AuthError({
            message: "Spotify authorization could not be completed.",
            cause,
          }),
      })

      return yield* Effect.all(
        callback.prepared.map((flow) =>
          curl
            .runJson(
              RawTokenResponseSchema,
              authorizationCodeRequest({
                clientId: flow.clientId,
                code: callback.received.get(flow.state) ?? "",
                redirectUri: `${callback.baseUri}${flow.redirectPath}`,
                verifier: flow.pair.verifier,
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
        )
      )
    })

    const authorize = Effect.fn("AuthService/authorize")(function* (
      clientId: string,
      configPath: string
    ) {
      const custom = clientId.trim()
      const usesKeymaster = !custom || custom === KEYMASTER_CLIENT_ID
      const flows: ReadonlyArray<{
        readonly clientId: string
        readonly scopes: readonly string[]
        readonly redirectPath: "/callback" | "/login"
      }> = usesKeymaster
        ? [
            {
              clientId: KEYMASTER_CLIENT_ID,
              scopes: [...USER_SCOPES, ...PLAYBACK_SCOPES],
              redirectPath: "/login",
            },
          ]
        : [
            {
              clientId: custom,
              scopes: USER_SCOPES,
              redirectPath: "/callback",
            },
            {
              clientId: KEYMASTER_CLIENT_ID,
              scopes: PLAYBACK_SCOPES,
              redirectPath: "/login",
            },
          ]

      const tokens = yield* runAuthorizationJourney(flows)
      yield* Effect.log(
        `OAuth journey complete: ${tokens.length} token(s), client ${flows.map((f) => f.clientId).join(", ")}`
      )
      const web = tokens[0]!
      if (!web.refresh_token) {
        return yield* new AuthError({
          message: "Spotify did not return a refresh token.",
          cause: web,
        })
      }
      const credentials: SpotifyCredentials = {
        clientId: flows[0]!.clientId,
        refreshToken: web.refresh_token,
      }
      yield* writeSpotifyConfig(configPath, credentials)

      // Playback credentials are paired via Spotify's Zeroconf handshake in a
      // separate `bun run pair` step: node-librespot's OAuth-token borrow path
      // (loginWithAccessToken) was deprecated by Spotify in August 2026.
      yield* Effect.log(
        "Login complete. Run `bun run pair` in another terminal and tap 'SpotUI' in the Spotify app to enable playback."
      )
      return credentials
    })

    return AuthService.of({ refresh, authorize })
  }).pipe(Effect.provide(CurlServiceLive))
)

const openBrowser = (url: string) => {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open"
  Bun.spawn({ cmd: [command, url], stdout: "ignore", stderr: "ignore" })
}

export const writeSpotifyConfig = (
  path: string,
  credentials: SpotifyCredentials
) =>
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
