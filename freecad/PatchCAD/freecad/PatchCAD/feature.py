"""Reversible Part::FeaturePython implementation for PatchCAD operations."""

from __future__ import annotations

import importlib

from .selection import SelectionTarget


SCHEMA_VERSION = 1


class InvalidPatchShape(RuntimeError):
    pass


def _modules():
    return importlib.import_module("FreeCAD"), importlib.import_module("Part")


def _quantity(value: object) -> float:
    return float(getattr(value, "Value", value))


def valid_one_solid(shape: object) -> bool:
    if shape is None or shape.isNull():  # type: ignore[attr-defined]
        return False
    return bool(shape.isValid() and len(shape.Solids) == 1)  # type: ignore[attr-defined]


def _cylinder(obj: object, radius: float, *, bounds: str = "cutter"):
    app, part = _modules()
    axis = app.Vector(obj.Axis.x, obj.Axis.y, obj.Axis.z)  # type: ignore[attr-defined]
    point = app.Vector(obj.Point.x, obj.Point.y, obj.Point.z)  # type: ignore[attr-defined]
    if bounds == "fill":
        lower = _quantity(obj.FillMin)  # type: ignore[attr-defined]
        upper = _quantity(obj.FillMax)  # type: ignore[attr-defined]
    else:
        lower = _quantity(obj.CutterMin)  # type: ignore[attr-defined]
        upper = _quantity(obj.CutterMax)  # type: ignore[attr-defined]
    start = point + axis * lower
    height = upper - lower
    return part.makeCylinder(radius, height, start, axis)


def build_patch_shape(obj: object):
    source_shape = obj.Source.Shape  # type: ignore[attr-defined]
    if not bool(obj.Enabled):  # type: ignore[attr-defined]
        result = source_shape.copy()
    else:
        requested_radius = _quantity(obj.Diameter) / 2.0  # type: ignore[attr-defined]
        original_radius = _quantity(obj.OriginalDiameter) / 2.0  # type: ignore[attr-defined]
        if obj.Operation == "resize_hole" and requested_radius < original_radius:  # type: ignore[attr-defined]
            outer = _cylinder(obj, original_radius, bounds="fill")
            inner = _cylinder(obj, requested_radius)
            annulus = outer.cut(inner)
            result = source_shape.fuse(annulus).cut(inner)
        else:
            result = source_shape.cut(_cylinder(obj, requested_radius))
    if not valid_one_solid(result):
        raise InvalidPatchShape("PatchCAD operation did not produce one valid solid")
    return result


class PatchFeature:
    def __init__(self, obj: object) -> None:
        self.execution_serial = 0
        obj.Proxy = self  # type: ignore[attr-defined]

    def execute(self, obj: object) -> None:
        shape = build_patch_shape(obj)
        obj.Shape = shape  # type: ignore[attr-defined]
        self.execution_serial += 1

    def dumps(self):
        return {"schema_version": SCHEMA_VERSION}

    def loads(self, state):
        self.execution_serial = 0
        return None


def attach_patch_feature(
    obj: object,
    target: SelectionTarget,
    *,
    diameter_mm: float,
    patch_id: str,
    request_id: str,
    request_fingerprint: str,
    audit_id: str,
) -> None:
    app, _ = _modules()
    group = "PatchCAD"
    obj.addProperty("App::PropertyLink", "Source", group, "Unmodified source feature")  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyString", "SourceSubelement", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyEnumeration", "Operation", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyLength", "Diameter", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyLength", "OriginalDiameter", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyVector", "Point", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyVector", "Axis", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyDistance", "CutterMin", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyDistance", "CutterMax", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyDistance", "FillMin", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyDistance", "FillMax", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyBool", "Enabled", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyString", "PatchId", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyString", "RequestId", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyString", "RequestFingerprint", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyString", "AuditId", group)  # type: ignore[attr-defined]
    obj.addProperty("App::PropertyInteger", "SchemaVersion", group)  # type: ignore[attr-defined]

    obj.Source = target.source  # type: ignore[attr-defined]
    obj.SourceSubelement = target.subelement  # type: ignore[attr-defined]
    obj.Operation = ["add_hole", "resize_hole"]  # type: ignore[attr-defined]
    obj.Operation = target.operation  # type: ignore[attr-defined]
    obj.Diameter = diameter_mm  # type: ignore[attr-defined]
    obj.OriginalDiameter = target.original_diameter_mm  # type: ignore[attr-defined]
    obj.Point = app.Vector(*target.point)  # type: ignore[attr-defined]
    obj.Axis = app.Vector(*target.axis)  # type: ignore[attr-defined]
    obj.CutterMin = target.cutter_min  # type: ignore[attr-defined]
    obj.CutterMax = target.cutter_max  # type: ignore[attr-defined]
    obj.FillMin = target.fill_min  # type: ignore[attr-defined]
    obj.FillMax = target.fill_max  # type: ignore[attr-defined]
    obj.Enabled = True  # type: ignore[attr-defined]
    obj.PatchId = patch_id  # type: ignore[attr-defined]
    obj.RequestId = request_id  # type: ignore[attr-defined]
    obj.RequestFingerprint = request_fingerprint  # type: ignore[attr-defined]
    obj.AuditId = audit_id  # type: ignore[attr-defined]
    obj.SchemaVersion = SCHEMA_VERSION  # type: ignore[attr-defined]
    PatchFeature(obj)
