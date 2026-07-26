# PatchCAD Task 2 Report — Shared CAD and AI Contracts

## Status

Complete. The shared contract module now validates strict, millimetre-only
version-1 bracket snapshots and the two allowed local patch plans. It also
provides strict selection, fingerprint, verification, planning, and research
payload boundaries with inferred TypeScript types.

## Implementation

- Added `CONTRACT` as the single source for units, geometric tolerances, hole
  limits, and prompt bounds.
- Added strict Zod 4.4.3 schemas and inferred types for all required shared
  CAD and AI payloads.
- Restricted semantic hole IDs to non-empty `hole:` IDs using safe identifier
  characters and fixed the supported axis to positive Z.
- Added a complete version-1 mounting-bracket fixture with four semantic
  through-holes.
- Replaced the temporary module-existence smoke test with behavioral schema
  tests using the real schemas and hand-authored literal expectations.
- Recorded the RED failure, GREEN verification, and carry-forward rules in
  `docs/implementation-log.md`.

## RED / GREEN Evidence

### RED

Command:

```text
npm test -- tests/unit/schemas.test.ts
```

Before production code was added, the replacement behavioral suite exited 1
with:

```text
Failed to resolve import "@/lib/cad/schemas"
```

No test cases ran because the requested schema module did not exist. This was
the expected absence-of-feature failure.

### GREEN

Commands and fresh results:

```text
npm test -- tests/unit/schemas.test.ts  # 1 file, 11 tests passed
npm run typecheck                        # passed
npm test                                 # 2 files, 12 tests passed
npm run lint                             # passed
git diff --check                         # passed
```

The required secret-shaped-value scan produced no matches (its exit status 1
is the expected `git grep` result for zero matches).

## Test Coverage

- parses the valid version-1 bracket fixture;
- parses both `resize_hole` and `add_hole` plans;
- rejects negative diameters, unknown operations, top-level extra keys,
  non-millimetre snapshot units, and malformed feature IDs;
- proves JSON serialization round-trips the snapshot without data loss;
- accepts bounded, millimetre-only plan requests and normalized public research
  source responses.

## Files Changed

- `src/lib/cad/contract.ts`
- `src/lib/cad/schemas.ts`
- `tests/fixtures/bracket-context.json`
- `tests/unit/schemas.test.ts`
- `docs/implementation-log.md`
- `.superpowers/sdd/2026-07-26-patchcad-mvp/task-2-report.md`

## Self-Review

- Every declared object schema uses `.strict()`; nested coordinates,
  dimensions, holes, sources, and discriminated variants are also strict.
- Plans are a discriminated union limited to the two approved operations; the
  schema contains no executable CAD language or provider credential fields.
- All geometry values are finite, dimensions are positive, and diameters honor
  the central 1–40 mm bounds.
- Tests assert runtime behavior against concrete fixtures; no mocks or
  implementation-derived expected values were used.

## Concerns

None for Task 2. Subsequent patch-engine and API work must parse external data
at these schemas rather than relying on TypeScript types alone, and must retain
the existing millimetre-only and strict-boundary rules.
