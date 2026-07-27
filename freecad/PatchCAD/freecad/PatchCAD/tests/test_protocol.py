import json
import threading
import unittest
from unittest import mock

from freecad.PatchCAD import protocol
from freecad.PatchCAD.protocol import (
    IdempotencyConflict,
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

    def test_rejects_a_point_for_resize_hole(self):
        payload = self.valid_payload()
        payload["operation"] = "resize_hole"

        with self.assertRaisesRegex(ProtocolError, "point is only supported"):
            parse_patch_request(payload)

    def test_rejects_blind_holes_without_a_depth_contract(self):
        payload = self.valid_payload()
        payload["through_all"] = False

        with self.assertRaisesRegex(ProtocolError, "through_all"):
            parse_patch_request(payload)

    def test_rejects_non_finite_or_non_positive_diameter(self):
        for diameter in (0, -1, float("inf"), float("nan"), 10**400, True):
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

    def test_different_request_ids_do_not_hold_the_cache_lock_during_work(self):
        cache = RequestIdCache()
        first_started = threading.Event()
        release_first = threading.Event()
        second_finished = threading.Event()
        first_result = []

        def first_operation():
            first_started.set()
            self.assertTrue(release_first.wait(1))
            return "first"

        first_thread = threading.Thread(
            target=lambda: first_result.append(cache.run("req-1", first_operation))
        )
        first_thread.start()
        self.assertTrue(first_started.wait(1))

        second_thread = threading.Thread(
            target=lambda: (
                cache.run(
                    "req-2", lambda: second_finished.set() or "second"
                )
            )
        )
        second_thread.start()
        try:
            self.assertTrue(second_finished.wait(1))
        finally:
            release_first.set()
            first_thread.join(1)
            second_thread.join(1)

        self.assertFalse(first_thread.is_alive())
        self.assertFalse(second_thread.is_alive())
        self.assertEqual(first_result, ["first"])

    def test_concurrent_same_request_id_replays_one_result(self):
        cache = RequestIdCache()
        first_started = threading.Event()
        release_first = threading.Event()
        operation_calls = []
        results = []

        def first_operation():
            operation_calls.append("first")
            first_started.set()
            self.assertTrue(release_first.wait(1))
            return {"patch_id": "Patch001"}

        first_thread = threading.Thread(
            target=lambda: results.append(
                cache.run("req-1", first_operation, fingerprint="payload-a")
            )
        )
        duplicate_thread = threading.Thread(
            target=lambda: results.append(
                cache.run(
                    "req-1",
                    lambda: operation_calls.append("duplicate") or {"patch_id": "Patch002"},
                    fingerprint="payload-a",
                )
            )
        )
        first_thread.start()
        self.assertTrue(first_started.wait(1))
        duplicate_thread.start()
        release_first.set()
        first_thread.join(1)
        duplicate_thread.join(1)

        self.assertFalse(first_thread.is_alive())
        self.assertFalse(duplicate_thread.is_alive())
        self.assertEqual(operation_calls, ["first"])
        self.assertEqual(results, [{"patch_id": "Patch001"}] * 2)

    def test_concurrent_conflicting_request_id_is_rejected_without_waiting(self):
        cache = RequestIdCache()
        first_started = threading.Event()
        release_first = threading.Event()
        conflict_finished = threading.Event()
        conflicts = []

        def first_operation():
            first_started.set()
            self.assertTrue(release_first.wait(1))
            return "first"

        first_thread = threading.Thread(
            target=lambda: cache.run("req-1", first_operation, fingerprint="payload-a")
        )

        def conflicting_call():
            try:
                cache.run(
                    "req-1",
                    lambda: self.fail("conflicting operation must not run"),
                    fingerprint="payload-b",
                )
            except IdempotencyConflict as error:
                conflicts.append(error)
            finally:
                conflict_finished.set()

        first_thread.start()
        self.assertTrue(first_started.wait(1))
        conflict_thread = threading.Thread(target=conflicting_call)
        conflict_thread.start()
        try:
            self.assertTrue(conflict_finished.wait(1))
        finally:
            release_first.set()
            first_thread.join(1)
            conflict_thread.join(1)

        self.assertFalse(first_thread.is_alive())
        self.assertFalse(conflict_thread.is_alive())
        self.assertEqual(len(conflicts), 1)

    def test_failed_operation_is_not_cached(self):
        cache = RequestIdCache()

        with self.assertRaisesRegex(RuntimeError, "first failure"):
            cache.run(
                "req-1",
                lambda: (_ for _ in ()).throw(RuntimeError("first failure")),
                fingerprint="payload-a",
            )

        self.assertEqual(
            cache.run("req-1", lambda: "retried", fingerprint="payload-a"),
            "retried",
        )

    def test_failed_inflight_request_wakes_duplicate_and_allows_retry(self):
        cache = RequestIdCache()
        first_started = threading.Event()
        duplicate_waiting = threading.Event()
        release_first = threading.Event()
        errors = {}
        operation_calls = []

        class ObservedEvent:
            def __init__(self):
                self._event = threading.Event()

            def set(self):
                self._event.set()

            def wait(self):
                duplicate_waiting.set()
                return self._event.wait()

        original_inflight = protocol._InFlightRequest

        def create_inflight(*args, **kwargs):
            return original_inflight(*args, completed=ObservedEvent(), **kwargs)

        def first_operation():
            operation_calls.append("first")
            first_started.set()
            self.assertTrue(release_first.wait(1))
            raise RuntimeError("primary failure")

        def run_request(name, operation):
            try:
                cache.run("req-1", operation, fingerprint="payload-a")
            except RuntimeError as error:
                errors[name] = str(error)

        with mock.patch.object(protocol, "_InFlightRequest", side_effect=create_inflight):
            first_thread = threading.Thread(
                target=lambda: run_request("first", first_operation)
            )
            duplicate_thread = threading.Thread(
                target=lambda: run_request(
                    "duplicate",
                    lambda: operation_calls.append("duplicate") or "unexpected",
                )
            )
            first_thread.start()
            self.assertTrue(first_started.wait(1))
            duplicate_thread.start()
            self.assertTrue(duplicate_waiting.wait(1))
            release_first.set()
            first_thread.join(1)
            duplicate_thread.join(1)

        self.assertFalse(first_thread.is_alive())
        self.assertFalse(duplicate_thread.is_alive())
        self.assertEqual(operation_calls, ["first"])
        self.assertEqual(errors, {"first": "primary failure", "duplicate": "primary failure"})
        self.assertEqual(
            cache.run("req-1", lambda: "retried", fingerprint="payload-a"),
            "retried",
        )


if __name__ == "__main__":
    unittest.main()
