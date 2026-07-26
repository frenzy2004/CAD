import json
import unittest

from freecad.PatchCAD.protocol import (
    PatchRequest,
    ProtocolError,
    RequestIdCache,
    parse_patch_request,
)


class PatchRequestTests(unittest.TestCase):
    def valid_payload(self):
        return {
            "request_id": "req-123",
            "document": "Bracket",
            "object_name": "Body",
            "subelement": "Face7",
            "operation": "add_hole",
            "diameter_mm": 6.25,
            "point": [10.0, 20.0, 3.0],
            "through_all": True,
            "units": "mm",
        }

    def test_parses_strict_millimetre_request(self):
        request = parse_patch_request(json.dumps(self.valid_payload()).encode("utf-8"))

        self.assertEqual(
            request,
            PatchRequest(
                request_id="req-123",
                document="Bracket",
                object_name="Body",
                subelement="Face7",
                operation="add_hole",
                diameter_mm=6.25,
                point=(10.0, 20.0, 3.0),
                through_all=True,
            ),
        )

    def test_rejects_unknown_keys(self):
        payload = self.valid_payload()
        payload["python"] = "import os"

        with self.assertRaisesRegex(ProtocolError, "unknown field"):
            parse_patch_request(payload)

    def test_rejects_non_millimetre_units(self):
        payload = self.valid_payload()
        payload["units"] = "inch"

        with self.assertRaisesRegex(ProtocolError, "units"):
            parse_patch_request(payload)

    def test_rejects_unsupported_operations(self):
        payload = self.valid_payload()
        payload["operation"] = "fillet"

        with self.assertRaisesRegex(ProtocolError, "operation"):
            parse_patch_request(payload)

    def test_requires_a_point_for_add_hole(self):
        payload = self.valid_payload()
        payload["point"] = None

        with self.assertRaisesRegex(ProtocolError, "point"):
            parse_patch_request(payload)

    def test_rejects_blind_holes_without_a_depth_contract(self):
        payload = self.valid_payload()
        payload["through_all"] = False

        with self.assertRaisesRegex(ProtocolError, "through_all"):
            parse_patch_request(payload)

    def test_rejects_non_finite_or_non_positive_diameter(self):
        for diameter in (0, -1, float("inf"), float("nan"), True):
            with self.subTest(diameter=diameter):
                payload = self.valid_payload()
                payload["diameter_mm"] = diameter
                with self.assertRaisesRegex(ProtocolError, "diameter_mm"):
                    parse_patch_request(payload)


class RequestIdCacheTests(unittest.TestCase):
    def test_repeated_request_id_returns_first_result_without_reapplying(self):
        cache = RequestIdCache()
        calls = []

        first = cache.run("req-1", lambda: calls.append("applied") or {"patch_id": "Patch001"})
        second = cache.run("req-1", lambda: calls.append("applied-again") or {"patch_id": "Patch002"})

        self.assertEqual(first, {"patch_id": "Patch001"})
        self.assertIs(second, first)
        self.assertEqual(calls, ["applied"])

    def test_reusing_request_id_with_different_payload_is_rejected(self):
        cache = RequestIdCache()
        cache.run("req-1", lambda: "first", fingerprint="payload-a")

        with self.assertRaisesRegex(ProtocolError, "different payload"):
            cache.run("req-1", lambda: "second", fingerprint="payload-b")


if __name__ == "__main__":
    unittest.main()
