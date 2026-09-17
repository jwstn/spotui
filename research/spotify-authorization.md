# Spotify User Authorization and Token Lifecycle

> Context pointer: resolves GitHub issue [#2](https://github.com/jwstn/spotui/issues/2) for the wayfinding map [#1](https://github.com/jwstn/spotui/issues/1).

Research date: 2026-09-10

Sources are Spotify's current Web API documentation. No application code is included in this note.

## Decision

Use **Authorization Code with PKCE** for SpotUI. Spotify recommends this flow when a client secret cannot be safely stored, explicitly including desktop applications, and its flow table says it can access user resources and refresh access tokens without a server-side secret. The client-credentials flow is not suitable because it does not include user authorization and cannot access user library data.

Sources:

- [Authorization](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [Authorization Code with PKCE Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)

## Authorization Flow

1. Generate a high-entropy PKCE code verifier of 43-128 characters, then derive an S256 code challenge. Keep the verifier available for the authorization-code exchange.
2. Open `https://accounts.spotify.com/authorize` with `response_type=code`, `client_id`, `redirect_uri`, the space-separated `scope`, `code_challenge_method=S256`, and `code_challenge`. Include a random `state`; Spotify calls it optional but strongly recommends it for CSRF protection.
3. Receive `code` and `state` at the callback. Reject an unexpected state and handle an `error` response such as `access_denied`.
4. POST `application/x-www-form-urlencoded` to `https://accounts.spotify.com/api/token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, and `code_verifier`. The `redirect_uri` must exactly match the authorization request.

For a terminal-native callback, register an explicit loopback IP literal such as `http://127.0.0.1/callback` and use a dynamically selected port in the authorization request. Spotify permits dynamic ports for loopback IP literals when the registered URI omits the port. `localhost` is not allowed; non-loopback callbacks must use HTTPS. Exact redirect-URI matching still applies apart from the documented loopback-port exception.

Sources:

- [Authorization Code with PKCE Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)

## Required Read Scopes

Request the least set that covers the agreed read-only library surfaces:

| Surface | Scope | Spotify endpoint and limitation |
| --- | --- | --- |
| Private playlists | `playlist-read-private` | `GET /me/playlists`; also required by `GET /playlists/{id}/items` |
| Collaborative playlists | `playlist-read-collaborative` | Include collaborative playlists when requesting a user's playlists |
| Saved tracks | `user-library-read` | `GET /me/tracks` |
| Saved albums | `user-library-read` | `GET /me/albums` |
| Followed artists | `user-follow-read` | `GET /me/following?type=artist`; the endpoint currently supports artists only |

Therefore the default authorization scope string should be:

```text
playlist-read-private playlist-read-collaborative user-library-read user-follow-read
```

Do not request `user-read-private` or `user-read-email` for these surfaces. Spotify documents those scopes for profile/subscription or email access, not for the four library surfaces. If optional search is later adopted, Spotify's scope table lists `user-read-private` for search.

Sources:

- [Scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes)
- [Get Current User's Playlists](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists)
- [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- [Get User's Saved Tracks](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks)
- [Get User's Saved Albums](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-albums)
- [Get Followed Artists](https://developer.spotify.com/documentation/web-api/reference/get-followed)

## Token Lifecycle

- The token response contains a Bearer `access_token`, the granted `scope`, `expires_in`, and a `refresh_token`. Spotify documents `expires_in=3600`; treat the access token as valid for one hour and refresh before or on expiry.
- Refresh with a POST to `/api/token`, form-encoded as `grant_type=refresh_token`, `refresh_token`, and `client_id`. For PKCE, `client_id` is required and the client-secret `Authorization` header is not; do not put a client secret in the native app's TOML.
- A refresh response may omit `refresh_token`. Preserve the existing refresh token unless a replacement is returned, in which case persist the replacement.
- Spotify documents a six-month lifetime for refresh tokens issued to Developer Dashboard apps. Refreshing an access token does not extend that lifetime. The lifetime starts when the user authorizes; after expiry SpotUI must send the user through authorization again.
- `invalid_grant` means the refresh token is expired, revoked, or otherwise invalid. Discard the unusable credential and require a fresh authorization rather than retrying refresh indefinitely.

The TOML-backed credential model therefore needs, at minimum, a `client_id` and per-user `refresh_token`. The access token and its expiry can be runtime state; if cached, they must be treated as disposable. This is an implementation consequence of Spotify's PKCE and refresh rules, not a Spotify-prescribed TOML schema.

Sources:

- [Authorization Code with PKCE Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Access Token](https://developer.spotify.com/documentation/web-api/concepts/access-token)
- [Refreshing Tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens)

## API Limitations Affecting the Map

- **Playlist contents are not universally readable.** `GET /me/playlists` lists playlists owned or followed by the current user, but Spotify says playlist items are available only when the user owns the playlist or is a collaborator. A followed, non-collaborative playlist may therefore be metadata-only; no read scope bypasses this limitation. The UI and domain model must represent absent items rather than assume every listed playlist can be expanded.
- **Use the current endpoint names.** Spotify's February 2026 migration documentation removed playlist `/tracks` reads and replaced them with `GET /playlists/{id}/items`. Response fields changed from `tracks` to `items`, and playlist item content is subject to the ownership/collaboration rule above.
- **Paginate every collection.** Playlist, saved-track, and saved-album endpoints accept at most 50 items per request. Followed artists also accept at most 50 and use a cursor (`after`) rather than offset pagination. The playlist-list endpoint documents a maximum offset of 100,000.
- **Market availability matters.** Saved-track, saved-album, and playlist-item requests document a `market` parameter and say content is unavailable when neither a market nor the user's country is available. When a valid user access token is present, the user's account country takes priority over the explicit market. The adapters should pass a market where required and handle unavailable or restricted content.
- **Returned items can be incomplete.** Playlist entries can contain a null item for unavailable tracks; playlist contents can include episodes as well as tracks; local-file entries are possible. The client must inspect item types and nullability rather than cast every item to a playable Spotify track.
- **Rate limits are rolling-window limits.** Spotify may return `429`; its documentation says the response normally includes `Retry-After`. Apply bounded backoff and avoid eager fan-out. Development-mode quota exhaustion is distinct and returns a `QUOTA_EXCEEDED` reason.
- **Development Mode is constrained.** The app owner needs Spotify Premium, up to five authenticated users can use the app, and each user must be allowlisted. As of Spotify's July 2026 changelog, developers may create up to 25 client IDs, but development-mode quota is counted per developer account rather than independently per client ID. Extended quota mode is intended for wider audiences and Spotify's current documentation says new quota-extension applications are accepted from organizations, not individuals.
- **Content policy still applies to a read-only UI.** Spotify's endpoint documentation prohibits downloading Spotify content, requires visual content to remain in its original form, requires attribution/link-back for Spotify metadata and artwork, and prohibits using Spotify content to train AI models.

Sources:

- [Get Current User's Playlists](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists)
- [Get Playlist](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
- [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- [February 2026 Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [February 2026 Changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [Rate Limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [Quota Modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [July 2026 Changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)

## Decision Impact

- The architecture needs a local loopback callback listener and a browser-based authorization handoff, with PKCE state held only for the active authorization transaction.
- The TOML schema must distinguish stable app identity (`client_id`) from per-user refresh credentials. It must support atomic replacement of a rotated refresh token and a reauthorization path at least every six months.
- The Spotify request boundary must own access-token freshness and one-time refresh coordination so concurrent API calls do not race to refresh the same credential. Token exchange and refresh remain curl-backed operations under the map's existing constraint.
- The initial scope set is four scopes and remains read-only. Do not add mutation scopes.
- Playlist navigation must show or explain metadata-only followed playlists; it cannot promise track contents for every playlist returned by Spotify.
- Pagination, 401/403/429 handling, market/restriction handling, null playlist items, and track-versus-episode discrimination belong in the later endpoint-adapter and acceptance-test tickets.
