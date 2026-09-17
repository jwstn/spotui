# Request And Response Schemas Are Different

The learner correctly identified the current request builders as producing
encoded data and chose to decode that data inside `runJson`. They initially
described the caller-supplied response schema when asked where the request
schema belongs. The distinction was clarified: `CurlService` owns and applies
its fixed request schema internally, while the caller supplies the response
schema that determines the returned decoded value.

**Evidence**: The learner selected encoded request input and internal decoding,
then described the response-schema flow when answering the request-schema
question.

**Implications**: The next design step is to write the two-stage `runJson`
workflow and assign each schema decode to the correct error channel.
