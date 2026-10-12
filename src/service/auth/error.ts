import * as Schema from "effect/Schema"

export class AuthError extends Schema.TaggedError<AuthError>()(
  "SpotUI/AuthError",
  {
    message: Schema.String,
    cause: Schema.Unknown,
  }
) {}
