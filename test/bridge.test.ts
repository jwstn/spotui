import { describe, expect, test } from "bun:test"
import {
  beginCollectionLoad,
  completeCollectionLoad,
  failCollectionLoad,
  initialCollectionState,
} from "../src/bridge"

describe("bridge collection state", () => {
  test("keeps existing data visible during refresh", () => {
    const current = {
      ...initialCollectionState<string>(),
      status: "ready" as const,
      items: ["old"],
    }

    expect(beginCollectionLoad(current, 2)).toEqual({
      status: "refreshing",
      items: ["old"],
      continuation: null,
      error: null,
      generation: 2,
      loadingMore: false,
    })
  })

  test("discards a stale completion", () => {
    const current = beginCollectionLoad(
      beginCollectionLoad(initialCollectionState<string>(), 1),
      2
    )

    expect(
      completeCollectionLoad(current, 1, { items: ["stale"], continuation: null })
    ).toBe(current)
  })

  test("retains items and continuation after a refresh failure", () => {
    const current = beginCollectionLoad(
      {
        ...initialCollectionState<string>(),
        status: "ready" as const,
        items: ["old"],
        continuation: { kind: "offset" as const, offset: 1, limit: 1 },
      },
      3
    )

    expect(failCollectionLoad(current, 3, "network")).toEqual({
      status: "error",
      items: ["old"],
      continuation: { kind: "offset", offset: 1, limit: 1 },
      error: "network",
      generation: 3,
      loadingMore: false,
    })
  })
})
