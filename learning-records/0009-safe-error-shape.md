# Safe Error Shape

The learner selected a sanitized request summary, HTTP status, and message as
safe retained error fields. This is a valid user-facing error shape, with the
important refinement that machine policy should use structured fields such as
`kind`, `statusCode`, and `retryAfterSeconds` rather than matching message text.

**Evidence**: The learner chose `request`, `statusCode`, and `message` after
excluding credentials and raw process output.

**Implications**: The next lesson introduces `Effect.retry` and `Schedule`,
using structured curl error fields to decide which failures are retryable.
