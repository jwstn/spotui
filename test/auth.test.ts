import { describe, expect, test } from "bun:test"
import { buildAuthorizationUrl, createPkcePair, refreshTokenRequest } from "../src/auth"

describe("Spotify authorization", () => {
  test("builds a PKCE authorization URL with read scopes", () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "http://127.0.0.1:43123/callback",
        state: "state-value",
        challenge: "challenge-value",
      })
    )

    expect(url.searchParams.get("client_id")).toBe("client-id")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("scope")).toContain("playlist-read-private")
    expect(url.searchParams.get("scope")).toContain("user-library-read")
  })

  test("refreshes with client ID and refresh token, never a client secret", () => {
    expect(
      refreshTokenRequest({ clientId: "client-id", refreshToken: "refresh-token" })
    ).toEqual({
      method: "POST",
      url: "https://accounts.spotify.com/api/token",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: {
        grant_type: "refresh_token",
        client_id: "client-id",
        refresh_token: "refresh-token",
      },
    })
  })

  test("creates a verifier and S256 challenge pair", async () => {
    const pair = await createPkcePair()
    expect(pair.verifier.length).toBeGreaterThan(20)
    expect(pair.challenge).not.toBe(pair.verifier)
    expect(pair.challenge).not.toContain("=")
  })
})
