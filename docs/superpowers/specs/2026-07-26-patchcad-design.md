# PatchCAD Design Specification

Date: 2026-07-26

Status: Proposed for user review

Project type: Non-commercial research prototype

## 1. Product Summary

PatchCAD is a FreeCAD workbench for verified, local AI-assisted edits to mechanical CAD models.

The defining interaction is:

> Circle or select a problem region, describe the intended change, preview verified alternatives, and preserve everything outside the approved edit envelope.

PatchCAD is not a general text-to-CAD generator. Its purpose is to make narrow, rapid-prototyping changes without silently disturbing unrelated geometry.

The first product wedge is component-swap mounting patches for engineering students, Formula Student and robotics teams, makers, and small prototype shops. Typical later jobs include changing a motor hole pattern, adding a sensor mount, creating a clearance pocket, or reinforcing a local bracket region.

## 2. Goals

### 2.1 Prototype goals

The first proof must:

1. Run as a FreeCAD workbench or add-on.
2. Operate on one watertight solid from an FCStd or STEP file.
3. Let the user select a complete recognized feature.
4. Support adding a round hole to a planar face.
5. Support resizing a straight round through-hole or flat-bottom blind hole while preserving its axis and depth.
6. Convert a natural-language request into a typed, reviewable patch plan.
7. Apply geometry changes only through deterministic FreeCAD/OpenCASCADE operations.
8. Reject a result unless its material change is confined to an approved edit envelope.
9. Present a before/after geometry diff and invariant report before acceptance.
10. Make every accepted patch reversible through a FreeCAD transaction and an explicit Patch feature.

### 2.2 Product goals after the proof

The first usable product should support FDM prototype brackets and enclosure panels, including:

- Hole-pattern replacement and relocation
- Slots and clearance pockets
- Simple bosses and ribs
- Heat-set insert seats
- Hardware and tool-access clearances
- Component-swap patches grounded in authoritative vendor drawings
- Several verified alternatives optimized for print time, material, or stiffness proxy

### 2.3 Success criteria

The geometry proof is successful when:

- All supported operations pass on a committed corpus of at least 30 representative prismatic solids.
- No accepted test case has material change outside its approved edit envelope beyond the configured geometric tolerance.
- Every accepted output is a closed, valid solid.
- Protected axes, entry planes, depths, and selected faces remain geometrically equivalent within tolerance.
- Unsupported or ambiguous cases fail closed without modifying the document.
- A successful simple patch can be planned, previewed, validated, and accepted in under 60 seconds on the development machine, excluding external API outages.
- No secret, credential, full CAD payload, or unredacted environment file enters Git history.

The later product's north-star metric is the percentage of component-swap jobs that produce an accepted, print-ready patch in under 10 minutes with a successful first physical fit.

## 3. Non-Goals

The prototype will not provide:

- Whole-part or text-to-assembly generation
- Arbitrary edits to organic or free-form surfaces
- Mesh or STL healing
- Simultaneous redesign of several parts
- Mechanism, cable-routing, or motion optimization
- Production drawings, GD&T authoring, CAM, procurement, or production costing
- Full FEA, fatigue, impact, thermal, or CFD claims
- Safety certification or autonomous engineering approval
- Automatic execution without user confirmation
- Portable reconstruction of native feature history from generic STEP files
- Support for every CAD application or manufacturing process

## 4. User Experience

### 4.1 Core workflow

1. The user opens an FCStd document or imports one STEP solid.
2. The user activates **Magic Circle**.
3. The user draws a lasso in the 3D viewport or uses native face selection during the earliest proof.
4. PatchCAD maps the screen selection to B-rep faces and expands it to a recognized feature.
5. PatchCAD highlights:
   - The proposed editable volume
   - Protected boundary faces
   - Preserved axes, planes, and depths
6. The user enters an instruction, such as:
   - “Change this hole to 8 mm and keep its axis and depth.”
   - “Add a 5 mm through-hole at the selected point.”
7. The AI sidecar returns a typed patch plan.
8. PatchCAD displays the interpreted operation, units, assumptions, editable envelope, and preserved invariants.
9. The user confirms the interpretation.
10. FreeCAD executes the proposed patch in an isolated transaction.
11. The verifier rejects invalid or out-of-envelope results.
12. PatchCAD shows a colored before/after diff:
    - Green: added material
    - Red: removed material
    - Blue: protected geometry
13. The user accepts the patch or discards it.
14. On acceptance, PatchCAD commits the transaction, adds a named Patch feature, and saves an audit sidecar.

### 4.2 Component-swap workflow

After the geometry proof, the user may provide a component model, vendor part number, or authoritative URL. Exa retrieves likely official drawings and datasheets. OpenAI extracts mounting dimensions into a structured candidate record. PatchCAD requires the user to confirm the source and critical dimensions before geometry generation.

The system then proposes several local interface patches while preserving the original part outside the approved envelope.

## 5. System Architecture

```text
FreeCAD Workbench
  ├── Viewport selection and Magic Circle overlay
  ├── Topology/feature recognizer
  ├── Edit-contract builder
  ├── Deterministic patch executor
  ├── Geometry and manufacturability validator
  ├── Diff preview and Patch feature
  └── Audit report exporter
          │
          │ loopback JSON with minimal geometry metadata
          ▼
Local AI Sidecar
  ├── OpenAI typed patch planner
  ├── Exa source retriever
  ├── Source and prompt-injection filtering
  └── Optional Text2CAD research adapter
```

### 5.1 FreeCAD workbench

The FreeCAD workbench owns all user interaction and CAD mutation. It uses:

- `FreeCADGui` and Coin3D for viewport selection, picking, overlays, and highlighting
- `FreeCADGui.Selection.getSelectionEx()` for selected subobjects and picked points
- `Part` and `TopoShape` for B-rep inspection, primitives, booleans, and validity checks
- Part Design or scripted feature objects for reversible Patch features
- Document transactions for preview, commit, abort, undo, and rollback
- STEP and FCStd import/export through FreeCAD

The workbench never executes model-generated Python or unrestricted CAD code.

### 5.2 Local AI sidecar

The sidecar isolates API clients and modern Python dependencies from FreeCAD's embedded Python environment. It listens only on loopback and accepts a small structured request containing:

- A viewport crop when visual context is necessary
- Selected face and feature metadata
- Units and model tolerance
- The user's instruction
- Explicitly protected invariants
- Optional component identifiers

It does not receive the complete CAD file by default.

OpenAI converts the request into a strict patch-plan schema. Exa is used only when authoritative external component or manufacturing information is necessary.

### 5.3 Shared schemas

The initial patch plan is conceptually:

```json
{
  "schema_version": "1",
  "operation": "resize_hole",
  "target": {
    "semantic_type": "straight_round_hole",
    "fingerprint": "geometry-derived-reference"
  },
  "parameters": {
    "diameter_mm": 8.0
  },
  "preserve": [
    "axis",
    "entry_plane",
    "depth"
  ],
  "assumptions": [],
  "sources": []
}
```

Allowed operations are enumerated. Unknown operations, missing units, contradictory constraints, and parameters outside configured bounds are rejected before execution.

### 5.4 Text2CAD adapter

Text2CAD is a research reference and optional experimental adapter, not a dependency of the core patch executor.

Potential uses include:

- Comparing sequential CAD representations
- Exploring natural-language-to-feature-sequence planning
- Creating non-commercial benchmark examples
- Testing whether a generated subsequence can inform a bounded Patch feature

Text2CAD output must still pass through the same typed-operation whitelist and deterministic verifier. It may never directly mutate the FreeCAD document.

## 6. Edit Contract and Locality Guarantee

PatchCAD defines:

- `E`: the approved editable 3D envelope, including a small numerical guard band
- `P`: protected faces, datums, axes, mate surfaces, and all geometry outside `E`
- `Δ`: the material symmetric difference between the original and candidate solids

A patch is accepted only when:

1. `Δ` is contained in `E` within model tolerance.
2. Protected underlying surfaces and trimmed boundaries remain geometrically equivalent within tolerance.
3. The result is one closed, oriented, manifold solid.
4. The requested invariants remain fixed.
5. Configured minimum-wall, hole-to-edge, collision, and manufacturing rules pass.
6. The diff and assumptions are shown before commit.

The guarantee concerns geometric equivalence, not stable face numbers, STEP entity ordering, or unchanged internal B-rep object identity.

Long-lived references use semantic queries and geometric fingerprints, not labels such as `Face17`, because topology identifiers may split, merge, or reorder after regeneration.

## 7. Geometry Execution

### 7.1 Feature recognition

The proof recognizes analytic planes, cylinders, and their adjacency:

- A planar target face for adding a hole
- A complete cylindrical face and boundary loops for identifying a hole
- Axis, radius, entry plane, exit plane, and depth

Partial-face selections and ambiguous intersecting features are rejected.

### 7.2 Supported proof operations

#### Add hole

1. Resolve a picked point or constrained point on a planar face.
2. Construct a cylinder using the requested diameter and direction.
3. Cut it from the base solid.
4. Validate the result and locality contract.

#### Resize hole

1. Recognize the existing cylindrical hole and its invariant axis and depth.
2. Restore material inside the old hole using a bounded plug operation.
3. Cut the requested replacement cylinder.
4. Validate the result and locality contract.

The executor runs in a document transaction. Any kernel exception, timeout, invalid topology, or failed invariant aborts the transaction.

## 8. Retrieval and AI Responsibilities

### 8.1 OpenAI

OpenAI may:

- Interpret the user request
- Resolve intent against selected geometry metadata
- Produce a typed patch plan
- Extract structured dimensions from an authoritative source
- Explain assumptions and rejected constraints

OpenAI may not:

- Execute Python
- Produce unrestricted geometry code for execution
- Override the validator
- Approve a safety-critical design
- Silently infer missing critical dimensions

### 8.2 Exa

Exa may retrieve:

- Official vendor drawings and datasheets
- Mounting patterns and dimensional tables
- Manufacturer guidance for prototype materials or inserts
- Relevant cited technical references

Search results are untrusted input. Domain preference, source type, publication date, URL, and extracted evidence are retained. Critical dimensions require user confirmation before execution.

## 9. Security, Privacy, and Secrets

- API credentials are read only from `OPENAI_API_KEY` and `EXA_API_KEY`.
- `.env` files, credentials, tokens, and local settings are ignored by Git.
- The repository includes only a `.env.example` containing placeholders.
- Keys are never included in prompts, reports, exceptions, telemetry, fixtures, screenshots, or command output.
- Logs redact authorization headers and common secret formats.
- The FreeCAD model stays local unless the user explicitly enables a future upload feature.
- Only the minimum viewport crop and structured metadata needed for planning are sent externally.
- Retrieved web text is treated as untrusted data and cannot add tools, change system instructions, or broaden the allowed operation set.
- The local sidecar binds to loopback and uses an unpredictable per-session token between the workbench and service.
- Generated plans are schema-validated before reaching the executor.

## 10. Licensing and Attribution

This prototype is explicitly non-commercial.

### 10.1 FreeCAD

FreeCAD's repository is licensed under LGPL-2.1. The prototype should use FreeCAD through its documented add-on and Python interfaces rather than modifying FreeCAD core. Required notices and source/license obligations must be preserved for redistributed components.

### 10.2 Text2CAD

The Text2CAD repository states CC BY-NC-SA 4.0. Any use or adaptation must:

- Attribute the project and authors
- Link the applicable license
- Identify modifications
- Remain non-commercial
- Apply ShareAlike terms to adaptations

DeepCAD data, Hugging Face datasets, checkpoints, and transitive dependencies may have separate licenses. Each artifact must be recorded and checked before download, redistribution, or inclusion in a release.

The prototype keeps Text2CAD behind an adapter to make its use, attribution, replacement, and licensing boundaries explicit.

### 10.3 Future commercialization

Commercial work is out of scope. A future commercial project would require a fresh dependency and data-license review, replacement of non-commercial components or separately negotiated permission, and a clean-room assessment of training data and derived artifacts.

## 11. Error Handling

PatchCAD fails closed:

- **No API key:** geometry tools remain available; AI planning and retrieval display a setup error.
- **API timeout or outage:** no CAD transaction begins.
- **Ambiguous instruction:** display the parsed alternatives and require a new explicit instruction.
- **Unsupported topology:** explain the unsupported condition without approximating an edit.
- **Missing units:** require units or an explicit document-unit confirmation.
- **Untrusted or conflicting source:** require user selection of the authoritative source.
- **Kernel failure:** abort the transaction and preserve the original document.
- **Validator failure:** discard the candidate and show the failed invariant.
- **Sidecar crash:** preserve the FreeCAD document and allow a clean restart.

## 12. Testing Strategy

### 12.1 Unit tests

- Patch-plan schema validation
- Unit parsing and conversion
- Semantic feature fingerprints
- Edit-envelope construction
- Source normalization and trust metadata
- Secret redaction
- Prompt-injection isolation

### 12.2 Geometry tests

- Add and resize holes across varying orientations and dimensions
- Through-holes and flat-bottom blind holes
- Boundary-adjacent holes
- Minimum-wall and hole-to-edge failures
- Invalid, intersecting, blended, and ambiguous features
- STEP models with tolerances and sliver faces
- Geometric equivalence outside the envelope
- Closed-solid and topology validity checks

The corpus contains at least 30 committed synthetic or permissively licensed models. Every model records its expected operation, invariants, and rejection or acceptance result.

### 12.3 Property and regression tests

- Random supported hole diameters and depths within bounded ranges
- Repeating the same patch produces geometrically equivalent output
- Rejected patches leave the source document unchanged
- Undo restores the exact pre-patch document state
- Previously fixed kernel edge cases remain in the regression corpus

### 12.4 Integration tests

- FreeCAD workbench to sidecar request/response
- Mocked OpenAI structured output
- Mocked Exa result extraction
- Transaction preview, acceptance, and rollback
- FCStd and STEP export/reopen validation

Live API tests are opt-in, rate-limited, never run in default CI, and use environment-provided credentials.

### 12.5 Physical validation

The later component-swap milestone includes a small set of printed fixtures and brackets. Each test records target hardware, source drawing, requested clearance, printed material, printer settings, measured fit, and any manual correction.

## 13. Delivery Stages

### Stage 0: Repository and test harness

- FreeCAD add-on skeleton
- Local sidecar skeleton
- Shared schemas
- Secret-safe configuration
- CI and geometry-test harness

### Stage 1: Deterministic hole patch

- Native face selection
- Hole recognition
- Add-hole and resize-hole operations
- Transactional execution
- Geometry diff and locality validator
- Audit sidecar

### Stage 2: Magic Circle

- Viewport lasso overlay
- Screen-polygon to visible B-rep face mapping
- Recognized-feature expansion
- Editable-envelope and protected-boundary preview

### Stage 3: AI planning

- OpenAI structured patch planning
- Interpretation confirmation UI
- Failure explanations and schema enforcement

### Stage 4: Component grounding

- Exa source retrieval
- Vendor-drawing extraction
- Source confirmation
- Hardware-interface records

### Stage 5: Component-swap patches

- Hole patterns and slots
- Simple bosses, insert seats, ribs, and pockets
- Candidate comparison
- FDM manufacturability checks
- Physical first-fit validation

## 14. Design Decisions

1. **FreeCAD host rather than a new CAD application:** this provides a mature viewport, feature tree, transactions, STEP support, and OpenCASCADE geometry.
2. **Local sidecar rather than loading every AI dependency into FreeCAD:** this avoids Python-version conflicts and creates a clean security boundary.
3. **Typed patch plans rather than executable AI code:** this makes the operation set inspectable, testable, and fail-closed.
4. **Geometric locality rather than topology identity:** B-rep face identity is not stable across regeneration.
5. **Native selection before Magic Circle:** this validates the geometry and safety loop before investing in custom viewport interaction.
6. **Hole edits before arbitrary patches:** these have explicit invariants and objective verification.
7. **Text2CAD as optional research input:** its whole-history generation and non-commercial ShareAlike license make it unsuitable as the core executor.
8. **Human confirmation before mutation:** AI interpretation and retrieved dimensions remain fallible.

## 15. References

- FreeCAD repository: https://github.com/FreeCAD/FreeCAD
- FreeCAD API overview: https://wiki.freecad.org/FreeCAD_API
- FreeCAD API category: https://wiki.freecad.org/Category:API
- FreeCAD Part scripting: https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Part_scripting.md
- Text2CAD repository: https://github.com/SadilKhan/Text2CAD
- Text2CAD license: https://github.com/SadilKhan/Text2CAD/blob/main/LICENSE
- Text2CAD paper: https://arxiv.org/abs/2409.17106
- Exa Search API: https://exa.ai/docs/reference/search-api-guide-for-coding-agents
- OpenAI Responses API guidance: https://developers.openai.com/api/docs/guides/latest-model
- Zoo Zoodle: https://zoo.dev/docs/zoo-design-studio/features/ml-ai/zoodle
- Autodesk Assistant in Fusion: https://www.autodesk.com/products/fusion-360/blog/autodesk-assistant-in-fusion-a-step-by-step-guide/
