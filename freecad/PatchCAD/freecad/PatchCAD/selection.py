"""FreeCAD GUI selection validation for supported hole operations."""

from __future__ import annotations

from dataclasses import dataclass
import importlib
import math
from typing import Callable, Literal

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
    fill_min: float
    fill_max: float
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


def _same_shape(left: object, right: object) -> bool:
    is_same = getattr(left, "isSame", None)
    if callable(is_same):
        return bool(is_same(right))
    return left is right


def _validate_through_openings(
    face: object,
    source_shape: object,
    vector_factory: Callable[[float, float, float], object],
    *,
    axis: tuple[float, float, float],
    center: tuple[float, float, float],
    radial: tuple[float, float, float],
    radius: float,
    lower: float,
    upper: float,
) -> None:
    axial_span = upper - lower
    boundary_tolerance = max(1e-5, axial_span * 1e-7)
    endpoint_edges: list[object] = []
    try:
        edges = list(face.Edges)  # type: ignore[attr-defined]
        for endpoint in (lower, upper):
            matches = []
            for edge in edges:
                edge_center = _tuple(edge.CenterOfMass)  # type: ignore[attr-defined]
                projection = sum(
                    (edge_center[index] - center[index]) * axis[index]
                    for index in range(3)
                )
                if math.isclose(
                    projection,
                    endpoint,
                    rel_tol=0,
                    abs_tol=boundary_tolerance,
                ):
                    matches.append(edge)
            if len(matches) != 1:
                raise SelectionError(
                    "resize_hole could not prove two through-hole boundary loops"
                )
            endpoint_edges.append(matches[0])

        for edge in endpoint_edges:
            ancestors = list(source_shape.ancestorsOfType(edge, type(face)))
            adjacent = [
                ancestor
                for ancestor in ancestors
                if not _same_shape(ancestor, face)
            ]
            if len(adjacent) != 1 or "plane" not in _surface_kind(adjacent[0]):
                raise SelectionError(
                    "resize_hole requires planar openings at both through-hole ends"
                )
    except SelectionError:
        raise
    except Exception as exc:
        raise SelectionError(
            "resize_hole could not prove through-hole boundary connectivity"
        ) from exc

    radial_length = math.sqrt(sum(value * value for value in radial))
    if not math.isclose(radial_length, radius, rel_tol=1e-7, abs_tol=1e-7):
        raise SelectionError(
            "resize_hole could not prove through-hole radial geometry"
        )
    radial_unit = tuple(value / radial_length for value in radial)
    tangent_unit = (
        axis[1] * radial_unit[2] - axis[2] * radial_unit[1],
        axis[2] * radial_unit[0] - axis[0] * radial_unit[2],
        axis[0] * radial_unit[1] - axis[1] * radial_unit[0],
    )
    opening_directions = (
        (0.0, 0.0, 0.0),
        radial_unit,
        tuple(-value for value in radial_unit),
        tangent_unit,
        tuple(-value for value in tangent_unit),
    )
    probe_offset = max(1e-5, min(radius, axial_span) * 1e-6)
    try:
        for endpoint, outward in ((lower, -1.0), (upper, 1.0)):
            for direction in opening_directions:
                coordinates = tuple(
                    center[index]
                    + axis[index] * (endpoint + outward * probe_offset)
                    + direction[index] * radius * 0.75
                    for index in range(3)
                )
                probe = vector_factory(*coordinates)
                if source_shape.isInside(probe, 1e-7, True):
                    raise SelectionError(
                        "resize_hole requires a through-hole open across both ends"
                    )
    except SelectionError:
        raise
    except Exception as exc:
        raise SelectionError(
            "resize_hole could not verify both through-hole openings"
        ) from exc


def _validate_inward_full_cylinder(
    face: object,
    source_shape: object | None = None,
    vector_factory: Callable[[float, float, float], object] | None = None,
) -> tuple[tuple[float, float, float], float]:
    if "cylinder" not in _surface_kind(face):
        raise SelectionError("resize_hole requires one cylindrical face")
    u_min, u_max, v_min, v_max = face.ParameterRange  # type: ignore[attr-defined]
    if not math.isclose(abs(float(u_max) - float(u_min)), 2 * math.pi, rel_tol=0, abs_tol=1e-6):
        raise SelectionError("partial cylindrical faces cannot be resized")

    surface = face.Surface  # type: ignore[attr-defined]
    radius = float(surface.Radius)
    axial_span = abs(float(v_max) - float(v_min))
    expected_area = 2 * math.pi * radius * axial_span
    wires = list(getattr(face, "Wires", ()))
    actual_area = float(getattr(face, "Area", math.nan))
    if (
        len(wires) != 1
        or not math.isfinite(radius)
        or radius <= 0
        or not math.isfinite(axial_span)
        or axial_span <= 0
        or not math.isfinite(actual_area)
        or not math.isclose(actual_area, expected_area, rel_tol=1e-7, abs_tol=1e-7)
    ):
        raise SelectionError("resize_hole requires one untrimmed full cylindrical wall")

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
    if (
        source_shape is None
        or vector_factory is None
        or len(list(getattr(source_shape, "Solids", ()))) != 1
        or not callable(getattr(source_shape, "isInside", None))
        or not callable(getattr(source_shape, "ancestorsOfType", None))
    ):
        raise SelectionError("resize_hole requires a demonstrably open through-hole")

    lower, upper = sorted((float(v_min), float(v_max)))
    _validate_through_openings(
        face,
        source_shape,
        vector_factory,
        axis=axis,
        center=center,
        radial=radial,
        radius=radius,
        lower=lower,
        upper=upper,
    )
    return axis, 2.0 * radius


def _hole_wall_bounds(
    face: object,
    point: tuple[float, float, float],
    axis: tuple[float, float, float],
) -> tuple[float, float]:
    u_min, u_max, v_min, v_max = face.ParameterRange  # type: ignore[attr-defined]
    u_mid = (u_min + u_max) / 2
    endpoints = (
        _tuple(face.valueAt(u_mid, v_min)),  # type: ignore[attr-defined]
        _tuple(face.valueAt(u_mid, v_max)),  # type: ignore[attr-defined]
    )
    projections = [
        sum((endpoint[index] - point[index]) * axis[index] for index in range(3))
        for endpoint in endpoints
    ]
    return min(projections), max(projections)


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
        app = importlib.import_module("FreeCAD")
        axis, original_diameter = _validate_inward_full_cylinder(
            face,
            source.Shape,  # type: ignore[attr-defined]
            app.Vector,
        )
        point = _tuple(face.CenterOfMass)
        fill_min, fill_max = _hole_wall_bounds(face, point, axis)
    cutter_min, cutter_max = _cutter_bounds(source, point, axis)
    if operation == "add_hole":
        fill_min, fill_max = cutter_min, cutter_max
    return SelectionTarget(
        document=source.Document.Name,  # type: ignore[attr-defined]
        object_name=source.Name,  # type: ignore[attr-defined]
        subelement=subelement,
        point=point,
        operation=operation,
        axis=axis,
        cutter_min=cutter_min,
        cutter_max=cutter_max,
        fill_min=fill_min,
        fill_max=fill_max,
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
