# Process Cleanup Is An Ownership Guarantee

The learner understands that the process-running boundary, rather than
`attempt`, should own cleanup. They recognize that timeout interruption must
reach the external process and that waiting for exit is different from merely
calling `kill`.

**Evidence**: The learner assigned cleanup to `runProcess` and explained that
termination and completion are separate events. The refinement is that the
Effect aborts the signal first; the listener responds by terminating the
process, and cleanup must then await process exit and stream draining.

**Implications**: The next lesson can connect this ownership contract to live
layers, test layers, and tests that prove both fake service behavior and real
process cleanup.
