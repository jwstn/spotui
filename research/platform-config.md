# Native Platform Config Locations and Secret Handling

> Context pointer: resolves GitHub issue [#5](https://github.com/jwstn/spotui/issues/5) for the wayfinding map [#1](https://github.com/jwstn/spotui/issues/1).

Research date: 2026-09-10

Sources are platform-owner specifications and documentation. No application
code is included in this note.

## Decision

Use one logical per-user TOML file named `config.toml` under the platform's
native per-user application/configuration root. Do not search the working
directory or merge several implicit files.

| Platform | Default root and file | Resolution rule |
| --- | --- | --- |
| Linux | `$XDG_CONFIG_HOME/spotui/config.toml`; fallback `~/.config/spotui/config.toml` | Follow the XDG Base Directory Specification. An unset or empty `XDG_CONFIG_HOME` uses `$HOME/.config`; a relative value is invalid and must be ignored. |
| macOS | `~/Library/Application Support/spotui/config.toml` | Use the per-user `Library/Application Support` area for app-managed configuration and support data, not `Library/Preferences`, which Apple says should be managed through its preferences APIs. |
| Windows | `%LOCALAPPDATA%\spotui\config.toml` | Resolve the Windows `FOLDERID_LocalAppData` known folder rather than assuming a literal environment-variable path. The conceptual default is `%USERPROFILE%\AppData\Local`. |

The explicit override is the non-empty `SPOTUI_CONFIG` environment variable.
It must be an absolute path and takes precedence over the platform default;
the two locations are not merged. A relative override is an error rather than
an implicit path relative to the current working directory.

`spotui` is the stable application directory name on every platform. The
native roots differ, but the logical discovery contract and file name do not.

## Platform Findings

### Linux

The XDG Base Directory Specification defines `XDG_CONFIG_HOME` as the base
for user-specific configuration and specifies `$HOME/.config` when it is
unset or empty. It requires base-directory values to be absolute and says an
invalid relative value should be ignored. Its lookup convention places the
application subdirectory and file below that base directory.

When creating a missing destination directory, the specification says an
application should attempt to create it with mode `0700`. Linux's `umask(2)`
documentation shows why this is not enough for a secret-bearing file: a
usual umask of `022` turns a requested `0666` file into `0644`, and a parent
default ACL can take precedence over the umask. Create the TOML file with
owner-only mode `0600` explicitly, and create the application directory with
`0700` when it does not exist.

For an existing POSIX config, reject group/other mode bits when it contains a
refresh token instead of silently treating a broadly readable file as safe.
The error should tell the user to restrict the file, for example with
`chmod 600`, without printing the token.

### macOS

Apple's File System Programming Guide identifies the current user's `Library`
as the location for user-specific app files. It specifically assigns
app-created data files and configuration files to `Library/Application
Support`, while `Library/Preferences` is intended for `NSUserDefaults` or
CFPreferences rather than files created directly by an app. This makes
`~/Library/Application Support/spotui/config.toml` the native TOML location.

Apple documents that macOS access is governed by both BSD permissions and
ACLs. Apply the same owner-only `0600` file policy and `0700` application
directory policy used on Linux, but do not treat mode bits as a complete proof
of isolation: an ACL can grant additional access. Network or unusual file
systems may also have different ACL behavior.

### Windows

Microsoft documents `FOLDERID_LocalAppData` as a per-user known folder with
the default path `%USERPROFILE%\AppData\Local`, and `FOLDERID_RoamingAppData`
as the separate `%APPDATA%` roaming location. A refresh token is local
machine state for this client, so use LocalAppData rather than deliberately
placing it in RoamingAppData.

Microsoft recommends the Known Folder APIs for new code. `SHGetKnownFolderPath`
resolves a known folder for the current user and allows the system's redirected
folder location to be honored. The app should therefore append `spotui` and
`config.toml` to the resolver result.

Windows does not provide a portable equivalent of Unix `0600` mode checks.
Microsoft documents that a newly created file with no explicit security
descriptor inherits its ACL from the parent directory, and that access is
checked against the file's security descriptor. Keep the file below the
per-user LocalAppData root and preserve its inherited ACL; do not attempt to
translate Unix mode bits into Windows behavior. If a future strict policy
requires removing inherited grants, it must use Windows security-descriptor
APIs and be tested as Windows ACL behavior, not as a numeric mode.

## Credential Handling

The TOML may contain the public Spotify `client_id` and the per-user refresh
token established by the PKCE flow. It must not contain a Spotify client
secret. The access token and expiry are disposable runtime state and should
not be persisted merely because the config is TOML-backed.

On all platforms:

- Never log the parsed config, refresh token, or complete path in an error that
  might be copied into diagnostics.
- Write credential updates atomically through a temporary file in the same
  application directory, apply the platform-appropriate restriction before
  writing secret data, then replace the old file.
- Do not use cache, temporary, public, shared, or installation directories for
  the credential-bearing file.
- Treat `SPOTUI_CONFIG` as a path override only; do not add a token-valued
  environment-variable fallback.

## Testing Implications

The configuration boundary needs a path resolver seam so tests do not modify a
real home directory or depend on the host OS. Cover at least:

- Linux defaults with unset, empty, absolute, and relative
  `XDG_CONFIG_HOME` values.
- macOS `Library/Application Support` and Windows `FOLDERID_LocalAppData`
  resolution, including redirected/non-default roots supplied by a resolver
  fake.
- A non-empty absolute `SPOTUI_CONFIG` winning over every native default,
  rejection of a relative override, and no fallback search after an explicit
  override.
- Creation of missing parent directories and the exact default paths for all
  three platforms.
- POSIX directory/file modes (`0700`/`0600`), rejection of group/other bits on
  an existing credential file, and behavior when an ACL or umask changes the
  resulting mode. These tests should run on Linux and macOS rather than
  assuming Windows mode semantics.
- Windows ACL behavior on a Windows runner or through a security-descriptor
  test seam. `icacls` can inspect the resulting DACL, but a test must not
  assert that Windows exposes Unix-style owner/group/other bits.
- Atomic refresh-token replacement, preservation of a token omitted by a
  refresh response, and redaction of the token from errors and logs.

## Decision Impact

- The implementation needs a small platform path resolver and one explicit
  `SPOTUI_CONFIG` override, with no implicit current-directory config.
- The TOML credential schema can remain one per-user file, but its refresh
  token is a secret and its access-token cache is optional disposable state.
- POSIX writes require explicit restrictive modes; `umask` is not a sufficient
  security control. Windows needs native ACL handling rather than mode-bit
  portability assumptions.
- The later configuration and authorization tickets must include path,
  permission, atomic-write, redaction, and cross-platform test seams before
  the Spotify request boundary depends on persisted credentials.

## Sources

- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/)
- [Linux `umask(2)`](https://man7.org/linux/man-pages/man2/umask.2.html)
- [Linux `chmod(2)`](https://man7.org/linux/man-pages/man2/chmod.2.html)
- [Apple File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- [Microsoft Known Folders](https://learn.microsoft.com/en-us/windows/win32/shell/known-folders)
- [Microsoft `KNOWNFOLDERID`](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)
- [Microsoft `SHGetKnownFolderPath`](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath)
- [Microsoft File Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights)
- [Microsoft `icacls`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
