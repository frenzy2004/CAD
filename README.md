# PatchCAD

PatchCAD is a noncommercial mechanical-engineering prototype for making a
small, verified change to a CAD model without regenerating the rest of it.
Draw a **Magic Circle** around one editable feature, describe the local change,
inspect the exact preview and locality checks, then apply or undo it.

The web app is deliberately not a general chat-to-CAD generator. OpenAI may
produce one typed patch plan, but only the deterministic CAD contract and the
browser OpenCascade worker can execute it. Exa evidence is displayed for human
review and never mutates geometry.

## Browser workflow

1. Wait for the OpenCascade kernel to report `Kernel ready`.
2. Draw a circle around one hole in the included mounting bracket.
3. Enter a bounded instruction such as `make this hole 8 mm`.
4. Inspect the proposed diameter and the protected-feature verification.
5. Apply, reject, undo, or reset the sample.
6. Export the verified exact STEP result and its JSON audit record.

When `OPENAI_API_KEY` is not configured, the app falls back only for its small
documented grammar and labels the plan `Offline grammar`. It does not pretend
that an AI provider ran.

## Supported MVP operations

- Resize exactly one selected semantic hole in the included parametric bracket.
- Add a through-hole at a selected top-face point.
- Accept diameters from `1 mm` through `40 mm`.
- Enforce a `2 mm` minimum wall and preserve protected feature fingerprints to
  `0.0001 mm`.
- Use millimetres internally. The offline grammar also accepts explicit inch
  values and converts them to millimetres.
- Keep one level of undo and reject no-effect, ambiguous, unsupported, or
  out-of-selection edits.

The web workspace intentionally exposes the included bracket workflow in this
MVP. Arbitrary STEP files generally lack editable feature history; use the
FreeCAD add-on for local edits to an existing engineering model. The lower-level
browser worker accepts one bounded solid and can rebuild only holes created in
that browser session—it refuses generic pre-existing-hole resizing.

## Local development

Requirements:

- Node.js 22.x
- npm with the committed lockfile
- Python 3.11+ for the FreeCAD-independent bridge tests
- Chromium for Playwright end-to-end tests
- FreeCAD 1.1+ only for the optional desktop add-on and its installation-time
  geometry smoke test

Install and start:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The pre-development script
copies the pinned OpenCascade WebAssembly file from
`replicad-opencascadejs@0.23.0` to the ignored `public/cad-runtime/` directory.
It never downloads or compiles a different CAD kernel.

All provider settings are optional and server-only:

```text
OPENAI_API_KEY
OPENAI_MODEL
EXA_API_KEY
```

Keep credentials in `.env.local` or encrypted deployment settings. Never put a
key in browser code, a prompt, a URL, a tracked file, or a command-line
argument. `OPENAI_MODEL` defaults to `gpt-5.6`.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run test:freecad
npx playwright install chromium
npm run test:e2e
npm run build
```

The complete local gate is:

```bash
npm run verify
```

The standard Python suite is intentionally importable without FreeCAD. A
FreeCAD executable is required before claiming that real document transactions,
booleans, workbench registration, and GUI-thread dispatch have been smoke
tested.

## Architecture and trust boundary

```text
Magic Circle + prompt
        │
        ├── POST /api/plan ── OpenAI typed proposal (optional)
        ├── local grammar ─── deterministic fallback (optional)
        └── POST /api/research ── Exa citations (optional, evidence only)
        │
        ▼
local schema + target authorization
        │
        ▼
browser Web Worker + OpenCascade B-rep
        │
        ├── exact preview and protected-feature verification
        ├── STEP export
        └── audit JSON
```

- Provider credentials and SDK clients remain in server-only modules.
- The browser Web Worker owns the authoritative B-rep; Three.js renders only
  tessellated display geometry.
- The model cannot emit executable CAD code and cannot authorize its own target.
- The FreeCAD bridge binds only to `127.0.0.1`, requires an in-memory token,
  bounds request bodies, applies an exact-origin allowlist, and dispatches
  document work onto FreeCAD's GUI thread.
- A patch is a reversible feature; the source FreeCAD object is not overwritten.

## FreeCAD add-on

The add-on is under `freecad/PatchCAD` using the namespaced FreeCAD 1.1 layout.
See [freecad/README.md](freecad/README.md) for installation, bridge, supported
selection, audit, and runtime-verification instructions.

## Deployment

Import [frenzy2004/CAD](https://github.com/frenzy2004/CAD) into Vercel or run:

```bash
npx vercel@latest link --yes --project patchcad
npx vercel@latest deploy --yes
npx vercel@latest deploy --prod --yes
```

Use Vercel's dashboard or interactive secret input to add `OPENAI_API_KEY` and
`EXA_API_KEY` to Preview and Production. Add `OPENAI_MODEL=gpt-5.6` as a
non-secret. The full offline CAD workflow remains usable when the two provider
keys are absent; `/api/health` reports only configuration presence, never
values.

## Credits and status

PatchCAD credits FreeCAD, Open CASCADE Technology, replicad, and the Text2CAD
paper/repository. No Text2CAD code, model weights, dataset, or generated
sequences are shipped. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This is an educational, noncommercial prototype—not a substitute for qualified
engineering review, tolerance analysis, manufacturing validation, or safety
sign-off.
