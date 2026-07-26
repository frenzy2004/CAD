"""PatchCAD GUI commands. FreeCAD and Qt are imported only on activation."""

from __future__ import annotations

import importlib
from pathlib import Path
import uuid

from .bridge import GuiBridgeRuntime
from .protocol import PatchRequest
from .selection import SelectionError, capture_selection
from .service import PatchService


_bridge_runtime: GuiBridgeRuntime | None = None
_service = PatchService()


def _app():
    return importlib.import_module("FreeCAD")


def _gui():
    return importlib.import_module("FreeCADGui")


def _qt_widgets():
    for module_name in ("PySide.QtWidgets", "PySide6.QtWidgets", "PySide2.QtWidgets"):
        try:
            return importlib.import_module(module_name)
        except ImportError:
            continue
    raise RuntimeError("FreeCAD Qt widgets are unavailable")


def _message(kind: str, text: str) -> None:
    console = _app().Console
    method = {
        "error": console.PrintError,
        "warning": console.PrintWarning,
    }.get(kind, console.PrintMessage)
    method(f"PatchCAD: {text}\n")


def _diameter_dialog(title: str, initial: float) -> float | None:
    widgets = _qt_widgets()
    value, accepted = widgets.QInputDialog.getDouble(
        None, title, "Diameter (mm)", initial, 0.001, 1_000_000.0, 3
    )
    return float(value) if accepted else None


class _CreatePatchCommand:
    operation = "add_hole"

    def GetResources(self):
        return {
            "MenuText": self.menu_text,
            "ToolTip": self.tooltip,
            "Pixmap": str(
                Path(__file__).resolve().parents[2] / "Resources" / "Icons" / "PatchCAD.svg"
            ),
        }

    def IsActive(self):
        return _app().ActiveDocument is not None

    def Activated(self):
        try:
            target = capture_selection(self.operation)
            initial = target.original_diameter_mm or 6.0
            diameter = _diameter_dialog(self.menu_text, initial)
            if diameter is None:
                return
            request = PatchRequest(
                request_id=str(uuid.uuid4()),
                document=target.document,
                object_name=target.object_name,
                subelement=target.subelement,
                operation=self.operation,
                diameter_mm=diameter,
                point=target.point if self.operation == "add_hole" else None,
                through_all=True,
            )
            result = _service.create_patch(request, target)
            _message("info", f"created {result['object_name']}")
            if result.get("audit_error"):
                _message("warning", result["audit_error"]["message"])
        except Exception as exc:
            _message("error", str(exc))


class AddHoleCommand(_CreatePatchCommand):
    operation = "add_hole"
    menu_text = "Add Hole Patch"
    tooltip = "Create a reversible through-hole patch on one planar face"


class ResizeHoleCommand(_CreatePatchCommand):
    operation = "resize_hole"
    menu_text = "Resize Hole Patch"
    tooltip = "Resize one validated full inward cylindrical hole wall"


class TogglePatchCommand:
    def GetResources(self):
        return {
            "MenuText": "Enable/Disable Patch",
            "ToolTip": "Toggle the selected reversible PatchCAD feature",
        }

    def IsActive(self):
        return _app().ActiveDocument is not None

    def Activated(self):
        selected = _gui().Selection.getSelection()
        if len(selected) != 1 or not hasattr(selected[0], "PatchId"):
            _message("error", "select exactly one PatchCAD patch")
            return
        patch = selected[0]
        try:
            result = _service.set_enabled(patch.PatchId, not bool(patch.Enabled))
            _message("info", f"{'enabled' if result['enabled'] else 'disabled'} {patch.Label}")
            if result.get("audit_error"):
                _message("warning", result["audit_error"]["message"])
        except Exception as exc:
            _message("error", str(exc))


class StartBridgeCommand:
    def GetResources(self):
        return {
            "MenuText": "Start Local Bridge",
            "ToolTip": "Start the authenticated PatchCAD bridge on 127.0.0.1",
        }

    def IsActive(self):
        return _bridge_runtime is None

    def Activated(self):
        global _bridge_runtime
        if _bridge_runtime is not None:
            return
        try:
            runtime = GuiBridgeRuntime(_service.dispatch)
            runtime.start()
            _bridge_runtime = runtime
            host, port = runtime.address
            _message(
                "info",
                f"bridge listening on http://{host}:{port}; in-memory bearer token: {runtime.token}",
            )
        except Exception as exc:
            _message("error", str(exc))


class StopBridgeCommand:
    def GetResources(self):
        return {
            "MenuText": "Stop Local Bridge",
            "ToolTip": "Stop the PatchCAD localhost bridge and discard its token",
        }

    def IsActive(self):
        return _bridge_runtime is not None

    def Activated(self):
        global _bridge_runtime
        if _bridge_runtime is None:
            return
        _bridge_runtime.close()
        _bridge_runtime = None
        _message("info", "bridge stopped; bearer token discarded")


def register_commands() -> None:
    gui = _gui()
    gui.addCommand("PatchCAD_AddHole", AddHoleCommand())
    gui.addCommand("PatchCAD_ResizeHole", ResizeHoleCommand())
    gui.addCommand("PatchCAD_TogglePatch", TogglePatchCommand())
    gui.addCommand("PatchCAD_StartBridge", StartBridgeCommand())
    gui.addCommand("PatchCAD_StopBridge", StopBridgeCommand())
