"""FreeCADCmd smoke test for PatchCAD's real document and OCCT path."""

import math

import FreeCAD as App
import Part

from freecad.PatchCAD.protocol import PatchRequest
from freecad.PatchCAD.selection import SelectionTarget
from freecad.PatchCAD.service import PatchService


def _require(condition, message):
    if not condition:
        raise AssertionError(message)


def _quantity(value):
    return float(getattr(value, "Value", value))


def _require_one_valid_solid(shape):
    _require(not shape.isNull(), "patch shape is null")
    _require(shape.isValid(), "patch shape is invalid")
    _require(len(shape.Solids) == 1, "patch shape is not one solid")


def _require_volume(shape, expected, message):
    _require(
        math.isclose(shape.Volume, expected, rel_tol=0.0, abs_tol=1e-7),
        message,
    )


def _undo_and_recompute(document):
    document.undo()
    document.recompute()


def _redo_and_recompute(document):
    document.redo()
    document.recompute()


def main():
    document = App.newDocument("PatchCADNativeSmoke")
    version = ".".join(str(value) for value in App.Version()[:3])
    try:
        source = document.addObject("Part::Feature", "Source")
        source.Shape = Part.makeBox(40, 40, 10)
        document.recompute()
        source_volume = source.Shape.Volume
        document.UndoMode = 1
        document.clearUndos()
        _require(document.UndoMode != 0, "FreeCAD undo was not enabled")
        _require(document.UndoCount == 0, "source setup was retained in undo history")
        _require(document.RedoCount == 0, "source setup retained a redo history")
        target = SelectionTarget(
            document=document.Name,
            object_name=source.Name,
            subelement="Face6",
            point=(20.0, 20.0, 10.0),
            operation="add_hole",
            axis=(0.0, 0.0, 1.0),
            cutter_min=-20.0,
            cutter_max=20.0,
            fill_min=-20.0,
            fill_max=20.0,
            original_diameter_mm=0.0,
            source=source,
        )
        request = PatchRequest(
            request_id="native-smoke-1",
            document=document.Name,
            object_name=source.Name,
            subelement="Face6",
            operation="add_hole",
            diameter_mm=10.0,
            point=(20.0, 20.0, 10.0),
        )

        patch_service = PatchService()
        created = patch_service.create_patch(request, target)
        patch = document.getObject(created["object_name"])
        _require(patch is not None, "create_patch did not persist a patch object")
        _require_one_valid_solid(patch.Shape)
        first_volume = patch.Shape.Volume
        _require(first_volume < source_volume, "create_patch did not cut material")
        patch_name = patch.Name
        _require(document.UndoCount == 1, "create_patch did not create one undo step")
        _require(document.RedoCount == 0, "create_patch left redo history")

        _undo_and_recompute(document)
        _require(document.UndoCount == 0, "undo did not remove the create step")
        _require(document.RedoCount == 1, "undo did not record the create step")
        _require(
            document.getObject(patch_name) is None,
            "undo create did not remove the patch object",
        )
        _require_volume(source.Shape, source_volume, "undo create changed the source")

        _redo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "redo create did not restore the patch object")
        _require(document.UndoCount == 1, "redo did not restore the create step")
        _require(document.RedoCount == 0, "redo left create history pending")
        _require_one_valid_solid(patch.Shape)
        _require_volume(patch.Shape, first_volume, "redo create did not restore shape")

        updated = patch_service.update_diameter(patch.PatchId, 20.0)
        _require(_quantity(patch.Diameter) == 20.0, "update did not set diameter")
        _require(updated["diameter_mm"] == 20.0, "update response is stale")
        _require_one_valid_solid(patch.Shape)
        updated_volume = patch.Shape.Volume
        _require(updated_volume < first_volume, "update did not enlarge the cut")
        _require(document.UndoCount == 2, "update did not create one undo step")
        _require(document.RedoCount == 0, "update left redo history")

        _undo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "undo removed the patch")
        _require(document.UndoCount == 1, "undo did not remove the update step")
        _require(document.RedoCount == 1, "undo did not record the update step")
        _require(_quantity(patch.Diameter) == 10.0, "undo did not restore diameter")
        _require_one_valid_solid(patch.Shape)
        _require_volume(patch.Shape, first_volume, "undo did not restore shape")

        _redo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "redo removed the patch")
        _require(document.UndoCount == 2, "redo did not restore the update step")
        _require(document.RedoCount == 0, "redo left update history pending")
        _require(_quantity(patch.Diameter) == 20.0, "redo did not restore diameter")
        _require_one_valid_solid(patch.Shape)
        _require_volume(patch.Shape, updated_volume, "redo did not restore shape")

        patch_service.set_enabled(patch.PatchId, False)
        _require(not patch.Enabled, "toggle did not disable patch")
        _require_one_valid_solid(patch.Shape)
        _require_volume(
            patch.Shape, source_volume, "disabled patch did not restore the source shape"
        )
        _require(document.UndoCount == 3, "disable did not create one undo step")
        _require(document.RedoCount == 0, "disable left redo history")

        _undo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "undo disable removed the patch")
        _require(document.UndoCount == 2, "undo did not remove the disable step")
        _require(document.RedoCount == 1, "undo did not record the disable step")
        _require(patch.Enabled, "undo disable did not re-enable the patch")
        _require_one_valid_solid(patch.Shape)
        _require_volume(
            patch.Shape, updated_volume, "undo disable did not restore the modified shape"
        )

        _redo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "redo disable removed the patch")
        _require(document.UndoCount == 3, "redo did not restore the disable step")
        _require(document.RedoCount == 0, "redo left disable history pending")
        _require(not patch.Enabled, "redo disable did not disable the patch")
        _require_one_valid_solid(patch.Shape)
        _require_volume(
            patch.Shape, source_volume, "redo disable did not restore the source shape"
        )

        patch_service.set_enabled(patch.PatchId, True)
        _require(patch.Enabled, "toggle did not re-enable patch")
        _require_one_valid_solid(patch.Shape)
        _require_volume(
            patch.Shape, updated_volume, "re-enabled patch did not restore the modified shape"
        )
        _require(document.UndoCount == 4, "enable did not create one undo step")
        _require(document.RedoCount == 0, "enable left redo history")

        _undo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "undo enable removed the patch")
        _require(document.UndoCount == 3, "undo did not remove the enable step")
        _require(document.RedoCount == 1, "undo did not record the enable step")
        _require(not patch.Enabled, "undo enable did not disable the patch")
        _require_one_valid_solid(patch.Shape)
        _require_volume(
            patch.Shape, source_volume, "undo enable did not restore the source shape"
        )

        _redo_and_recompute(document)
        patch = document.getObject(patch_name)
        _require(patch is not None, "redo enable removed the patch")
        _require(document.UndoCount == 4, "redo did not restore the enable step")
        _require(document.RedoCount == 0, "redo left enable history pending")
        _require(patch.Enabled, "redo enable did not enable the patch")
        _require_one_valid_solid(patch.Shape)
        _require_volume(
            patch.Shape, updated_volume, "redo enable did not restore the modified shape"
        )
        _require_volume(source.Shape, source_volume, "mutations changed the source")
    finally:
        App.closeDocument(document.Name)
    print("FREECAD_VERSION=" + version)
    print("NATIVE_SMOKE_OK")


main()
