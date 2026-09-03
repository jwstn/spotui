# SpotUI

A terminal UI client for the Spotify API, built with Bun and OpenTUI.

## Language

**CurlRunner**:
Executes HTTP requests from structured config using native fetch, returning a result type with data or error. Avoid: http client, request builder.

**Result type**:
A `{ data, error }` discriminated union returned by the curl runner. The caller decides how to handle errors — no exceptions are thrown. Avoid: throw, try/catch.

**Client Credentials flow**:
Spotify's server-to-server authentication. A POST to `/api/token` with client ID and secret returns a bearer token. No user login involved. Avoid: auth code, authorization code.

**Bearer token**:
An access token obtained from the Client Credentials flow, used in the `Authorization` header for subsequent Spotify API requests. Avoid: api key, access token (overloaded).
