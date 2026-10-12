# ghui Initialization, Effect Bridge, and Architecture

Research date: 2026-09-13

## Scope and Convention

This note answers how the `ghui` application is initialized, how its Effect
programs reach the React/OpenTUI frontend, and which architectural features
organize the software. The repository already keeps research notes in
`research/*.md`, so this report is stored at `research/ghui-architecture.md`.

The repository source paths and line ranges below refer to the checkout at
`/home/jw/Code/spotui/ghui`. External framework claims are limited to the
official OpenTUI and Effect sources listed in [Sources](#sources), each checked
on the research date.

## Findings

### Short answer

`ghui` has no source file named `bridge`. The Effect-to-frontend bridge is a
composition of two pieces:

1. `ghui/src/services/runtime.ts:45-64` builds the application service
   layers and creates `githubRuntime` with `Atom.runtime(...)`.
2. `ghui/src/index.tsx:120-162` dynamically obtains
   `RegistryProvider` and `App`, then renders `App` inside the provider;
   `@effect/atom-react` hooks consequently read and write the registry used by
   the runtime-created atoms.

The terminal entrypoint is `ghui/src/index.tsx`. The packaged Node launcher
`ghui/bin/ghui.js` normally selects a platform binary and falls back to the
source entrypoint `ghui/src/standalone.ts` when that binary is unavailable.

### Application initialization

#### Packaged command path

- The published package exposes `ghui/bin/ghui.js` as the `ghui` executable
  (`ghui/package.json:34-36`).
- The launcher handles `GHUI_BIN_PATH` first, then handles help, version, and
  upgrade commands (`ghui/bin/ghui.js:46-67`).
- For a normal launch it maps Node's platform and architecture to the
  published binary package, rejects unsupported combinations, rejects musl
  Linux, and resolves `bin/ghui` from the platform package
  (`ghui/bin/ghui.js:15-23,69-110`).
- If that binary is absent but `src/standalone.ts` exists, it runs the source
  entrypoint with Bun and forwards the CLI arguments
  (`ghui/bin/ghui.js:112-120`).

The package also defines `start` as `bun run src/index.tsx` and `dev` as a
watch-mode launch of that entrypoint (`ghui/package.json:44-47`). The standalone
entrypoint handles help, version, upgrade, and unknown commands before
`await import("./index.js")` starts the actual UI
(`ghui/src/standalone.ts:3-12,31-55`).

#### Renderer and process setup

`ghui/src/index.tsx` is a top-level-await Bun module. It imports OpenTUI's
renderer factory and React binding, Effect, and React hooks
(`ghui/src/index.tsx:1-14`). Before creating the renderer it enables the
alternate screen environment setting (`ghui/src/index.tsx:16`). The renderer
is created with Ctrl-C exit disabled, alternate-screen mode, passthrough
external output, and an `onDestroy` callback that disables terminal focus
reporting and exits the process (`ghui/src/index.tsx:71-79`).

This matches OpenTUI's ownership model: the official React binding documents
that `createRoot(renderer)` adopts an existing renderer rather than owning it,
and that the code which creates the renderer owns renderer cleanup. OpenTUI's
renderer documentation says that `createCliRenderer()` performs asynchronous
terminal setup and returns a `CliRenderer` whose root represents the render
tree ([OpenTUI React bindings](https://opentui.com/docs/bindings/react/),
[OpenTUI Renderer](https://opentui.com/docs/core-concepts/renderer/)).

The entrypoint installs a handoff seam for interactive subprocesses such as an
editor. `setTuiSuspender` receives callbacks that disable focus reporting,
suspend the renderer, then resume it, re-enable focus reporting, repaint the
full screen, and request a render (`ghui/src/index.tsx:81-94`).

It also constructs the system-theme reloader, wiring terminal palette reads,
color application, Effect-backed preference lookup, timers, and SIGUSR2 to the
reloader (`ghui/src/index.tsx:96-118`). The baseline is primed before React is
mounted (`ghui/src/index.tsx:114`).

#### Bootstrap and first render

`Bootstrap` owns three startup states: the dynamically loaded application
bundle, a human-readable boot hint, and a system-theme generation counter
(`ghui/src/index.tsx:120-124`). On mount it schedules startup work for the next
turn of the event loop, registers the bash Tree-sitter parser, then dynamically
imports `@effect/atom-react` and `./App.js`
(`ghui/src/index.tsx:125-151`).

While those imports are pending, Bootstrap renders `StartupLogo`, which uses
the OpenTUI renderer and terminal dimensions and advances a spinner on an
interval (`ghui/src/index.tsx:50-69,153-163`). Once imports resolve, Bootstrap
renders:

```tsx
<RegistryProvider>
  <App systemThemeGeneration={systemThemeGeneration} />
</RegistryProvider>
```

(`ghui/src/index.tsx:153-159`). The root is finally attached to the already
created renderer with `createRoot(renderer).render(<Bootstrap />)`
(`ghui/src/index.tsx:165-175`). The initial focus-reporting enable, optional
full repaint, and one-shot render request happen immediately before that mount
(`ghui/src/index.tsx:165-173`).

### Effect bridge to the frontend

#### Service runtime construction

`ghui/src/services/runtime.ts` selects live or mock GitHub and cache layers
based on environment-controlled mock mode (`ghui/src/services/runtime.ts:19-58`).
The live composition merges `GitHubService`, `CacheService`, clipboard, browser,
editor, command runner, and observability layers
(`ghui/src/services/runtime.ts:45-64`). The resulting `githubRuntime` is an
Effect Atom runtime:

```ts
export const githubRuntime = Atom.runtime(
  Layer.mergeAll(...).pipe(
    Layer.provide(CommandRunner.layer),
    Layer.provideMerge(Observability.layer),
  ),
)
```

(`ghui/src/services/runtime.ts:60-64`). This is the application-specific
bridge from Effect service requirements to atom computations; atom bodies can
`yield* GitHubService` or `yield* CacheService` without receiving those
services as React props.

The official Effect Atom source describes `Atom.runtime` as an Atom runtime
that builds a `Context` from a `Layer` and exposes constructors for atoms and
functions that run with that context
([Effect Atom runtime source](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/reactivity/Atom.ts)).
The official Effect runtime documentation defines an Effect as a program that
can require services and explains that a runtime supplies those requirements
when the program is executed ([Effect runtime documentation](https://effect.website/docs/v4/runtime)).

#### Atoms are the bridge surface

The code uses two runtime-created atom forms:

- `githubRuntime.atom(...)` exposes an Effect-backed reactive computation to
  the registry. The PR list atom reads `activeViewAtom`, obtains
  `GitHubService` and `CacheService`, runs the shared cache-first queue, and
  returns its load (`ghui/src/ui/pullRequests/atoms.ts:60-89`). The issue list
  atom follows the same pattern with issue-specific adapters
  (`ghui/src/ui/issues/atoms.ts:44-60`).
- `githubRuntime.fn<Input>()(...)` exposes Effect-backed actions. Examples
  include label changes, draft changes, merge/close actions, comments, browser
  opening, workspace preferences, and cache operations
  (`ghui/src/ui/pullRequests/atoms.ts:193-216`,
  `ghui/src/ui/comments/atoms.ts:71-96`,
  `ghui/src/services/systemAtoms.ts:8-11`,
  `ghui/src/workspace/atoms.ts:20-26`).

The runtime-created atom is not itself a React component. React reaches it via
`@effect/atom-react`: `usePullRequestSurface` uses `useAtom`,
`useAtomValue`, `useAtomSet`, and `useAtomRefresh` to read state, update state,
and refresh asynchronous atoms (`ghui/src/surfaces/pullRequest/usePullRequestSurface.ts:1,155-180`).
`useIssueSurface` uses the same hook boundary for issue state
(`ghui/src/surfaces/issue/useIssueSurface.ts:1,95-110`).

`useGitHubActions` centralizes action bindings. It calls `useAtomSet(...,
{ mode: "promise" })` for Effect actions and obtains the current registry to
refresh the issue atom (`ghui/src/hooks/useGitHubActions.ts:22-40`). The hook
returns ordinary callbacks to the app shell, so UI orchestration does not need
to know how a GitHub operation is executed.

#### Registry provider and React lifetime

The provider in `index.tsx` supplies the registry context for the entire app
tree (`ghui/src/index.tsx:153-159`). The official `@effect/atom-react` source
states that `RegistryProvider` creates an `AtomRegistry`, provides it through
`RegistryContext`, and disposes it after the provider's React lifetime
([RegistryContext source](https://raw.githubusercontent.com/Effect-TS/effect/main/packages/atom-react/src/RegistryContext.ts)).
The local frontend code then imports and invokes `useAtomValue`, `useAtom`,
`useAtomSet`, and `useAtomRefresh` from that package inside the provider
subtree (`ghui/src/surfaces/pullRequest/usePullRequestSurface.ts:1,155-180`,
`ghui/src/surfaces/issue/useIssueSurface.ts:1,95-110`).

`App` is intentionally a render manifest. Its source says that state, hooks,
derivations, atom subscriptions, keymap wiring, and side effects live in
`useAppShell`; the component consumes the returned shell bundle and renders
the layout (`ghui/src/App.tsx:15-22`). Therefore the frontend bridge is:

```text
Effect services/layers
        |
        v
githubRuntime.atom / githubRuntime.fn
        |
        v
AtomRegistry supplied by RegistryProvider
        |
        v
useAtomValue / useAtom / useAtomSet / useAtomRefresh
        |
        v
Surface shells and useAppShell
        |
        v
OpenTUI React JSX
```

### Key architecture features

#### 1. Layered, typed service boundary

External effects are represented as Effect services rather than being called
directly from JSX. `GitHubService` is a typed `Context.Service` whose interface
contains reads, detail hydration, diffs, workflow runs, comments, labels,
reviews, merge, close, and draft operations
(`ghui/src/services/GitHubService.ts:82-117`). Its live layer routes GitHub
operations through `CommandRunner`, adds spans and telemetry, invokes `gh`,
decodes JSON through Effect Schemas, and normalizes domain values
(`ghui/src/services/GitHubService.ts:119-165,239-295`).

`CommandRunner` is a separate Effect service. It owns Bun subprocess creation,
stdin/stdout/stderr handling, cancellation, timeouts, exit-code errors, JSON
decoding, and schema decoding (`ghui/src/services/CommandRunner.ts:63-73,85-163`).
This keeps process mechanics below GitHub API/domain logic and makes the
GitHub layer replaceable by the mock layer configured in `runtime.ts`.

#### 2. Reactive atom graph with derived state

The application models durable UI state and derived state as atoms. Workspace
scope and surface selection, favorites, recents, tab visibility, and repository
rollups are defined in `ghui/src/workspace/atoms.ts:8-31`. PR atoms derive
displayed, filtered, grouped, visible, and selected PRs from loads, overrides,
filters, and selection (`ghui/src/ui/pullRequests/atoms.ts:219-357`). Issue
atoms use the parallel pipeline of raw load, overrides, filter, repository
grouping, and selection (`ghui/src/ui/issues/atoms.ts:62-105`). Comments derive
their subject, key, list, ordered rows, and selected comment from the active
surface and selected item (`ghui/src/ui/comments/atoms.ts:18-69`).

This makes the registry the shared state graph between independent surfaces,
commands, loaders, and renderers. The official Atom registry API describes the
registry as storing atom nodes and coordinating reads, writes, refreshes,
subscriptions, and disposal ([AtomRegistry source](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/reactivity/AtomRegistry.ts)).

#### 3. Cache-first queue and incremental pagination

PR and issue lists share a generic queue protocol. `loadItemQueue` determines a
viewer/cache key, reads a persisted cache entry when available, writes cached
data into the in-memory atom if needed, fetches the first page, merges it into
the keyed cache, persists the resulting load, and returns it
(`ghui/src/item/queue.ts:31-59`). The generic load model tracks the view, data,
fetch time, cursor, and whether another page exists
(`ghui/src/item/load.ts:4-10`).

The shared load model deduplicates incoming items by key and preserves the
pagination invariant that a cursor must advance before another page remains
available (`ghui/src/item/load.ts:40-49,68-89`). PR and issue surfaces then
expose load-more state and selection to the app shell
(`ghui/src/surfaces/pullRequest/usePullRequestSurface.ts:163-236`,
`ghui/src/surfaces/issue/useIssueSurface.ts:95-137`).

The live cache is SQLite-backed through `@effect/sql-sqlite-bun`. The cache
service defines migrations for PRs, queue snapshots, workspace preferences,
repository details, and issues (`ghui/src/services/CacheService.ts:371-437`),
and builds the SQLite layer with directory creation, pragmas, and migration
execution (`ghui/src/services/CacheService.ts:874-900`). Mock mode swaps in a
disabled cache layer (`ghui/src/services/runtime.ts:56-64`).

#### 4. App-shell plus Surface shells

The domain vocabulary defines a Surface as a top-level workspace mode with its
own state, loaders, views, modals, and keymap context, while the App-shell owns
cross-cutting infrastructure such as layout, modal stack, theme, command
registry, keymap binding, paste routing, workspace navigation, startup tasks,
and preferences persistence (`ghui/CONTEXT.md:11-25`).

The implementation follows that division. `useAppShell` is the integration
point for terminal dimensions, registry access, PR/issue/repository surfaces,
layout, modal state, startup tasks, commands, and keymap wiring
(`ghui/src/hooks/useAppShell.ts:73-102,249-268,431-460,951-1072`).
`WorkspaceContent` selects the repository, issue, or PR presentation from the
active surface and view-mode flags (`ghui/src/surfaces/WorkspaceContent.tsx:82-137`).
The PR and issue surface hooks each expose a shell bundle of data, derived
state, selection, pagination, and actions to the app shell
(`ghui/src/surfaces/pullRequest/usePullRequestSurface.ts:72-118`,
`ghui/src/surfaces/issue/useIssueSurface.ts:53-82`).

The boundary is transitional rather than perfectly complete: the PR source
explicitly says that some setters still cross into the App-shell and are
intended to dissolve as commands become atom-driven
(`ghui/src/surfaces/pullRequest/usePullRequestSurface.ts:102-106,134-137`).

#### 5. Pure, compositional keyboard architecture

`@ghui/keymap` treats bindings as composable values, state as input, and
dispatch as a pure function (`ghui/packages/keymap/README.md:1-5`). Its README
defines `Keymap` composition through union, contramap, scope, restriction, and
prefix operations and says that the pure dispatcher returns next state and a
decision (`ghui/packages/keymap/README.md:37-66`).

ghui composes an application keymap from scoped modal, full-view, and list
navigation keymaps (`ghui/src/keymap/all.ts:73-136`). The OpenTUI adapter
normalizes native `KeyEvent` values into the keymap's cross-platform stroke
shape and fans one `useKeyboard` subscription out to registered handlers
(`ghui/src/keyboard/opentuiAdapter.ts:7-22,24-54`).
`useKeymapWiring` builds the application context, connects the OpenTUI input
stream, and routes text input (`ghui/src/hooks/useKeymapWiring.ts:15-26`).

#### 6. Explicit terminal/rendering boundary

The UI is rendered through OpenTUI JSX, not a browser DOM. The TypeScript
configuration selects the OpenTUI JSX runtime (`ghui/tsconfig.json:8-10`),
while `App` renders terminal boxes, text, dividers, tabs, workspace content,
footer, and modals (`ghui/src/App.tsx:45-76`). OpenTUI's official React docs
state that JSX intrinsic elements map to Core renderables and that React
reconciles them into the renderer tree ([OpenTUI React bindings](https://opentui.com/docs/bindings/react/)).

The application keeps renderer-specific concerns at the edge: `useAppShell`
reads terminal dimensions and renderer events, handles palette/background
updates, and passes render-oriented bundles to the view tree
(`ghui/src/hooks/useAppShell.ts:73-76,236-240`). Business operations remain in
Effect services and atoms rather than in render components.

#### 7. Startup tasks and optimistic interaction are separated from rendering

Mount-time and user-state side effects are grouped in hooks. Startup tasks
prune the cache, hydrate repository rollups, prewarm repository details, and
persist queue selection (`ghui/src/hooks/useStartupTasks.ts:35-82`). Mutations
are kept in a separate item mutation hook; the PR surface exposes override and
recently-completed setters for that transition (`ghui/src/surfaces/pullRequest/usePullRequestSurface.ts:102-106,331-369`).
The result is a rendering layer that consumes derived shell data while cache,
refresh, optimistic-update, and persistence policies remain in named seams.

## Initialization Trace

```text
ghui command
  -> bin/ghui.js
  -> platform binary, or src/standalone.ts fallback
  -> src/index.tsx
  -> createCliRenderer(...)
  -> renderer suspension/theme/parser setup
  -> Bootstrap startup logo
  -> dynamic import of @effect/atom-react and App
  -> RegistryProvider
  -> App
  -> useAppShell
  -> Surface shells and atom hooks
  -> OpenTUI JSX rendered by createRoot(renderer)
```

The Effect data path runs alongside the React path:

```text
Layer.mergeAll(GitHubService, CacheService, ...)
  -> Atom.runtime(...)
  -> githubRuntime.atom / githubRuntime.fn
  -> RegistryProvider's AtomRegistry
  -> useAtomValue / useAtom / useAtomSet
  -> surface shell derivations
  -> App render manifest
```

The first diagram is owned by `ghui/bin/ghui.js:46-123`,
`ghui/src/standalone.ts:31-55`, and `ghui/src/index.tsx:71-175`. The second is
owned by `ghui/src/services/runtime.ts:45-64`,
`ghui/src/index.tsx:153-159`, and the atom/hook sources cited above.

## Sources

### Repository sources

Repository source is the primary authority for ghui-specific behavior. The
paths cited inline are the source files inspected for this report.

- `ghui/README.md` for product scope, installation modes, configuration, and
  user-visible features.
- `ghui/package.json` for package entrypoints, scripts, dependencies, and
  workspace layout.
- `ghui/AGENTS.md` and `ghui/CONTEXT.md` for repository architecture terms and
  local engineering conventions.
- `ghui/bin/ghui.js`, `ghui/src/standalone.ts`, and `ghui/src/index.tsx` for
  command dispatch and initialization.
- `ghui/src/services/runtime.ts`, `ghui/src/services/GitHubService.ts`,
  `ghui/src/services/CommandRunner.ts`, and `ghui/src/services/CacheService.ts`
  for the Effect service graph and persistence boundary.
- `ghui/src/ui/pullRequests/atoms.ts`, `ghui/src/ui/issues/atoms.ts`,
  `ghui/src/ui/comments/atoms.ts`, and `ghui/src/services/systemAtoms.ts` for
  runtime-created data and action atoms.
- `ghui/src/hooks/useAppShell.ts`,
  `ghui/src/hooks/useGitHubActions.ts`,
  `ghui/src/surfaces/pullRequest/usePullRequestSurface.ts`,
  `ghui/src/surfaces/issue/useIssueSurface.ts`, and
  `ghui/src/surfaces/WorkspaceContent.tsx` for frontend orchestration and
  Surface boundaries.
- `ghui/packages/keymap/README.md`, `ghui/src/keymap/all.ts`,
  `ghui/src/keyboard/opentuiAdapter.ts`, and
  `ghui/src/hooks/useKeymapWiring.ts` for keyboard architecture.

### External primary sources

Access date for every external source below: 2026-09-13.

- OpenTUI, React bindings: <https://opentui.com/docs/bindings/react/>. Documents
  `createCliRenderer`, `createRoot(renderer)`, OpenTUI JSX reconciliation,
  hooks, and renderer/root ownership.
- OpenTUI, renderer: <https://opentui.com/docs/core-concepts/renderer/>.
  Documents asynchronous renderer creation, screen modes, suspension/resume,
  rendering, and renderer events.
- Effect, runtime documentation: <https://effect.website/docs/v4/runtime>.
  Documents Effects, service requirements, runtimes, and Layer-backed runtime
  integration.
- Effect, Atom source: <https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/reactivity/Atom.ts>.
  Documents the Atom runtime API and its Layer-backed atom/function
  constructors.
- Effect, AtomRegistry source: <https://github.com/Effect-TS/effect/blob/main/packages/effect/src/unstable/reactivity/AtomRegistry.ts>.
  Documents registry reads, writes, refresh, subscriptions, and disposal.
- Effect, `@effect/atom-react` RegistryContext source:
  <https://raw.githubusercontent.com/Effect-TS/effect/main/packages/atom-react/src/RegistryContext.ts>.
  Documents `RegistryContext` and `RegistryProvider` creation and disposal.

## Verification

- Confirmed the existing convention by reading `research/platform-config.md`,
  `research/spotify-read-apis.md`, and `research/spotify-authorization.md`.
- Re-read this Markdown file after creation to verify headings, code blocks,
  citations, local paths, external URLs, and the initialization trace are
  present and readable.
- Checked the worktree before editing. Existing unrelated changes were present;
  this research task added only `research/ghui-architecture.md`.
