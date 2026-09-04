import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import Bun, { type SyncSubprocess } from "bun"
import type { TimeoutError } from "effect/Cause"
import {
  ErrorMessage,
  GeneralCurlError,
  JsonParseCurlError,
  Message,
} from "./error"

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env")
  process.exit(1)
}

const REDIRECT_URL = "eg:http://localhost:8080" // your redirect URL - must be localhost URL and/or HTTPS

const AUTHORIZATION_ENDPOINT = "https://accounts.spotify.com/authorize"
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"
const SCOPE = "user-read-private user-read-email"

interface Interface {
  readonly post: (
    args: string[]
  ) => Effect.Effect<AccessTokenResult, GeneralCurlError>
}

class CurlClient extends Context.Service<CurlClient, Interface>()(
  "CurlClient"
) {}

type AccessTokenResult = {
  access_token: string
  token_type: "Bearer"
  expires_in: number
}

const CurlClientLayer = Layer.effect(
  CurlClient,
  Effect.gen(function* () {
    const post = Effect.fn("CurlClient/post")(
      (args: string[]): Effect.Effect<AccessTokenResult, GeneralCurlError> =>
        Effect.gen(function* () {
          const result = Bun.spawnSync({
            cmd: ["curl", "-X", "POST", ...args],
            stdout: "pipe",
            stderr: "pipe",
          })

          return result
        }).pipe(
          Effect.tapCause(
            (cause) =>
              new GeneralCurlError({
                cause,
                message: ErrorMessage.make(
                  "Something went wrong while executing the curl command."
                ),
              })
          ),
          Effect.map((value) => JSON.parse(value.stdout.toString())),
          Effect.tap((result) => Effect.sync(() => console.log(result)))
        )
    )

    return CurlClient.of({
      post,
    })
  })
)

const ACCESS_TOKEN_ARGS = [
  TOKEN_ENDPOINT,
  "-H",
  "Content-Type: application/x-www-form-urlencoded",
  "-d",
  `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
]

const program = Effect.gen(function* () {
  const curlClient = yield* CurlClient
  const accessToken = yield* curlClient
    .post(ACCESS_TOKEN_ARGS)
    .pipe(
      Effect.timeout("5 seconds"),
      Effect.retry(
        Schedule.max([Schedule.exponential("100 millis"), Schedule.recurs(3)])
      ),
      Effect.timeout("15 seconds")
    )
  return accessToken
}).pipe(Effect.orDie)

const runnable = Effect.provide(program, CurlClientLayer)
await Effect.runPromise(runnable)
