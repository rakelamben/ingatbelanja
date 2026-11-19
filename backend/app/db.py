from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def connect(path: Path | str) -> sqlite3.Connection:
    database_path = Path(path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, isolation_level=None, timeout=5.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=5000")
    connection.execute("PRAGMA synchronous=NORMAL")
    return connection


@contextmanager
def tx(connection: sqlite3.Connection, *, write: bool = False) -> Iterator[sqlite3.Connection]:
    connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
    try:
        yield connection
        connection.execute("COMMIT")
    except BaseException:
        connection.execute("ROLLBACK")
        raise


def schema_version(connection: sqlite3.Connection) -> int:
    return int(connection.execute("PRAGMA user_version").fetchone()[0])


def _statements(sql: str) -> list[str]:
    statements: list[str] = []
    current = ""
    for line in sql.splitlines(keepends=True):
        current += line
        if sqlite3.complete_statement(current):
            statement = current.strip()
            if statement:
                statements.append(statement)
            current = ""
    if current.strip():
        statements.append(current.strip())
    return statements


def migrations() -> list[tuple[int, Path]]:
    result: list[tuple[int, Path]] = []
    for path in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.sql")):
        result.append((int(path.name[:4]), path))
    return result


def migrate(connection: sqlite3.Connection) -> int:
    current = schema_version(connection)
    for version, path in migrations():
        if version <= current:
            continue
        sql = path.read_text(encoding="utf-8")
        with tx(connection, write=True):
            for statement in _statements(sql):
                connection.execute(statement)
            connection.execute(f"PRAGMA user_version = {version}")
            violations = connection.execute("PRAGMA foreign_key_check").fetchall()
            if violations:
                raise sqlite3.IntegrityError(f"foreign key violations after migration {version}")
        current = version
    return current


def assert_integrity(connection: sqlite3.Connection) -> None:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise sqlite3.DatabaseError(f"SQLite integrity_check failed: {integrity}")
    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise sqlite3.IntegrityError(f"foreign_key_check returned {len(violations)} rows")
