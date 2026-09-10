import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

export interface CurlRequest {
  readonly method: "GET" | "POST"
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly form?: Readonly<Record<string, string>>
}

export interface CurlResponse {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly statusCode: number | null
}

export const buildCurlArgs = (request: CurlRequest): readonly string[] => {
  const args = [
    "curl",
    "--fail-with-body",
    "--silent",
    "--show-error",
    "--request",
    request.method,
  ]

  for (const [name, value] of Object.entries(request.headers ?? {})) {
    args.push("--header", `${name}: ${value}`)
  }

  if (request.form) {
    args.push("--data", new URLSearchParams(request.form).toString())
  }

  args.push("--write-out", "\\n%{http_code}")
  args.push(request.url)
  return args
}

export class CurlProcessError extends Schema.TaggedError<CurlProcessError>()(
  "SpotUI/CurlProcessError",
  {
    args: Schema.Array(Schema.String),
    stdout: Schema.String,
    stderr: Schema.String,
    exitCode: Schema.Number,
    statusCode: Schema.NullOr(Schema.Number),
    retryAfterSeconds: Schema.NullOr(Schema.Number),
    kind: Schema.Literals(["process", "timeout", "http"]),
    message: Schema.String,
  }
) {}

export class CurlJsonError extends Schema.TaggedError<CurlJsonError>()(
  "SpotUI/CurlJsonError",
  { stdout: Schema.String, message: Schema.String, cause: Schema.Unknown }
) {}

export interface CurlRunnerShape {
  readonly run: (
    request: CurlRequest
  ) => Effect.Effect<CurlResponse, CurlProcessError>
  readonly runJson: <S extends Schema.Constraint>(
    schema: S,
    request: CurlRequest
  ) => Effect.Effect<
    S["Type"],
    CurlProcessError | CurlJsonError | Schema.SchemaError,
    S["DecodingServices"]
  >
}

export class CurlRunner extends Context.Service<CurlRunner, CurlRunnerShape>()(
  "SpotUI/CurlRunner"
) {}

const readStream = async (stream: ReadableStream | null | undefined) =>
  stream ? Bun.readableStreamToText(stream) : ""

const splitStatusCode = (stdout: string) => {
  const match = stdout.match(/\n(\d{3})$/)
  return match
    ? { stdout: stdout.slice(0, match.index), statusCode: Number(match[1]) }
    : { stdout, statusCode: null }
}

const retryAfterFrom = (stderr: string) => {
  const match = stderr.match(/retry-after:\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

const runProcess = (args: readonly string[]) =>
  Effect.tryPromise({
    try: async (signal) => {
      const process = Bun.spawn({
        cmd: [...args],
        stdout: "pipe",
        stderr: "pipe",
      })
      const kill = () => process.kill()
      signal.addEventListener("abort", kill, { once: true })

      try {
        const [exitCode, stdout, stderr] = await Promise.all([
          process.exited,
          readStream(process.stdout),
          readStream(process.stderr),
        ])
        return { exitCode, stdout, stderr }
      } finally {
        signal.removeEventListener("abort", kill)
      }
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

export const CurlRunnerLive = Layer.effect(
  CurlRunner,
  Effect.gen(function* () {
    const attempt = Effect.fn("CurlRunner/attempt")((request: CurlRequest) => {
      const args = buildCurlArgs(request)
      return Effect.timeoutOrElse(runProcess(args), {
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
      }).pipe(
        Effect.map((result) => ({ ...result, ...splitStatusCode(result.stdout) })),
        Effect.flatMap((result) =>
          result.exitCode === 0 && (result.statusCode === null || result.statusCode < 400)
            ? Effect.succeed(result)
            : Effect.fail(
                new CurlProcessError({
                  args: [...args],
                  ...result,
                  retryAfterSeconds: retryAfterFrom(result.stderr),
                  kind: "http",
                  message: "The curl request failed.",
                })
              )
        )
      )
    })

    const run = Effect.fn("CurlRunner/run")((request: CurlRequest) =>
      attempt(request).pipe(
        Effect.retry({
          times: 2,
          schedule: Schedule.exponential("300 millis"),
          while: (error) =>
            error.kind === "process" ||
            (error.statusCode !== null && error.statusCode >= 500) ||
            (error.statusCode === 429 &&
              error.retryAfterSeconds !== null &&
              error.retryAfterSeconds <= 30),
        })
      )
    )

    const runJson = Effect.fn("CurlRunner/runJson")(
      <S extends Schema.Constraint>(schema: S, request: CurlRequest) =>
        run(request).pipe(
          Effect.flatMap((result) =>
            Effect.try({
              try: () => JSON.parse(result.stdout) as unknown,
              catch: (cause) =>
                new CurlJsonError({
                  stdout: result.stdout,
                  message: "The curl response was not valid JSON.",
                  cause,
                }),
            })
          ),
          Effect.flatMap(Schema.decodeUnknownEffect(schema)),
          Effect.mapError((error) =>
            error instanceof Schema.SchemaError
              ? error
              : error instanceof CurlJsonError
                ? error
                : error
          )
        )
    )

    return CurlRunner.of({ run, runJson })
  })
)
