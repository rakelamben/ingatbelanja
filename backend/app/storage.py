from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Iterable

from .db import connect


def _safe_relative_path(relative_path: str | Path) -> Path:
    path = Path(relative_path)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("storage path must be relative and stay inside storage")
    return path


def write_atomic(storage_dir: Path | str, relative_path: str | Path, data: bytes) -> Path:
    root = Path(storage_dir).resolve()
    relative = _safe_relative_path(relative_path)
    destination = (root / relative).resolve()
    if root not in destination.parents:
        raise ValueError("storage path escapes storage directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return relative


def iter_files(storage_dir: Path | str) -> Iterable[Path]:
    root = Path(storage_dir)
    if not root.exists():
        return []
    return (path.relative_to(root) for path in root.rglob("*") if path.is_file())


def cleanup_orphans(
    storage_dir: Path | str, database_path: Path | str, *, dry_run: bool = True
) -> list[Path]:
    root = Path(storage_dir).resolve()
    database = Path(database_path).resolve()
    connection = connect(database_path)
    try:
        known = {
            Path(row[0])
            for row in connection.execute(
                "SELECT original_path FROM receipt_images WHERE original_path IS NOT NULL "
                "UNION SELECT processed_path FROM receipt_images WHERE processed_path IS NOT NULL "
                "UNION SELECT thumb_path FROM receipt_images WHERE thumb_path IS NOT NULL"
            )
        }
    finally:
        connection.close()
    orphaned = [
        path
        for path in iter_files(root)
        if path.parts
        and (root / path).resolve() != database
        and path.name != ".gitkeep"
        and path not in known
    ]
    if not dry_run:
        for relative in orphaned:
            (root / relative).unlink(missing_ok=True)
    return orphaned
