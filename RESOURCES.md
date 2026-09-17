# Effect Interface Design Resources

## Knowledge

- [Effect-smol source checkout](./.opencode/references/effect-smol/README.md)
  Primary local reference requested for this course. Use the source and examples
  for exact Effect v4 behavior, especially `Effect.gen`, `Effect.fn`, layers,
  resources, and schedules.
- [Effect-smol: Effect.fn documentation](./.opencode/references/effect-smol/packages/effect/src/Effect.ts#L13470)
  Exact reference for named Effect functions, generator bodies, and return type
  helpers.
- [Effect-smol: service layer composition](./.opencode/references/effect-smol/ai-docs/src/01_effect/03_services/20_layer-composition.ts)
  Reference for keeping service layers focused and composing dependencies
  explicitly with `Layer.provide`.
- [Effect-smol: acquire and release](./.opencode/references/effect-smol/ai-docs/src/01_effect/05_resources/10_acquire-release.ts)
  Reference for owning resources and cleaning them up when a layer is torn down.
- [Effect-smol: schedules and retries](./.opencode/references/effect-smol/ai-docs/src/06_schedule/10_schedules.ts)
  Reference for typed retryability, exponential backoff, jitter, and retry caps.
- [Effect-smol: ManagedRuntime integration](./.opencode/references/effect-smol/ai-docs/src/04_integration/10_managed-runtime.ts)
  Reference for retaining an Effect runtime at an imperative application edge.
- [Current curl service](./src/service/curl.ts)
  Running case study. Read it alongside each lesson and identify which boundary
  is responsible for each failure.

## Wisdom (Communities)

- [Effect Discord](https://discord.gg/effect-ts)
  High-signal place to compare Effect designs with maintainers and experienced
  users after forming a concrete question.
- [Effect GitHub Discussions](https://github.com/Effect-TS/effect/discussions)
  Searchable design discussions for API usage and architectural tradeoffs.

## Gaps

- The repository declares Effect `4.0.0-rc.112` while installed dependencies
  may resolve another release. Version selection should be settled before using
  APIs that differ between the archived reference and installed package.
- No local Effect service test helper has been established yet. A later lesson
  will inspect the repository's test conventions before introducing one.
