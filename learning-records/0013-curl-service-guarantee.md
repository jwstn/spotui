# Curl Service Guarantee

The learner can state the behavioral guarantee of a schema-polymorphic curl
service: the caller supplies a request and schema, the service returns the
decoded value matching that schema, and failures remain typed as transport,
JSON, or schema errors.

**Evidence**: The learner restated the capstone guarantee in their own words
without relying on implementation details such as Bun, curl arguments, or
process handles.

**Implications**: The interface contract is established. The next design
decision is the request boundary: whether callers provide encoded external
values or the service accepts only decoded internal request values.
