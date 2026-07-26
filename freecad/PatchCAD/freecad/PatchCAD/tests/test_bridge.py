import http.client
import json
import socket
import threading
import time
import unittest

from freecad.PatchCAD.bridge import BridgeApplication, BridgeServer, GuiThreadDispatcher


class RecordingDispatcher:
    def __init__(self):
        self.calls = []
        self.result = {"ok": True}
        self.error = None

    def submit(self, action, payload, timeout_s):
        self.calls.append((action, payload, timeout_s))
        if self.error:
            raise self.error
        return self.result


class RunningBridgeTests(unittest.TestCase):
    token = "test-token"
    origin = "http://localhost:3000"

    def setUp(self):
        self.dispatcher = RecordingDispatcher()
        self.app = BridgeApplication(
            self.dispatcher,
            token=self.token,
            allowed_origins=(self.origin, "https://patchcad.vercel.app"),
            request_timeout_s=0.05,
            max_body_bytes=256,
        )
        self.server = BridgeServer(self.app, port=0)
        self.server.start()
        self.host, self.port = self.server.address

    def tearDown(self):
        self.server.close()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(self.host, self.port, timeout=2)
        request_headers = dict(headers or {})
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        data = response.read()
        response_headers = dict(response.getheaders())
        connection.close()
        return response.status, response_headers, json.loads(data) if data else None

    def auth_headers(self, **extra):
        return {"Authorization": f"Bearer {self.token}", **extra}

    def test_requires_bearer_token(self):
        status, _, body = self.request("GET", "/health")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"]["code"], "UNAUTHORIZED")

        status, _, body = self.request(
            "GET", "/health", headers=self.auth_headers(Origin=self.origin)
        )
        self.assertEqual(status, 200)
        self.assertEqual(body, {"status": "ok"})

    def test_cors_allows_only_an_exact_configured_origin(self):
        status, headers, _ = self.request(
            "GET", "/health", headers=self.auth_headers(Origin=self.origin)
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], self.origin)
        self.assertNotIn("Access-Control-Allow-Credentials", headers)

        status, headers, body = self.request(
            "GET",
            "/health",
            headers=self.auth_headers(Origin="http://localhost:3000.attacker.invalid"),
        )
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(body["error"]["code"], "ORIGIN_NOT_ALLOWED")

    def test_private_network_preflight_is_origin_scoped(self):
        status, headers, _ = self.request(
            "OPTIONS",
            "/patches",
            headers={
                "Origin": self.origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization, content-type",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], self.origin)
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")
        self.assertEqual(headers["Vary"], "Origin")

    def test_rejects_body_over_limit_before_dispatch(self):
        status, _, body = self.request(
            "POST",
            "/patches",
            body=b"x" * 257,
            headers=self.auth_headers(
                Origin=self.origin,
                **{"Content-Type": "application/json", "Content-Length": "257"},
            ),
        )

        self.assertEqual(status, 413)
        self.assertEqual(body["error"]["code"], "BODY_TOO_LARGE")
        self.assertEqual(self.dispatcher.calls, [])

    def test_partial_content_length_body_times_out_cleanly(self):
        connection = socket.create_connection((self.host, self.port), timeout=1)
        connection.settimeout(0.25)
        request = (
            "POST /patches HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Authorization: Bearer {self.token}\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: 100\r\n"
            "Connection: close\r\n"
            "\r\n"
            "{"
        ).encode("ascii")
        connection.sendall(request)

        status = None
        body = None
        try:
            response = http.client.HTTPResponse(connection)
            response.begin()
            status = response.status
            data = response.read()
            body = json.loads(data) if data else None
        except TimeoutError:
            pass
        finally:
            connection.close()

        self.assertEqual(status, 408)
        self.assertEqual(body["error"]["code"], "BODY_READ_TIMEOUT")
        self.assertEqual(self.dispatcher.calls, [])

    def test_dispatch_timeout_returns_gateway_timeout(self):
        self.dispatcher.error = TimeoutError("GUI did not respond")

        status, _, body = self.request(
            "GET", "/selection", headers=self.auth_headers(Origin=self.origin)
        )

        self.assertEqual(status, 504)
        self.assertEqual(body["error"]["code"], "GUI_TIMEOUT")

    def test_create_patch_is_idempotent_by_request_id(self):
        payload = {
            "request_id": "req-42",
            "document": "Bracket",
            "object_name": "Body",
            "subelement": "Face4",
            "operation": "resize_hole",
            "diameter_mm": 8.0,
            "point": None,
            "through_all": True,
            "units": "mm",
        }
        self.dispatcher.result = {"patch_id": "patch-42"}

        first = self.request(
            "POST", "/patches", body=payload, headers=self.auth_headers(Origin=self.origin)
        )
        second = self.request(
            "POST", "/patches", body=payload, headers=self.auth_headers(Origin=self.origin)
        )

        self.assertEqual(first[0], 201)
        self.assertEqual(second[0], 200)
        self.assertEqual(first[2], {"patch_id": "patch-42"})
        self.assertEqual(second[2], first[2])
        self.assertEqual(len(self.dispatcher.calls), 1)

    def test_semantically_equivalent_payload_replays_despite_json_default_spelling(self):
        explicit = {
            "request_id": "req-semantic",
            "document": "Bracket",
            "object_name": "Body",
            "subelement": "Face4",
            "operation": "resize_hole",
            "diameter_mm": 8.0,
            "point": None,
            "through_all": True,
            "units": "mm",
        }
        implicit = {
            "units": "mm",
            "diameter_mm": 8,
            "operation": "resize_hole",
            "subelement": "Face4",
            "object_name": "Body",
            "document": "Bracket",
            "request_id": "req-semantic",
        }
        self.dispatcher.result = {"patch_id": "patch-semantic"}

        first = self.request(
            "POST", "/patches", body=explicit, headers=self.auth_headers(Origin=self.origin)
        )
        second = self.request(
            "POST", "/patches", body=implicit, headers=self.auth_headers(Origin=self.origin)
        )

        self.assertEqual(first[0], 201)
        self.assertEqual(second[0], 200)
        self.assertEqual(second[2], first[2])
        self.assertEqual(len(self.dispatcher.calls), 1)

    def test_request_id_payload_conflict_returns_conflict(self):
        payload = {
            "request_id": "req-conflict",
            "object_name": "Body",
            "subelement": "Face4",
            "operation": "resize_hole",
            "diameter_mm": 8,
            "units": "mm",
        }
        self.dispatcher.result = {"patch_id": "patch-conflict"}

        first = self.request(
            "POST", "/patches", body=payload, headers=self.auth_headers(Origin=self.origin)
        )
        payload["diameter_mm"] = 9
        second = self.request(
            "POST", "/patches", body=payload, headers=self.auth_headers(Origin=self.origin)
        )

        self.assertEqual(first[0], 201)
        self.assertEqual(second[0], 409)
        self.assertEqual(second[2]["error"]["code"], "IDEMPOTENCY_CONFLICT")
        self.assertEqual(len(self.dispatcher.calls), 1)

    def test_persisted_idempotent_result_uses_replay_status_after_restart(self):
        payload = {
            "request_id": "req-persisted",
            "object_name": "Body",
            "subelement": "Face4",
            "operation": "resize_hole",
            "diameter_mm": 8,
            "units": "mm",
        }
        self.dispatcher.result = {
            "patch_id": "patch-persisted",
            "idempotent": True,
        }

        status, _, body = self.request(
            "POST", "/patches", body=payload, headers=self.auth_headers(Origin=self.origin)
        )

        self.assertEqual(status, 200)
        self.assertTrue(body["idempotent"])

    def test_mutation_routes_dispatch_named_gui_work(self):
        cases = [
            ("PATCH", "/patches/patch-7/diameter", {"diameter_mm": 9, "units": "mm"}, "update_diameter"),
            ("PATCH", "/patches/patch-7/enabled", {"enabled": False}, "set_enabled"),
        ]

        for method, path, payload, expected_action in cases:
            with self.subTest(path=path):
                status, _, body = self.request(
                    method,
                    path,
                    body=payload,
                    headers=self.auth_headers(Origin=self.origin),
                )
                self.assertEqual(status, 200)
                self.assertEqual(body, {"ok": True})
                self.assertEqual(self.dispatcher.calls[-1][0], expected_action)


class GuiThreadDispatcherTests(unittest.TestCase):
    def test_http_thread_only_enqueues_until_gui_drain(self):
        dispatcher = GuiThreadDispatcher()
        result = []

        worker = threading.Thread(
            target=lambda: result.append(dispatcher.submit("selection", {}, timeout_s=1))
        )
        worker.start()
        time.sleep(0.02)

        self.assertEqual(result, [])
        self.assertTrue(dispatcher.drain_one(lambda action, payload: {"action": action}))
        worker.join(timeout=1)
        self.assertEqual(result, [{"action": "selection"}])

    def test_waiting_http_thread_times_out_without_gui_drain(self):
        dispatcher = GuiThreadDispatcher()

        with self.assertRaises(TimeoutError):
            dispatcher.submit("selection", {}, timeout_s=0.01)

    def test_timeout_cannot_escape_after_gui_execution_has_started(self):
        dispatcher = GuiThreadDispatcher()
        started = threading.Event()
        release = threading.Event()
        results = []
        errors = []

        def submit():
            try:
                results.append(dispatcher.submit("create_patch", {}, timeout_s=0.1))
            except BaseException as exc:
                errors.append(exc)

        def execute_on_gui_thread():
            while not dispatcher.drain_one(
                lambda _action, _payload: (
                    started.set(),
                    release.wait(timeout=1),
                    {"patch_id": "patch-1"},
                )[-1]
            ):
                time.sleep(0.001)

        request_thread = threading.Thread(target=submit)
        gui_thread = threading.Thread(target=execute_on_gui_thread)
        request_thread.start()
        gui_thread.start()
        self.assertTrue(started.wait(timeout=1))

        try:
            time.sleep(0.12)
            self.assertTrue(request_thread.is_alive())
            self.assertEqual(errors, [])
        finally:
            release.set()
            request_thread.join(timeout=1)
            gui_thread.join(timeout=1)

        self.assertEqual(errors, [])
        self.assertEqual(results, [{"patch_id": "patch-1"}])


if __name__ == "__main__":
    unittest.main()
