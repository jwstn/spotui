# Decoding Services Are Not Parsing

The learner correctly understands that `JSON.parse` is synchronous and should
be wrapped with `Effect.try`. They initially omitted transport failure from the
`runJson` failure union and interpreted `S["DecodingServices"]` as a service for
JSON parsing. The distinction was corrected: `runJson` preserves transport,
JSON syntax, and schema failures, while `DecodingServices` describes any Effect
services required by the supplied schema during schema decoding.

**Evidence**: The learner answered the constructor question correctly and
identified that the schema decoder may depend on an environment, followed by a
correction separating that environment from `JSON.parse`.

**Implications**: The next lesson can move to designing safe typed errors,
including which response and request data must not be retained in errors.
