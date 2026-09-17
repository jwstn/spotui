import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { CurlProcessError } from "#/service/curl/error"

enum CurlRequestMethods {
  GET = "GET",
  POST = "POST",
}

const CurlRequest = Schema.Struct({
  method: Schema.Enum(CurlRequestMethods),
  url: Schema.URL,
  headers: Schema.optional(Schema.Headers),
  form: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
type CurlRequest = typeof CurlRequest.Type

const CurlResponse = Schema.Struct({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Number,
  statusCode: Schema.NullOr(Schema.Number),
})
export type CurlResponse = typeof CurlResponse.Type

export const buildCurlArgs = Effect.fn("SpotUI/buildCurlArgs")((
  request: CurlRequest
): Effect.Effect<readonly string[], never> => {
  const args = [
    "curl",
    "--fail-with-body",
    "--silent",
    "--show-error",
    "--request",
    request.method,
  ]

  const headers = request.headers ?? {}
  for (const [name, value] of Object.entries(headers)) {
    args.push("--header", `${name}: ${value}`)
  }

  if (request.form) {
    args.push("--data", new URLSearchParams(request.form).toString())
  }

  args.push("--write-out", "\\n%{http_code}")
  args.push(request.url.toString())
  return Effect.succeed(args)
})

export interface Interface {
  readonly run: (
    request: CurlRequest
  ) => Effect.Effect<CurlResponse, CurlProcessError>
}

export class CurlService extends Context.Service<CurlService, Interface>()(
  "SpotUI/CurlService"
) {}

const readStream = (stream: ReadableStream) => {
  return Effect.gen(function* () {
    return yield* Effect.succeed(Bun.readableStreamToText(stream))
  })
}

const runProcess = (args: readonly string[]) => {
  return Effect.tryPromise({
    try: async () => {
      const process = Bun.spawn({
        cmd: [...args],
        stdout: "pipe",
        stderr: "pipe",
      })

      const [exitCode, stdout, stderr] = Effect.all([
        Effect.promise(async () => await process.exited),
        readStream(process.stdout),
        readStream(process.stderr),
      ])
      return { exitCode, stdout, stderr }
    },
    catch: (cause) =>
      new CurlProcessError({
        args: [...args],
        stdout: "",
        stderr: String(cause),
        exitCode: -1,
        statusCode: null,
        retryAfterSeconds: null,
        kind: "process",
        message: "The curl process could not be started.",
      }),
  })
}

const attempt = Effect.fn("CurlService/attempt")((request: CurlRequest) => {
  return Effect.gen(function* () {
    const args = yield* buildCurlArgs(request)
    return yield* Effect.timeoutOrElse(runProcess(args), {
      duration: "15 seconds",
      orElse: () =>
        Effect.fail(
          new CurlProcessError({
            args: [...args],
            stdout: "",
            stderr: "",
            exitCode: -1,
            statusCode: null,
            retryAfterSeconds: null,
            kind: "timeout",
            message: "The curl request timed out.",
          })
        ),
    })
  })
})

export const CurlServiceLive = Layer.effect(
  CurlService,
  Effect.gen(function* () {
    const run = Effect.fn("CurlService/run")((request: CurlRequest) =>
      Effect.gen(function* () {
        return yield* attempt(request)
      })
    )

    return CurlService.of({ run })
  })
)
