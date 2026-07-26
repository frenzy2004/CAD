"""Authenticated loopback HTTP transport and GUI-thread work queue."""

from __future__ import annotations

from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import queue
import re
import secrets
import threading
from typing import Callable, Literal, Mapping, Protocol
from urllib.parse import unquote, urlsplit

from .protocol import (
    IdempotencyConflict,
    ProtocolError,
    RequestIdCache,
    parse_patch_request,
    patch_request_fingerprint,
)


DEFAULT_MAX_BODY_BYTES = 64 * 1024
DEFAULT_REQUEST_TIMEOUT_S = 15.0
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://patchcad.vercel.app",
)
_PATCH_PATH = re.compile(r"^/patches/([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})/(diameter|enabled)$")


class Dispatcher(Protocol):
    def submit(self, action: str, payload: object, timeout_s: float) -> object: ...


@dataclass
class _WorkItem:
    action: str
    payload: object
    completed: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)
    state: Literal["queued", "running", "cancelled", "completed"] = "queued"
    result: object = None
    error: BaseException | None = None


class GuiThreadDispatcher:
    """Queue work from HTTP threads for explicit draining on FreeCAD's GUI thread."""

    def __init__(self) -> None:
        self._queue: queue.Queue[_WorkItem] = queue.Queue()

    def submit(self, action: str, payload: object, timeout_s: float) -> object:
        item = _WorkItem(action=action, payload=payload)
        self._queue.put(item)
        if not item.completed.wait(timeout_s):
            with item.lock:
                if item.state == "queued":
                    item.state = "cancelled"
                    item.completed.set()
                    raise TimeoutError("FreeCAD GUI thread did not respond in time")
                running = item.state == "running"
            if running:
                item.completed.wait()
        if item.error is not None:
            raise item.error
        return item.result

    def drain_one(self, handler: Callable[[str, object], object]) -> bool:
        try:
            item = self._queue.get_nowait()
        except queue.Empty:
            return False
        with item.lock:
            if item.state != "queued":
                return True
            item.state = "running"
        result: object = None
        error: BaseException | None = None
        try:
            result = handler(item.action, item.payload)
        except BaseException as exc:
            error = exc
        finally:
            with item.lock:
                item.result = result
                item.error = error
                item.state = "completed"
                item.completed.set()
        return True

    def drain(self, handler: Callable[[str, object], object], limit: int = 32) -> int:
        drained = 0
        while drained < limit and self.drain_one(handler):
            drained += 1
        return drained


class BridgeApplication:
    """Configuration and route logic shared by all request-handler threads."""

    def __init__(
        self,
        dispatcher: Dispatcher,
        *,
        token: str | None = None,
        allowed_origins: tuple[str, ...] = ("http://localhost:3000",),
        request_timeout_s: float = DEFAULT_REQUEST_TIMEOUT_S,
        max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
    ) -> None:
        if not allowed_origins or any(origin == "*" for origin in allowed_origins):
            raise ValueError("allowed_origins must contain exact origins, never wildcards")
        self.dispatcher = dispatcher
        self.token = token or secrets.token_urlsafe(32)
        self.allowed_origins = frozenset(allowed_origins)
        self.request_timeout_s = request_timeout_s
        self.max_body_bytes = max_body_bytes
        self.request_cache = RequestIdCache()

    def dispatch(self, action: str, payload: object) -> object:
        return self.dispatcher.submit(action, payload, self.request_timeout_s)

    def create_patch(self, raw_body: bytes) -> tuple[object, bool]:
        request = parse_patch_request(raw_body)
        fingerprint = patch_request_fingerprint(request)
        created = False

        def apply() -> object:
            nonlocal created
            created = True
            return self.dispatch("create_patch", request)

        result = self.request_cache.run(
            request.request_id, apply, fingerprint=fingerprint
        )
        if isinstance(result, Mapping) and result.get("idempotent") is True:
            created = False
        return result, created


class _LoopbackHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], app: BridgeApplication):
        self.app = app
        super().__init__(address, _BridgeRequestHandler)


class BridgeServer:
    """Lifecycle wrapper that cannot bind beyond IPv4 loopback."""

    def __init__(self, app: BridgeApplication, *, port: int = 0) -> None:
        self._server = _LoopbackHTTPServer(("127.0.0.1", port), app)
        self._thread: threading.Thread | None = None

    @property
    def address(self) -> tuple[str, int]:
        host, port = self._server.server_address
        return str(host), int(port)

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            name="PatchCAD-loopback-bridge",
            daemon=True,
        )
        self._thread.start()

    def close(self) -> None:
        if self._thread is None:
            return
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=2)
        self._thread = None


class GuiBridgeRuntime:
    """Own the loopback server and a Qt timer created on FreeCAD's GUI thread."""

    def __init__(
        self,
        handler: Callable[[str, object], object],
        *,
        port: int = 8765,
        allowed_origins: tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS,
        request_timeout_s: float = DEFAULT_REQUEST_TIMEOUT_S,
        max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
    ) -> None:
        qt_core = _qt_core()
        self.dispatcher = GuiThreadDispatcher()
        self.application = BridgeApplication(
            self.dispatcher,
            allowed_origins=allowed_origins,
            request_timeout_s=request_timeout_s,
            max_body_bytes=max_body_bytes,
        )
        self.server = BridgeServer(self.application, port=port)
        self._handler = handler
        self._timer = qt_core.QTimer()
        self._timer.setInterval(25)
        self._timer.timeout.connect(self._drain)

    @property
    def token(self) -> str:
        return self.application.token

    @property
    def address(self) -> tuple[str, int]:
        return self.server.address

    def start(self) -> None:
        self._timer.start()
        self.server.start()

    def close(self) -> None:
        self.server.close()
        self._timer.stop()

    def _drain(self) -> None:
        self.dispatcher.drain(self._handler)


def _qt_core():
    import importlib

    for module_name in ("PySide.QtCore", "PySide6.QtCore", "PySide2.QtCore"):
        try:
            return importlib.import_module(module_name)
        except ImportError:
            continue
    raise RuntimeError("FreeCAD Qt bindings are unavailable")


class _BridgeRequestHandler(BaseHTTPRequestHandler):
    server_version = "PatchCADBridge/0.1"
    sys_version = ""

    @property
    def app(self) -> BridgeApplication:
        return self.server.app  # type: ignore[attr-defined]

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin")
        if origin not in self.app.allowed_origins:
            self._error(HTTPStatus.FORBIDDEN, "ORIGIN_NOT_ALLOWED", "origin is not allowed")
            return
        requested_method = self.headers.get("Access-Control-Request-Method")
        if requested_method not in {"GET", "POST", "PATCH"}:
            self._error(HTTPStatus.BAD_REQUEST, "INVALID_PREFLIGHT", "method is not allowed")
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers(origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        self._handle()

    def do_POST(self) -> None:
        self._handle()

    def do_PATCH(self) -> None:
        self._handle()

    def _handle(self) -> None:
        origin = self.headers.get("Origin")
        if origin is not None and origin not in self.app.allowed_origins:
            self._error(HTTPStatus.FORBIDDEN, "ORIGIN_NOT_ALLOWED", "origin is not allowed")
            return
        authorization = self.headers.get("Authorization", "")
        expected = f"Bearer {self.app.token}"
        if not secrets.compare_digest(authorization, expected):
            self._error(HTTPStatus.UNAUTHORIZED, "UNAUTHORIZED", "valid bearer token required")
            return

        path = urlsplit(self.path).path
        try:
            if self.command == "GET" and path == "/health":
                self._json(HTTPStatus.OK, {"status": "ok"})
                return
            if self.command == "GET" and path == "/selection":
                self._json(HTTPStatus.OK, self.app.dispatch("selection", {}))
                return
            if self.command == "POST" and path == "/patches":
                result, created = self.app.create_patch(self._read_body())
                self._json(HTTPStatus.CREATED if created else HTTPStatus.OK, result)
                return

            match = _PATCH_PATH.fullmatch(path)
            if self.command == "PATCH" and match:
                patch_id, operation = unquote(match.group(1)), match.group(2)
                body = self._json_body()
                if operation == "diameter":
                    payload = self._diameter_payload(patch_id, body)
                    self._json(HTTPStatus.OK, self.app.dispatch("update_diameter", payload))
                else:
                    payload = self._enabled_payload(patch_id, body)
                    self._json(HTTPStatus.OK, self.app.dispatch("set_enabled", payload))
                return
            self._error(HTTPStatus.NOT_FOUND, "NOT_FOUND", "endpoint not found")
        except IdempotencyConflict as exc:
            self._error(
                HTTPStatus.CONFLICT,
                "IDEMPOTENCY_CONFLICT",
                str(exc),
            )
        except ProtocolError as exc:
            self._error(HTTPStatus.BAD_REQUEST, "INVALID_REQUEST", str(exc))
        except _BodyTooLarge:
            self._error(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                "BODY_TOO_LARGE",
                "request body exceeds the configured limit",
            )
        except TimeoutError:
            self._error(
                HTTPStatus.GATEWAY_TIMEOUT,
                "GUI_TIMEOUT",
                "FreeCAD GUI thread did not respond in time",
            )
        except Exception:
            self._error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "request could not be completed",
            )

    def _read_body(self) -> bytes:
        if self.headers.get("Transfer-Encoding"):
            raise ProtocolError("chunked request bodies are not supported")
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ProtocolError("Content-Length is required")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ProtocolError("Content-Length must be an integer") from exc
        if length < 0:
            raise ProtocolError("Content-Length must not be negative")
        if length > self.app.max_body_bytes:
            raise _BodyTooLarge
        body = self.rfile.read(length)
        if len(body) != length:
            raise ProtocolError("request body ended before Content-Length")
        return body

    def _json_body(self) -> dict[str, object]:
        raw = self._read_body()
        try:
            value = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProtocolError("request body must be valid UTF-8 JSON") from exc
        if not isinstance(value, dict):
            raise ProtocolError("request body must be a JSON object")
        return value

    def _diameter_payload(
        self, patch_id: str, body: Mapping[str, object]
    ) -> dict[str, object]:
        if set(body) != {"diameter_mm", "units"}:
            raise ProtocolError("diameter update requires only diameter_mm and units")
        if body["units"] != "mm":
            raise ProtocolError("units must be 'mm'")
        diameter = body["diameter_mm"]
        if (
            isinstance(diameter, bool)
            or not isinstance(diameter, (int, float))
            or not math.isfinite(float(diameter))
            or float(diameter) <= 0
        ):
            raise ProtocolError("diameter_mm must be a positive finite number")
        return {"patch_id": patch_id, "diameter_mm": float(diameter)}

    def _enabled_payload(
        self, patch_id: str, body: Mapping[str, object]
    ) -> dict[str, object]:
        if set(body) != {"enabled"} or not isinstance(body.get("enabled"), bool):
            raise ProtocolError("enabled update requires only a boolean enabled field")
        return {"patch_id": patch_id, "enabled": body["enabled"]}

    def _cors_headers(self, origin: str | None = None) -> None:
        origin = origin if origin is not None else self.headers.get("Origin")
        if origin in self.app.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: HTTPStatus, value: object) -> None:
        data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _error(self, status: HTTPStatus, code: str, message: str) -> None:
        self._json(status, {"error": {"code": code, "message": message}})


class _BodyTooLarge(Exception):
    pass
