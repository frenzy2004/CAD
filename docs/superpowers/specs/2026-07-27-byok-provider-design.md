# Bring-Your-Own-Key Provider Design

## Goal

Make PatchCAD safe to publish without funding arbitrary provider usage: each
browser user may supply their own OpenAI and/or Exa API key, and PatchCAD never
ships, persists, logs, or falls back to an owner-controlled provider key.

## Decision

Use an ephemeral server-proxy BYOK design. A user enters an optional OpenAI key
for plan generation and an optional Exa key for research. The browser keeps
each value only in `sessionStorage` for the current browser session. On a
matching request it sends the key in a dedicated request header. The route
reads that header before reading the body, constructs the provider client for
that request only, and discards the reference when the request completes.

This is deliberately not a shared access code. A shared code would still make
the project owner pay and would be easy to redistribute. Direct browser calls
are also out of scope because provider SDK calls would expose a less controlled
network boundary and cannot use the existing server-side validation pipeline.

## Trust boundary

```text
browser sessionStorage
  OpenAI key ── x-patchcad-openai-key ── POST /api/plan ── OpenAI
  Exa key    ── x-patchcad-exa-key    ── POST /api/research ── Exa

No owner API key env vars → no billing fallback → no persistent key database
```

The hosting server necessarily receives a key transiently while proxying the
request. It must not write it to logs, error messages, telemetry, responses,
or durable storage. The UI must say this plainly and recommend self-hosting to
users who require maximum key isolation.

## Server behavior

- Define public constants for two header names and the `PROVIDER_KEY_REQUIRED`
  public error code. Constants contain no secret values and can be imported by
  browser code.
- Add a server-only reader that trims a header, rejects a missing, blank, or
  overlong value, and returns no provider value in the response.
- Both `/api/plan` and `/api/research` must reject a missing provider header
  with HTTP 401 and `{ error: { code: "PROVIDER_KEY_REQUIRED" } }` before
  consuming the request body or constructing/calling a provider client.
- Each route factory receives a `createService(apiKey)` function. It invokes
  that factory only after header validation, so the client configuration exists
  only for the request. The concrete app routes use the supplied key and the
  non-secret `OPENAI_MODEL` setting.
- Remove the shared-access-code gate and `PATCHCAD_PROVIDER_ACCESS_CODE`.
  Remove use of `OPENAI_API_KEY` and `EXA_API_KEY` from runtime route and
  health behavior. The application must not silently use either environment
  variable.
- Keep current bounded JSON parsing, deterministic CAD validation, controlled
  rationale, and generic provider-failure envelopes unchanged.
- Health reports that both providers use BYOK rather than reporting whether
  owner credentials are configured.

## Browser behavior

- Replace the shared-code field with a compact “Your API keys (session only)”
  section containing independent password inputs for OpenAI and Exa.
- `autoComplete="off"`; input values are never included in audit exports,
  worker messages, URLs, prompts, browser local storage, or UI error text.
- Store nonblank values under distinct `sessionStorage` keys; clear the
  matching storage entry when a user clears an input. Do not write either key
  to `localStorage`.
- A plan request attaches only the nonblank OpenAI header. A research request
  attaches only the nonblank Exa header.
- With no OpenAI key, plan preview continues through the existing local
  grammar fallback. With no Exa key, research is marked unavailable without
  affecting geometry. A rejected or expired supplied key remains a generic
  provider failure; its text is never surfaced.

## Documentation and deployment

- `.env.example` contains only `OPENAI_MODEL`, with a BYOK comment. It must
  not invite users to add provider keys or a shared access code.
- README describes session-only key handling, transient proxying, the
  self-hosting privacy caveat, and that deployment needs no provider secrets.
- Existing owner keys must not be committed, displayed, copied into Vercel,
  or used in tests. Test fixtures use clearly synthetic values only.

## Verification

- Unit tests prove the server header reader accepts a trimmed, bounded key and
  rejects missing, blank, and overlong values without echoing the value.
- Plan and research route tests prove a missing key returns 401 before a body
  stream is read or a provider factory/adapter is called; supplied keys reach
  only the injected service factory.
- Browser integration tests prove each key stays session-only, is attached
  only to its matching endpoint, is omitted from the other endpoint and worker
  payloads, can be cleared, and preserves local planning fallback/research
  unavailable handling.
- Run the focused suites, typecheck, lint, the full unit/integration suite,
  and build before deployment review. A fresh security scan follows the final
  implementation because provider credential flow is security-sensitive.

## Non-goals

- User accounts, key database storage, team key sharing, usage billing,
  provider key validation before use, and exposing API keys to FreeCAD or the
  CAD worker are not part of this change.
