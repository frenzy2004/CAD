import math
import unittest

from freecad.PatchCAD.selection import SelectionError, _validate_inward_full_cylinder


class Vector:
    def __init__(self, x, y, z):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)


class CylinderSurface:
    def __init__(self, radius=5.0):
        self.Axis = Vector(0, 0, 1)
        self.Center = Vector(0, 0, 0)
        self.Radius = radius


class PlaneSurface:
    pass


class ConeSurface:
    pass


class AdjacentFace:
    def __init__(self, kind):
        self.Surface = PlaneSurface() if kind == "plane" else ConeSurface()


class BoundaryEdge:
    def __init__(self, z, end):
        self.CenterOfMass = Vector(0, 0, z)
        self.end = end
        self.owner = None


class CylinderFace:
    def __init__(self, *, radius=5.0, height=10.0, area_ratio=1.0, wire_count=1):
        self.Surface = CylinderSurface(radius)
        self.ParameterRange = (0.0, 2 * math.pi, 0.0, height)
        self.Area = 2 * math.pi * radius * height * area_ratio
        self.Wires = [object() for _ in range(wire_count)]
        self.Edges = [
            BoundaryEdge(0.0, "lower"),
            BoundaryEdge(height, "upper"),
        ]
        for edge in self.Edges:
            edge.owner = self

    def valueAt(self, u, v):
        radius = float(self.Surface.Radius)
        return Vector(radius * math.cos(u), radius * math.sin(u), v)

    def normalAt(self, u, _v):
        return Vector(-math.cos(u), -math.sin(u), 0)


class SourceShape:
    def __init__(
        self,
        *,
        inside_below=False,
        inside_above=False,
        lower_surface="plane",
        upper_surface="plane",
        solid_below_radius=None,
    ):
        self.inside_below = inside_below
        self.inside_above = inside_above
        self.solid_below_radius = solid_below_radius
        self.adjacent = {
            "lower": AdjacentFace(lower_surface),
            "upper": AdjacentFace(upper_surface),
        }
        self.probes = []
        self.Solids = [self]

    def isInside(self, point, tolerance, strictly_inside):
        self.probes.append((point, tolerance, strictly_inside))
        if point.z < 0 and self.solid_below_radius is not None:
            return math.hypot(point.x, point.y) > self.solid_below_radius
        return self.inside_below if point.z < 0 else self.inside_above

    def ancestorsOfType(self, edge, shape_type):
        if shape_type is not type(edge.owner):
            raise AssertionError(f"unexpected ancestor type {shape_type!r}")
        return [edge.owner, self.adjacent[edge.end]]


class CylinderSelectionBoundaryTests(unittest.TestCase):
    def test_rejects_trimmed_cylinder_even_when_underlying_u_range_is_full(self):
        face = CylinderFace(area_ratio=0.75)

        with self.assertRaisesRegex(SelectionError, "untrimmed"):
            _validate_inward_full_cylinder(face)

    def test_rejects_side_port_wire_on_full_underlying_cylinder(self):
        face = CylinderFace(wire_count=2)

        with self.assertRaisesRegex(SelectionError, "untrimmed"):
            _validate_inward_full_cylinder(face)

    def test_rejects_cylindrical_wall_closed_in_source_at_either_axial_end(self):
        for inside_below, inside_above in ((True, False), (False, True)):
            with self.subTest(
                inside_below=inside_below, inside_above=inside_above
            ):
                source_shape = SourceShape(
                    inside_below=inside_below,
                    inside_above=inside_above,
                )
                error = None
                try:
                    _validate_inward_full_cylinder(
                        CylinderFace(), source_shape, Vector
                    )
                except SelectionError as exc:
                    error = exc
                except TypeError:
                    pass

                self.assertIsNotNone(error)
                self.assertIn("through", str(error))

    def test_accepts_untrimmed_inward_wall_open_at_both_axial_ends(self):
        source_shape = SourceShape()
        result = None
        try:
            result = _validate_inward_full_cylinder(
                CylinderFace(), source_shape, Vector
            )
        except TypeError:
            pass

        self.assertEqual(result, ((0.0, 0.0, 1.0), 10.0))
        self.assertEqual(len(source_shape.probes), 10)
        self.assertLess(source_shape.probes[0][0].z, 0)
        self.assertTrue(any(probe[0].z > 10 for probe in source_shape.probes))
        self.assertTrue(any(abs(probe[0].x) > 3 for probe in source_shape.probes))
        self.assertTrue(any(abs(probe[0].y) > 3 for probe in source_shape.probes))

    def test_rejects_blind_drill_tip_even_when_axis_endpoint_probes_are_void(self):
        source_shape = SourceShape(lower_surface="cone")

        with self.assertRaisesRegex(SelectionError, "through-hole"):
            _validate_inward_full_cylinder(
                CylinderFace(), source_shape, Vector
            )

    def test_rejects_internal_shoulder_with_smaller_axial_pilot_opening(self):
        source_shape = SourceShape(solid_below_radius=2.0)

        with self.assertRaisesRegex(SelectionError, "through-hole"):
            _validate_inward_full_cylinder(
                CylinderFace(), source_shape, Vector
            )


if __name__ == "__main__":
    unittest.main()
