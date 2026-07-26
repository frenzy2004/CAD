# Task 5 Report — Browser OpenCascade Worker

## Status

Implemented on `agent/patchcad-kernel` in commit `f5f6e33` (`Run exact bracket geometry in a CAD worker`).

## Delivered

- `src/lib/cad/worker-protocol.ts` defines strict Zod request/reply boundaries with UUID request IDs, discriminated message types, transferable typed mesh data, finite geometry/index/bounds validation, OCCT face groups, semantic bracket/session-hole anchors, a 30-second client timeout, and a documented 50 MiB desktop-oriented STEP limit.
- `src/workers/cad.worker.ts` is the only Replicad/OCCT import graph. It initializes `replicad-opencascadejs@0.23.0` once with `locateFile: () => "/cad-runtime/replicad_single-0.23.0.wasm"` and `setOC`.
- Brackets are exact single solids made from one box cut by cylinders. Meshes use Replicad tessellation and transfer `Float32Array`/`Uint32Array` buffers.
- STEP import uses `importSTEP(new Blob([bytes]))`, resolves exactly one valid solid (including a one-solid compound), retains an untouched owned base B-rep, and returns `mesh().faceGroups`.
- Imported edits require a current planar OCCT face. A new session hole records its point, normal, and diameter. A same-point request resizes only that session-owned record. Every result is rebuilt from the untouched base using a cutter longer than twice the base bounding-box diagonal; non-planar/pre-existing-hole requests fail closed.
- STEP export uses `blobSTEP()` from the current exact B-rep, never the display mesh.
- `src/hooks/useCadWorker.ts` provides lazy client-only creation, one initialization promise, unique request IDs, a pending map, transfers, timeout/progress/error state, crash handling, and termination/rejection on unmount.
- `next.config.ts` emits a client CAD worker entry, enables client WebAssembly support, preserves browser fallbacks, and leaves the CAD runtime out of server bundles.

## TDD evidence

RED:

```text
npm test -- tests/integration/cad-worker.test.ts
FAIL tests/integration/cad-worker.test.ts
Failed to resolve import "@/lib/cad/worker-protocol"
```

GREEN:

```text
npm test -- tests/integration/cad-worker.test.ts
Test Files 1 passed (1)
Tests 7 passed (7)
```

The tests catch invalid/duplicate-format IDs, unknown and extra messages, non-finite positions/normals, incomplete triangles, out-of-range indices, invalid bounds, and missing bracket semantics. Expectations use hand-written literal mesh fixtures; no CAD kernel mock exists in production.

## Verification

```text
npm test
Test Files 5 passed (5)
Tests 46 passed (46)

npm run typecheck
exit 0

npm run lint
exit 0

npm run build
Compiled successfully; static generation completed; exit 0
```

Bundle inspection found:

- `.next/static/chunks/cad.worker.js`
- `public/cad-runtime/replicad_single-0.23.0.wasm` (10 MB)
- `/cad-runtime/replicad_single-0.23.0.wasm` and duplicate-ID handling in the emitted worker
- no Replicad, STEP-reader, or pinned-WASM signatures in `.next/server` JavaScript

## Limitation and carry-forward

jsdom exposes `WebAssembly` but not `Worker` (`{"Worker":"undefined","WebAssembly":"object"}`), so Vitest cannot run the real browser worker/WASM lifecycle. This task therefore proves the strict protocol in Vitest and the worker graph in the production Webpack build without faking the kernel.

Task 12 Playwright must run the real worker against the emitted pinned WASM and assert initialization, exact bracket build, transferable mesh data and face groups, exact STEP export/re-import, one-solid import, planar session-hole add/resize, and fail-closed pre-existing-hole resize.

## Concerns

- Real worker/WASM execution remains a required Playwright assertion in Task 12.
- The 50 MiB import ceiling is intentionally desktop-oriented; memory pressure below that limit varies by browser and model topology.
- `node_modules` is a shared untracked symlink used only for local dependency resolution and was not staged or committed.

## Fix Round 1 — lifecycle, correlation, ordering, and validation

### Changes

- Fatal client failures now share one cleanup path. An invalid reply, worker crash, or request timeout clears both worker and initialization refs, detaches handlers, terminates the worker, rejects and clears every pending request, and requires a fresh worker initialization. Terminating on timeout prevents a late exact-kernel operation from mutating hidden authoritative state.
- `createCadWorkerDispatcher` recovers a supplied schema-valid UUID before rejecting a malformed request. It generates a fallback UUID only when no valid correlation ID exists.
- The dispatcher serializes all valid requests over one promise tail. This is stricter than serializing writes alone and keeps builds, imports, session cuts, and exports coherent with one authoritative B-rep.
- Mesh validation now requires face-group starts/counts to be triangle-aligned, contiguous, ordered, non-overlapping, in range, and collectively cover the complete index stream.
- Exact imported/cloned resources use `retainValidatedResource`; validation failure deterministically calls `delete()` before ownership can transfer. A failed result clone also deletes the already-owned imported base.
- Concrete non-finite-normal and inverted-bounds fixtures now protect the existing schema promises.

### RED/GREEN evidence

Face-group range validation:

```text
RED  npm test -- tests/integration/cad-worker.test.ts
     Test Files 1 failed (1)
     Tests 5 failed | 9 passed (14)
     All five malformed face-group fixtures were incorrectly accepted.

GREEN npm test -- tests/integration/cad-worker.test.ts
      Test Files 1 passed (1)
      Tests 14 passed (14)
```

Runtime correlation and serialized dispatch:

```text
RED  npm test -- tests/integration/cad-worker.test.ts
     Test Files 1 failed (1)
     Tests 3 failed | 14 passed (17)
     TypeError: createCadWorkerDispatcher is not a function

GREEN npm test -- tests/integration/cad-worker.test.ts && npm run typecheck
      Test Files 1 passed (1)
      Tests 17 passed (17)
      TypeScript exited 0
```

Fatal hook lifecycle:

```text
RED  npm test -- tests/integration/cad-worker-lifecycle.test.tsx
     Test Files 1 failed (1)
     Tests 3 failed (3)
     Invalid reply, crash, and timeout each reported terminateCount 0 instead of 1.

GREEN npm test -- tests/integration/cad-worker-lifecycle.test.tsx && npm run typecheck
      Test Files 1 passed (1)
      Tests 3 passed (3)
      TypeScript exited 0
```

Failed resource ownership:

```text
RED  npm test -- tests/unit/owned-resource.test.ts
     Test Files 1 failed (1)
     Failed to resolve import "@/lib/cad/owned-resource"

GREEN npm test -- tests/unit/owned-resource.test.ts
      Test Files 1 passed (1)
      Tests 2 passed (2)
```

Independent-review atomicity correction:

```text
RED  npm test -- tests/unit/owned-resource.test.ts
     Test Files 1 failed (1)
     Tests 2 failed | 2 passed (4)
     commitPreparedResource was missing, so candidates could not prove prepare-before-adopt behavior.

GREEN npm test -- tests/unit/owned-resource.test.ts
      Test Files 1 passed (1)
      Tests 4 passed (4)
```

The correction prepares and validates build/import/session-cut meshes before replacing authoritative state. Preparation failure deletes the unadopted candidate (and an unadopted imported base) while leaving the prior exact shape and session feature record intact.

Snapshot-export atomicity:

```text
RED  npm test -- tests/unit/owned-resource.test.ts
     Test Files 1 failed (1)
     Tests 2 failed | 4 passed (6)
     commitPreparedResourceAsync was missing.

GREEN npm test -- tests/unit/owned-resource.test.ts
      Test Files 1 passed (1)
      Tests 6 passed (6)
```

`export-step` with an optional snapshot now awaits both `blobSTEP()` and `arrayBuffer()` before adopting the snapshot. A synchronous or asynchronous serialization failure deletes the candidate and preserves the prior exact model.

Normal/bounds mutation check:

```text
RED  npm test -- tests/integration/cad-worker.test.ts -t "non-finite normals|inverted bounds"
     Test Files 1 failed (1)
     Tests 2 failed | 15 skipped (17)
     Both fixtures were incorrectly accepted with their validators temporarily disabled.

GREEN npm test -- tests/integration/cad-worker.test.ts -t "non-finite normals|inverted bounds"
      Test Files 1 passed (1)
      Tests 2 passed | 15 skipped (17)
```

### Final verification

```text
npm test
Test Files 7 passed (7)
Tests 65 passed (65)

npm run typecheck
exit 0

npm run lint
exit 0

npm run build
Compiled successfully; static generation completed; exit 0
```

Post-build inspection reconfirmed `.next/static/chunks/cad.worker.js`, the 10 MB pinned public WASM, the versioned WASM URL plus `INVALID_REQUEST`/`DUPLICATE_REQUEST_ID` signatures in the client worker, and no CAD runtime signatures in `.next/server` JavaScript.

Independent final re-review was CLEAN after both atomicity corrections. The reviewer reran the three focused suites (26/26) and type checking successfully.

### Carry-forward

jsdom still has no browser `Worker`; lifecycle tests therefore control only the external Worker boundary and never fake the production CAD kernel. Task 12 remains responsible for real Playwright/WASM assertions covering kernel initialization, exact build/import/cut/export behavior, transferable mesh buffers/face groups, timeout recovery at browser level, and fail-closed imported-hole behavior.
