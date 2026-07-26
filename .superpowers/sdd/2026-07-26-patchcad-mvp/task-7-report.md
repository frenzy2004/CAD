# Task 7 Report — OpenAI structured patch planning

## Outcome

Implemented the server-only OpenAI patch-planning route. It uses the Responses API structured-output helper, validates every parsed plan against the deterministic CAD contract, and never includes provider details or secrets in public errors.

## TDD evidence

`tests/integration/api-plan.test.ts` was introduced before the route and service modules existed. The initial run was RED because `@/app/api/plan/route` could not resolve. After the minimal adapter, service, prompt, environment accessor, and route were added, the suite passed 9 behavior tests.

## Verification

- `npm test -- tests/integration/api-plan.test.ts` — 9 passed
- `npm run typecheck` — passed

## SDK discovery

OpenAI SDK 6.49 exposes `response.output_parsed` for `responses.parse`. Refusals are represented as `message` output content with `type: "refusal"`, rather than a top-level `response.refusal` property.

## Fix Round 1

Two review findings were corrected in separate TDD cycles:

1. Oversized request bodies: three regressions first returned `502` because the route ignored both declared and actual byte size and reached the provider fake. The route now rejects a declared body over 64 KiB before reading it and caps bytes while consuming the stream, so absent or falsified `Content-Length` values cannot bypass the bound.
2. Provider-authored rationale: resize and add-hole regressions first returned executable CAD-like model prose unchanged. The service now replaces every accepted provider rationale with a deterministic summary constructed only from the validated operation branch, semantic target, and numeric dimensions.

Fresh verification after both fixes:

- `npm test -- tests/integration/api-plan.test.ts` — 14 passed
- `npm run typecheck` — passed
