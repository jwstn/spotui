# Generic Decoding Has Typed Failures

The learner understands that the curl service must remain ignorant of Spotify
response shapes while still performing generic JSON parsing and schema decoding.
They identified that a schema-polymorphic `runJson` should expose decoding
failures rather than silently returning unknown data.

**Evidence**: The learner explained that `CurlService` knows only the endpoint,
transport, generic decoding, and declared errors, and accepted a parsing error
as part of the `runJson` contract.

**Implications**: Teach the distinction between malformed JSON (`JSON.parse`)
and schema mismatch (`Schema.decodeUnknownEffect`), then compose both with
`Effect.try`, `Effect.flatMap`, and typed error classes.
