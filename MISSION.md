# Mission: Effect Interfaces For Reliable Boundaries

## Why
Learn Effect well enough to design reliable service boundaries around fallible
processes and network calls, then use those ideas to repair SpotUI's curl
boundary without blindly applying patches.

## Success looks like
- Explain an Effect type as a contract: success, failure, and requirements.
- Choose appropriate Effect functions for sequencing, errors, timeouts,
  cancellation, resources, retries, and dependency injection.
- Design separate interfaces for request construction, process execution, and
  decoded API behavior.
- Test the design with explicit fake layers before connecting the real process.
- Refactor `src/service/curl.ts` while preserving credential safety and cleanup.

## Constraints
- Use the checked-out `effect-smol` source as the primary Effect reference.
- Check version-sensitive details against the installed Effect package too.
- Learn through short lessons and retrieval exercises tied to this repository.
- Do not treat the current curl implementation as the model; use it as a case
  study in boundary design.

## Out of scope
- Replacing curl with a different HTTP client before understanding the boundary.
- Refactoring unrelated SpotUI services or UI code.
- Memorizing Effect APIs without connecting them to interface decisions.
