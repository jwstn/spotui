# Spotify Playlist and Library Read APIs

> Context pointer: resolves GitHub issue [#3](https://github.com/jwstn/spotui/issues/3) for the wayfinding map [#1](https://github.com/jwstn/spotui/issues/1).

Research date: 2026-09-10
Sources are Spotify's current Web API documentation only. No application code is included in this note.

## Decision

The core read-only route is feasible with a Spotify user access token and four scopes:

```text
playlist-read-private playlist-read-collaborative user-library-read user-follow-read
```

The client must use offset pagination for playlists and saved library collections, and ID-cursor pagination for followed artists. It must model playlist contents as optional and polymorphic rather than assuming every playlist expands to tracks. Search is feasible as an optional catalog-search feature, but it is not a saved-library search and requires the additional `user-read-private` scope.

The core route does not require `user-read-email`, `user-read-private`, or a call to `GET /me`; the playlist and library endpoints can be read without displaying the Spotify user's profile.

## Endpoints

All paths below are relative to `https://api.spotify.com/v1` and require a user-authorized bearer token.

| Surface | Read endpoint | Scope | Request and response shape |
| --- | --- | --- | --- |
| Current user's playlists | `GET /me/playlists` | `playlist-read-private`; add `playlist-read-collaborative` to include collaborative playlists | Query `limit` (default 20, 1-50) and `offset` (default 0, documented maximum 100,000). Returns `Paged<SimplifiedPlaylistObject>`: `href`, `limit`, `next`, `offset`, `previous`, `total`, and `items[]`. Each item includes playlist metadata such as `id`, `name`, `description`, `images`, `owner`, `public`, `collaborative`, `snapshot_id`, and an `items` summary with `href` and `total`. The reference page still exposes deprecated `tracks`; use `items` under the February 2026 contract. |
| Playlist details | `GET /playlists/{playlist_id}` | The current reference page declares OAuth 2.0 but no additional authorization-scope block. Use the user's authorized token and the playlist-read scope already needed for private playlist access. | Returns a `PlaylistObject` with metadata (`id`, `name`, `description`, `images`, `owner`, `public`, `collaborative`, `snapshot_id`, external URL/URI) and, when accessible, an `items` paged object. Supports `market`, `fields`, and `additional_types=track,episode`. `fields` can project nested fields; `market` is an ISO 3166-1 alpha-2 code. |
| Playlist contents | `GET /playlists/{playlist_id}/items` | `playlist-read-private` | Query `market`, `fields`, `limit` (default 20, 1-50), `offset` (default 0), and `additional_types` (`track` and/or `episode`; default is track). Returns `Paged<PlaylistTrackObject>` with `href`, `limit`, `next`, `offset`, `previous`, `total`, and `items[]`. Each item has `added_at`, `added_by`, `is_local`, and `item`, where `item` is a track or episode object. Use this endpoint, not the removed `/playlists/{id}/tracks` read endpoint. |
| Saved tracks | `GET /me/tracks` | `user-library-read` | Query optional `market`, `limit` (default 20, 1-50), and `offset` (default 0). Returns `Paged<SavedTrackObject>` with the common paging fields and `items[]`; each item has `added_at` and a full `track` object. |
| Saved albums | `GET /me/albums` | `user-library-read` | Query `limit` (default 20, 1-50), `offset` (default 0), and optional `market`. Returns `Paged<SavedAlbumObject>` with the common paging fields and `items[]`; each item has `added_at` and a full `album` object. The album includes its own simplified `tracks` paged object, so displaying the saved-album list does not require fetching every album's tracks. |
| Followed artists | `GET /me/following?type=artist` | `user-follow-read` | `type` is required and currently only accepts `artist`. Query `after` with the last artist ID from the previous page and `limit` (default 20, 1-50). Returns `{ artists: CursorPaged<ArtistObject> }`, where `artists` has `href`, `limit`, `next`, `cursors: { after, before }`, `total`, and `items[]`. |

### Common response and content rules

- Offset-paged responses use `next` and `previous` URLs plus `offset`, `limit`, and `total`. Follow the returned `next` URL (or advance by `offset + limit`) until `next` is `null`; do not assume the first page is complete.
- Followed artists do not have an offset. Continue with the `after` cursor from `artists.cursors.after` or the returned `next` URL until `artists.next` is `null`. The request cursor is the last artist ID retrieved.
- Playlist details and items are only available for playlists owned by the current user or playlists where the user is a collaborator. Spotify documents `403 Forbidden` for a followed, non-collaborative playlist. `GET /me/playlists` can therefore return a playlist whose metadata is readable but whose `items` field is absent.
- Playlist items are not necessarily tracks. The endpoint defaults to tracks, can return episodes when requested, and instructs clients to inspect each object's `type` for future types. Unavailable playlist tracks can be `null`; local-file entries are marked by `is_local`.
- `market` controls availability for playlist details/items and saved tracks/albums. Spotify says the country associated with a valid user access token takes priority over an explicit market. If neither a market nor the user's country is available, content is considered unavailable.
- Artwork URLs in image objects are temporary and expire in less than a day. Metadata and artwork must retain Spotify attribution and a link back to the applicable Spotify object; Spotify content may not be downloaded.
- Fields including `available_markets`, popularity, and some other object properties are deprecated or can be removed by the current API contract. The February 2026 migration guide says to tolerate missing fields and specifically changes playlist `tracks`/`tracks.items`/`tracks.items.track` to `items`/`items.items`/`items.items.item`.

## Search Feasibility

`GET /search` is a catalog search endpoint, not a search over the Spotify user's saved library. It accepts required `q` and comma-separated `type` parameters. Supported types are `album`, `artist`, `playlist`, `track`, `show`, `episode`, and `audiobook`; optional parameters include `market`, `limit`, `offset`, and `include_external=audio`.

The response contains one paged result object per requested type, for example `tracks`, `artists`, `albums`, or `playlists`; each has `href`, `limit`, `next`, `offset`, `previous`, `total`, and `items[]`. Search pagination is offset-based, with a default limit of 5, a maximum limit of 10 per type, and a maximum offset of 1,000. The February 2026 migration guide confirms the reduced 10-result limit.

Spotify's current scopes table lists `user-read-private` for `GET /search`. That scope is described as access to subscription details, so search would add consent even if SpotUI never renders profile data. Search is technically viable but should remain optional and should not be used as a substitute for `GET /me/tracks` or `GET /me/albums`.

## Implementation Impact

- Keep the four core scopes in the PKCE authorization request from issue #2; do not add profile or email scopes for the read-only library screens.
- Define separate offset-page and cursor-page adapters, while allowing each adapter to follow Spotify's returned `next` URL.
- Use one playlist model with optional `items` and a discriminated track/episode item union. Treat a successful playlist metadata response without `items` as a supported state, not as an adapter failure.
- Carry `market` deliberately on content requests or surface unavailable content when the token/account market cannot resolve it.
- Use `items` for all current playlist reads and reject/deprecate assumptions based on `/playlists/{id}/tracks` or `tracks.items.track`.
- Keep search out of the blocking implementation slice; if added later, request `user-read-private`, cap each page at 10 results, and label results as catalog results rather than saved-library results.

## Sources

- [Get Current User's Playlists](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists)
- [Get Playlist](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
- [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- [Get User's Saved Tracks](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks)
- [Get User's Saved Albums](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-albums)
- [Get Followed Artists](https://developer.spotify.com/documentation/web-api/reference/get-followed)
- [Search for Item](https://developer.spotify.com/documentation/web-api/reference/search)
- [Scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes)
- [Authorization](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [February 2026 Web API Dev Mode Changes - Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Get Current User's Profile](https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile)
