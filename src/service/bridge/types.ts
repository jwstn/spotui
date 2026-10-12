import * as Schema from "effect/Schema"

export const CollectionStatus = Schema.Literals([
  "idle",
  "loading",
  "refreshing",
  "ready",
  "error",
])
export type CollectionStatus = typeof CollectionStatus.Type
