# PatchCAD MVP Implementation Plan (Historical and Superseded)

> **Superseded provider setup:** This 2026-07-26 plan is retained only as
> implementation history. Its owner-managed `OPENAI_API_KEY` and `EXA_API_KEY`
> instructions are obsolete and must not be used for current setup. PatchCAD
> now accepts browser-session BYOK credentials per request, retains no owner
> provider credential, and requires an edge/WAF rate limit for public
> multi-instance deployment. Follow the current README and the 2026-07-27 BYOK
> design instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production Vercel application where a user circles a hole on an exact browser-generated bracket, asks for a local change in plain language, receives a typed OpenAI patch plan grounded by optional Exa research, previews a deterministic OpenCascade modification, verifies that no protected feature moved, and exports the result; also ship a FreeCAD add-on bridge for applying the same plan contract to desktop CAD.

**Architecture:** The Vercel-hosted Next.js application owns the product UI and server-only AI/research routes. Exact geometry stays in the browser: a Web Worker runs replicad's OpenCascade WebAssembly build and sends transferable meshes and STEP bytes to the UI. The model never emits executable CAD code; it returns a strict Zod-validated `PatchPlan`, which a deterministic patch engine validates and applies. A pure verification layer compares semantic feature fingerprints before and after the rebuild. The FreeCAD add-on uses the same JSON contract through import/export bundles and refuses unsupported or non-local edits.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Three.js with React Three Fiber, replicad with `replicad-opencascadejs`, Zod, OpenAI Responses API structured outputs, Exa JavaScript SDK, Vitest, Testing Library, Playwright, Python `unittest`, FreeCAD Python API, Vercel.

## Global Constraints

- Treat the user's supplied OpenAI and Exa credentials as secrets. Never place them in source, test fixtures, shell history, command arguments, logs, screenshots, commits, or generated artifacts.
- Keep `OPENAI_API_KEY`, `EXA_API_KEY`, and `OPENAI_MODEL` server-only. No variable containing a secret may use the `NEXT_PUBLIC_` prefix.
- The browser receives typed patch plans and public research citations only. It never receives provider credentials.
- The AI may select and parameterize only operations listed in `PatchPlanSchema`. It must never emit or execute Python, JavaScript, OpenSCAD, FreeCAD console code, or arbitrary B-rep instructions.
- The first exact-CAD proof supports a parametric single-solid mounting bracket with four through-holes. Supported operations are `resize_hole` and `add_hole`.
- A drawn circle is an intent envelope. The selected semantic feature ID, dimensions, edge-wall constraints, and protected-feature fingerprints are the authority.
- A patch succeeds only when the result is a valid solid, the requested target changed, and every protected fingerprint is unchanged within tolerance.
- The browser may import one manifold STEP solid and add a new session-owned through-hole on a planar face. It may resize that newly added hole by rebuilding from the untouched imported base. It must not claim it can resize arbitrary pre-existing STEP holes or reconstruct missing feature history.
- Geometry generation, meshing, and STEP export run in a browser Web Worker so Vercel Functions handle JSON only.
- When AI credentials are unavailable, the application remains a working deterministic CAD demo and labels its local parser honestly. It must not pretend a provider call occurred.
- Use documented public APIs only. Pin exact dependency versions in `package-lock.json`.
- Use isolated Git worktrees and parallel pull requests for independent workstreams. Do not let two agents edit the same file set concurrently.
- Record every material success, failure, workaround, and resulting carry-forward rule in `docs/implementation-log.md` before ending a task, so later branches do not repeat failed approaches.
- Preserve attribution for FreeCAD, Open CASCADE, replicad, and Text2CAD. No Text2CAD model weights or datasets are bundled in this milestone.
- Every implementation task follows red-green-refactor, ends with focused verification, runs a secret scan, and creates a small commit.

## Planned Repository Map

```text
.
├── .env.example
├── .gitignore
├── .vercelignore
├── README.md
├── THIRD_PARTY_NOTICES.md
├── eslint.config.mjs
├── next.config.ts
├── package-lock.json
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
├── public/
│   ├── cad-runtime/
│   │   └── replicad_single-0.23.0.wasm
│   └── icons/
├── scripts/
│   └── copy-cad-runtime.mjs
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── plan/route.ts
│   │   │   └── research/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── cad/
│   │   │   ├── CadViewport.tsx
│   │   │   ├── MagicCircleOverlay.tsx
│   │   │   ├── PatchPreview.tsx
│   │   │   └── Scene.tsx
│   │   ├── workspace/
│   │   │   ├── PatchComposer.tsx
│   │   │   ├── PatchWorkspace.tsx
│   │   │   ├── ResearchPanel.tsx
│   │   │   └── VerificationStrip.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── StatusBadge.tsx
│   ├── hooks/
│   │   ├── useCadWorker.ts
│   │   └── usePatchWorkspace.ts
│   ├── lib/
│   │   ├── cad/
│   │   │   ├── contract.ts
│   │   │   ├── demo-bracket.ts
│   │   │   ├── local-parser.ts
│   │   │   ├── patch-engine.ts
│   │   │   ├── projection.ts
│   │   │   ├── schemas.ts
│   │   │   └── worker-protocol.ts
│   │   ├── download.ts
│   │   └── env.ts
│   ├── server/
│   │   ├── openai/
│   │   │   ├── client.ts
│   │   │   ├── plan-prompt.ts
│   │   │   └── plan-service.ts
│   │   └── exa/
│   │       ├── client.ts
│   │       └── research-service.ts
│   └── workers/
│       └── cad.worker.ts
├── tests/
│   ├── e2e/
│   │   └── patch-workflow.spec.ts
│   ├── fixtures/
│   │   └── bracket-context.json
│   ├── integration/
│   │   ├── api-plan.test.ts
│   │   ├── api-research.test.ts
│   │   └── cad-worker.test.ts
│   ├── unit/
│   │   ├── local-parser.test.ts
│   │   ├── patch-engine.test.ts
│   │   ├── projection.test.ts
│   │   └── schemas.test.ts
│   └── setup.ts
├── freecad/
│   ├── README.md
│   ├── PatchCAD/
│   │   ├── package.xml
│   │   ├── pyproject.toml
│   │   ├── Resources/
│   │   │   └── Icons/
│   │   │       └── PatchCAD.svg
│   │   └── freecad/
│   │       └── PatchCAD/
│   │           ├── __init__.py
│   │           ├── init.py
│   │           ├── init_gui.py
│   │           ├── Commands.py
│   │           ├── protocol.py
│   │           ├── selection.py
│   │           ├── feature.py
│   │           ├── service.py
│   │           ├── audit.py
│   │           ├── bridge.py
│   │           └── tests/
└── docs/
    ├── implementation-log.md
    └── superpowers/
        ├── plans/
        │   └── 2026-07-26-patchcad-mvp.md
        └── specs/
            └── 2026-07-26-patchcad-design.md
```

## Parallel Execution Strategy

1. Land Task 1 through Task 4 on `agent/patchcad-foundation`; these files define the dependency graph and shared contracts.
2. Push that branch, then create three isolated worktrees from the same foundation commit:
   - `agent/patchcad-kernel` for Tasks 5, 6, and 10;
   - `agent/patchcad-providers` for Tasks 7 and 8;
   - `agent/patchcad-freecad` for Task 11.
3. Each worktree updates its own section of `docs/implementation-log.md`, pushes its branch, and opens a focused pull request. File ownership is exclusive during parallel work.
4. Merge the three reviewed pull requests into `agent/patchcad-integration`, resolve only genuine integration seams there, then complete Tasks 9 and 12 through 14.
5. Never reuse a failed worktree for a second approach without first logging the failure and resetting the branch through a safe, non-destructive method.

---

### Task 1: Scaffold the Vercel-ready application and test harness

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/setup.ts`
- Create: `.gitignore`
- Create: `.vercelignore`
- Create: `.env.example`
- Create: `scripts/copy-cad-runtime.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] Initialize the pinned Next.js application at the repository root. Install runtime dependencies:

```bash
npm install --save-exact next@16.2.12 react@19.2.8 react-dom@19.2.8 zod@4.4.3 openai@6.49.0 exa-js@2.16.0 three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7 replicad@0.23.1 replicad-opencascadejs@0.23.0 replicad-threejs-helper@0.23.0 lucide-react@1.27.0 clsx@2.1.1
npm install --save-dev --save-exact typescript @types/node @types/react @types/react-dom @types/three tailwindcss @tailwindcss/postcss eslint eslint-config-next vitest@4.1.10 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test@1.62.0
```

- [ ] Write scripts in `package.json`:

```json
{
  "scripts": {
    "predev": "node scripts/copy-cad-runtime.mjs",
    "dev": "next dev --webpack",
    "prebuild": "node scripts/copy-cad-runtime.mjs",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:freecad": "PYTHONPATH=freecad/PatchCAD python3 -m unittest discover -s freecad/PatchCAD/freecad/PatchCAD/tests -v",
    "verify": "npm run lint && npm run typecheck && npm test && npm run test:freecad && npm run build"
  }
}
```

- [ ] Set `"engines": { "node": "22.x" }` so Vercel uses a supported LTS runtime. The local Node 24 runtime may be used for development only when the same lockfile and full build gate pass.

- [ ] Implement `scripts/copy-cad-runtime.mjs` to copy `node_modules/replicad-opencascadejs/src/replicad_single.wasm` to the versioned public path. Fail loudly if the pinned source artifact is missing; do not download or compile OCCT during a Vercel build.

- [ ] Add an immutable one-year header for `/cad-runtime/replicad_single-0.23.0.wasm` in `next.config.ts`, and Webpack client fallbacks for Node-only modules referenced by Emscripten. Do not enable pthreads or cross-origin isolation in this milestone.

- [ ] Make `.gitignore` reject `.env`, `.env.*`, `.vercel`, `node_modules`, `.next`, Playwright artifacts, Python caches, FreeCAD backup files, and exported CAD files while explicitly allowing `.env.example`.

- [ ] Use `.vercelignore` to omit design-time test artifacts and Python caches while retaining the small FreeCAD source directory for downloadable documentation. Never omit `public/cad-runtime`.

- [ ] Put variable names only in `.env.example`:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
EXA_API_KEY=
```

- [ ] Configure Vitest for `jsdom`, `tests/setup.ts`, and the `@/` alias. Configure Playwright to start `npm run dev` and run Chromium against `http://127.0.0.1:3000`.

- [ ] Add a temporary failing smoke test in `tests/unit/schemas.test.ts` that imports `@/lib/cad/schemas` and expects it to exist.

- [ ] Run the test and confirm RED:

```bash
npm test -- tests/unit/schemas.test.ts
```

Expected: module resolution failure for `@/lib/cad/schemas`.

- [ ] Keep the root page minimal but valid, with the title `PatchCAD` and a `main` landmark. The complete workspace arrives in Task 8.

- [ ] Run scaffold checks:

```bash
npm run typecheck
npm run lint
npm run build
```

- [ ] Scan for secret-shaped values:

```bash
git grep -nE '(sk-proj-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})' -- . ':!docs/superpowers/plans/2026-07-26-patchcad-mvp.md'
```

Expected: no output.

- [ ] Commit:

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts playwright.config.ts tests/setup.ts tests/unit/schemas.test.ts .gitignore .vercelignore .env.example scripts src/app
git commit -m "Scaffold PatchCAD web application"
```

- [ ] Append the verified scaffold commands, any dependency/bundler failures, and their carry-forward rules to `docs/implementation-log.md` in the same commit or an immediately following documentation commit.

### Task 2: Define the shared CAD and AI contracts

**Files:**

- Create: `src/lib/cad/schemas.ts`
- Create: `src/lib/cad/contract.ts`
- Create: `tests/fixtures/bracket-context.json`
- Modify: `tests/unit/schemas.test.ts`

- [ ] Replace the scaffold smoke test with failing tests for:

  - a valid version-1 bracket snapshot;
  - `resize_hole` and `add_hole` plans;
  - rejection of negative diameters, unknown operations, extra keys, mismatched units, and malformed feature IDs;
  - serialization round-trip without data loss.

- [ ] Define strict Zod schemas and inferred TypeScript types:

```ts
type HoleFeature = {
  id: `hole:${string}`;
  kind: "through_hole";
  centerMm: { x: number; y: number; z: number };
  diameterMm: number;
  axis: { x: 0; y: 0; z: 1 };
};

type BracketSnapshot = {
  version: 1;
  kind: "mounting_bracket";
  units: "mm";
  dimensions: { widthMm: number; depthMm: number; heightMm: number };
  holes: HoleFeature[];
};

type PatchPlan =
  | {
      version: 1;
      operation: "resize_hole";
      targetFeatureId: HoleFeature["id"];
      diameterMm: number;
      rationale: string;
    }
  | {
      version: 1;
      operation: "add_hole";
      targetFaceId: "face:top";
      centerMm: { x: number; y: number };
      diameterMm: number;
      rationale: string;
    };
```

- [ ] Add `SelectionEnvelopeSchema`, `FeatureFingerprintSchema`, `VerificationReportSchema`, `PlanRequestSchema`, `PlanResponseSchema`, `ResearchRequestSchema`, and `ResearchResponseSchema`. Use `.strict()` at every object boundary.

- [ ] Put cross-cutting tolerances in `contract.ts`:

```ts
export const CONTRACT = {
  units: "mm",
  fingerprintToleranceMm: 1e-4,
  minimumWallMm: 2,
  minimumHoleDiameterMm: 1,
  maximumHoleDiameterMm: 40,
  maximumPromptCharacters: 500,
} as const;
```

- [ ] Run RED, implement the schemas, then run GREEN:

```bash
npm test -- tests/unit/schemas.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/cad/schemas.ts src/lib/cad/contract.ts tests/fixtures/bracket-context.json tests/unit/schemas.test.ts
git commit -m "Define typed PatchCAD contracts"
```

### Task 3: Implement deterministic patching and locality verification

**Files:**

- Create: `src/lib/cad/demo-bracket.ts`
- Create: `src/lib/cad/patch-engine.ts`
- Create: `tests/unit/patch-engine.test.ts`

- [ ] Write failing tests covering:

  - resizing only the selected hole;
  - adding a hole only on `face:top`;
  - rejection when the target is not in the selection envelope;
  - rejection when a hole violates the minimum edge wall or intersects another hole;
  - protected fingerprints remaining unchanged;
  - detection of an intentionally mutated protected feature;
  - one-level undo restoring byte-for-byte-equivalent snapshot JSON.

- [ ] Create `createDemoBracket()` with dimensions `100 × 64 × 8 mm` and four `6 mm` corner holes centered `12 mm` from their adjacent edges. Assign stable semantic IDs `hole:nw`, `hole:ne`, `hole:sw`, and `hole:se`.

- [ ] Implement pure functions:

```ts
export function fingerprintSnapshot(snapshot: BracketSnapshot): FeatureFingerprint[];
export function validatePlan(input: {
  before: BracketSnapshot;
  selection: SelectionEnvelope;
  plan: PatchPlan;
}): ValidationResult;
export function applyPatch(input: {
  before: BracketSnapshot;
  selection: SelectionEnvelope;
  plan: PatchPlan;
}): { after: BracketSnapshot; report: VerificationReport };
export function verifyLocality(
  before: BracketSnapshot,
  after: BracketSnapshot,
  editableFeatureIds: string[],
): VerificationReport;
```

- [ ] Use coordinate, diameter, count, and solid-dimension fingerprints; do not rely on array position. Round only for comparison, never for geometry input.

- [ ] Return structured rejection codes such as `TARGET_OUTSIDE_SELECTION`, `MINIMUM_WALL_VIOLATION`, `HOLE_COLLISION`, `PROTECTED_FEATURE_CHANGED`, and `UNSUPPORTED_OPERATION`.

- [ ] Run:

```bash
npm test -- tests/unit/patch-engine.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/cad/demo-bracket.ts src/lib/cad/patch-engine.ts tests/unit/patch-engine.test.ts
git commit -m "Add deterministic local patch engine"
```

### Task 4: Parse a small offline command grammar

**Files:**

- Create: `src/lib/cad/local-parser.ts`
- Create: `tests/unit/local-parser.test.ts`

- [ ] Write failing table tests for:

  - `make this hole 8 mm`;
  - `resize selected hole to 1/4 inch` converting to `6.35 mm`;
  - `add a 5 mm hole here`;
  - harmless capitalization and whitespace;
  - rejection of missing dimensions, non-positive values, multiple operations, and unsupported operations.

- [ ] Implement `parseLocalPatch(prompt, selection): PatchPlanParseResult`. It may recognize only resize/add-hole grammar and must set `source: "local-parser"` so the UI can label it.

- [ ] Keep the parser independent of the OpenAI path. It is an explicit offline mode and an operational fallback only when the server reports `AI_NOT_CONFIGURED`.

- [ ] Run:

```bash
npm test -- tests/unit/local-parser.test.ts
```

- [ ] Commit:

```bash
git add src/lib/cad/local-parser.ts tests/unit/local-parser.test.ts
git commit -m "Add honest offline patch parser"
```

### Task 5: Build the browser OpenCascade worker

**Files:**

- Create: `src/lib/cad/worker-protocol.ts`
- Create: `src/workers/cad.worker.ts`
- Create: `src/hooks/useCadWorker.ts`
- Create: `tests/integration/cad-worker.test.ts`
- Modify: `next.config.ts`

- [ ] Define a strict request/reply protocol with unique request IDs:

```ts
type CadWorkerRequest =
  | { id: string; type: "initialize" }
  | { id: string; type: "build"; snapshot: BracketSnapshot }
  | { id: string; type: "import-step"; bytes: ArrayBuffer }
  | {
      id: string;
      type: "cut-session-hole";
      faceId: number;
      pointMm: { x: number; y: number; z: number };
      diameterMm: number;
    }
  | { id: string; type: "export-step"; snapshot?: BracketSnapshot };

type CadWorkerReply =
  | { id: string; type: "ready" }
  | { id: string; type: "imported"; model: ImportedModelSummary; mesh: CadMesh }
  | { id: string; type: "mesh"; mesh: CadMesh }
  | { id: string; type: "step"; filename: string; bytes: ArrayBuffer }
  | { id: string; type: "error"; code: string; message: string };
```

- [ ] Write a failing worker-protocol test that validates request IDs, rejects unknown message types, and asserts a built mesh has finite positions, triangle indices, normals, bounds, and semantic hole anchors.

- [ ] Configure the worker as a client-only ESM dependency and ensure WebAssembly assets are emitted by the Next.js build. Do not import replicad from a Server Component or route handler.

- [ ] In `cad.worker.ts`, initialize `replicad-opencascadejs` exactly once using `locateFile: () => "/cad-runtime/replicad_single-0.23.0.wasm"`, inject it with `setOC`, build the bracket as one box cut by cylinders, mesh the resulting solid, and transfer array buffers rather than cloning them.

- [ ] Add exact STEP import with `importSTEP(new Blob([bytes]))`. Accept one solid under a documented desktop-oriented size limit, retain an untouched base B-rep in worker memory, and return `mesh().faceGroups` so raycast triangles map back to OCCT face IDs.

- [ ] For imported solids, allow a new session-owned hole only when the hit face reports planar geometry. Compute the face normal at the model-space hit point, cut a cylinder longer than twice the model bounding-box diagonal, and rebuild resize operations from the untouched imported base plus the session feature record. Reject pre-existing-hole resize requests.

- [ ] Export STEP bytes with `blobSTEP()` from the exact result shape, not from the display mesh.

- [ ] Add worker lifecycle management in `useCadWorker`: lazy client initialization, pending-request map, timeout, progress/error states, and termination on unmount.

- [ ] Run:

```bash
npm test -- tests/integration/cad-worker.test.ts
npm run typecheck
npm run build
```

- [ ] If jsdom cannot execute the WASM worker, keep protocol tests in Vitest and add the real worker build/export assertion to the Playwright test in Task 12. Do not replace the kernel with a fake in production code.

- [ ] Commit:

```bash
git add src/lib/cad/worker-protocol.ts src/workers/cad.worker.ts src/hooks/useCadWorker.ts tests/integration/cad-worker.test.ts next.config.ts
git commit -m "Run exact bracket geometry in a CAD worker"
```

### Task 6: Render the model and implement the Magic Circle

**Files:**

- Create: `src/components/cad/Scene.tsx`
- Create: `src/components/cad/CadViewport.tsx`
- Create: `src/components/cad/MagicCircleOverlay.tsx`
- Create: `src/lib/cad/projection.ts`
- Create: `tests/unit/projection.test.ts`

- [ ] Write failing tests for choosing the nearest projected feature anchor inside a drawn circle, rejecting anchors outside it, resolving ties deterministically by feature ID, and converting pointer coordinates using the canvas bounding rectangle.

- [ ] Implement projection helpers as pure functions and keep Three.js object traversal out of selection logic.

- [ ] Render the transferable worker mesh using `BufferGeometry`, physically legible lighting, grid, axes, orbit controls, fit-to-view, and selected-feature highlighting.

- [ ] Implement circle drawing with pointer capture:

  - pointer down records the center;
  - pointer move updates radius;
  - pointer up resolves a semantic hole anchor;
  - movement below `8 px` is treated as a click-sized circle;
  - `Escape` cancels;
  - orbit controls are disabled while drawing.

- [ ] Show the circle as a precise SVG overlay, keep it visible after selection, and provide accessible status text such as `Selected hole:nw, diameter 6 mm`.

- [ ] Expose `onSelectionChange(selectionEnvelope)` from `CadViewport`. The envelope must name exactly one editable feature for `resize_hole`.

- [ ] Run:

```bash
npm test -- tests/unit/projection.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add src/components/cad src/lib/cad/projection.ts tests/unit/projection.test.ts
git commit -m "Add Magic Circle CAD selection"
```

### Task 7: Add OpenAI structured patch planning

**Files:**

- Create: `src/lib/env.ts`
- Create: `src/server/openai/client.ts`
- Create: `src/server/openai/plan-prompt.ts`
- Create: `src/server/openai/plan-service.ts`
- Create: `src/app/api/plan/route.ts`
- Create: `tests/integration/api-plan.test.ts`

- [ ] Write failing service and route tests using an injected fake model adapter. Cover:

  - a parsed valid plan;
  - schema-invalid model output;
  - refusal;
  - incomplete response;
  - model attempting to target a protected feature;
  - missing key returning HTTP `503` with code `AI_NOT_CONFIGURED`;
  - malformed or oversized request returning HTTP `400`;
  - no secret present in response bodies or serialized errors.

- [ ] Validate environment access through server-only functions. The default model is `gpt-5.6`; allow `OPENAI_MODEL` to override it without exposing the value to the client bundle.

- [ ] Create a lean outcome-first prompt:

```text
Produce one safe local CAD patch plan.
Success means the operation is in the supplied schema, targets only the selected
feature or selected top-face point, preserves millimetres, and does not infer
missing geometry. Refuse unsupported edits. Never output executable CAD code.
```

- [ ] Implement the provider adapter with the official Responses API and Zod structured-output helper:

```ts
const response = await openai.responses.parse({
  model,
  input,
  text: { format: zodTextFormat(PatchPlanSchema, "patch_plan") },
});
```

- [ ] Parse refusal and incomplete states explicitly. Pass every model result through `validatePlan` before returning it.

- [ ] Return `source: "openai"` only after a real successful provider response.

- [ ] Run:

```bash
npm test -- tests/integration/api-plan.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/env.ts src/server/openai src/app/api/plan/route.ts tests/integration/api-plan.test.ts
git commit -m "Plan local CAD patches with OpenAI"
```

### Task 8: Add Exa-grounded component research

**Files:**

- Create: `src/server/exa/client.ts`
- Create: `src/server/exa/research-service.ts`
- Create: `src/app/api/research/route.ts`
- Create: `tests/integration/api-research.test.ts`

- [ ] Write failing tests with an injected Exa adapter for:

  - a constrained mounting-spec query;
  - deduplication by canonical URL;
  - result normalization to title, URL, excerpt, and source domain;
  - at most five returned sources;
  - invalid URLs and empty titles being discarded;
  - missing key returning `RESEARCH_NOT_CONFIGURED`;
  - upstream timeout returning a safe `502` without request headers or secrets.

- [ ] Implement a single server-only `searchAndContents` call with `type: "auto"`, `numResults: 5`, bounded text, and a query focused on mounting-hole dimensions or datasheets.

- [ ] Do not let Exa results mutate geometry directly. Research results are evidence shown beside the proposed dimensions; the user still chooses whether to apply a plan.

- [ ] Run:

```bash
npm test -- tests/integration/api-research.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add src/server/exa src/app/api/research/route.ts tests/integration/api-research.test.ts
git commit -m "Ground component patches with Exa research"
```

### Task 9: Assemble the complete PatchCAD workspace

**Files:**

- Create: `src/hooks/usePatchWorkspace.ts`
- Create: `src/components/workspace/PatchWorkspace.tsx`
- Create: `src/components/workspace/PatchComposer.tsx`
- Create: `src/components/workspace/ResearchPanel.tsx`
- Create: `src/components/workspace/VerificationStrip.tsx`
- Create: `src/components/cad/PatchPreview.tsx`
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/StatusBadge.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] Write a failing Testing Library workflow test inside `tests/integration/workspace.test.tsx`:

  1. demo bracket becomes ready;
  2. `hole:nw` is selected;
  3. user enters `make this hole 8 mm`;
  4. preview shows only one changed feature;
  5. verification shows `3 protected holes unchanged`;
  6. Apply updates the current diameter;
  7. Undo restores `6 mm`.

- [ ] Implement a reducer/state machine with explicit states:

```text
booting → ready → selected → planning → previewing → applying → verified
                                      ↘ rejected
                                      ↘ error
```

- [ ] Build a non-chat industrial workspace:

  - compact top toolbar with sample name, kernel status, and export;
  - large central CAD viewport;
  - right-side patch inspector with selected feature, one-line instruction, plan source, editable proposed dimension, and Apply/Reject;
  - collapsible evidence section for Exa citations;
  - bottom verification strip showing locality, solid validity, and protected fingerprints.

- [ ] Use a restrained graphite/ivory/orange visual system, tabular numeric typography, visible millimetre units, high-contrast focus rings, responsive stacking below tablet width, and no generic message bubbles.

- [ ] On plan submission:

  1. call `/api/plan`;
  2. if it returns `AI_NOT_CONFIGURED`, use `parseLocalPatch` and label `Offline grammar`;
  3. validate locally;
  4. build the preview through the real worker;
  5. show verification before enabling Apply.

- [ ] Support Apply, Reject, one-level Undo, Reset Sample, and manual numeric adjustment that is revalidated before rebuilding.

- [ ] Run:

```bash
npm test -- tests/integration/workspace.test.tsx
npm run typecheck
npm run lint
```

- [ ] Commit:

```bash
git add src/hooks/usePatchWorkspace.ts src/components src/app tests/integration/workspace.test.tsx
git commit -m "Assemble the PatchCAD editing workspace"
```

### Task 10: Export exact CAD and patch audit artifacts

**Files:**

- Create: `src/lib/download.ts`
- Modify: `src/hooks/usePatchWorkspace.ts`
- Modify: `src/components/workspace/PatchWorkspace.tsx`
- Modify: `src/components/workspace/VerificationStrip.tsx`
- Create: `tests/unit/download.test.ts`

- [ ] Write failing tests for safe filename generation, MIME types, object URL revocation, and a patch audit JSON containing before hash, after hash, selection, plan source, plan, verification report, and timestamp without credentials or provider headers.

- [ ] Add two exports:

  - `patchcad-bracket.step` from the exact worker shape;
  - `patchcad-audit.json` from the typed application state.

- [ ] Disable STEP export until a worker result is verified. Show byte size and browser-local processing in the status.

- [ ] Run:

```bash
npm test -- tests/unit/download.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add src/lib/download.ts src/hooks/usePatchWorkspace.ts src/components/workspace tests/unit/download.test.ts
git commit -m "Export verified CAD and patch audits"
```

### Task 11: Implement the FreeCAD bridge contract and add-on

**Files:**

- Create: `freecad/PatchCAD/package.xml`
- Create: `freecad/PatchCAD/pyproject.toml`
- Create: `freecad/PatchCAD/Resources/Icons/PatchCAD.svg`
- Create: `freecad/PatchCAD/freecad/PatchCAD/__init__.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/init.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/init_gui.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/Commands.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/protocol.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/selection.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/feature.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/service.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/audit.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/bridge.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/tests/test_protocol.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/tests/test_audit.py`
- Create: `freecad/PatchCAD/freecad/PatchCAD/tests/test_bridge.py`

- [ ] Use the modern FreeCAD 1.1 namespaced add-on layout. `package.xml` must declare `<freecadmin>1.1.0</freecadmin>`, depend on the internal `part` module, and name `PatchCADWorkbench` as its workbench class.

- [ ] Start with failing FreeCAD-independent tests for strict request parsing, unknown-key rejection, millimetre units, supported operations, request idempotency, atomic audit writes, bridge token authentication, exact-origin CORS, Private Network Access preflight, request body bounds, and timeout behavior.

- [ ] Keep `protocol.py`, `audit.py`, and the HTTP transport importable without FreeCAD. Define:

```py
@dataclass(frozen=True)
class PatchRequest:
    request_id: str
    document: str | None
    object_name: str
    subelement: str
    operation: Literal["add_hole", "resize_hole"]
    diameter_mm: float
    point: tuple[float, float, float] | None = None
    through_all: bool = True
```

- [ ] Register `PatchCADWorkbench` in `init_gui.py` and commands `PatchCAD_AddHole`, `PatchCAD_ResizeHole`, `PatchCAD_TogglePatch`, `PatchCAD_StartBridge`, and `PatchCAD_StopBridge` through `FreeCADGui.addCommand`.

- [ ] Resolve GUI selections with `FreeCADGui.Selection.getSelectionEx()` and persist document name, object name, subelement name, and picked point. Accept only planar faces for add-hole and full inward cylindrical faces for resize; reject partial cylinders and outward bosses.

- [ ] Make a reversible `Part::FeaturePython` Patch object rather than overwriting the source. Persist source link/subelement, operation, diameter, original diameter, point, axis, cutter bounds, enabled state, patch ID, request ID, audit ID, and schema version as FreeCAD properties.

- [ ] Put all mutation behind `service.py` with one FreeCAD transaction per operation. Abort and recompute on every exception; commit only after a non-null, valid one-solid result. Make repeated `request_id` calls return the existing patch.

- [ ] Use `Part.makeCylinder` plus exact `cut` for add/enlarge operations. Implement shrink only for a validated full cylindrical hole wall by fusing an annulus and recutting the requested inner cylinder. `Enabled=False` must reproduce the source shape.

- [ ] Atomically write `<document>.FCStd.patchcad.audit.json` after a committed transaction using a same-directory temporary file, `flush`, `fsync`, and `os.replace`. Report an audit-write error separately because filesystem writes are not part of FreeCAD undo.

- [ ] Add an explicit localhost bridge bound only to `127.0.0.1` with health, selection, create-patch, update-diameter, and enable/disable endpoints. Require an in-memory random token, allow only configured exact localhost/Vercel origins, limit bodies, and dispatch all FreeCAD work from HTTP threads onto the GUI thread through a Qt timer.

- [ ] Run pure tests:

```bash
PYTHONPATH="$PWD/freecad/PatchCAD" python3 -m unittest \
  freecad.PatchCAD.tests.test_protocol \
  freecad.PatchCAD.tests.test_audit \
  freecad.PatchCAD.tests.test_bridge
```

- [ ] If a FreeCAD executable is available, also run:

```bash
FreeCADCmd -M "$PWD/freecad/PatchCAD" --run-test freecad.PatchCAD.tests.test_feature
FreeCADCmd -M "$PWD/freecad/PatchCAD" --run-test freecad.PatchCAD.tests.test_transactions
```

If it is unavailable, record the smoke test as an installation-dependent manual verification; do not claim it ran.

- [ ] Commit:

```bash
git add freecad
git commit -m "Add the PatchCAD FreeCAD bridge"
```

### Task 12: Add health checks, end-to-end tests, docs, and attribution

**Files:**

- Create: `src/app/api/health/route.ts`
- Create: `tests/e2e/patch-workflow.spec.ts`
- Create: `README.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `freecad/README.md`
- Modify: `src/app/layout.tsx`

- [ ] Add a health route returning:

```json
{
  "status": "ok",
  "cadRuntime": "browser-wasm",
  "openaiConfigured": true,
  "exaConfigured": true
}
```

The booleans may reveal configuration presence but never values.

- [ ] Write Playwright tests for:

  - page title and accessible landmarks;
  - worker reaching `Kernel ready`;
  - Magic Circle selecting `hole:nw`;
  - offline resize workflow from `6 mm` to `8 mm`;
  - preview verification showing protected features unchanged;
  - Apply and Undo;
  - STEP export producing a non-empty download;
  - mobile layout at `390 × 844`;
  - no uncaught browser errors.

- [ ] Add a route-mocked OpenAI browser test and keep one production-compatible deterministic path so CI does not spend provider credits.

- [ ] Document:

  - prerequisites and local commands;
  - secret setup using `.env.local` without example values;
  - exact supported operations and limits;
  - browser sample workflow;
  - FreeCAD bundle workflow and installation;
  - architecture and trust boundary;
  - deployment;
  - known MVP limit: browser editing uses the included parametric bracket, while arbitrary STEP editing requires FreeCAD;
  - noncommercial prototype status.

- [ ] In `THIRD_PARTY_NOTICES.md`, credit and link:

  - FreeCAD and its LGPL-2.1 license;
  - Open CASCADE Technology and LGPL-2.1 with exception;
  - replicad and MIT license;
  - Text2CAD, its paper, and CC BY-NC-SA 4.0 license, clearly stating it is design inspiration and no weights/dataset are shipped.

- [ ] Run:

```bash
npx playwright install chromium
npm run test:e2e
npm run verify
```

- [ ] Commit:

```bash
git add src/app/api/health tests/e2e README.md THIRD_PARTY_NOTICES.md freecad/README.md src/app/layout.tsx
git commit -m "Document and verify the PatchCAD MVP"
```

### Task 13: Security and implementation review

**Files:**

- Modify only files implicated by review findings.

- [ ] Use `superpowers:requesting-code-review` with the design spec and this plan as requirements.

- [ ] Use `vercel:react-best-practices` to review every changed TSX file and fix material findings.

- [ ] Check that provider modules are unreachable from client bundles:

```bash
rg -n 'OPENAI_API_KEY|EXA_API_KEY|new OpenAI|new Exa' src
rg -n 'use client' src/server src/app/api
```

Expected: credentials and provider clients appear only under server or route modules; no `use client` appears there.

- [ ] Scan tracked and untracked text for the actual secret prefixes and UUID-like Exa keys without printing file contents:

```bash
git grep -lE '(sk-proj-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})' -- . || true
git status --short
```

Expected: no matching file paths. If any appear, stop, remove them without displaying the matching line, rotate the affected key, and rerun the scan.

- [ ] Run the complete local gate:

```bash
npm run verify
npm run test:e2e
```

- [ ] Commit review fixes if required:

```bash
git add --all
git commit -m "Harden PatchCAD before deployment"
```

Do not create an empty commit when no fixes are needed.

### Task 14: Push, deploy to Vercel, and verify production

**Files:**

- Vercel-generated local metadata only: `.vercel/project.json` (ignored)
- Modify tracked files only if the Vercel build reveals a real portability defect.

- [ ] Push the implementation branch to `frenzy2004/CAD` and open a pull request against `main`. Ensure all commits from this plan are visible remotely.

- [ ] Check Vercel authentication without exposing tokens:

```bash
npx vercel@latest whoami
```

- [ ] Link the GitHub repository to a Vercel project named `patchcad`:

```bash
npx vercel@latest link --yes --project patchcad
```

- [ ] Configure `OPENAI_API_KEY` and `EXA_API_KEY` as encrypted Vercel environment variables for Preview and Production using Vercel's interactive secret input or dashboard. Configure `OPENAI_MODEL=gpt-5.6` as a non-secret. Never put a value on the command line, in a file, or in captured output.

- [ ] If a secure credential-input channel is not available to the agent, deploy the fully functional offline CAD path, report the two provider integrations as unconfigured, and give the user the exact dashboard variable names. Do not weaken secret handling to satisfy this step.

- [ ] Create a preview deployment:

```bash
npx vercel@latest deploy --yes
```

- [ ] Inspect the build result and logs. Fix only reproducible application issues, rerun `npm run verify`, commit, push, and redeploy.

- [ ] Verify the preview in a real browser:

  - initial document and styles load;
  - WebAssembly worker reaches ready;
  - Magic Circle selection works;
  - offline plan, preview, Apply, Undo, and STEP export work;
  - `/api/health` returns `200`;
  - configured provider routes return safe responses;
  - console has no uncaught errors;
  - narrow viewport remains usable.

- [ ] Deploy the verified commit to production:

```bash
PATCHCAD_PRODUCTION_URL="$(npx vercel@latest deploy --prod --yes)"
```

- [ ] Run production Playwright smoke tests against the production URL:

```bash
PLAYWRIGHT_BASE_URL="$PATCHCAD_PRODUCTION_URL" npm run test:e2e -- --grep @smoke
```

- [ ] Inspect production runtime errors and deployment status through Vercel. Confirm the deployment is `READY` and no server route is leaking headers or credentials.

- [ ] Merge the reviewed implementation to `main`, confirm `origin/main` points at the verified deployment commit, and preserve the production URL in the GitHub repository description or README.

- [ ] Use `superpowers:verification-before-completion`. Record the exact commands and fresh results before claiming completion.

## Final Acceptance Checklist

- [ ] The production URL loads without authentication.
- [ ] The browser performs real OpenCascade geometry generation, local modification, meshing, and STEP export.
- [ ] A user can draw a circle around a hole rather than selecting only from a list.
- [ ] A typed plan can resize that hole while preserving three protected holes.
- [ ] The UI blocks Apply when locality or geometry validation fails.
- [ ] OpenAI and Exa calls are server-only and clearly report configured/unconfigured state.
- [ ] Offline mode remains functional and honestly labeled.
- [ ] The FreeCAD add-on and pure contract tests are present, with any unrun desktop smoke test disclosed.
- [ ] Tests, lint, typecheck, production build, Playwright, and Python tests pass from the final commit.
- [ ] No secret or secret-shaped burner credential exists in Git history or deployment logs.
- [ ] All commits are pushed to `frenzy2004/CAD`.
- [ ] Vercel reports the production deployment `READY`, and a fresh production smoke test passes.
