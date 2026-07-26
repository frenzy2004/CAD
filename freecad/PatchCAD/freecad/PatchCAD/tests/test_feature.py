from types import SimpleNamespace
import unittest
from unittest import mock

from freecad.PatchCAD import feature


class DiscreteSolid:
    """Tiny set-solid used to exercise boolean boundary behavior."""

    def __init__(self, cells):
        self.cells = frozenset(cells)

    def cut(self, other):
        return DiscreteSolid(self.cells - other.cells)

    def fuse(self, other):
        return DiscreteSolid(self.cells | other.cells)

    def copy(self):
        return DiscreteSolid(self.cells)

    def isNull(self):
        return not self.cells

    def isValid(self):
        return True

    @property
    def Solids(self):
        return [self]


class ShrinkGeometryBoundaryTests(unittest.TestCase):
    def test_shrink_fill_cannot_add_sleeves_beyond_the_hole_wall(self):
        source = DiscreteSolid({"existing-body"})
        patch = SimpleNamespace(
            Source=SimpleNamespace(Shape=source),
            Enabled=True,
            Operation="resize_hole",
            Diameter=6.0,
            OriginalDiameter=10.0,
        )

        def cylinder(_patch, radius, *, bounds="cutter"):
            if radius == 5.0:
                if bounds == "fill":
                    return DiscreteSolid({"new-fill", "hole-core"})
                return DiscreteSolid(
                    {
                        "new-fill",
                        "hole-core",
                        "exterior-core",
                        "exterior-sleeve",
                    }
                )
            return DiscreteSolid({"hole-core", "exterior-core"})

        with mock.patch.object(feature, "_cylinder", side_effect=cylinder):
            result = feature.build_patch_shape(patch)

        self.assertEqual(result.cells, frozenset({"existing-body", "new-fill"}))


class FeatureExecutionTests(unittest.TestCase):
    def test_successful_execute_advances_a_transient_proxy_token(self):
        patch = SimpleNamespace(ExecutionSerial=0)
        proxy = feature.PatchFeature(patch)
        fresh_shape = DiscreteSolid({"fresh-shape"})

        with mock.patch.object(feature, "build_patch_shape", return_value=fresh_shape):
            proxy.execute(patch)

        self.assertIs(patch.Shape, fresh_shape)
        self.assertEqual(getattr(proxy, "execution_serial", None), 1)


if __name__ == "__main__":
    unittest.main()
