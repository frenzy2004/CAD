# Bring-Your-Own-Key Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each PatchCAD browser user use their own OpenAI and Exa API keys without shipping, retaining, logging, or falling back to owner provider credentials.

**Architecture:** Public, secret-free constants name the two request headers and browser session-storage keys. Server-only routes extract a bounded key before body parsing and create a provider service only for that request. The client keeps independent optional keys only in browser `sessionStorage`, adds each to its matching request, and retains existing offline/local behavior when absent.

**Tech Stack:** Next.js 16 route handlers, TypeScript 6, React 19, Vitest, Testing Library, OpenAI SDK 6, Exa SDK 2.

## Global Constraints

- Do not add, copy, log, serialize, commit, or deploy any real provider secret.
- The public app never reads `OPENAI_API_KEY`, `EXA_API_KEY`, or `PATCHCAD_PROVIDER_ACCESS_CODE` as a fallback.
- Missing, blank, or overlong provider headers return HTTP 401 `{ error: { code: "PROVIDER_KEY_REQUIRED" } }` before body consumption or provider construction.
- Browser keys are password inputs, `autoComplete="off"`, and may exist only in React state and `sessionStorage`.
- The OpenAI key goes only to `/api/plan`; the Exa key goes only to `/api/research`.
- Preserve bounded JSON parsing, deterministic plan validation, controlled rationales, generic provider errors, worker isolation, and offline planning fallback.
- Use `apply_patch` for source edits, test first, run focused tests before committing, and commit each completed task.

---

## File structure

- `src/lib/provider-keys.ts` — secret-free names shared by browser and server.
- `src/server/http/request-provider-key.ts` — server-only bounded header reader and public 401 response helper.
- `src/server/openai/plan-route.ts` / `src/server/exa/research-route.ts` — factories that obtain a request-specific service only after key validation.
- `src/app/api/plan/route.ts` / `src/app/api/research/route.ts` — concrete request-scoped provider-service factories.
- `src/lib/env.ts` / `src/server/health/health-route.ts` — retain only non-secret model configuration and disclose the BYOK mode.
- `src/components/workspace/PatchWorkspace.tsx`, `PatchComposer.tsx`, and `src/hooks/usePatchWorkspace.ts` — session-only key UI and endpoint-specific request headers.
- `tests/unit/request-provider-key.test.ts`, route integration tests, workspace regression tests, `README.md`, and `.env.example` — regression coverage and accurate operator/user instructions.

### Task 1: Keep Vitest and Playwright test domains separate

**Files:**
- Modify: `vitest.config.ts`
- Test: `package.json` `test` script and `playwright.config.ts` provide the two runner boundaries.

**Interfaces:**
- Produces a Vitest configuration that excludes `tests/e2e/**`.
- Preserves Playwright ownership of `tests/e2e/**` through `npm run test:e2e`.

- [ ] **Step 1: Record the failing baseline command**

Run: `npm test`

Expected: FAIL with `Playwright Test did not expect test() to be called here`
from `tests/e2e/patch-workflow.spec.ts`, proving Vitest currently includes the
separate Playwright suite.

- [ ] **Step 2: Implement the smallest runner-boundary correction**

Add an `exclude` entry to the existing `test` object in `vitest.config.ts`:

```ts
exclude: ["tests/e2e/**"],
```

Do not rename tests, modify Playwright configuration, or alter the `test:e2e`
script.

- [ ] **Step 3: Verify the corrected boundaries**

Run: `npm test`

Expected: PASS with the Vitest suite only. The command must not import a
Playwright `test()` declaration.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "fix: exclude playwright specs from vitest"
```

### Task 2: Request-scoped provider-key route boundary

**Files:**
- Create: `src/lib/provider-keys.ts`, `src/server/http/request-provider-key.ts`, `tests/unit/request-provider-key.test.ts`
- Modify: `src/server/openai/plan-route.ts`, `src/server/exa/research-route.ts`, `tests/integration/api-plan.test.ts`, `tests/integration/api-research.test.ts`
- Delete: `src/server/http/provider-access-gate.ts`, `tests/unit/provider-access-gate.test.ts`

**Interfaces:**
- Produces `OPENAI_PROVIDER_KEY_HEADER = "x-patchcad-openai-key"`, `EXA_PROVIDER_KEY_HEADER = "x-patchcad-exa-key"`, `OPENAI_PROVIDER_KEY_STORAGE_KEY = "patchcad-openai-key"`, `EXA_PROVIDER_KEY_STORAGE_KEY = "patchcad-exa-key"`, `PROVIDER_KEY_REQUIRED_CODE = "PROVIDER_KEY_REQUIRED"`, and a `ProviderKeyName = "openai" | "exa"` type.
- Produces `readRequestProviderKey(request: Request, header: string): string | undefined`, which trims a header and accepts at most 1024 characters.
- Produces `createProviderKeyRequiredResponse(): Response` with status 401 and the exact public error envelope.
- Changes route factories to `createPlanRoute(createService: (apiKey: string) => PlanService)` and `createResearchRoute(createService: (apiKey: string) => ResearchService)`.

- [ ] **Step 1: Write failing server-boundary tests**

Add unit cases for a trimmed accepted key and missing, blank, and 1025-character rejected values. Change the plan and research integration helpers to inject a service factory. Add tests that a missing matching key header returns the exact 401 envelope before a streaming body is pulled, factory invoked, or adapter called; add a supplied-key case that captures the trimmed synthetic key passed to the factory.

```ts
expect(await handler(streamingRequest)).toMatchObject({ status: 401 });
expect(bodyRead).toBe(false);
expect(factoryCalls).toBe(0);
expect(await response.json()).toEqual({
  error: { code: "PROVIDER_KEY_REQUIRED" },
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/unit/request-provider-key.test.ts tests/integration/api-plan.test.ts tests/integration/api-research.test.ts`

Expected: failures because the new reader/constants and request-specific factory signatures do not yet exist, and the old shared-code behavior still answers `PROVIDER_ACCESS_REQUIRED`.

- [ ] **Step 3: Implement the minimal server boundary**

Create the secret-free shared constants and this server-only shape:

```ts
export function readRequestProviderKey(request: Request, header: string) {
  const key = request.headers.get(header)?.trim();
  return key && key.length <= 1024 ? key : undefined;
}

export function createProviderKeyRequiredResponse() {
  return Response.json(
    { error: { code: PROVIDER_KEY_REQUIRED_CODE } },
    { status: 401 },
  );
}
```

At the first line of each route handler, read its matching header and return the
helper response when missing. Only then parse JSON and invoke
`createService(apiKey)`. Delete the shared access-code gate and its tests.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- tests/unit/request-provider-key.test.ts tests/integration/api-plan.test.ts tests/integration/api-research.test.ts`

Expected: PASS with no legacy access-code imports or public error codes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/provider-keys.ts src/server/http/request-provider-key.ts \
  src/server/openai/plan-route.ts src/server/exa/research-route.ts \
  tests/unit/request-provider-key.test.ts tests/integration/api-plan.test.ts \
  tests/integration/api-research.test.ts
git commit -m "feat: require request-scoped provider keys"
```

### Task 3: Concrete routes, health, and operator documentation

**Files:**
- Modify: `src/app/api/plan/route.ts`, `src/app/api/research/route.ts`, `src/lib/env.ts`, `src/server/health/health-route.ts`, `tests/integration/api-health.test.ts`, `.env.example`, `README.md`

**Interfaces:**
- Consumes the Task 2 route factory signatures.
- Produces `getOpenAIModel(environment?: NodeJS.ProcessEnv): string`; it defaults to `"gpt-5.6"` and reads no provider secret.
- Health JSON is exactly `{ status: "ok", cadRuntime: "browser-wasm", providers: { openai: "byok", exa: "byok" } }`.

- [ ] **Step 1: Write failing application-wiring and health tests**

Update health tests to assert the exact BYOK response regardless of supplied
legacy provider environment variables. Keep the existing route-surface test
passing, then use the exact `rg` check in Step 4 to prove the concrete
plan/research routes no longer import the access gate or call
`getOpenAIConfiguration`/`getExaConfiguration`.

```ts
expect(await createHealthRoute({ OPENAI_API_KEY: "synthetic" })().json()).toEqual({
  status: "ok",
  cadRuntime: "browser-wasm",
  providers: { openai: "byok", exa: "byok" },
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/integration/api-health.test.ts tests/integration/api-route-surface.test.ts`

Expected: failure because health currently reports owner credential configuration
and application routes still create globally configured provider services.

- [ ] **Step 3: Implement per-request app wiring and documentation**

Replace `getOpenAIConfiguration` and `getExaConfiguration` with a non-secret
model getter while retaining the configuration types used by services. In each
application route, define a local factory that builds a configuration from the
request key and creates the corresponding SDK adapter/service inside that
factory. Do not retain a module-level service configured with a key.

Make health static BYOK status. Remove owner-key and shared-code entries from
`.env.example`; retain only `OPENAI_MODEL=gpt-5.6` with a BYOK comment. Update
README development, architecture, and deployment text to state that no provider
secret belongs in Vercel settings, keys are session-only, the server transits
them for a request, and self-hosting offers the strongest isolation.

- [ ] **Step 4: Run the focused tests and static secret-boundary check**

Run:

```bash
npm test -- tests/integration/api-health.test.ts tests/integration/api-route-surface.test.ts
rg -n "PATCHCAD_PROVIDER_ACCESS_CODE|createProviderAccessGate|getOpenAIConfiguration|getExaConfiguration" src tests .env.example README.md
```

Expected: tests PASS; `rg` returns no matches. Mentions of legacy variable names
are allowed only in the committed design spec that explains their removal.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/plan/route.ts src/app/api/research/route.ts src/lib/env.ts \
  src/server/health/health-route.ts tests/integration/api-health.test.ts \
  tests/integration/api-route-surface.test.ts .env.example README.md
git commit -m "feat: wire providers to user-supplied keys"
```

### Task 4: Session-only key workspace UI

**Files:**
- Modify: `src/components/workspace/PatchWorkspace.tsx`, `src/components/workspace/PatchComposer.tsx`, `src/components/workspace/ResearchPanel.tsx`, `src/hooks/usePatchWorkspace.ts`, `tests/integration/workspace-review-regressions.test.tsx`

**Interfaces:**
- Consumes the Task 2 constants and `PROVIDER_KEY_REQUIRED_CODE`.
- `PatchComposerProps` receives `providerKeys: { openai: string; exa: string }` and `onProviderKeyChange(provider: ProviderKeyName, value: string): void`.
- `usePatchWorkspace(initialSnapshot, providerKeys)` uses `providerKeys.openai` only for `/api/plan` and `providerKeys.exa` only for `/api/research`.

- [ ] **Step 1: Write failing browser regression tests**

Replace the uncommitted shared-code regression with independent OpenAI and Exa
password-input tests. Type synthetic values, assert `sessionStorage` values and
empty `localStorage`, trigger a plan, and assert request headers have exactly
the OpenAI key for `/api/plan` and exactly the Exa key for `/api/research`.
Return `PROVIDER_KEY_REQUIRED` and assert offline planning plus unavailable
research. Assert neither synthetic key appears in worker calls or audit-related
payloads, then clear both fields and assert their session entries are removed.

```ts
expect(planHeaders.get(OPENAI_PROVIDER_KEY_HEADER)).toBe("synthetic-openai-key");
expect(planHeaders.get(EXA_PROVIDER_KEY_HEADER)).toBeNull();
expect(researchHeaders.get(EXA_PROVIDER_KEY_HEADER)).toBe("synthetic-exa-key");
expect(researchHeaders.get(OPENAI_PROVIDER_KEY_HEADER)).toBeNull();
```

- [ ] **Step 2: Run the focused workspace test and verify RED**

Run: `npm test -- tests/integration/workspace-review-regressions.test.tsx`

Expected: failure because the screen still has one shared access-code field,
uses an obsolete header, and treats the old error code as the fallback trigger.

- [ ] **Step 3: Implement the minimal session-only UI**

Replace the shared-code state with `{ openai, exa }`, load/store its two values
under `patchcad-openai-key` and `patchcad-exa-key` in `sessionStorage`, and
remove an entry when its input is cleared. Render a compact labelled section
headed `Your API keys (session only)` with independent OpenAI and Exa password
inputs and explanatory copy that states keys are not saved and transit the
server only for the request. Use `autoComplete="off"`.

Create each fetch header object from `content-type` plus only its matching
nonblank provider header. Treat `PROVIDER_KEY_REQUIRED` exactly like the
existing absence of optional provider configuration: local parser for plans and
unavailable research. Do not change worker, audit, URL, or prompt payloads.

- [ ] **Step 4: Run the focused workspace test and verify GREEN**

Run: `npm test -- tests/integration/workspace-review-regressions.test.tsx`

Expected: PASS; no text, headers, worker calls, or storage entries reference
the shared access-code model.

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/PatchWorkspace.tsx \
  src/components/workspace/PatchComposer.tsx \
  src/components/workspace/ResearchPanel.tsx src/hooks/usePatchWorkspace.ts \
  tests/integration/workspace-review-regressions.test.tsx
git commit -m "feat: add session-only bring-your-own-key UI"
```

### Task 5: Full regression verification and security handoff

**Files:**
- Modify only if a verification failure reveals a product defect in the files above.
- Test: all Vitest suites, lint, typecheck, build, and fresh security scan.

**Interfaces:**
- Consumes completed Tasks 1–4.
- Produces an evidence-backed readiness report; it does not add a new provider feature.

- [ ] **Step 1: Run the complete automated verification gate**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0. If any command fails, write a minimal failing
regression test first, then fix only the implicated implementation using the
same task review loop.

- [ ] **Step 2: Run a fresh provider-flow security review**

Review the finished diff for owner-key fallback, persistent storage, secret
echoing/logging, provider construction before header rejection, cross-endpoint
header leakage, and errors that disclose a synthetic key. Record any validated
finding with file/line evidence and resolve it through a reviewed fix task.

- [ ] **Step 3: Record verification outcome**

When all commands and the security review are clean, leave the worktree with no
uncommitted provider implementation changes. If a validated defect required a
reviewed fix, its task-specific commit already records the exact changed files
and test evidence; do not create a blanket verification commit.
