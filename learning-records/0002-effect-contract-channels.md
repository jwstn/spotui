# Effect Contract Channels

The learner can identify the three channels of an Effect contract: `A` is the
successful value, `E` is the union of failures introduced by the workflow, and
`R` is the required environment. For `attempt`, they correctly identified the
raw `runProcess` result as the current success value, the process and timeout
errors as failures, and `never` as the current environment requirement.

**Evidence**: The learner answered the `A`, `E`, and `R` exercise and recognized
that `Effect.timeoutOrElse` combines the underlying failure channel with the
timeout branch.

**Implications**: The next step is distinguishing an implementation's raw
success value from the public interface's semantic success value. The curl
service should not necessarily expose process details to Spotify API callers.
