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
