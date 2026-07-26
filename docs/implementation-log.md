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
- Evidence: The first suite was RED on the missing module. Two follow-up regressions were RED because an anchor cleanup exception could prevent URL revocation and because `planSource` relied only on TypeScript; nested cleanup and a runtime source allowlist made all 9 focused tests pass. Typecheck and lint passed.
- Carry-forward rule: Workspace export must call this boundary only after worker verification. Audit serialization explicitly selects typed fields, and object URL cleanup must remain inside a nested `finally` so one cleanup failure cannot skip the other.

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
