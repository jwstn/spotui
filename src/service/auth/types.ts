import * as Schema from "effect/Schema"

export const PkcePair = Schema.Struct({
  verifier: Schema.String,
  challenge: Schema.String,
})
export type PkcePair = typeof PkcePair.Type

export const BearerToken = Schema.Struct({
  accessToken: Schema.String,
  expiresAt: Schema.Number,
  refreshToken: Schema.NullOr(Schema.String),
})
export type BearerToken = typeof BearerToken.Type

export const RawTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number,
  refresh_token: Schema.optionalKey(Schema.String),
})
export type RawTokenResponseSchema = typeof RawTokenResponseSchema.Type
