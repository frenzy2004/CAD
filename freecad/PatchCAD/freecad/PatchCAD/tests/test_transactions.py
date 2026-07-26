import unittest
from types import SimpleNamespace

from freecad.PatchCAD.service import PatchService, PatchServiceError


class ValidStaleShape:
    def isNull(self):
        return False

    def isValid(self):
        return True

    @property
    def Solids(self):
        return [self]


class PatchObject:
    def __init__(self):
        self.PatchId = "patch-1"
        self.RequestId = "request-1"
        self.AuditId = "audit-1"
        self.Name = "PatchCADPatch"
        self.Operation = "resize_hole"
        self.Diameter = 6.0
        self.Enabled = True
        self.Proxy = SimpleNamespace(execution_serial=4)
        self.State = []
        self.Shape = ValidStaleShape()
        self.Document = TransactionDocument(self)


class TransactionDocument:
    Name = "Bracket"
    FileName = ""

    def __init__(self, patch):
        self.patch = patch
        self.recompute_behavior = lambda: 1
        self.commits = 0
        self.aborts = 0
        self._snapshot = None

    def openTransaction(self, _label):
        self._snapshot = (self.patch.Diameter, self.patch.Enabled)

    def recompute(self):
        return self.recompute_behavior()

    def commitTransaction(self):
        self.commits += 1

    def abortTransaction(self):
        self.aborts += 1
        self.patch.Diameter, self.patch.Enabled = self._snapshot


class MutationRecomputeTests(unittest.TestCase):
    def test_update_aborts_when_execute_leaves_a_stale_valid_shape(self):
        patch = PatchObject()
        patch.Document.recompute_behavior = lambda: 1

        with self.assertRaisesRegex(PatchServiceError, "fresh"):
            PatchService()._mutate_patch(
                patch,
                "Update PatchCAD diameter",
                lambda: setattr(patch, "Diameter", 12.0),
                {"operation": "update_diameter", "diameter_mm": 12.0},
            )

        self.assertEqual(patch.Diameter, 6.0)
        self.assertEqual(patch.Document.commits, 0)
        self.assertEqual(patch.Document.aborts, 1)

    def test_toggle_aborts_when_recomputed_object_reports_invalid(self):
        patch = PatchObject()

        def invalid_recompute():
            patch.Proxy.execution_serial += 1
            patch.State = ["Invalid"]
            return 1

        patch.Document.recompute_behavior = invalid_recompute

        with self.assertRaisesRegex(PatchServiceError, "recompute"):
            PatchService()._mutate_patch(
                patch,
                "Toggle PatchCAD patch",
                lambda: setattr(patch, "Enabled", False),
                {"operation": "set_enabled", "enabled": False},
            )

        self.assertTrue(patch.Enabled)
        self.assertEqual(patch.Document.commits, 0)
        self.assertEqual(patch.Document.aborts, 1)

    def test_update_commits_only_after_transient_proxy_token_advances(self):
        patch = PatchObject()

        def fresh_recompute():
            patch.Proxy.execution_serial += 1
            patch.Shape = ValidStaleShape()
            return 1

        patch.Document.recompute_behavior = fresh_recompute

        try:
            result = PatchService()._mutate_patch(
                patch,
                "Update PatchCAD diameter",
                lambda: setattr(patch, "Diameter", 12.0),
                {"operation": "update_diameter", "diameter_mm": 12.0},
            )
        except PatchServiceError as exc:
            self.fail(f"fresh proxy execution was rejected: {exc}")

        self.assertEqual(result["diameter_mm"], 12.0)
        self.assertEqual(patch.Document.commits, 1)
        self.assertEqual(patch.Document.aborts, 0)


if __name__ == "__main__":
    unittest.main()
