import { describe, expect, test } from "bun:test"
import { commandDefinitions, dispatchCommand } from "../src/commands"

describe("navigation commands", () => {
  test("exposes the MVP command registry", () => {
    expect(commandDefinitions.map((command) => command.id)).toEqual([
      "go-playlists",
      "go-saved-tracks",
      "go-saved-albums",
      "go-followed-artists",
      "back",
      "open",
      "refresh",
      "load-more",
      "quit",
    ])
  })

  test("dispatches a command to the typed bridge action", async () => {
    const calls: string[] = []
    const bridge = {
      selectCollection: (collection: string) => {
        calls.push(collection)
      },
      back: () => {
        calls.push("back")
      },
      openSelected: async () => {
        calls.push("open")
      },
      refresh: async () => {
        calls.push("refresh")
      },
      loadMore: async () => {
        calls.push("load-more")
      },
    }

    await dispatchCommand(bridge, "go-saved-albums")
    await dispatchCommand(bridge, "refresh")

    expect(calls).toEqual(["saved-albums", "refresh"])
  })
})
