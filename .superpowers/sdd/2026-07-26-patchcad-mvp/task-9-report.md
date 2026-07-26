# Task 9 report — complete PatchCAD workspace

## Outcome

- Added the explicit `booting → ready → selected → planning → previewing → applying → verified` workspace reducer, including rejected and error paths.
- Wired the exact CAD worker to initial bracket construction, candidate preview construction, reject restoration, undo, and reset.
- Wired `/api/plan` with strict response parsing and an honest `AI_NOT_CONFIGURED` fallback to the local grammar.
- Kept Exa research in an evidence-only panel; research responses never enter the patch or worker inputs.
- Added the graphite/ivory/orange responsive workspace, Magic Circle viewport, local patch inspector, editable proposed diameter, preview delta, Apply/Reject, one-level Undo, Reset, and locality verification strip.

## TDD evidence

1. RED: `npm test -- tests/integration/workspace.test.tsx`
   - Failed because `@/components/workspace/PatchWorkspace` did not exist.
2. GREEN: `npm test -- tests/integration/workspace.test.tsx`
   - 1 workflow test passed.
   - The workflow proves exact-kernel readiness, `hole:nw` selection, `make this hole 8 mm`, honest Offline grammar provenance, exactly one changed feature, three protected holes unchanged, Apply to 8 mm, and Undo to 6 mm.
3. Refactor gate:
   - `npm run typecheck` passed.
   - `npm run lint` passed with no warnings.

## Full verification

- `npm test`: 16 files, 111 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; `/` is static and all three API routes are emitted.

## Honest limitation carried to Task 12

The workflow test replaces only WebGL rendering, browser Worker transport, and HTTP with controlled boundaries. It does not claim that OpenCascade WASM executed inside a real browser. Task 12 must verify the real worker/WASM/Three.js lifecycle with Playwright.
