# Request Decoding Produces Transport Input

The learner understands that callers provide response schemas so each caller
can choose the decoded domain value it needs, and that `CurlJsonError` occurs
when a returned response body is not valid JSON before response-schema
decoding. They initially confused the request schema's decoded result with a
response value; the correction is that `CurlRequestSchema` produces trusted
transport input such as a method, URL, headers, and form fields.

**Evidence**: The learner correctly explained response-schema ownership and the
JSON failure stage, then distinguished the request-schema confusion for review.

**Implications**: The next step is to write the concrete request and response
types and test cases that prove the two decoding stages stay separate.
