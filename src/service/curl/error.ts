import * as Schema from "effect/Schema"

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
