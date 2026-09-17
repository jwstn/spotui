# Explicit Layers Enable Substitution

The learner understands that a successful test curl operation should return the
decoded value required by the caller's schema, not raw transport data. They
initially described live integration tests as proving dynamic data; the refined
principle is that live tests should prove real process and transport behavior
using controlled input, not depend on changing external provider data. They are
also developing the reason for explicit layer provision: dependency visibility
and substitution, not only reuse.

**Evidence**: The learner identified schema-shaped fake results and questioned
the purpose of explicit layer wiring, which was clarified as the mechanism that
lets tests replace the live implementation.

**Implications**: The next lesson can assemble the target curl interface and
map each discovered bug to the boundary responsible for preventing it.
