import { describe, expect, test } from "bun:test"
import { buildCurlArgs } from "../src/curl"

describe("curl command construction", () => {
  test("builds a GET request with headers", () => {
    expect(
      buildCurlArgs({
        method: "GET",
        url: "https://api.spotify.com/v1/me/playlists",
        headers: {
          Authorization: "Bearer runtime-token",
          Accept: "application/json",
        },
      })
    ).toEqual([
      "curl",
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--request",
      "GET",
      "--header",
      "Authorization: Bearer runtime-token",
      "--header",
      "Accept: application/json",
      "--write-out",
      "\\n%{http_code}",
      "https://api.spotify.com/v1/me/playlists",
    ])
  })

  test("encodes form bodies as one curl data argument", () => {
    expect(
      buildCurlArgs({
        method: "POST",
        url: "https://accounts.spotify.com/api/token",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        form: {
          grant_type: "refresh_token",
          client_id: "public-id",
          refresh_token: "refresh-value",
        },
      })
    ).toEqual([
      "curl",
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--request",
      "POST",
      "--header",
      "Content-Type: application/x-www-form-urlencoded",
      "--data",
      "grant_type=refresh_token&client_id=public-id&refresh_token=refresh-value",
      "--write-out",
      "\\n%{http_code}",
      "https://accounts.spotify.com/api/token",
    ])
  })
})
