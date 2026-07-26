# Task 8 Report — Exa-grounded component research

## Outcome

Implemented a server-only Exa research route that produces at most five normalized evidence sources. It has no geometry imports or mutation path: the returned sources are for user review beside a proposed patch.

## TDD evidence

`tests/integration/api-research.test.ts` was added before its route and service modules existed. Its initial run was RED because `@/app/api/research/route` could not resolve. After the smallest adapter, normalization service, and route were added, all four behavior tests passed.

## Verification

- `npm test -- tests/integration/api-research.test.ts` — 4 passed
- `npm run typecheck` — passed

## SDK discovery

The installed Exa 2.16 package still provides `searchAndContents` (as a deprecated compatibility wrapper), including the legacy `type`, `numResults`, and `text` option shape required for this task.
