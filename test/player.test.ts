import { describe, expect, test } from "bun:test"
import { playerCommandFor } from "../src/player"

describe("player command selection", () => {
  test("prefers pacat over aplay when both exist", () => {
    expect(playerCommandFor((command) => ["pacat", "aplay"].includes(command))).toEqual([
      "pacat",
      "--format=s16le",
      "--rate=44100",
      "--channels=2",
      "-",
    ])
  })

  test("falls back to aplay when pacat is missing", () => {
    expect(playerCommandFor((command) => command === "aplay")).toEqual([
      "aplay",
      "-q",
      "-f",
      "S16_LE",
      "-r",
      "44100",
      "-c",
      "2",
      "-",
    ])
  })

  test("returns null when no PCM player is installed", () => {
    expect(playerCommandFor(() => false)).toBeNull()
  })
})