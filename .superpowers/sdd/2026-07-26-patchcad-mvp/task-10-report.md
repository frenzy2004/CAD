# Task 10 report — verified CAD and audit exports

## Outcome

- Consumed the reviewed artifact boundary from integration commit `8717a5e`.
- Kept STEP and audit actions disabled until a patch is applied from a verified exact-worker preview.
- Requests `export-step` from the worker's current exact shape and refuses an empty or non-STEP reply.
- Downloads the fixed `patchcad-bracket.step` filename with `model/step`.
- Hashes the typed before/after snapshots, builds the strict audit envelope, and downloads `patchcad-audit.json` with `application/json`.
- Reports exact STEP/audit byte sizes as browser-local artifacts in the verification strip.

## TDD evidence

1. RED: `npm test -- tests/integration/workspace.test.tsx`
   - After the test harness was given explicit cleanup, the export workflow failed because clicking Download STEP produced no worker request, download, or byte status.
2. GREEN: `npm test -- tests/integration/workspace.test.tsx`
   - 2 workflow tests passed.
   - The export workflow proves both buttons are locked before verification, then exact STEP and typed audit downloads occur after Apply, MIME types are correct, byte status is visible, and both object URLs are revoked.
3. Focused artifact gate:
   - `npm test -- tests/unit/download.test.ts`: 12 tests passed.
   - `npm run typecheck`: passed.
   - `npm run lint`: passed with no warnings.

## Full verification

- `npm test`: 16 files, 114 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; `/` and all API route surfaces emitted successfully.

## Trust boundary

The browser receives provider plans and evidence, but only a validated deterministic plan enters exact geometry. STEP bytes come from the browser worker, and audit construction selects only typed fields; credentials and provider headers have no route into either artifact.
