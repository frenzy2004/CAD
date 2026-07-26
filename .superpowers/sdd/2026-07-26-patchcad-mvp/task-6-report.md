# Task 6 Report — Magic Circle CAD Selection

## Status

Implemented on `agent/patchcad-kernel` in `123d233` (`Add Magic Circle CAD selection`) with the reviewed lifecycle follow-up described below.

## Delivered

- `Scene.tsx` reuses the worker-owned `Float32Array` and `Uint32Array` buffers in a Three.js `BufferGeometry`, disposes the geometry on replacement, and renders legible standard-material lighting, edges, an XY grid, axes, Z-up orbit controls, deterministic fit-to-view, and a semantic selected-hole marker.
- Semantic hole anchors are projected inside the Fiber render loop into canvas-local CSS pixels. Projection does not traverse Three.js scene objects and publishes only when its stable projection signature changes.
- `projection.ts` provides pure client-to-canvas conversion, minimum-radius circle construction, and deterministic nearest-anchor resolution.
- `MagicCircleOverlay.tsx` draws a persistent SVG circle with pointer capture. Primary-pointer down records the center, movement updates the radius, pointer up resolves one anchor, movement below 8 px remains an 8 px click circle, and Escape, pointer cancel, or unexpected capture loss cancels safely.
- Orbit controls are disabled synchronously during draw capture and restored after every terminal path. Alt-primary drag remains available for orbiting.
- `CadViewport.tsx` exposes `onSelectionChange(SelectionEnvelope | null)`. A successful resize selection is parsed through `SelectionEnvelopeSchema` and contains exactly one current-mesh `hole:*` editable feature. Unsupported or stale anchors fail closed.
- Every mesh identity change advances a local revision, immediately invalidating projected anchors, highlight, drawing state, persisted circle, and the external selection.
- The viewport has a definite 28 rem default height so the percentage-height Canvas fills its frame.

## TDD evidence

Initial projection RED:

```text
npm test -- tests/unit/projection.test.ts
FAIL tests/unit/projection.test.ts
Failed to resolve import "@/lib/cad/projection"
```

Projection GREEN:

```text
npm test -- tests/unit/projection.test.ts
Test Files 1 passed (1)
Tests 6 passed (6)
```

Independent-review lifecycle RED:

```text
npm test -- tests/unit/magic-circle-overlay.test.tsx tests/unit/cad-viewport.test.tsx
Test Files 2 failed (2)
Tests 2 failed (2)

- lostpointercapture left onDrawingChange(true)
- replacement meshes retained an enabled stale projected-anchor selection
```

Lifecycle GREEN:

```text
npm test -- tests/unit/magic-circle-overlay.test.tsx tests/unit/cad-viewport.test.tsx tests/unit/projection.test.ts
Test Files 3 passed (3)
Tests 9 passed (9)
```

The capture tests also prove that the browser's expected `lostpointercapture` after deliberate pointer-up does not erase a completed selection or its visible circle.

## Final verification

```text
npm test
Test Files 10 passed (10)
Tests 74 passed (74)

npm run typecheck
exit 0

npm run lint
exit 0

npm run build
Compiled successfully; static generation completed; exit 0

git diff --check
exit 0
```

Independent final re-review was CLEAN after both lifecycle corrections and the definite-height correction. The reviewer reran the focused 9 tests, type checking, and lint successfully.

## Limitation and carry-forward

This task verifies pure selection math and controlled React pointer/model lifecycles in jsdom, plus the Three.js client graph in the production build. It does not claim visual browser verification.

Task 12 must exercise the emitted worker and viewport in a real browser, including Z-up fit-to-view, orbit/draw handoff, 8 px click selection, persistent SVG circle, selected-hole highlighting, Escape, unexpected capture loss, and mesh-replacement invalidation.
