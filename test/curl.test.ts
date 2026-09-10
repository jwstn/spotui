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

  test("encodes a PUT JSON body as a curl data argument", () => {
    expect(
      buildCurlArgs({
        method: "PUT",
        url: "https://api.spotify.com/v1/me/player/play?device_id=spotui-local",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer runtime-token",
        },
        json: { context_uri: "spotify:playlist:abc" },
      })
    ).toEqual([
      "curl",
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--request",
      "PUT",
      "--header",
      "Accept: application/json",
      "--header",
      "Authorization: Bearer runtime-token",
      "--header",
      "Content-Type: application/json",
      "--data",
      '{"context_uri":"spotify:playlist:abc"}',
      "--write-out",
      "\\n%{http_code}",
      "https://api.spotify.com/v1/me/player/play?device_id=spotui-local",
    ])
  })
})
