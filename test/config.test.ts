import { afterEach, describe, expect, test } from "bun:test"
import { chmod, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import {
  configPathFor,
  parseSpotifyConfig,
  readConfig,
  resolveConfigPath,
} from "../src/config"

const permissionTestPath = join(tmpdir(), `spotui-config-${process.pid}.toml`)

afterEach(async () => {
  await rm(permissionTestPath, { force: true })
})

describe("Spotify configuration", () => {
  test("uses the explicit absolute override without fallback", () => {
    expect(
      resolveConfigPath({
        platform: "linux",
        home: "/home/alice",
        xdgConfigHome: "/home/alice/.config",
        override: "/tmp/spotui.toml",
      })
    ).toEqual({
      kind: "override",
      path: "/tmp/spotui.toml",
    })
  })

  test("uses native paths for each supported platform", () => {
    expect(configPathFor("linux", "/home/alice", "/custom/config")).toBe(
      "/custom/config/spotui/config.toml"
    )
    expect(configPathFor("macos", "/Users/alice")).toBe(
      "/Users/alice/Library/Application Support/spotui/config.toml"
    )
    expect(configPathFor("windows", "C:\\Users\\alice")).toBe(
      "C:\\Users\\alice\\AppData\\Local\\spotui\\config.toml"
    )
  })

  test("decodes only the durable credentials", () => {
    expect(
      parseSpotifyConfig(
        '[spotify]\nclient_id = "public-id"\nrefresh_token = "refresh-value"',
        "/tmp/spotui.toml"
      )
    ).toEqual({
      kind: "ready",
      path: "/tmp/spotui.toml",
      clientId: "public-id",
      refreshToken: "refresh-value",
    })
  })

  test("returns a safe error for incomplete configuration", () => {
    expect(
      parseSpotifyConfig('[spotify]\nclient_id = "public-id"', "/tmp/spotui.toml")
    ).toEqual({
      kind: "invalid",
      path: "/tmp/spotui.toml",
      message: "Missing spotify.refresh_token.",
    })
  })

  test("rejects broadly readable credential files on POSIX", async () => {
    if (process.platform === "win32") return
    await Bun.write(
      permissionTestPath,
      '[spotify]\nclient_id = "public-id"\nrefresh_token = "refresh-value"\n'
    )
    await chmod(permissionTestPath, 0o644)

    await expect(Effect.runPromise(readConfig(permissionTestPath))).resolves.toEqual({
      kind: "invalid",
      path: permissionTestPath,
      message: "Config permissions are too broad; use chmod 600.",
    })
  })
})
