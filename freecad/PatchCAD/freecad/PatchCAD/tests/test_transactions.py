import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

from freecad.PatchCAD import service
from freecad.PatchCAD.protocol import PatchRequest, ProtocolError
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
        self.RequestFingerprint = ""
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
        self.Objects = [patch]
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

    def test_pre_write_filesystem_error_is_post_commit_audit_error(self):
        patch = PatchObject()
        patch.Document.FileName = "/read-only/Bracket.FCStd"

        def fresh_recompute():
            patch.Proxy.execution_serial += 1
            patch.Shape = ValidStaleShape()
            return 1

        patch.Document.recompute_behavior = fresh_recompute
        result = None
        error = None
        with mock.patch.object(
            service,
            "write_audit_entry",
            side_effect=PermissionError("audit directory denied"),
        ):
            try:
                result = PatchService()._mutate_patch(
                    patch,
                    "Update PatchCAD diameter",
                    lambda: setattr(patch, "Diameter", 12.0),
                    {"operation": "update_diameter", "diameter_mm": 12.0},
                )
            except OSError as exc:
                error = exc

        self.assertIsNone(error)
        self.assertEqual(result["audit_error"]["code"], "AUDIT_WRITE_FAILED")
        self.assertIn("audit directory denied", result["audit_error"]["message"])
        self.assertEqual(patch.Diameter, 12.0)
        self.assertEqual(patch.Document.commits, 1)
        self.assertEqual(patch.Document.aborts, 0)

    def test_invalid_utf8_audit_is_post_commit_audit_error(self):
        patch = PatchObject()

        def fresh_recompute():
            patch.Proxy.execution_serial += 1
            patch.Shape = ValidStaleShape()
            return 1

        patch.Document.recompute_behavior = fresh_recompute
        with tempfile.TemporaryDirectory() as directory:
            document_path = Path(directory) / "Bracket.FCStd"
            patch.Document.FileName = str(document_path)
            Path(f"{document_path}.patchcad.audit.json").write_bytes(b"\xff")
            result = None
            error = None

            try:
                result = PatchService()._mutate_patch(
                    patch,
                    "Update PatchCAD diameter",
                    lambda: setattr(patch, "Diameter", 12.0),
                    {"operation": "update_diameter", "diameter_mm": 12.0},
                )
            except UnicodeDecodeError as exc:
                error = exc

        self.assertIsNone(error)
        self.assertEqual(result["audit_error"]["code"], "AUDIT_WRITE_FAILED")
        self.assertEqual(patch.Diameter, 12.0)
        self.assertEqual(patch.Document.commits, 1)
        self.assertEqual(patch.Document.aborts, 0)


class PersistedIdempotencyTests(unittest.TestCase):
    @staticmethod
    def fingerprint(request):
        canonical = {
            "request_id": request.request_id,
            "document": request.document,
            "object_name": request.object_name,
            "subelement": request.subelement,
            "operation": request.operation,
            "diameter_mm": request.diameter_mm,
            "point": list(request.point) if request.point is not None else None,
            "through_all": request.through_all,
            "units": "mm",
        }
        encoded = json.dumps(
            canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def test_existing_request_id_with_different_semantic_payload_is_rejected(self):
        original = PatchRequest(
            request_id="request-1",
            document="Bracket",
            object_name="Body",
            subelement="Face4",
            operation="resize_hole",
            diameter_mm=6.0,
        )
        changed = PatchRequest(
            request_id="request-1",
            document="Bracket",
            object_name="Body",
            subelement="Face4",
            operation="resize_hole",
            diameter_mm=8.0,
        )
        patch = PatchObject()
        patch.RequestFingerprint = self.fingerprint(original)
        target = SimpleNamespace(source=patch.Document)
        target.source = SimpleNamespace(Document=patch.Document)

        with mock.patch.object(service, "_app", return_value=SimpleNamespace()):
            with self.assertRaisesRegex(ProtocolError, "different payload"):
                PatchService().create_patch(changed, target)

    def test_exact_replay_returns_original_document_after_active_document_changes(self):
        request = PatchRequest(
            request_id="request-global",
            document=None,
            object_name="Body",
            subelement="Face4",
            operation="resize_hole",
            diameter_mm=6.0,
        )
        persisted = PatchObject()
        persisted.RequestId = request.request_id
        persisted.RequestFingerprint = self.fingerprint(request)
        other_document = SimpleNamespace(Name="Other", Objects=[])
        app = SimpleNamespace(
            ActiveDocument=other_document,
            listDocuments=lambda: {
                "Bracket": persisted.Document,
                "Other": other_document,
            },
        )
        result = None
        error = None

        with (
            mock.patch.object(service, "_app", return_value=app),
            mock.patch.object(
                service,
                "resolve_request",
                side_effect=AssertionError("replay must not resolve the new active document"),
            ),
        ):
            try:
                result = PatchService().create_patch(request)
            except AssertionError as exc:
                error = exc

        self.assertIsNone(error)
        self.assertEqual(result["patch_id"], persisted.PatchId)
        self.assertEqual(result["document"], "Bracket")
        self.assertTrue(result["idempotent"])

    def test_global_request_id_conflicts_before_resolving_changed_document_or_payload(self):
        original = PatchRequest(
            request_id="request-global-conflict",
            document="Bracket",
            object_name="Body",
            subelement="Face4",
            operation="resize_hole",
            diameter_mm=6.0,
        )
        persisted = PatchObject()
        persisted.RequestId = original.request_id
        persisted.RequestFingerprint = self.fingerprint(original)
        other_document = SimpleNamespace(Name="Other", Objects=[])
        app = SimpleNamespace(
            ActiveDocument=other_document,
            listDocuments=lambda: {
                "Bracket": persisted.Document,
                "Other": other_document,
            },
        )
        changed_requests = (
            PatchRequest(**{**original.__dict__, "document": "Other"}),
            PatchRequest(**{**original.__dict__, "diameter_mm": 8.0}),
        )

        for changed in changed_requests:
            with self.subTest(changed=changed):
                error = None
                with (
                    mock.patch.object(service, "_app", return_value=app),
                    mock.patch.object(
                        service,
                        "resolve_request",
                        side_effect=AssertionError(
                            "request conflict must precede target resolution"
                        ),
                    ),
                ):
                    try:
                        PatchService().create_patch(changed)
                    except BaseException as exc:
                        error = exc

                self.assertIsInstance(error, ProtocolError)
                self.assertIn("different payload", str(error))

    def test_duplicate_persisted_request_id_across_documents_is_ambiguous(self):
        request = PatchRequest(
            request_id="request-duplicate",
            document=None,
            object_name="Body",
            subelement="Face4",
            operation="resize_hole",
            diameter_mm=6.0,
        )
        first = PatchObject()
        second = PatchObject()
        for patch in (first, second):
            patch.RequestId = request.request_id
            patch.RequestFingerprint = self.fingerprint(request)
        second.Document.Name = "Other"
        app = SimpleNamespace(
            ActiveDocument=second.Document,
            listDocuments=lambda: {
                "Bracket": first.Document,
                "Other": second.Document,
            },
        )

        with mock.patch.object(service, "_app", return_value=app):
            with self.assertRaisesRegex(ProtocolError, "multiple open documents"):
                PatchService().create_patch(request)


if __name__ == "__main__":
    unittest.main()
