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

## FreeCAD workstream

### 2026-07-26 20:55 +08 — Task 11 Fix Round 2 deadline, replay, audit, and topology gates

- Branch/commit: `agent/patchcad-freecad` after `1a528e2` (this fix commit)
- Attempt: Reproduce all five validated review findings with focused behavior tests before tightening the FreeCAD-independent bridge and service.
- Result: worked
- Evidence: The audit regression was RED because an invalid UTF-8 sidecar escaped as `UnicodeDecodeError(... invalid start byte)` after the CAD transaction had committed; wrapping `UnicodeError` as `AuditWriteError` made it GREEN with `AUDIT_WRITE_FAILED` while retaining the new diameter and one commit. The queued-work regression was RED because the expired item executed (`['create_patch'] != []`); an absolute `time.monotonic()` deadline carried by each item and checked under its lock made all four dispatcher tests GREEN. The real slow-trickle HTTP regression was RED after the required loopback-permission rerun (`201 != 408`); deadline-aware `read1` chunks made it GREEN with 408 and zero dispatches. Two completed-body parse seams were then RED (`POST 201 != 408`; `PATCH 200 != 408`); carrying the same deadline through parsing and checking it at the dispatch boundary made both GREEN with zero dispatches. Global replay tests were RED because target resolution followed the new active document, changed document/payload requests raised the test sentinel instead of `ProtocolError`, and duplicate persisted IDs raised no conflict; scanning every open document before target resolution made all four persisted-idempotency tests GREEN. The drill-tip regression was RED with `SelectionError not raised`; requiring two cylindrical boundary loops, one planar adjacent face at each end, and an open sampled cross-section also rejected an internal shoulder with a smaller pilot opening. The first topology seam used the wrong `"Face"` argument and failed the acceptance case; current FreeCAD `TopoShapePy::ancestorsOfType` requires a shape subtype, so `type(face)` made the six selection tests GREEN.
- Carry-forward rule: A queued GUI mutation and an HTTP body both have one absolute monotonic deadline. Request IDs are global across all open FreeCAD documents and ambiguous duplicates fail closed. Existing-hole resize requires topology plus cross-section evidence for two straight planar openings; centerline emptiness alone is never through-hole proof. Audit decoding failures are post-commit `AUDIT_WRITE_FAILED` responses, not transaction rollbacks.

### 2026-07-26 20:55 +08 — Task 11 Fix Round 2 verification and runtime boundary

- Branch/commit: `agent/patchcad-freecad` after `1a528e2` (this fix commit)
- Attempt: Run the complete standard-Python suite, compilation, add-on metadata, lazy-import, and executable-availability checks.
- Result: worked for FreeCAD-independent checks; FreeCAD runtime remains unavailable
- Evidence: The restricted first `npm run test:freecad` attempt reported 13 loopback-bind `PermissionError: [Errno 1] Operation not permitted` errors while all non-socket tests passed. The final approved loopback rerun completed 51/51 tests in 7.714 seconds. `python3 -m compileall -q` passed, `xmllint --noout` passed, and metadata resolved to `PatchCADWorkbench|1.1.0|part`. Importing `protocol`, `audit`, and `bridge` left `FreeCAD`, `FreeCADGui`, and `Part` absent from `sys.modules`. No `FreeCADCmd`, `freecadcmd`, `FreeCAD`, or `freecad` executable was found.
- Carry-forward rule: Keep the socket tests real and rerun them through approved loopback permission in this managed environment. These checks do not substitute for FreeCAD 1.1 geometry, recompute, undo, or GUI smoke tests; continue to report those runtime checks as unrun.

### 2026-07-26 19:17 +08 — Task 11 Fix Round 1 geometry and recompute gates

- Branch/commit: `agent/patchcad-freecad` after `7673f0e`
- Attempt: Reproduce and correct exterior sleeves in shrink-hole fills and stale-shape commits after failed FeaturePython recomputes.
- Result: worked
- Evidence: Three initial seam tests were RED: the discrete geometry result retained `exterior-sleeve`, and update/toggle mutations committed despite a non-advancing execution token or `Invalid` state. Exact hole-wall axial fill bounds made the geometry seam GREEN. A persisted execution counter was rejected before commit because mutating it inside `execute()` would add saved-state side effects; two additional RED seams required a Proxy-local token and successful commit after that transient token advanced. `PatchFeature.execute()` now advances the transient token only after assigning a fresh shape, while the service checks recompute count, object error state, `isValid()`, token advancement, and one-solid shape validity before commit.
- Carry-forward rule: Never use over-travelled cutter bounds for additive material. Keep freshness bookkeeping transient on the FeaturePython Proxy, and abort/recompute the transaction whenever recompute does not prove a fresh valid shape.

### 2026-07-26 18:54 +08 — PatchCAD FreeCAD bridge RED and sandbox boundary

- Branch/commit: `agent/patchcad-freecad` before Task 11 commit
- Attempt: Add FreeCAD-independent behavior tests for the strict patch protocol, audit replacement, authenticated HTTP bridge, CORS/PNA, request bounds, GUI dispatch timeout, and request idempotency before creating production modules.
- Result: worked, with one environment-dependent retry
- Evidence: The required pure command first exited 1 with three expected `ModuleNotFoundError` errors for absent `protocol`, `audit`, and `bridge` modules. After the minimal implementation, the restricted sandbox rejected ephemeral loopback binds with `PermissionError: [Errno 1] Operation not permitted`; rerunning the same standard-library tests with approved loopback permission exposed one genuine failure (`500 != 413`) in the oversized-body response.
- Carry-forward rule: Keep the bridge tests on real ephemeral `127.0.0.1` sockets. In this managed environment they require the approved `python3 -m unittest` loopback permission; do not replace them with handler mocks.

### 2026-07-26 18:54 +08 — Pure bridge contract and fail-closed protocol

- Branch/commit: `agent/patchcad-freecad` before Task 11 commit
- Attempt: Implement strict millimetre-only request parsing, conflict-aware request-ID caching, atomic same-directory audit replacement, bearer-token HTTP routes, exact-origin CORS/PNA, body bounds, timeout mapping, and a queue drained only by a GUI-thread Qt timer.
- Result: worked
- Evidence: After mapping the body-limit exception to 413, all 20 initial pure tests passed. A later focused test proved that `through_all=false` was incorrectly accepted (RED: `ProtocolError not raised`); rejecting blind holes until a depth contract exists made that focused test GREEN. The complete pure suite then contains 21 tests.
- Carry-forward rule: The current FreeCAD MVP supports through holes only. HTTP threads may enqueue and wait, but only the Qt timer callback may call selection or mutation services. Tokens remain random process memory, origins remain exact allowlist entries, and credentials/cookies/wildcards must not be introduced.

### 2026-07-26 18:54 +08 — Reversible FreeCAD adapter and missing runtime

- Branch/commit: `agent/patchcad-freecad` before Task 11 commit
- Attempt: Add the FreeCAD 1.1 namespaced workbench, selection validation, reversible `Part::FeaturePython`, one-transaction mutation service, exact Part booleans, persisted patch metadata, and post-commit external audit reporting using the documented FreeCAD Python APIs.
- Result: partial
- Evidence: Standard Python compilation, XML parsing, and import-isolation checks passed; importing `protocol`, `audit`, and `bridge` loaded none of `FreeCAD`, `FreeCADGui`, or `Part`. `command -v` found no `FreeCADCmd`, `freecadcmd`, `FreeCAD`, or `freecad` executable, matching the earlier planning discovery.
- Carry-forward rule: Treat add/enlarge cuts and shrink annulus fuse/recut geometry, face-orientation recognition, FeaturePython recompute, GUI registration, and transaction undo as installation-dependent manual verification until run under FreeCAD 1.1. Never report the FreeCAD geometry/GUI smoke tests as run in this environment.

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
