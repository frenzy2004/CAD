"""All FreeCAD document mutation, transaction, validation, and audit handling."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib
import math
from pathlib import Path
from typing import Mapping
import uuid

from .audit import write_audit_entry
from .feature import attach_patch_feature, valid_one_solid
from .protocol import IdempotencyConflict, PatchRequest, patch_request_fingerprint
from .selection import (
    SelectionTarget,
    current_selection_payload,
    resolve_request,
)


class PatchServiceError(RuntimeError):
    pass


def _app():
    return importlib.import_module("FreeCAD")


def _quantity_value(value: object) -> float:
    return float(getattr(value, "Value", value))


def _find_patches(document: object, property_name: str, value: str) -> list[object]:
    return [
        obj
        for obj in document.Objects  # type: ignore[attr-defined]
        if getattr(obj, property_name, None) == value and hasattr(obj, "PatchId")
    ]


def _find_patch(document: object, property_name: str, value: str):
    matches = _find_patches(document, property_name, value)
    return matches[0] if matches else None


def _find_request_patch(document: object, request_id: str):
    matches = _find_patches(document, "RequestId", request_id)
    if len(matches) > 1:
        raise IdempotencyConflict(
            "request_id already exists in multiple persisted patches"
        )
    return matches[0] if matches else None


def _open_documents(app: object) -> list[object]:
    documents: list[object] = []
    listed = getattr(app, "listDocuments", None)
    if callable(listed):
        values = listed()
        if not isinstance(values, Mapping):
            raise PatchServiceError("FreeCAD did not return its open document map")
        documents.extend(values.values())
    active = getattr(app, "ActiveDocument", None)
    if active is not None:
        documents.append(active)

    unique: list[object] = []
    for document in documents:
        if not any(document is candidate for candidate in unique):
            unique.append(document)
    return unique


def _find_global_request_patch(app: object, request_id: str):
    matches = [
        patch
        for document in _open_documents(app)
        for patch in _find_patches(document, "RequestId", request_id)
    ]
    if len(matches) > 1:
        raise IdempotencyConflict(
            "request_id already exists in multiple persisted patches"
        )
    return matches[0] if matches else None


def _patch_response(patch: object, *, idempotent: bool = False) -> dict[str, object]:
    return {
        "patch_id": patch.PatchId,  # type: ignore[attr-defined]
        "request_id": patch.RequestId,  # type: ignore[attr-defined]
        "audit_id": patch.AuditId,  # type: ignore[attr-defined]
        "document": patch.Document.Name,  # type: ignore[attr-defined]
        "object_name": patch.Name,  # type: ignore[attr-defined]
        "operation": patch.Operation,  # type: ignore[attr-defined]
        "diameter_mm": _quantity_value(patch.Diameter),  # type: ignore[attr-defined]
        "enabled": bool(patch.Enabled),  # type: ignore[attr-defined]
        "idempotent": idempotent,
    }


def _persisted_replay(
    patch: object, request_fingerprint: str
) -> dict[str, object]:
    if getattr(patch, "RequestFingerprint", "") != request_fingerprint:
        raise IdempotencyConflict(
            "request_id was already used with a different payload"
        )
    response = _patch_response(patch, idempotent=True)
    response["audit_error"] = None
    return response


def _execution_serial(patch: object) -> int:
    proxy = getattr(patch, "Proxy", None)
    serial = getattr(proxy, "execution_serial", None)
    if not isinstance(serial, int):
        raise PatchServiceError("PatchCAD feature has no transient execution token")
    return serial


def _recompute_fresh(document: object, patch: object, previous_serial: int) -> None:
    recomputed = document.recompute()  # type: ignore[attr-defined]
    if not isinstance(recomputed, int) or recomputed <= 0:
        raise PatchServiceError("FreeCAD recompute did not execute the patch")
    state = {str(value).lower() for value in getattr(patch, "State", ())}
    if state.intersection({"invalid", "error"}):
        raise PatchServiceError("FreeCAD recompute reported an invalid patch")
    if hasattr(patch, "isValid") and not patch.isValid():
        raise PatchServiceError("FreeCAD recompute reported an invalid patch")
    if _execution_serial(patch) <= previous_serial:
        raise PatchServiceError("FreeCAD recompute did not produce a fresh patch shape")
    if not valid_one_solid(patch.Shape):  # type: ignore[attr-defined]
        raise PatchServiceError("patch did not produce one valid solid")


def _abort_and_recompute(document: object, transaction_open: bool) -> None:
    if transaction_open:
        try:
            document.abortTransaction()  # type: ignore[attr-defined]
        except Exception:
            pass
    try:
        document.recompute()  # type: ignore[attr-defined]
    except Exception:
        pass


class PatchService:
    def dispatch(self, action: str, payload: object) -> object:
        if action == "selection":
            return current_selection_payload()
        if action == "create_patch" and isinstance(payload, PatchRequest):
            return self.create_patch(payload)
        if action == "update_diameter" and isinstance(payload, dict):
            return self.update_diameter(str(payload["patch_id"]), payload["diameter_mm"])
        if action == "set_enabled" and isinstance(payload, dict):
            return self.set_enabled(str(payload["patch_id"]), bool(payload["enabled"]))
        raise PatchServiceError(f"unsupported dispatcher action: {action}")

    def create_patch(
        self, request: PatchRequest, target: SelectionTarget | None = None
    ) -> dict[str, object]:
        app = _app()
        request_fingerprint = patch_request_fingerprint(request)
        existing = _find_global_request_patch(app, request.request_id)
        if existing is None and target is not None:
            existing = _find_request_patch(
                target.source.Document, request.request_id
            )
        if existing is not None:
            return _persisted_replay(existing, request_fingerprint)

        target = target or resolve_request(request)
        document = target.source.Document
        existing = _find_request_patch(document, request.request_id)
        if existing is not None:
            return _persisted_replay(existing, request_fingerprint)

        patch_id = str(uuid.uuid4())
        audit_id = str(uuid.uuid4())
        patch = None
        transaction_open = False
        try:
            document.openTransaction(f"PatchCAD {request.operation}")
            transaction_open = True
            patch = document.addObject("Part::FeaturePython", "PatchCADPatch")
            patch.Label = f"PatchCAD {request.operation.replace('_', ' ')}"
            attach_patch_feature(
                patch,
                target,
                diameter_mm=request.diameter_mm,
                patch_id=patch_id,
                request_id=request.request_id,
                request_fingerprint=request_fingerprint,
                audit_id=audit_id,
            )
            _recompute_fresh(document, patch, 0)
            if hasattr(target.source, "ViewObject"):
                target.source.ViewObject.Visibility = False
            document.commitTransaction()
            transaction_open = False
        except Exception:
            _abort_and_recompute(document, transaction_open)
            raise

        response = _patch_response(patch)
        response["audit_error"] = self._write_audit(
            document,
            {
                "audit_id": audit_id,
                "request_id": request.request_id,
                "patch_id": patch_id,
                "operation": request.operation,
                "diameter_mm": request.diameter_mm,
                "source": {
                    "document": target.document,
                    "object_name": target.object_name,
                    "subelement": target.subelement,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        return response

    def update_diameter(self, patch_id: str, diameter_mm: float) -> dict[str, object]:
        if isinstance(diameter_mm, bool) or not isinstance(diameter_mm, (int, float)):
            raise PatchServiceError("diameter_mm must be a positive finite number")
        try:
            diameter_mm = float(diameter_mm)
        except OverflowError as exc:
            raise PatchServiceError(
                "diameter_mm must be a positive finite number"
            ) from exc
        if not math.isfinite(diameter_mm) or diameter_mm <= 0:
            raise PatchServiceError("diameter_mm must be a positive finite number")
        patch = self._active_patch(patch_id)
        return self._mutate_patch(
            patch,
            "Update PatchCAD diameter",
            lambda: setattr(patch, "Diameter", diameter_mm),
            {"operation": "update_diameter", "diameter_mm": diameter_mm},
        )

    def set_enabled(self, patch_id: str, enabled: bool) -> dict[str, object]:
        patch = self._active_patch(patch_id)
        return self._mutate_patch(
            patch,
            "Toggle PatchCAD patch",
            lambda: setattr(patch, "Enabled", enabled),
            {"operation": "set_enabled", "enabled": enabled},
        )

    def _active_patch(self, patch_id: str):
        document = _app().ActiveDocument
        if document is None:
            raise PatchServiceError("no active FreeCAD document")
        patch = _find_patch(document, "PatchId", patch_id)
        if patch is None:
            raise PatchServiceError(f"patch {patch_id!r} does not exist")
        return patch

    def _mutate_patch(
        self,
        patch: object,
        label: str,
        mutation,
        audit_fields: dict[str, object],
    ) -> dict[str, object]:
        document = patch.Document  # type: ignore[attr-defined]
        previous_serial = _execution_serial(patch)
        transaction_open = False
        try:
            document.openTransaction(label)
            transaction_open = True
            mutation()
            _recompute_fresh(document, patch, previous_serial)
            document.commitTransaction()
            transaction_open = False
        except Exception:
            _abort_and_recompute(document, transaction_open)
            raise

        entry = {
            "audit_id": str(uuid.uuid4()),
            "patch_id": patch.PatchId,  # type: ignore[attr-defined]
            "request_id": patch.RequestId,  # type: ignore[attr-defined]
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **audit_fields,
        }
        response = _patch_response(patch)
        response["audit_error"] = self._write_audit(document, entry)
        return response

    def _write_audit(
        self, document: object, entry: dict[str, object]
    ) -> dict[str, str] | None:
        filename = str(getattr(document, "FileName", ""))
        if not filename:
            return {
                "code": "AUDIT_WRITE_FAILED",
                "message": "save the FreeCAD document before writing its external audit",
            }
        try:
            write_audit_entry(Path(filename), entry)
        except OSError as exc:
            return {"code": "AUDIT_WRITE_FAILED", "message": str(exc)}
        return None
