"""Crash-safe JSON audit persistence independent of FreeCAD."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
from typing import Mapping


class AuditWriteError(OSError):
    """The CAD transaction committed, but its external audit write failed."""


def audit_path_for(document_path: str | os.PathLike[str]) -> Path:
    return Path(f"{Path(document_path)}.patchcad.audit.json")


def _read_existing(path: Path) -> list[object]:
    if not path.exists():
        return []
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AuditWriteError(f"cannot read existing audit: {exc}") from exc
    if (
        not isinstance(value, dict)
        or value.get("schema_version") != 1
        or not isinstance(value.get("entries"), list)
    ):
        raise AuditWriteError("existing audit has an unsupported schema")
    return list(value["entries"])


def write_audit_entry(
    document_path: str | os.PathLike[str], entry: Mapping[str, object]
) -> Path:
    """Append an entry using a flushed, fsynced, same-directory replacement."""

    destination = audit_path_for(document_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    entries = _read_existing(destination)
    entries.append(dict(entry))
    payload = {"schema_version": 1, "entries": entries}
    temporary_name: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=destination.parent,
            prefix=".patchcad-audit-",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            json.dump(payload, temporary, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, destination)
        temporary_name = None
        return destination
    except OSError as exc:
        raise AuditWriteError(str(exc)) from exc
    finally:
        if temporary_name is not None:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
