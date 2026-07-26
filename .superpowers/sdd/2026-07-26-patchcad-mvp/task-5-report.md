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
