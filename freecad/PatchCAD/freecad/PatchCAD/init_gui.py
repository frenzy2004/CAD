"""PatchCAD workbench registration for FreeCAD 1.1."""

from __future__ import annotations

import importlib
from pathlib import Path


COMMANDS = (
    "PatchCAD_AddHole",
    "PatchCAD_ResizeHole",
    "PatchCAD_TogglePatch",
    "PatchCAD_StartBridge",
    "PatchCAD_StopBridge",
)


class _PatchCADWorkbenchDefinition:
    MenuText = "PatchCAD"
    ToolTip = "Verified and reversible local CAD patches"
    Icon = str(Path(__file__).resolve().parents[2] / "Resources" / "Icons" / "PatchCAD.svg")

    def Initialize(self):
        from .Commands import register_commands

        register_commands()
        self.appendToolbar("PatchCAD", list(COMMANDS))
        self.appendMenu("PatchCAD", list(COMMANDS))

    def Activated(self):
        return None

    def Deactivated(self):
        return None

    def GetClassName(self):
        return "Gui::PythonWorkbench"


class PatchCADWorkbench:
    """Lazy constructor for the real FreeCADGui.Workbench subclass."""

    def __new__(cls):
        gui = importlib.import_module("FreeCADGui")
        workbench_class = type(
            "PatchCADWorkbench",
            (_PatchCADWorkbenchDefinition, gui.Workbench),
            {"__module__": __name__},
        )
        return workbench_class()


def register_workbench() -> None:
    importlib.import_module("FreeCADGui").addWorkbench(PatchCADWorkbench())


register_workbench()
