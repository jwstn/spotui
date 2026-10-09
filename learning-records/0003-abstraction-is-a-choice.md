# Abstraction Is A Choice

The learner prefers keeping Bun process execution concrete because Bun is the
application's committed runtime and a runtime swap is not an active requirement.
They also want the curl boundary to transform responses according to a schema
supplied by the caller. This establishes a pragmatic rule: introduce an Effect
service seam for current variation and test control, not for speculative future
replacement; keep transport mechanics in the curl service while letting callers
own domain response schemas.

**Evidence**: The learner rejected a process-runner abstraction based on the
current runtime boundary and proposed a schema-driven input/output contract for
curl callers.

**Implications**: Teach `Context.Service` and `Layer` as dependency ownership
tools, then show how a generic `runJson(schema, request)` keeps Spotify schemas
out of the transport service.
