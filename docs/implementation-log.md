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

### 2026-07-27 23:33 — Clean-worktree CAD startup and selection-safety reconciliation

- Branch/commit: `agent/byok-provider-hardening` before the reconciliation commit
- Attempt: Validate the BYOK branch in an isolated checkout, reconcile it with
  the verified recovery baseline, and rerun the exact browser workflow before
  publishing it.
- Result: worked
- Evidence: The branch's manual `cad-worker` webpack entry failed to start a
  clean Next development server with `Entry cad-worker depends on main, but
  this entry was not found`; removing the redundant entry restored worker
  startup. The restored worker now owns and validates every boolean result as
  one solid and uses OpenCascade distance evaluation to reject an add-hole
  point that is not on the selected planar face. The deterministic Playwright
  configuration isolates its local server and can target an explicit external
  preview. During the full browser run, boolean `shadows` produced a
  deprecated Three.js `PCFSoftShadowMap` console error; the existing exact
  offline STEP smoke test failed, then passed after selecting the supported
  `basic` shadow map. Final verification passed 21 Vitest files / 150 tests,
  typecheck, lint, a production build, and all 5 Playwright flows, including
  imported STEP round-trip, face-local edits, mobile layout, and BYOK health.
- Carry-forward rule: Do not manually inject a Next worker entry when module
  worker loading already supplies it. Keep exact point-on-face validation and
  single-solid ownership at the worker boundary; a face ID alone never
  authorizes an arbitrary edit location. Keep browser tests on their isolated
  port and use `PLAYWRIGHT_BASE_URL` for a protected preview once authenticated.

### 2026-07-27 13:52 — Public BYOK provider boundary and recovery hardening

- Branch/commit: `recovery/selection-owned-add-hole` through `cc4a940`
- Attempt: Replace a shared paid-provider access-code design with independent
  OpenAI/Exa browser-session keys, request-scoped server clients, deterministic
  offline fallbacks, exact key isolation tests, and a final security review.
- Result: worked with one explicit deployment-layer residual
- Evidence: Routes reject missing/blank/overlong keys before body consumption
  or provider construction; provider keys are session-only in the browser,
  never enter CAD workers/audits/URLs/prompt bodies, and are read again at
  request dispatch so a pending preview observes a clear or replacement. The
  final hardening adds a shared process-local provider limiter, 429-before-
  construction coverage, 12-second/no-retry/1,200-token OpenAI bounds, and
  15-second route deadlines. The full final gate passed 21 Vitest files / 150
  tests, typecheck, lint, and production build. One earlier Magic Circle test
  timeout was unreproduced: its focused test, serial suite, and repeated full
  suite reruns all passed before final verification.
- Carry-forward rule: Never ship owner provider keys or an owner-paid shared
  code. Keep only session-owned BYOK keys; retain deterministic local planning
  when providers are absent/throttled. The checked-in limiter is per process /
  instance only: a public multi-instance deployment must also configure a
  distributed edge/WAF rate limit before claiming aggregate abuse protection.

### 2026-07-26 21:08 — Bind add-hole plans to the picked point

- Branch/commit: `agent/patchcad-point-binding` before the point-binding commit
- Attempt: Trace provider and offline add-hole plans from selection through validation, API response, preview, and deterministic apply; then require the picked point, reject provider centers outside a named 0.0001 mm Euclidean tolerance, and canonicalize accepted plans to the exact picked coordinates.
- Result: worked with one pre-existing test-runner failure carried forward
- Evidence: The isolated baseline ran 122 unit/integration tests successfully before `npm test` incorrectly collected `tests/e2e/patch-workflow.spec.ts` as Vitest and exited 1. The point-binding RED run then failed exactly 7 new assertions: missing points and displaced centers were accepted, near-point coordinates were retained, and the safe local-parser flow exposed no canonical validated plan. After the minimal fix, the focused run passed 47 tests across the patch engine, local parser, and plan API. A fresh unit/integration run with the known E2E path excluded passed all 129 tests; `npm run typecheck` and `npm run lint` exited 0; Playwright successfully listed all 5 browser tests. A fresh unfiltered `npm test` again passed all 129 collected unit/integration tests but exited 1 only on the same known Playwright-discovery error.
- Carry-forward rule: A face ID never authorizes an arbitrary add-hole location. Require `selection.pointMm`, accept at most 0.0001 mm of numeric-formatting drift, validate geometry at the canonical selected point, and propagate that canonical plan through provider responses, previews, and apply. Keep resize semantics unchanged.

### 2026-07-26 20:09 — Workspace independent-review hardening

- Branch/commit: `agent/patchcad-workspace` PR review fix
- Attempt: Reproduce and close the real-viewport selection, stale-plan, async race, keyboard accessibility, research invalidation, and worker-status findings without weakening exact-geometry boundaries.
- Result: worked
- Evidence: Regressions were RED for missing keyboard selection, preview mesh revision clearing the selection, instruction edits retaining an applicable stale plan, a pending 9 mm rebuild overwriting a newer blank value, stale research appearing after JSON body parsing, and an errored worker still announcing `Exact kernel ready`. The non-configuration provider-error test passed immediately and proved there was no offline fallback. After the fixes, all focused regressions passed; the full web suite passed 18 files and 122 tests, warning-free lint and typecheck passed, and the production build emitted all routes. Reject and Reset restoration also have workflow coverage.
- Carry-forward rule: Preserve semantic selection across explicitly authorized workspace mesh revisions only; every user edit must invalidate older async work before validation or body parsing completes, and kernel accessibility text must derive from worker status rather than retained mesh availability.

### 2026-07-26 20:09 — FreeCAD test script points to an unmerged package

- Branch/commit: `agent/patchcad-workspace` PR review verification
- Attempt: Run the repository `npm run test:freecad` gate after the workspace fixes.
- Result: failed
- Evidence: Python exited before collecting tests with `Start directory is not importable: 'freecad/PatchCAD/freecad/PatchCAD/tests'`; this branch contains only `freecad/README.md`, while the FreeCAD package remains on its separate implementation branch.
- Carry-forward rule: Do not report FreeCAD tests as executed on a branch that does not contain the package. Merge the reviewed FreeCAD branch before making this script a required combined-branch gate.

### 2026-07-26 19:44 — Verified STEP and audit workspace exports

- Branch/commit: `agent/patchcad-workspace` Task 10
- Attempt: Wire the reviewed artifact utilities to the applied exact-worker state while keeping unverified exports locked.
- Result: worked
- Evidence: The export workflow was RED because an enabled toolbar button had no export behavior, then GREEN after STEP requested the worker's current exact shape and audit export hashed only the typed before/after state. Two workspace tests, 12 artifact tests, all 114 repository tests, typecheck, warning-free lint, and the production build passed.
- Carry-forward rule: Export the worker's current shape only after Apply establishes a verified state; reject empty STEP bytes, use fixed filenames/MIME types, and build audit JSON only from the typed applied-patch record.

### 2026-07-26 19:41 — Explicit Testing Library cleanup

- Branch/commit: `agent/patchcad-workspace` Task 10 RED
- Attempt: Add a second integration workflow while relying on Testing Library's automatic cleanup.
- Result: failed, then worked
- Evidence: The second test found two `Download STEP` buttons because this Vitest setup imports lifecycle functions rather than exposing them globally, so Testing Library did not register its global auto-cleanup hook. Calling `cleanup()` in the file's existing `afterEach` restored isolation; the next run reached the intended missing-export failure.
- Carry-forward rule: Integration test files using imported Vitest lifecycle functions must register explicit DOM cleanup when multiple renders share the file; treat duplicate accessible elements across tests as a harness-isolation failure before diagnosing product behavior.

### 2026-07-26 19:39 — Complete local patch workspace

- Branch/commit: `agent/patchcad-workspace` Task 9
- Attempt: Assemble the exact worker, Magic Circle selection, provider/offline planning, deterministic verification, and non-chat industrial UI behind one explicit reducer.
- Result: worked
- Evidence: The workflow suite was first RED because `PatchWorkspace` did not exist, then GREEN for exact-kernel readiness, `hole:nw` selection, an 8 mm offline-grammar preview, one changed feature, three protected holes unchanged, Apply, and one-level Undo. The full gate passed 111 tests, typecheck, warning-free lint, and the Next production build.
- Carry-forward rule: Keep WebGL, Worker transport, and provider HTTP as the only workflow-test doubles. A successful worker build authorizes the preview, Exa remains evidence-only, and real OpenCascade WASM/browser behavior stays an explicit Playwright fact for Task 12.

### 2026-07-26 — Artifact boundary review fix

- Branch/commit: `agent/patchcad-integration` download review
- Attempt: Close independent-review gaps in canonical hashing, fixed artifact extensions, and cleanup/audit assertions before workspace wiring.
- Result: worked
- Evidence: Two regressions were RED: duplicate semantic hole IDs were hashable in source order, and a runtime extension such as `.step/../../unsafe` was appended unsanitized. Hashing now rejects duplicate IDs and the public helper accepts only `.step` or `.json` at both type and runtime boundaries. Tests now also prove anchor removal after click failure and the exact top-level audit key set. All 12 focused tests, typecheck, and lint pass.
- Carry-forward rule: Semantic hashes require unique IDs before sorting; never expose a “safe filename” helper with an unconstrained extension parameter, and assert exact audit surfaces rather than partial object matches.

### 2026-07-26 — Playwright browser runtime

- Branch/commit: integration verification environment
- Attempt: Check for and preinstall the lockfile-matched Playwright Chromium runtime before the real CAD/WASM end-to-end gate.
- Result: worked
- Evidence: `npx playwright install --dry-run chromium` identified missing Chromium build 1234, FFmpeg 1011, and its headless shell. The approved `npx playwright install chromium` downloaded all three successfully to Playwright's user cache.
- Carry-forward rule: Reuse Playwright Chromium build 1234 for Task 12; do not repeat the ~275 MiB browser download unless the pinned Playwright version changes.

### 2026-07-26 — Research route actual-byte bound

- Branch/commit: `agent/patchcad-integration` provider hardening
- Attempt: Apply the existing streaming 64 KiB JSON reader consistently to the Exa route instead of trusting `request.json()`.
- Result: worked
- Evidence: Three regressions were RED with `502`: a declared 70,000-byte body and valid JSON padded beyond 64 KiB with missing or falsified `Content-Length` all reached the Exa adapter. The research handler now uses `readBoundedJson`; all 7 focused tests pass and the adapter is never reached for those bodies. Typecheck and lint pass.
- Carry-forward rule: Every provider route must cap actual stream bytes independently of `Content-Length`; schema size limits do not protect the server from oversized-but-valid JSON framing.

### 2026-07-26 — Exact STEP and audit download boundary

- Branch/commit: `agent/patchcad-integration` Task 10 partial
- Attempt: Build the browser-only artifact utility before workspace wiring, with fixed MIME types, safe filenames, exact byte reporting, explicit audit serialization, and deterministic cleanup.
- Result: worked
- Evidence: The first suite was RED on the missing module. Two follow-up regressions were RED because an anchor cleanup exception could prevent URL revocation and because `planSource` relied only on TypeScript; nested cleanup and a runtime source allowlist fixed both. A later RED required a real validated SHA-256 helper for before/after bracket state; it now canonicalizes hole order by semantic ID. All 10 focused tests, typecheck, and lint pass.
- Carry-forward rule: Workspace export must call this boundary only after worker verification. Audit serialization explicitly selects typed fields, object URL cleanup must remain inside a nested `finally`, and bracket audit hashes must use the canonical semantic-ID order.

### 2026-07-26 — Health route and attribution slice

- Branch/commit: `agent/patchcad-integration` Task 12 partial
- Attempt: Add a cache-disabled health route that reveals only provider configuration presence, then document the trust boundary, noncommercial scope, supported limits, exact upstream licenses, and Text2CAD inspiration boundary.
- Result: worked
- Evidence: The two focused suites were RED on missing health modules, then passed 5 tests after adding a server-only injectable handler and an App Router module exposing only `GET`. The full suite passed 62 tests; typecheck, lint, and the Next production build passed and emitted dynamic `/api/health`, `/api/plan`, and `/api/research` routes. Installed package metadata and upstream license files agree that all three replicad packages are MIT, FreeCAD is LGPL-2.1-or-later, OCCT is LGPL-2.1 with its exception, and Text2CAD is CC BY-NC-SA 4.0.
- Carry-forward rule: Health responses may reveal only booleans, never values. Keep Text2CAD credit explicitly inspiration-only unless its noncommercial ShareAlike material is intentionally incorporated.

### 2026-07-26 — Synchronous health handler test assumption

- Branch/commit: `agent/patchcad-integration` health-route TDD
- Attempt: Parse the health handler's `Response` by calling `.then` directly on the handler result.
- Result: failed, then worked
- Evidence: The test failed with `TypeError: GET(...).then is not a function` because the injectable handler intentionally returns a synchronous `Response`. Reading `response.json()` directly made the unchanged implementation and both focused suites pass.
- Carry-forward rule: Route handlers may return `Response` or `Promise<Response>`; tests must await the body method on the returned response instead of assuming the handler itself is promise-shaped.

### 2026-07-26 — Parallel Next build lock collision

- Branch/commit: `agent/patchcad-providers` verification gate
- Attempt: Start a second production build while an independent reviewer was already building the same worktree.
- Result: failed, then worked
- Evidence: The second `npm run build` exited immediately with `Another next build process is already running`. The existing build completed and released `.next/lock`; an unchanged retry then compiled, type-checked, generated all pages, and emitted both provider routes successfully.
- Carry-forward rule: Never run concurrent Next production builds in one worktree. Parallelize builds across isolated worktrees, or wait for the current worktree's `.next/lock` owner to finish before retrying.

### 2026-07-26 — Provider route integration build fix

- Branch/commit: `agent/patchcad-providers` after `b4af09e`
- Attempt: Reproduce and fix the Next 16 production-build failure caused by unsupported exports from App Router route modules.
- Result: worked
- Evidence: `npm run build` compiled, then failed Next route type checking because `src/app/api/plan/route.ts` exported `createPlanRoute`; the research route exposed the same invalid factory pattern. A focused route-surface test was RED for `createPlanRoute` and `createResearchRoute`, then GREEN after moving both injectable factories to server-only provider modules. The exact production build subsequently completed and emitted dynamic `/api/plan` and `/api/research` routes.
- Carry-forward rule: Files under `src/app/**/route.ts` may export only supported HTTP handlers and Next route configuration fields. Keep testable dependency-injected handler factories in server modules outside the App Router route-file surface.

### 2026-07-26 — OpenAI structured local patch planning

- Branch/commit: `agent/patchcad-providers` Task 7
- Attempt: Add a server-only Responses API adapter using `responses.parse` and `zodTextFormat`, with an injected adapter boundary and deterministic plan validation before any OpenAI provenance is returned.
- Result: worked
- Evidence: The integration suite was RED on the missing route, then passed 9 behavior cases covering validated plans, malformed provider output, refusal, incomplete output, protected targets, missing configuration, malformed/oversized requests, and secret-free error envelopes. `npm run typecheck` exited 0.
- Carry-forward rule: The installed OpenAI 6.49 SDK exposes parsed output at `response.output_parsed`; refusal must be detected from `message` output content with `type: "refusal"`, and every parsed plan must still pass `validatePlan`.

### 2026-07-26 — Task 7 Fix Round 1: bounded requests and controlled rationale

- Branch/commit: `agent/patchcad-providers` after `5c9a4d9`
- Attempt: Prevent unbounded plan-route JSON consumption and prevent arbitrary model rationale from crossing the provider service boundary.
- Result: worked
- Evidence: Declared-oversize, missing-header, and falsified-header body tests were RED with `502` because the provider fake was reached, then GREEN with an early 64 KiB `Content-Length` check and an independent streaming byte cap. Resize and add-hole rationale tests were RED with executable model prose in the response, then GREEN after replacing it with operation-specific deterministic summaries. The focused suite passed 14 tests and type checking exited 0.
- Carry-forward rule: All provider routes must bound bytes while reading, regardless of headers. Treat structured-output string fields as untrusted provider text; return only controlled local summaries derived from validated semantic and numeric fields.

### 2026-07-26 — Exa-grounded component research

- Branch/commit: `agent/patchcad-providers` Task 8
- Attempt: Add a server-only Exa adapter and a route that returns bounded, normalized web evidence only, with canonical URL deduplication and safe upstream error handling.
- Result: worked
- Evidence: The route test was RED on the missing research route, then passed 4 behavior cases for constrained mounting-spec search, title/URL validation, canonical deduplication, five-source bounding, missing configuration, and redacted timeout failure. `npm run typecheck` exited 0.
- Carry-forward rule: Exa 2.16 retains `searchAndContents` as a deprecated compatibility wrapper; it accepts the requested `{ type: "auto", numResults: 5, text: { maxCharacters } }` call shape. Keep results as evidence only; no Exa output may modify CAD geometry.

### 2026-07-26 — Task 8 Fix Round 1: constrained Exa query composition

- Branch/commit: `agent/patchcad-providers` after `714cc08`
- Attempt: Prevent unrelated user research text from reaching Exa as the complete search query while preserving a single provider call and bounded growth.
- Result: worked
- Evidence: The adapter-boundary assertion was RED with the raw `M4 mounting bracket` query, then GREEN with an exact fixed composition that isolates the phrase as data and focuses retrieval on mounting-hole dimensions, bolt pattern, units, datasheets, and mechanical drawings. The focused suite passed 4 tests and type checking exited 0.
- Carry-forward rule: Compose provider research queries from a fixed domain frame plus the bounded user phrase exactly once; treat user text as isolated search data, never as provider instructions.

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

### 2026-07-26 — Real-browser exact CAD verification

- Branch/commit: `agent/patchcad-integration` Task 12
- Attempt: Exercise the complete Magic Circle workflow, the actual Web Worker and pinned OpenCascade WASM, exact STEP export/import, imported-face hole cutting, typed provider plans, and the 390 × 844 workspace in Chromium.
- Result: worked after five isolated RED/GREEN corrections
- Evidence: The first Playwright run accidentally reused an unrelated app on port 3000; the configuration now owns a dedicated port 3217 and can target an explicit `PLAYWRIGHT_BASE_URL` for deployed smoke tests. A manually injected webpack worker entry then prevented Next development startup with `Entry cad-worker depends on main`; removing it let the existing `new Worker(new URL(...))` boundary emit and load the worker. Real WASM execution exposed one-solid compound boolean results, so exact bracket and session-hole results now unwrap only an exactly-one-solid shape and reject zero or multiple solids. The browser workflow reproduced preview mesh replacement clearing the Magic Circle selection; the workspace regression fix now preserves the selection and invalidates only a stale preview. A STEP round-trip then proved that a point inside a pre-existing hole could be paired with the top-face ID; exact point-to-face distance validation now rejects it as `POINT_NOT_ON_FACE`. Finally, the first clean workflow emitted repeated `PCFSoftShadowMap` deprecation warnings; basic shadow maps removed that warning flood. `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3217 npm run test:e2e -- --reporter=line` passed all 5 tests in 10.4 seconds.
- Carry-forward rule: Browser verification must use an owned server or an explicit external base URL, execute the emitted worker and real WASM, and assert exact STEP behavior rather than only UI mocks. A planar-face operation must verify that its requested point lies on that exact face. Treat browser warnings and page errors as test evidence, not harmless noise.
