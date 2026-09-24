# Retry Policy Is Structured

The learner understands that retry decisions should use structured error data,
not human-facing messages. They also understand that storing
`retryAfterSeconds` without making the schedule honor it creates a misleading
contract: readers reasonably expect the field to affect retry timing, while the
implementation silently ignores it.

**Evidence**: The learner explained the fragility of message matching and the
design mismatch caused by unused retry metadata. They identified the error
schema as the source of retry policy, with the refinement that predicates inspect
runtime fields such as `kind`, `statusCode`, and `retryAfterSeconds`.

**Implications**: The next lesson moves from failure policy to interruption and
resource ownership: a timeout must stop and clean up the process it interrupts.
