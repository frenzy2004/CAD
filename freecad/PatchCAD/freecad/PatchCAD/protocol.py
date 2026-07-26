"""Strict JSON contracts shared by the FreeCAD service and localhost bridge."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
import threading
from typing import Callable, Literal, Mapping, TypeVar


Operation = Literal["add_hole", "resize_hole"]
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
_PATCH_FIELDS = frozenset(
    {
        "request_id",
        "document",
        "object_name",
        "subelement",
        "operation",
        "diameter_mm",
        "point",
        "through_all",
        "units",
    }
)
_REQUIRED_PATCH_FIELDS = frozenset(
    {"request_id", "object_name", "subelement", "operation", "diameter_mm", "units"}
)
_T = TypeVar("_T")


class ProtocolError(ValueError):
    """A request is not part of the PatchCAD wire contract."""


@dataclass(frozen=True)
class PatchRequest:
    request_id: str
    document: str | None
    object_name: str
    subelement: str
    operation: Operation
    diameter_mm: float
    point: tuple[float, float, float] | None = None
    through_all: bool = True


def _json_object(value: bytes | str | Mapping[str, object]) -> dict[str, object]:
    if isinstance(value, bytes):
        try:
            value = value.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ProtocolError("request body must be UTF-8 JSON") from exc
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ProtocolError("request body must be valid JSON") from exc
    if not isinstance(value, Mapping):
        raise ProtocolError("request body must be a JSON object")
    return dict(value)


def _strict_fields(
    value: Mapping[str, object], allowed: frozenset[str], required: frozenset[str]
) -> None:
    unknown = set(value) - allowed
    if unknown:
        raise ProtocolError(f"unknown field: {sorted(unknown)[0]}")
    missing = required - set(value)
    if missing:
        raise ProtocolError(f"missing field: {sorted(missing)[0]}")


def _identifier(value: object, field: str, *, optional: bool = False) -> str | None:
    if optional and value is None:
        return None
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ProtocolError(f"{field} must be a non-empty identifier")
    return value


def _finite_number(value: object, field: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ProtocolError(f"{field} must be a number")
    result = float(value)
    if not math.isfinite(result) or (positive and result <= 0):
        qualifier = "positive finite" if positive else "finite"
        raise ProtocolError(f"{field} must be a {qualifier} number")
    return result


def parse_patch_request(value: bytes | str | Mapping[str, object]) -> PatchRequest:
    """Parse one fail-closed, millimetre-only patch request."""

    body = _json_object(value)
    _strict_fields(body, _PATCH_FIELDS, _REQUIRED_PATCH_FIELDS)

    if body["units"] != "mm":
        raise ProtocolError("units must be 'mm'")
    operation = body["operation"]
    if operation not in ("add_hole", "resize_hole"):
        raise ProtocolError("operation must be add_hole or resize_hole")

    point_value = body.get("point")
    point = None
    if point_value is not None:
        if (
            not isinstance(point_value, (list, tuple))
            or isinstance(point_value, (str, bytes))
            or len(point_value) != 3
        ):
            raise ProtocolError("point must contain exactly three millimetre coordinates")
        point = tuple(_finite_number(item, "point") for item in point_value)
    if operation == "add_hole" and point is None:
        raise ProtocolError("point is required for add_hole")

    through_all = body.get("through_all", True)
    if not isinstance(through_all, bool):
        raise ProtocolError("through_all must be a boolean")
    if not through_all:
        raise ProtocolError("through_all=false is unsupported without a depth contract")

    return PatchRequest(
        request_id=_identifier(body["request_id"], "request_id"),  # type: ignore[arg-type]
        document=_identifier(body.get("document"), "document", optional=True),
        object_name=_identifier(body["object_name"], "object_name"),  # type: ignore[arg-type]
        subelement=_identifier(body["subelement"], "subelement"),  # type: ignore[arg-type]
        operation=operation,
        diameter_mm=_finite_number(body["diameter_mm"], "diameter_mm", positive=True),
        point=point,  # type: ignore[arg-type]
        through_all=through_all,
    )


class RequestIdCache:
    """Process-local request-result cache with payload-conflict detection."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entries: dict[str, tuple[str | None, object]] = {}

    def run(
        self,
        request_id: str,
        operation: Callable[[], _T],
        *,
        fingerprint: str | None = None,
    ) -> _T:
        with self._lock:
            cached = self._entries.get(request_id)
            if cached is not None:
                cached_fingerprint, result = cached
                if (
                    fingerprint is not None
                    and cached_fingerprint is not None
                    and fingerprint != cached_fingerprint
                ):
                    raise ProtocolError("request_id was already used with a different payload")
                return result  # type: ignore[return-value]

            result = operation()
            self._entries[request_id] = (fingerprint, result)
            return result
