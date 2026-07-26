# PatchCAD Implementation Log

This is the shared memory for implementation branches. Add an entry whenever an approach succeeds, fails, or changes an architectural decision. Never paste credentials, authorization headers, provider payloads containing private data, or unredacted deployment logs.

## Entry format

```text
### YYYY-MM-DD HH:MM — short subject
- Branch/commit:
- Attempt:
- Result: worked | failed | partial
- Evidence:
- Carry-forward rule:
```

## Baseline discoveries

### 2026-07-26 — Honest offline patch parser

- Branch/commit: `agent/patchcad-foundation` Task 4 worktree
- Attempt: Add a small, pure local grammar for one selected-hole resize or one top-face point add-hole command, with millimetre and inch dimensions, strict selection handling, and explicit local provenance.
- Result: worked
- Evidence: The new parser suite was RED because `@/lib/cad/local-parser` did not exist. After the minimal parser was added, a second RED showed that dimensionless recognized commands returned `UNSUPPORTED_OPERATION` rather than `MISSING_DIMENSION`; the parser was tightened and `npm test -- tests/unit/local-parser.test.ts` passed 12 tests. The suite includes `1/4 inch` converting to exactly `6.35 mm`, harmless capitalization/whitespace, and fail-closed errors for incomplete, non-positive, multi-operation, unsupported, and ambiguous-selection commands. `npm run typecheck` exited 0.
- Carry-forward rule: Use this parser only as the explicit `local-parser` offline path after an `AI_NOT_CONFIGURED` server response; never label it as a provider result, and reject a prompt or selection whenever it cannot identify exactly one safe operation and target.

### 2026-07-26 — Git push network permission route

- Branch/commit: `agent/patchcad-foundation` foundation handoff
- Attempt: Push the foundation branch to its remote.
- Result: worked after escalation
- Evidence: The initial `git push` failed under restricted DNS. The approved `git push` escalation succeeded.
- Carry-forward rule: Later network writes for this repository require the approved git-push escalation route; do not retry restricted DNS pushes as if they were authentication failures.

### 2026-07-26 — Task 3 retry after interrupted no-op

- Branch/commit: `agent/patchcad-foundation` at `e904f2f`
- Attempt: Restart deterministic patch-engine Task 3 after the previously dispatched agent was interrupted.
- Result: failed
- Evidence: The branch remained at the Task 2 contract commit and contained no Task 3 source, test, or documentation changes to preserve.
- Carry-forward rule: Treat this as a clean TDD retry; record fresh RED and GREEN evidence rather than inferring progress from the interrupted attempt.

### 2026-07-26 — Deterministic local patch engine

- Branch/commit: `agent/patchcad-foundation` after `e904f2f`
- Attempt: Build a pure semantic-ID patch engine and locality verifier with behavior-first tests for selected resize, top-face addition, validation rejections, protected fingerprints, tolerance, and immutable undo snapshots.
- Result: worked
- Evidence: The add-only selection contract test first failed because `editableFeatureIds` required one ID, then passed after allowing an empty feature list for a face-only envelope. The new patch test first failed on the missing modules, and the final `npm test` passed 25 tests; `npm run typecheck` and `npm run lint` exited 0.
- Carry-forward rule: Keep face-only add-hole authorization distinct from semantic feature authorization; generate new IDs deterministically and compare only fingerprints during locality checks, never array positions.

### 2026-07-26 — Task 3 Fix Round 1: no-effect and exact locality boundaries

- Branch/commit: `agent/patchcad-foundation` after `2c09f4d`
- Attempt: Correct same-diameter resize success reporting and the fingerprint tolerance comparator; add a resize wall regression.
- Result: worked
- Evidence: The same-diameter plan test was RED with `{ valid: true }`, then GREEN after `NO_EFFECT` validation and removal of the forced `targetChanged: true`. The immediate-above tolerance test at `0.000100004 mm` was RED, then GREEN with an unrounded absolute-delta comparison. The resize-wall assertion was mutation-checked RED when wall validation was temporarily disabled, then GREEN after restoration. Targeted tests passed 14 tests and type checking exited 0.
- Carry-forward rule: A plan that does not change a target must reject before patching, and tolerance comparisons must use the exact unrounded geometry delta.

### 2026-07-26 — Repository and local runtime

- Branch/commit: `agent/patchcad-design` at `4900d80`
- Attempt: Inspect the initial repository and available runtimes.
- Result: worked
- Evidence: The remote repository contains the approved design specification. Local versions are Node 24.18.0, npm 11.16.0, pnpm 11.9.0, GitHub CLI 2.96.0, and Python 3.14.6.
- Carry-forward rule: Pin Vercel to Node 22.x in `package.json`; require the committed lockfile and full verification gate to pass under the available local Node runtime.

### 2026-07-26 — Vercel CLI availability

- Branch/commit: planning branch
- Attempt: Run `vercel --version`.
- Result: failed
- Evidence: No global `vercel` executable is installed.
- Carry-forward rule: Use a pinned or current `npx vercel` invocation; do not assume a global install.

### 2026-07-26 — FreeCAD executable availability

- Branch/commit: planning branch
- Attempt: Locate `FreeCAD`, `freecad`, or a command-line FreeCAD executable.
- Result: failed
- Evidence: No FreeCAD executable is present in the current environment.
- Carry-forward rule: Keep bridge contracts and I/O testable with standard Python. Report the real FreeCAD smoke test as unrun until an executable is available; never imply it passed.

### 2026-07-26 — Replicad Three.js helper package name

- Branch/commit: planning branch
- Attempt: Query `@replicad/threejs-helper`.
- Result: failed
- Evidence: npm returned `404 Not Found`.
- Carry-forward rule: The published package is unscoped `replicad-threejs-helper@0.23.0`.

### 2026-07-26 — Browser CAD kernel feasibility

- Branch/commit: planning branch
- Attempt: Verify exact browser-side B-rep editing and export using primary project sources.
- Result: worked
- Evidence: `replicad@0.23.1` supports OpenCascade-backed booleans, exact STEP import/export, tessellation with face groups, and a Web Worker architecture. `replicad-opencascadejs@0.23.0` contains `src/replicad_single.wasm`.
- Carry-forward rule: Keep the B-rep authoritative inside one single-threaded worker; use Three.js only for display and raycasting. Copy the pinned WASM artifact to a versioned public URL before builds.

### 2026-07-26 — Imported STEP scope

- Branch/commit: planning branch
- Attempt: Define a truthful first edit for arbitrary STEP input.
- Result: partial
- Evidence: A STEP file provides exact topology but usually lacks editable parametric feature history. A planar-face cylinder cut is deterministic; generic existing-hole resize requires recognition, removal, healing, and recreation.
- Carry-forward rule: Browser import supports one solid and session-owned add/resize hole features. Refuse arbitrary pre-existing-hole resize. The included parametric bracket can safely resize its known holes.

### 2026-07-26 — OpenAI plan contract

- Branch/commit: planning branch
- Attempt: Verify the current official structured-output interface.
- Result: worked
- Evidence: Official OpenAI documentation recommends the Responses API with `responses.parse`, `zodTextFormat`, and `gpt-5.6` for new projects.
- Carry-forward rule: Return only strict `PatchPlanSchema` objects, handle refusals and incomplete responses explicitly, then pass the parsed plan through deterministic geometry validation.

### 2026-07-26 — Secret availability and handling

- Branch/commit: planning branch
- Attempt: Check whether provider credentials or a Vercel token are already present in the process environment without reading values.
- Result: partial
- Evidence: `OPENAI_API_KEY`, `EXA_API_KEY`, and `VERCEL_TOKEN` are unset in the current shell.
- Carry-forward rule: Never reproduce user-supplied credentials in a tool argument, file, log, or command. Use secure interactive Vercel input if available; otherwise deploy the honest offline CAD path and report the exact server-only variable names still requiring secure configuration.

### 2026-07-26 — Superpowers helper script permissions

- Branch/commit: controller before `agent/patchcad-foundation`
- Attempt: The controller initially invoked the Superpowers helper scripts without their user execute bits, then set the user execute bits and retried.
- Result: worked
- Evidence: The initial invocation was blocked by missing execute permission; the controller-confirmed retry worked after the permission correction.
- Carry-forward rule: Check helper-script execute permission before invoking a newly created or checked-out Superpowers workflow.

### 2026-07-26 — Vercel authentication discovery

- Branch/commit: controller before `agent/patchcad-foundation`
- Attempt: Run `npx vercel@latest whoami` to confirm deployment authentication.
- Result: partial
- Evidence: The command installed Vercel CLI 57.0.0, found no credentials, and entered a device-login flow that the controller cancelled. No device code or token was retained.
- Carry-forward rule: Production deployment tooling requires Vercel authentication or the connected deploy tool; never record a transient device code or token.

### 2026-07-26 — Vercel-ready web scaffold

- Branch/commit: `agent/patchcad-foundation` (this scaffold commit)
- Attempt: Install the exact pinned Next.js/CAD dependencies; configure the App Router, Vitest, Playwright, Vercel ignores, Webpack browser fallbacks, and the pinned OpenCascade WASM copier.
- Result: worked
- Evidence: `npm test -- tests/unit/page.test.tsx` passed (1 test); `npm run typecheck`, `npm run lint`, and `npm run build` passed. The build copied and served the versioned WASM artifact, and a byte comparison matched it to `replicad-opencascadejs`'s pinned source. With that source temporarily unavailable, `node scripts/copy-cad-runtime.mjs` exited 1 with an explicit `npm ci`/no-download-or-compile message; the source was restored immediately.
- Carry-forward rule: Keep `/cad-runtime/replicad_single-0.23.0.wasm` as a build-time copy of the lockfile-pinned package artifact. Do not enable pthreads or cross-origin isolation in this milestone.

### 2026-07-26 — Schema smoke-test handoff

- Branch/commit: `agent/patchcad-foundation` (this scaffold commit)
- Attempt: Run the required temporary schema smoke test before the CAD schema module exists.
- Result: worked
- Evidence: `npm test -- tests/unit/schemas.test.ts` exited 1 with `Failed to resolve import "@/lib/cad/schemas"`, as intended.
- Carry-forward rule: The CAD-schema task must add `src/lib/cad/schemas` and make this test green; until then, the full Vitest suite is intentionally red.

### 2026-07-26 — Dependency installation advisories

- Branch/commit: `agent/patchcad-foundation` (this scaffold commit)
- Attempt: Install the exact pinned runtime and development dependency lists with npm 11.
- Result: partial
- Evidence: npm installed the requested packages and the production build passed, while reporting 12 high-severity transitive audit advisories and pending install-script approval for `sharp` and `unrs-resolver`.
- Carry-forward rule: Do not run automatic or breaking audit upgrades and do not approve install scripts without a reviewed dependency decision; resolve advisories in a dedicated dependency-maintenance task while preserving the required pins.

### 2026-07-26 — Shared CAD contract RED state

- Branch/commit: `agent/patchcad-foundation` before the Task 2 contract implementation
- Attempt: Replace the temporary schema smoke test with behavioral validation tests, then run `npm test -- tests/unit/schemas.test.ts` before adding the schema module.
- Result: worked
- Evidence: Vitest exited 1 with `Failed to resolve import "@/lib/cad/schemas"`; no test cases ran because the required module did not yet exist.
- Carry-forward rule: Keep contract tests focused on runtime boundary behavior and run them while RED before adding or changing production schemas.

### 2026-07-26 — Shared CAD and AI contracts

- Branch/commit: `agent/patchcad-foundation` Task 2 worktree
- Attempt: Implement strict Zod 4.4.3 schemas for the versioned bracket snapshot, local patch operations, selection and verification payloads, plan API payloads, and public research payloads; centralize millimetre and safety bounds.
- Result: worked
- Evidence: `npm test -- tests/unit/schemas.test.ts` passed 11 tests, and `npm run typecheck` exited 0.
- Carry-forward rule: Treat all untrusted CAD, plan, and research payloads as strict millimetre-only boundaries; use `PatchPlanSchema` as the only accepted executable intent and keep provider credentials out of every shared contract and response type.

## Browser kernel workstream

### 2026-07-26 — Exact OpenCascade browser worker

- Branch/commit: `agent/patchcad-kernel` at `f5f6e33`
- Attempt: Add a strict transferable worker protocol, a single-initialization Replicad/OpenCascade worker, exact bracket/STEP operations, imported-solid session holes rebuilt from an untouched B-rep, and lazy React lifecycle management.
- Result: worked with browser-runtime verification carried forward
- Evidence: The protocol suite was RED because `@/lib/cad/worker-protocol` did not exist, then GREEN with 7 tests covering UUID IDs, unknown/extra message rejection, finite typed geometry, triangle/index invariants, bounds, face groups, and bracket hole anchors. The final repository suite passed 46 tests; type checking and lint exited 0. `npm run build` emitted `.next/static/chunks/cad.worker.js`, the pinned 10 MB `public/cad-runtime/replicad_single-0.23.0.wasm`, and no CAD runtime signatures in `.next/server` JavaScript. A direct jsdom capability check reported `Worker: "undefined"` while `WebAssembly: "object"`, so Vitest cannot execute the real browser worker.
- Carry-forward rule: Task 12 must exercise initialize, exact bracket build, STEP export/re-import, one-solid STEP import, planar session-hole add/resize, non-planar/pre-existing-hole rejection, and transferable mesh face groups in Playwright against the emitted worker and real pinned WASM. Do not add a fake production kernel or import Replicad/OCCT from any server graph.

### 2026-07-26 — Browser kernel Fix Round 1

- Branch/commit: `agent/patchcad-kernel` after `b572ab5`
- Attempt: Close reviewed concurrency, lifecycle, correlation, mesh-range, and failed-import ownership gaps with independent RED/GREEN regressions.
- Result: worked with real browser/WASM execution carried forward
- Evidence: Face-group tests were RED with five malformed layouts accepted, dispatcher tests were RED because no runtime dispatcher existed, three hook lifecycle tests were RED with zero worker terminations, and ownership was RED on the missing guarded-transfer module. Each became GREEN after its minimal fix. Independent review then found commit-before-reply state mutations: synchronous prepare-before-adopt tests drove atomic build/import/session-cut meshes, and asynchronous tests drove atomic snapshot STEP export. Final re-review was CLEAN. Non-finite-normal and inverted-bounds fixtures were mutation-checked RED with their validators temporarily disabled, then restored GREEN. The final suite passed 65 tests across 7 files; typecheck, lint, and the worker-enabled production build exited 0. The emitted client worker retains the pinned WASM URL and strict error codes, while `.next/server` JavaScript has no CAD runtime signatures.
- Carry-forward rule: Treat invalid replies, crashes, and timeouts as fatal worker generations; serialize every exact-kernel request; retain caller UUIDs for correlatable invalid requests; require face groups to cover the triangle stream exactly; delete unadopted OCCT resources on every failure. Task 12 must still run the real worker and WASM in Playwright rather than treating controlled jsdom lifecycle coverage as kernel execution.

### 2026-07-26 — Magic Circle CAD selection

- Branch/commit: `agent/patchcad-kernel` at `123d233` plus the reviewed lifecycle follow-up
- Attempt: Render transferred worker geometry without copying its typed arrays, fit a Z-up Three.js scene, project semantic hole anchors into CSS pixels, and resolve a persistent pointer-captured SVG circle into one strict resize-hole selection envelope.
- Result: worked with real-browser visual verification carried forward
- Evidence: The projection suite was RED on the missing module, then GREEN with six pure tests for in-circle nearest selection, rejection, deterministic ties, client-to-canvas coordinates, and the 8 px minimum radius. Review regressions were RED for lost pointer capture and stale state after mesh replacement, then GREEN after deliberate-release tracking and mesh-revision invalidation. The final suite passed 74 tests across 10 files; typecheck, lint, the production build, and whitespace checks exited 0.
- Carry-forward rule: Keep semantic selection independent of Three.js scene traversal; publish CSS-pixel anchors only when their projection changes; remount drawing state and invalidate external selections whenever the mesh generation changes. Task 12 must visually exercise fit-to-view, orbit/draw handoff, persistent SVG selection, Escape/capture-loss cancellation, and selected-hole highlighting in a real browser.
