import { Context, Effect, Layer, Schema } from "effect"

type Result<T> = { data: T; error: null } | { data: null; error: string }

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
type HttpHeaders = Record<string, string>
type HttpBody = Record<string, string> | string

interface HttpRequestConfig {
  method: HttpMethod
  url: string
  headers?: HttpHeaders
  body?: HttpBody
}

const ErrorMessage = Schema.String.pipe(Schema.brand("ErrorMessage"))
type ErrorMessage = typeof ErrorMessage.Type

class Message extends Schema.Class<Message>("Message")({
  message: ErrorMessage,
  cause: Schema.Unknown,
}) {}

class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  message: Message.fields.message,
  cause: Message.fields.cause,
}) {}

interface Interface {}

export class HttpService extends Context.Service<HttpService, Interface>()(
  "Services/HttpService"
) {
  static readonly Live = Layer.effect(
    HttpService,
    Effect.gen(function* () {
      const request = Effect.fn("HttpService.Request")((
        url: string,
        method: HttpMethod
      ) => {
        return Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: () => fetch(url, { method }),
            catch: (cause) =>
              new HttpError({
                cause,
                message: ErrorMessage.make("Message"),
              }),
          })
          return result
        })
      })

      return { request }
    })
  )
}

export async function http<T = unknown>(
  config: HttpRequestConfig
): Promise<Result<T>> {
  try {
    const init: RequestInit = {
      method: config.method,
      headers: config.headers,
    }

    if (config.body) {
      init.body =
        typeof config.body === "string"
          ? config.body
          : new URLSearchParams(config.body).toString()
    }

    const response = await fetch(config.url, init)

    if (!response.ok) {
      const text = await response.text()
      return { data: null, error: `HTTP ${response.status}: ${text}` }
    }

    const data = (await response.json()) as T
    return { data, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

// import { Context, Effect, Layer, Schema } from "effect"

// type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
// type HttpHeaders = Record<string, string>
// type HttpBody = Record<string, string> | string

// interface HttpRequestConfig {
//   method: HttpMethod
//   url: string
//   headers?: HttpHeaders
//   body?: HttpBody
// }

// class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
//   message: Schema.String,
//   cause: Schema.Unknown,
// }) {}

// export class HttpService extends Context.Service<
//   HttpService,
//   {
//     request: <T = unknown>(
//       config: HttpRequestConfig
//     ) => Effect.Effect<T, HttpError>
//   }
// >()("Services/HttpService") {
//   static readonly Live = Layer.effect(
//     HttpService,
//     Effect.gen(function* () {
//       const request = Effect.fn("HttpService.Request")(
//         <T = unknown>(config: HttpRequestConfig): Effect.Effect<T, HttpError> =>
//           Effect.gen(function* () {
//             const init: RequestInit = {
//               method: config.method,
//               headers: config.headers,
//             }

//             if (config.body) {
//               init.body =
//                 typeof config.body === "string"
//                   ? config.body
//                   : new URLSearchParams(config.body).toString()
//             }

//             const response = yield* Effect.tryPromise({
//               try: () => fetch(config.url, init),
//               catch: (cause) =>
//                 new HttpError({ message: "Fetch failed", cause }),
//             })

//             if (!response.ok) {
//               const text = yield* Effect.tryPromise({
//                 try: () => response.text(),
//                 catch: (cause) =>
//                   new HttpError({
//                     message: "Failed to read error body",
//                     cause,
//                   }),
//               })
//               return yield* Effect.fail(
//                 new HttpError({
//                   message: `HTTP ${response.status}: ${text}`,
//                   cause: response,
//                 })
//               )
//             }

//             const data = yield* Effect.tryPromise({
//               try: () => response.json() as Promise<T>,
//               catch: (cause) =>
//                 new HttpError({ message: "Failed to parse JSON", cause }),
//             })

//             return data
//           })
//       )

//       return { request }
//     })
//   )
// }
