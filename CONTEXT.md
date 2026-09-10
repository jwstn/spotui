# SpotUI

A terminal UI client for browsing a Spotify user's read-only library through OpenTUI.

## Language

**Spotify user**:
The account whose playlists and saved library SpotUI displays. Avoid: customer, profile owner.

**User authorization**:
Permission for SpotUI to read data owned by the Spotify user. It is distinct from app-only authorization, which cannot represent the user's library. Avoid: client credentials, API key.

**Client ID**:
The public identifier of the Spotify app requesting user authorization. It does not authenticate the Spotify user and is not a bearer token. Avoid: client ID token, API key.

**Refresh token**:
A durable credential that lets SpotUI obtain a new bearer token for the Spotify user without repeating authorization. Avoid: bearer token, client secret.

**Bearer token**:
A credential granted for Spotify API requests on behalf of the Spotify user. Avoid: client ID, API key.

**Login session**:
A temporary user-authorization interaction that turns a client ID into a refresh token. Avoid: profile session, client-credentials session.

**Configuration source**:
The one TOML file selected for SpotUI's Spotify credentials, either from the platform default or an explicit override. Avoid: config merge, credential pool.

**Playlist library**:
The Spotify user's playlists, playlist metadata, and tracks contained in those playlists. Avoid: playlist catalog, collection.

**Saved library**:
Tracks and albums explicitly saved by the Spotify user. Avoid: followed tracks, liked content.

**Followed artist collection**:
Artists the Spotify user follows. It is independent from the saved library and does not imply a collection of their tracks or albums. Avoid: followed tracks, followed albums.

**Playlist collection**:
The Spotify user's ordered set of playlist summaries and their navigable details. It does not include user-profile data. Avoid: playlist catalog.

**Playlist item**:
One ordered occurrence in a playlist, which may be a track, episode, local file, or unavailable item. Avoid: playlist track, media item.

**Unavailable item**:
A library occurrence whose Spotify content cannot be opened or whose metadata is incomplete, while retaining any stable identity and reason available. Avoid: missing item, null item.

**CurlRunner**:
The boundary that executes Spotify API requests through curl and returns decoded results or errors. Avoid: HTTP client, request builder.
