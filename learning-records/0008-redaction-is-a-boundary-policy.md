# Redaction Is A Boundary Policy

The learner can identify credentials, raw stdout, and raw stderr as data that
should be excluded from retained curl errors. They understand that
`Redacted` reduces accidental disclosure but is not cryptographic protection;
recovering its value to build process arguments turns the secret back into an
ordinary string that must still be excluded from errors and diagnostics.

**Evidence**: The learner explicitly excluded access/bearer tokens and raw
process output, and explained that the underlying value remains in memory.

**Implications**: The next step is to finish the safe error shape, then use
`kind`, status, and retry metadata as inputs to an Effect retry policy.
