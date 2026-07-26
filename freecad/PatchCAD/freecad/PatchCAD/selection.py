"""FreeCAD GUI selection validation for supported hole operations."""

from __future__ import annotations

from dataclasses import dataclass
import importlib
import math
from typing import Literal

from .protocol import PatchRequest


class SelectionError(ValueError):
    pass


@dataclass(frozen=True)
class SelectionTarget:
    document: str
    object_name: str
    subelement: str
    point: tuple[float, float, float]
    operation: Literal["add_hole", "resize_hole"]
    axis: tuple[float, float, float]
    cutter_min: float
    cutter_max: float
    original_diameter_mm: float
    source: object


def _modules():
    return importlib.import_module("FreeCAD"), importlib.import_module("FreeCADGui")


def _tuple(vector: object) -> tuple[float, float, float]:
    return float(vector.x), float(vector.y), float(vector.z)  # type: ignore[attr-defined]


def _normalized(vector: object) -> tuple[float, float, float]:
    x, y, z = _tuple(vector)
    length = math.sqrt(x * x + y * y + z * z)
    if length <= 1e-12:
        raise SelectionError("selected face has no usable axis")
    return x / length, y / length, z / length


def _surface_kind(face: object) -> str:
    return face.Surface.__class__.__name__.lower()  # type: ignore[attr-defined]


def _picked_point(selection: object, face: object) -> tuple[float, float, float]:
    points = getattr(selection, "PickedPoints", None)
    if points:
        return _tuple(points[0])
    return _tuple(face.CenterOfMass)  # type: ignore[attr-defined]


def _cutter_bounds(
    source: object,
    point: tuple[float, float, float],
    axis: tuple[float, float, float],
) -> tuple[float, float]:
    bounds = source.Shape.BoundBox  # type: ignore[attr-defined]
    projections = []
    for x in (float(bounds.XMin), float(bounds.XMax)):
        for y in (float(bounds.YMin), float(bounds.YMax)):
            for z in (float(bounds.ZMin), float(bounds.ZMax)):
                projections.append(
                    (x - point[0]) * axis[0]
                    + (y - point[1]) * axis[1]
                    + (z - point[2]) * axis[2]
                )
    span = max(projections) - min(projections)
    margin = max(1.0, span * 0.05)
    return min(projections) - margin, max(projections) + margin


def _validate_planar(face: object) -> tuple[float, float, float]:
    if "plane" not in _surface_kind(face):
        raise SelectionError("add_hole requires one planar face")
    u_min, u_max, v_min, v_max = face.ParameterRange  # type: ignore[attr-defined]
    return _normalized(face.normalAt((u_min + u_max) / 2, (v_min + v_max) / 2))  # type: ignore[attr-defined]


def _validate_inward_full_cylinder(
    face: object,
) -> tuple[tuple[float, float, float], float]:
    if "cylinder" not in _surface_kind(face):
        raise SelectionError("resize_hole requires one cylindrical face")
    u_min, u_max, v_min, v_max = face.ParameterRange  # type: ignore[attr-defined]
    if not math.isclose(abs(float(u_max) - float(u_min)), 2 * math.pi, rel_tol=0, abs_tol=1e-6):
        raise SelectionError("partial cylindrical faces cannot be resized")

    surface = face.Surface  # type: ignore[attr-defined]
    axis = _normalized(surface.Axis)
    center = _tuple(surface.Center)
    u_mid, v_mid = (u_min + u_max) / 2, (v_min + v_max) / 2
    point_on_face = _tuple(face.valueAt(u_mid, v_mid))  # type: ignore[attr-defined]
    normal = _normalized(face.normalAt(u_mid, v_mid))  # type: ignore[attr-defined]
    offset = tuple(point_on_face[index] - center[index] for index in range(3))
    axial = sum(offset[index] * axis[index] for index in range(3))
    radial = tuple(offset[index] - axial * axis[index] for index in range(3))
    if sum(normal[index] * radial[index] for index in range(3)) >= -1e-7:
        raise SelectionError("outward cylindrical bosses cannot be resized")
    return axis, 2.0 * float(surface.Radius)


def validate_target(
    source: object,
    subelement: str,
    operation: Literal["add_hole", "resize_hole"],
    point: tuple[float, float, float] | None = None,
) -> SelectionTarget:
    try:
        face = source.Shape.getElement(subelement)  # type: ignore[attr-defined]
    except Exception as exc:
        raise SelectionError(f"subelement {subelement!r} does not exist") from exc
    if getattr(face, "ShapeType", None) != "Face":
        raise SelectionError("PatchCAD accepts exactly one face")

    if point is None:
        point = _tuple(face.CenterOfMass)
    if operation == "add_hole":
        axis = _validate_planar(face)
        app, _ = _modules()
        part = importlib.import_module("Part")
        distance = face.distToShape(part.Vertex(app.Vector(*point)))[0]  # type: ignore[attr-defined]
        if float(distance) > 1e-5:
            raise SelectionError("add_hole point must lie on the selected planar face")
        original_diameter = 0.0
    else:
        axis, original_diameter = _validate_inward_full_cylinder(face)
        point = _tuple(face.CenterOfMass)
    cutter_min, cutter_max = _cutter_bounds(source, point, axis)
    return SelectionTarget(
        document=source.Document.Name,  # type: ignore[attr-defined]
        object_name=source.Name,  # type: ignore[attr-defined]
        subelement=subelement,
        point=point,
        operation=operation,
        axis=axis,
        cutter_min=cutter_min,
        cutter_max=cutter_max,
        original_diameter_mm=original_diameter,
        source=source,
    )


def capture_selection(
    operation: Literal["add_hole", "resize_hole"],
) -> SelectionTarget:
    _, gui = _modules()
    selected = gui.Selection.getSelectionEx()
    if len(selected) != 1:
        raise SelectionError("select exactly one face")
    item = selected[0]
    names = list(getattr(item, "SubElementNames", ()))
    faces = list(getattr(item, "SubObjects", ()))
    if len(names) != 1 or len(faces) != 1:
        raise SelectionError("select exactly one face")
    point = _picked_point(item, faces[0])
    return validate_target(item.Object, names[0], operation, point)


def resolve_request(request: PatchRequest) -> SelectionTarget:
    app, _ = _modules()
    document = app.getDocument(request.document) if request.document else app.ActiveDocument
    if document is None:
        raise SelectionError("no active FreeCAD document")
    source = document.getObject(request.object_name)
    if source is None:
        raise SelectionError(f"object {request.object_name!r} does not exist")
    return validate_target(source, request.subelement, request.operation, request.point)


def current_selection_payload() -> dict[str, object]:
    _, gui = _modules()
    selected = gui.Selection.getSelectionEx()
    if len(selected) != 1:
        raise SelectionError("select exactly one face")
    item = selected[0]
    names = list(getattr(item, "SubElementNames", ()))
    faces = list(getattr(item, "SubObjects", ()))
    if len(names) != 1 or len(faces) != 1:
        raise SelectionError("select exactly one face")
    point = _picked_point(item, faces[0])
    allowed = []
    original_diameter = None
    for operation in ("add_hole", "resize_hole"):
        try:
            target = validate_target(item.Object, names[0], operation, point)
        except SelectionError:
            continue
        allowed.append(operation)
        original_diameter = target.original_diameter_mm or None
    if not allowed:
        raise SelectionError("selected face is not a supported PatchCAD target")
    return {
        "document": item.Object.Document.Name,
        "object_name": item.Object.Name,
        "subelement": names[0],
        "point": list(point),
        "units": "mm",
        "allowed_operations": allowed,
        "original_diameter_mm": original_diameter,
    }
