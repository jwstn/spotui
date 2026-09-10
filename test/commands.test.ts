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
      "toggle-play",
      "next-track",
      "previous-track",
      "stop",
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
      togglePlayback: async () => {
        calls.push("toggle-play")
      },
      nextTrack: async () => {
        calls.push("next-track")
      },
      previousTrack: async () => {
        calls.push("previous-track")
      },
      stopPlayback: async () => {
        calls.push("stop")
      },
    }

    await dispatchCommand(bridge, "go-saved-albums")
    await dispatchCommand(bridge, "refresh")
    await dispatchCommand(bridge, "toggle-play")
    await dispatchCommand(bridge, "next-track")
    await dispatchCommand(bridge, "previous-track")
    await dispatchCommand(bridge, "stop")

    expect(calls).toEqual([
      "saved-albums",
      "refresh",
      "toggle-play",
      "next-track",
      "previous-track",
      "stop",
    ])
  })
})
