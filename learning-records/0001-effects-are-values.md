# Effects Are Values

The learner understands that an Effect is a value describing a computation, not
the computation's produced value. Inside `Effect.gen`, `yield*` sequences the
Effect and exposes its success value while also propagating its failures and
environment requirements; returning the Effect directly creates a nested
Effect. This is the foundation for reading Effect service interfaces correctly.

**Evidence**: The learner explained that `yield*` is needed to get the value an
Effect produces and that omitting it returns the Effect itself, causing a nested
Effect result.

**Implications**: The next lesson can move from generator mechanics to the
contract of `attempt`: its success value, typed failures, and required services.
