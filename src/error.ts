import { Schema } from "effect"

export const ErrorMessage = Schema.String.pipe(Schema.brand("ErrorMessage"))
export type ErrorMessage = typeof ErrorMessage.Type

export class Message extends Schema.Class<Message>("Message")({
  message: ErrorMessage,
  cause: Schema.Unknown,
}) {}

export class GeneralError extends Schema.TaggedError<GeneralError>()(
  "Spotui/GeneralError",
  {
    message: Message.fields.message,
    cause: Message.fields.cause,
  }
) {}

export class GeneralCurlError extends Schema.TaggedError<GeneralCurlError>()(
  "Spotui/CurlClient/GeneralCurlError",
  {
    message: Message.fields.message,
    cause: Message.fields.cause,
  }
) {}

export class JsonParseCurlError extends Schema.TaggedError<JsonParseCurlError>()(
  "Spotui/CurlClient/JsonParseCurlError",
  {
    message: Message.fields.message,
    cause: Message.fields.cause,
  }
) {}
