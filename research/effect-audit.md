# Effect Usage Audit

Date: 2026-09-16

## Scope And Baseline

This audit covers Effect usage in `src/service`, the Effect integration points in
`src/App.tsx`, `src/log.ts`, and the Effect-facing tests. It compares the code
with the checked-out reference at `.opencode/references/effect-smol` and with
the local installed package.

There is a dependency-source mismatch that should be resolved before a broad
migration:

- `package.json` declares `effect: ^4.0.0-rc.112`.
- `bun.lock` pins `4.0.0-rc.112`.
- `pnpm-lock.yaml` and the installed package resolve `4.0.0-rc.115`.
- The cloned `effect-smol` repository is archived at `4.0.0-beta.98`.

The reference checkout is still useful for v4 design guidance, but exact API
claims must be checked against the package version selected by the project.
For example, the checked-out v4 migration maps `Schema.TaggedError` to
`Schema.TaggedErrorClass` (`.opencode/references/effect-smol/migration/schema.md:33-35`),
while the installed RC still exports `Schema.TaggedError`. Pin one package
version and make the lockfiles agree before applying that mechanical rename.

## What Is Already Good

- Multi-step service construction uses `Effect.gen`, for example
  `src/service/auth.ts:143-371`.
- Reusable service methods generally have names via `Effect.fn`, for example
  `src/service/curl.ts:134-211` and `src/service/spotifyApi.ts:112-307`.
- External JSON responses are decoded with Effect Schema in
  `src/service/curl.ts:188-203`.
- Domain failures are mostly represented by tagged schema errors rather than
  untyped strings at the service boundary.
- The service interfaces are small enough to compose once their layers are
  separated from production wiring.

## Findings

### P0: Application resources are not owned by an Effect scope

`src/App.tsx:122-125` destroys the renderer directly. The bridge only exposes
`stopPlayback` (`src/service/bridge.ts:465-474`), and the player handle's
`close` operation is never called by the application (`src/player.ts:462-468`).
The close operation disposes the audio sink and closes the librespot session,
so a quit can leave child processes, streams, or the Spotify session alive.

This is the most serious lifecycle issue because it affects process shutdown,
not just Effect style.

Improvement:

- Add an idempotent application shutdown operation that stops playback,
  unsubscribes the playback listener, calls `PlaybackHandle.close()`, and
  waits for close completion before destroying the renderer.
- Prefer making the player an Effect service backed by a scoped layer. Acquire
  the player/session with `Effect.acquireRelease` and let the application scope
  close it.
- Keep one application-owned scope/runtime alive for the TUI lifetime.

The reference documents `Effect.acquireRelease` as the acquire/use/release
primitive (`packages/effect/src/Effect.ts:6545-6549`) and demonstrates resource
acquisition inside a `Layer.effect` (`ai-docs/src/01_effect/05_resources/10_acquire-release.ts:22-67`).

### P1: Effect runtime boundaries are scattered through the application

Effects are converted to promises in several independent places:

- `src/service/runtime.ts:20-35`
- `src/service/runtime.ts:43-45`
- `src/service/runtime.ts:65-81`
- `src/service/bridge.ts:720-743`
- `src/App.tsx:262-289`

The bridge then coordinates API calls, retries, and state updates with
`async`/`await`. That is a valid interop technique at an edge, but here the
edge is repeated inside the domain coordinator. It loses typed environment
requirements, typed failure unions, fiber ownership, and structured
interruption. No application fiber or runtime is retained for cancellation on
quit.

Improvement:

- Build the live service graph once at the application boundary.
- Keep service orchestration in Effects and expose only narrow Promise adapters
  where React/OpenTUI requires them.
- Use a shared `ManagedRuntime` or equivalent application runtime rather than
  calling `Effect.runPromise` after every operation.
- Retain and interrupt fibers for long-running startup, refresh, pagination,
  and shutdown operations.

The reference recommends `ManagedRuntime` for integrating Effect with an
imperative framework while retaining service/layer ownership
(`ai-docs/src/04_integration/10_managed-runtime.ts:60-89`). `runPromise` itself
is intended for Promise interop at the edge (`packages/effect/src/Effect.ts:8984-9023`),
not as the primary internal composition mechanism.

### P1: Live dependencies are hidden inside service layers

Both service layers provision the production CurlRunner internally:

- `src/service/auth.ts:143-146` and `src/service/auth.ts:369-370`
- `src/service/spotifyApi.ts:107-110` and `src/service/spotifyApi.ts:317`

Consequently, a test or alternate environment cannot provide a fake
`CurlRunner` to `AuthServiceLive` or `SpotifyApiLive`; the layer silently
replaces it with the real curl implementation. This also makes dependency
graphs harder to inspect and prevents shared instrumentation or configuration.

Improvement:

- Define `AuthServiceLive` and `SpotifyApiLive` as layers that require
  `CurlRunner`.
- Define separately named application layers that provide `CurlRunnerLive`.
- Compose those layers once at the root with `Layer.provide`.
- In tests, provide a deterministic fake layer explicitly.

This matches the reference distinction between a focused layer with required
dependencies and a production layer that wires them with `Layer.provide`
(`ai-docs/src/01_effect/03_services/20_layer-composition.ts:53-68`; the
primitive is documented at `packages/effect/src/Layer.ts:1375-1405`).

### P1: The bridge erases typed failures and formats them too early

`src/service/bridge.ts:720-725` accepts `Effect.Effect<A, unknown>`. The result
is immediately run as a Promise (`src/service/bridge.ts:726-743`), and most
failure paths turn the value into `String(error)` (`src/service/bridge.ts:322-337`,
`src/service/bridge.ts:570-618`). This makes authentication failures,
authorization failures, schema failures, rate limits, interruptions, and
defects indistinguishable to the state machine.

Improvement:

- Define a bridge-level error union, or preserve the service error union until
  the UI boundary.
- Handle expected tags with `Effect.catchTag` or a small typed mapper.
- Convert an error to a safe user-facing message exactly once, at the UI
  boundary.
- Handle interruption separately from an operational failure so a cancelled
  request does not display an error state.

The reference describes tagged errors as yieldable and matchable
(`packages/effect/src/Schema.ts:12955-13015`) and provides `Effect.retryOrElse`
for typed fallback handling (`packages/effect/src/Effect.ts:4063-4129`).

### P1: Untrusted playlist and persisted playback data bypass Schema

The playlist item schema accepts arbitrary values at
`src/spotifySchemas.ts:45-50`, and the normalizer casts one branch to
`RawTrack` without decoding it (`src/spotifyNormalize.ts:82-84`). A malformed
Spotify response can therefore reach normalizer code as an invalid shape and
throw outside the typed error channel.

Persisted playback credentials are also parsed and cast directly at
`src/service/config.ts:27-37`.

Improvement:

- Define schemas for the supported playlist item variants and decode the
  selected `item`/`track` value before normalization.
- Define a `PlaybackCredentialsSchema` and use
  `Schema.decodeUnknownEffect` after JSON parsing.
- Remove `as RawTrack` and make unsupported or incomplete variants explicit in
  the schema/domain model.
- Keep the raw API schema permissive only at fields that are intentionally
  ignored.

The reference says `Schema.decodeUnknownEffect` returns a typed Effect failure
(`packages/effect/src/Schema.ts:1347-1375`) and its guidance explicitly says to
use Schema for validation instead of manual predicates or unchecked parsing.

### P1: Resource cleanup is manual around curl and OAuth

`src/service/curl.ts:96-116` installs an abort listener and calls
`process.kill()`, but does not guarantee that the process has exited or that
all stream reads have completed before the effect finishes. The OAuth callback
server and timeout are similarly managed inside a Promise at
`src/service/auth.ts:195-285`; the timeout created at lines 266-271 is not
cleared after successful authorization.

Improvement:

- Wrap the spawned process in a scoped acquire/release operation.
- In the release action, remove listeners, terminate the process if needed,
  and await its exit without allowing release failure to replace the original
  result.
- Represent the callback server and timeout as resources with finalizers so
  success, failure, interruption, and timeout all stop the server and clear
  the timer.
- Prefer `Effect.callback` for callback registration when a Promise is not the
  natural boundary; its contract includes an interruption cleanup effect
  (`packages/effect/src/Effect.ts:1200-1206`).

### P1: Concurrent commands and pagination can race

Playback host creation is not single-flight (`src/service/bridge.ts:350-362`),
and commands are dispatched without serialization (`src/App.tsx:114-117`,
`src/commands.ts:26-37`). Two commands can concurrently initialize the player,
replace handles, or update playback state out of order.

The collection load-more path has no generation/view check on completion
(`src/service/bridge.ts:584-618`), unlike the initial load path. A stale page
can therefore append after a refresh, collection switch, or another load.

Improvement:

- Use a single-flight `Deferred`/ref or semaphore for player startup.
- Serialize mutating commands, or model them as an Effect queue/fiber that
  owns bridge state transitions.
- Carry the collection/view generation through `loadMore` and reject stale
  completions just as `openSelected` and refresh do.
- Make concurrency intentional in `Effect.all`; pass an explicit concurrency
  option where parallelism is part of the contract. The Effect v4 API exposes
  this option in `packages/effect/src/Effect.ts:514-526`.

### P1: Refresh-token persistence failures are discarded

At `src/service/bridge.ts:212-225`, failure to persist a rotated refresh token
is caught and ignored. The current process continues with an in-memory token,
but the next launch may use a revoked token and the user receives no warning.

Improvement:

- Give persistence failure its own typed error or warning outcome.
- Decide explicitly whether API access should fail closed, retry persistence,
  or continue with a visible warning.
- Test token rotation and persistence failure as separate cases.

### P1: Request failures can retain bearer and refresh tokens

`CurlProcessError` stores the full `args` array
(`src/service/curl.ts:44-55`). `buildCurlArgs` places authorization headers and
form values into those arguments (`src/service/curl.ts:31-40`), and the auth
forms include a refresh token (`src/service/auth.ts:84-93`). The errors are
then retained as causes by `SpotifyApiError` (`src/service/spotifyApi.ts:35-41`).

Improvement:

- Never store raw command arguments in a user-visible or log-retained error.
- Store a redacted request description, with authorization and refresh-token
  fields replaced before constructing the error.
- Avoid retaining raw response bodies when they can contain credentials or
  provider diagnostics that should not reach the UI.
- Consider Effect's `Redacted` type for in-memory credential values, while
  still redacting at the curl/process boundary.

### P2: Retry behavior is not tied to the server's retry delay

`src/service/curl.ts:173-185` uses exponential retry timing for process errors,
5xx responses, and selected 429 responses. It parses `retry-after` from
stderr (`src/service/curl.ts:91-94`), but the request does not capture response
headers, and the schedule never uses `retryAfterSeconds`. There is no jitter.

Improvement:

- Capture the actual response header or use a client that exposes response
  headers.
- Model retryability and retry delay as typed error data.
- Build a schedule that honors `Retry-After`, caps the total delay, and adds
  jitter for concurrent clients.
- Keep process-start failures and server throttling as separate retry classes.

Effect's `retry` is designed to consume a `Schedule`
(`packages/effect/src/Effect.ts:4040-4061`), so this policy belongs in the
typed service rather than in ad hoc metadata that the schedule ignores.

### P2: File logging is fire-and-forget and unflushable

`src/log.ts:12-17` starts `appendFile` without awaiting it, serializing it, or
registering shutdown behavior. Lines can reorder or be lost when the process
exits, and all write failures are silently discarded.

Improvement:

- Put file writes behind an Effect service or queue.
- Serialize writes and expose a flush/close operation.
- Attach logger cleanup to the application scope.
- Redact sensitive fields before logging rather than relying on the logger to
  receive safe messages.

### P2: Effect-specific integration tests are missing

Current tests mostly exercise pure helpers or manually supplied bridge
dependencies. For example, `test/curl.test.ts:4-60` tests only command
construction, and `test/auth.test.ts:8-50` tests URL/request helpers and PKCE.
There are no tests for live layer composition, CurlRunner interruption and
retry, OAuth server cleanup, playback shutdown, stale pagination, concurrent
player startup, logger failure, or playback-credential decoding.

Improvement:

- Add service tests with explicit fake layers for CurlRunner and Clock.
- Add live tests for filesystem, child process, callback server, and shutdown
  behavior, using scoped fixtures and finalizers.
- Add race tests for duplicate startup, stale load-more responses, and token
  refresh single-flight behavior.
- Use the Effect test style from the reference layer tests, which provides a
  shared test layer and tears it down after the test block
  (`ai-docs/src/09_testing/20_layer-tests.ts:6-18`, `92-105`).

## Recommended Order Of Work

1. Pin one Effect RC and one lockfile strategy; decide whether the project is
   targeting the installed RC API or the cloned v4 source API.
2. Add application shutdown and close the player/session deterministically.
3. Split service implementation layers from live dependency wiring.
4. Add schemas for persisted credentials and playlist item variants.
5. Preserve typed errors through the bridge and add redaction before errors are
   retained or logged.
6. Make player startup, command mutation, and pagination concurrency explicit.
7. Replace manual resource handling with scoped finalizers.
8. Add Effect service/live integration tests before larger refactors.

## Residual Questions

- Is `effect-smol` intended as a historical API reference, or should the repo
  target the currently installed `effect@4.0.0-rc.115` API?
- Should refresh-token persistence failure block the current session or only
  produce a visible warning?
- Is concurrent initial loading of all four collections required, or should
  the UI prioritize the active collection and load the rest in the background?
- Does the application have a renderer lifecycle hook that can await bridge
  shutdown before `renderer.destroy()`?

## Verification

- `bun test test/*.test.ts`: 27 tests passed.
- `bun run typecheck`: fails on existing errors in `src/App.tsx`,
  `src/components/LeftSidebar.tsx`, and `src/spotifyNormalize.ts`; the audit
  did not modify application code.
