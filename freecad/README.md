# PatchCAD for FreeCAD

The PatchCAD add-on creates a separate, reversible `Part::FeaturePython` patch
for one local hole edit. It never overwrites the selected source object. The
add-on targets the namespaced FreeCAD 1.1 package layout and depends only on
FreeCAD's internal Part workbench.

## Installation

Install FreeCAD 1.1 or newer, then clone this repository. In FreeCAD's Python
console, run:

```python
FreeCAD.getUserAppDataDir()
```

Close FreeCAD. Under that user-data directory, create `Mod/PatchCAD` and copy
the contents of this repository's `freecad/PatchCAD` directory into it. During
development, a directory symlink to `freecad/PatchCAD` is also suitable.

The resulting layout begins:

```text
Mod/PatchCAD/
├── package.xml
├── pyproject.toml
├── Resources/
└── freecad/PatchCAD/
    ├── init.py
    └── init_gui.py
```

Restart FreeCAD and choose **PatchCAD** from the workbench selector. This
prototype is not yet registered in FreeCAD's public Addon Manager catalog.

## Local editing workflow

Save the `.FCStd` document before editing if you want the external audit file.

To add a through-hole:

1. Select exactly one planar face and a point on that trimmed face.
2. Run **Add Hole Patch**.
3. Enter a diameter in millimetres.

To resize a hole:

1. Select exactly one complete inward cylindrical hole wall.
2. Run **Resize Hole Patch**.
3. Enter the new diameter in millimetres.

Partial cylindrical faces, outward bosses, blind holes, invalid solids, and
multi-selection are rejected. Shrinking a recognized full hole fuses an exact
annulus and then recuts the requested inner cylinder; enlarging and adding use
an exact through-cylinder cut.

Select a PatchCAD feature and run **Enable/Disable Patch** to toggle it. A
disabled patch reproduces a copy of the source shape. Create, resize, and toggle
each use one FreeCAD transaction so document undo/redo can remain available;
verify undo/redo under the installed FreeCAD release before production use.

After a committed operation, PatchCAD atomically updates:

```text
<document>.FCStd.patchcad.audit.json
```

An audit-write problem is reported separately because filesystem writes are
outside FreeCAD's undo transaction. The CAD transaction remains committed.

## Authenticated localhost bridge

Run **Start Local Bridge** from the PatchCAD workbench. FreeCAD displays the
exact loopback URL and a random in-memory bearer token in a one-time dialog.
Use the explicit **Copy bearer token** button if a local client needs it; the
token is never written to the FreeCAD console. Treat it as temporary secret
material. **Stop Local Bridge** stops the server and discards it.

The server:

- binds only to `127.0.0.1`;
- requires `Authorization: Bearer <token>` on every operation;
- accepts exact configured browser origins only;
- supports Private Network Access preflight for those origins;
- rejects wildcard origins, cookies, oversized or chunked bodies, unknown JSON
  keys, non-millimetre units, and unsupported operations;
- queues all selection and document work onto FreeCAD's GUI thread.

Endpoints:

```text
GET   /health
GET   /selection
POST  /patches
PATCH /patches/<patch-id>/diameter
PATCH /patches/<patch-id>/enabled
```

Example create request body:

```json
{
  "request_id": "request-001",
  "document": "Bracket",
  "object_name": "Body",
  "subelement": "Face3",
  "operation": "add_hole",
  "diameter_mm": 6,
  "point": [12, 20, 8],
  "through_all": true,
  "units": "mm"
}
```

Repeated `request_id` values are idempotent. Reusing an in-process request ID
with different JSON is rejected.

The default browser-origin allowlist is:

```text
http://localhost:3000
http://127.0.0.1:3000
https://patchcad.vercel.app
```

Change the configured tuple in a reviewed local build if the production origin
differs. Do not replace it with a wildcard.

## Verification

The transport, protocol, and audit suite runs without importing FreeCAD:

```bash
PYTHONPATH="$PWD/freecad/PatchCAD" python3 -m unittest \
  freecad.PatchCAD.tests.test_protocol \
  freecad.PatchCAD.tests.test_audit \
  freecad.PatchCAD.tests.test_bridge
```

The bridge tests bind an ephemeral `127.0.0.1` socket. A restricted test runner
must permit loopback binds.

### Native document smoke

The headless smoke creates a real Part box and exercises PatchCAD's create,
diameter-update, enable/disable, and undo/redo paths against FreeCAD's document
and OCCT geometry. It proves each PatchCAD action owns exactly one undo step,
including object creation and both toggle directions. It explicitly enables
document undo for FreeCADCmd, which otherwise starts with undo disabled. It
must run under `FreeCADCmd` (not the system Python):

```bash
FREECAD_CMD=FreeCADCmd npm run test:freecad:native
```

On macOS's app bundle, point the command at the bundled console executable and
provide its resource root:

```bash
FREECAD_ROOT="/Applications/FreeCAD.app/Contents/Resources"
PREFIX="$FREECAD_ROOT" \
PYTHONHOME="$FREECAD_ROOT" \
PYTHONPATH="$FREECAD_ROOT" \
LD_LIBRARY_PATH="$FREECAD_ROOT/lib" \
FREECAD_CMD="$FREECAD_ROOT/bin/freecadcmd" \
npm run test:freecad:native
```

The command requires one `NATIVE_SMOKE_OK` marker, reports its exact FreeCAD
version, and fails if FreeCAD reports an exception even when that executable
returns a zero status. The marker is emitted only after the temporary document
has closed. It intentionally does not run in the default `npm run verify`
command, because CI and browser deployments do not bundle FreeCAD.

Before distributing the add-on, run these installation-dependent checks under
the exact FreeCAD release you support:

- workbench discovery and all five command registrations;
- planar picked-point and complete inward-cylinder selection;
- add, enlarge, and shrink booleans on representative one-solid documents;
- disabled-patch equality with the source;
- transaction undo/redo and abort/recompute;
- saved and unsaved document audit behavior;
- browser preflight and real Qt-timer dispatch.

The native smoke was run against FreeCAD 1.1.3 on macOS for creation, diameter
updates, enable/disable geometry, and undo/redo. Workbench discovery, selection
UI, bridge dispatch, and audit behavior still need the installed GUI smoke.
