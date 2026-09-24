# Raw Process Output Is Not Safe Diagnostics

The learner proposed retaining a request, HTTP method, stdout, and stderr in a
curl error. The safe design correction is that raw stdout and stderr should not
be retained by default: stdout may contain response credentials or provider
data, and stderr may contain command or diagnostic details. A request summary
should include the method rather than duplicating it, and diagnostics should be
sanitized and bounded if they are retained at all.

**Evidence**: The learner attempted to select retained error fields and exposed
the common assumption that process output is automatically safe to keep.

**Implications**: Continue with error policy by choosing a minimal safe error
shape, then connect its `kind`, status, and retry metadata to `Effect.retry`.
