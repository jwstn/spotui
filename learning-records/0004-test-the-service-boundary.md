# Test The Service Boundary

The learner understands that the test seam belongs at the `CurlService`
interface, not necessarily around Bun itself. Production can provide a live
layer whose implementation uses Bun and curl, while tests provide a layer with
the same service functions and typed results backed by fakes. This avoids real
network requests without introducing a speculative process-runtime abstraction.

**Evidence**: The learner explained that Bun should remain concrete while a
test layer replaces the curl service and returns the same typed values.

**Implications**: The next design question is how the test implementation and
live implementation can share a schema-polymorphic `runJson` contract without
making the fake know every Spotify response type.
