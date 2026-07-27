import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from freecad.PatchCAD.audit import AuditWriteError, audit_path_for, write_audit_entry


class AuditWriteTests(unittest.TestCase):
    def test_writes_audit_next_to_document_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            document_path = Path(directory) / "Bracket.FCStd"

            result = write_audit_entry(
                document_path,
                {"audit_id": "audit-1", "request_id": "req-1", "operation": "add_hole"},
            )

            self.assertEqual(result, Path(f"{document_path}.patchcad.audit.json"))
            self.assertEqual(
                json.loads(result.read_text(encoding="utf-8")),
                {
                    "schema_version": 1,
                    "entries": [
                        {
                            "audit_id": "audit-1",
                            "operation": "add_hole",
                            "request_id": "req-1",
                        }
                    ],
                },
            )
            self.assertEqual(list(Path(directory).glob(".patchcad-audit-*")), [])

    def test_appends_without_losing_existing_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            document_path = Path(directory) / "Bracket.FCStd"
            write_audit_entry(document_path, {"audit_id": "audit-1"})
            result = write_audit_entry(document_path, {"audit_id": "audit-2"})

            entries = json.loads(result.read_text(encoding="utf-8"))["entries"]
            self.assertEqual(entries, [{"audit_id": "audit-1"}, {"audit_id": "audit-2"}])

    def test_replace_failure_preserves_previous_audit_and_removes_temp_file(self):
        with tempfile.TemporaryDirectory() as directory:
            document_path = Path(directory) / "Bracket.FCStd"
            audit_path = audit_path_for(document_path)
            audit_path.write_text('{"schema_version":1,"entries":[{"audit_id":"old"}]}', encoding="utf-8")

            with mock.patch.object(os, "replace", side_effect=OSError("disk error")):
                with self.assertRaisesRegex(AuditWriteError, "disk error"):
                    write_audit_entry(document_path, {"audit_id": "new"})

            self.assertEqual(
                json.loads(audit_path.read_text(encoding="utf-8"))["entries"],
                [{"audit_id": "old"}],
            )
            self.assertEqual(list(Path(directory).glob(".patchcad-audit-*")), [])

    def test_parent_directory_failure_is_reported_as_audit_write_error(self):
        with tempfile.TemporaryDirectory() as directory:
            document_path = Path(directory) / "missing" / "Bracket.FCStd"
            error = None

            with mock.patch.object(
                Path, "mkdir", side_effect=PermissionError("read-only directory")
            ):
                try:
                    write_audit_entry(document_path, {"audit_id": "audit-1"})
                except OSError as exc:
                    error = exc

            self.assertIsInstance(error, AuditWriteError)
            self.assertIn("read-only directory", str(error))

    def test_existing_path_probe_failure_is_reported_as_audit_write_error(self):
        with tempfile.TemporaryDirectory() as directory:
            document_path = Path(directory) / "Bracket.FCStd"
            error = None

            with mock.patch.object(
                Path, "exists", side_effect=PermissionError("path probe denied")
            ):
                try:
                    write_audit_entry(document_path, {"audit_id": "audit-1"})
                except OSError as exc:
                    error = exc

            self.assertIsInstance(error, AuditWriteError)
            self.assertIn("path probe denied", str(error))


if __name__ == "__main__":
    unittest.main()
