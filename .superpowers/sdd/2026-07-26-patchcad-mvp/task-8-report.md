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

## Fix Round 1

The adapter-boundary regression was RED because the service sent the unrelated user phrase `M4 mounting bracket` directly to Exa. The service now makes the single `searchAndContents` call with one fixed evidence-seeking query that:

- frames the original phrase once inside an explicit data-only boundary;
- requests mechanical mounting-hole dimensions, bolt pattern, stated units, and manufacturer datasheets or drawings;
- adds only a fixed prefix and suffix to the existing bounded request phrase.

Fresh verification:

- `npm test -- tests/integration/api-research.test.ts` — 4 passed
- `npm run typecheck` — passed

## Provider integration build fix

The plan route exposed an invalid factory export during the Next 16 production build, and inspection confirmed `src/app/api/research/route.ts` had the same unsupported `createResearchRoute` export. The route-surface regression was RED for both modules. The research factory now lives in `src/server/exa/research-route.ts`; the App Router module exports only `POST`, and provider behavior remains tested through the injected server factory. The exact `npm run build` then completed and emitted `/api/research` as a dynamic route.
