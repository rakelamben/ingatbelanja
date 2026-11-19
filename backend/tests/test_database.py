import sqlite3

import pytest
from app.db import assert_integrity, connect, migrate, schema_version, tx


def test_empty_database_migrates_and_seeds(tmp_path) -> None:
    database = tmp_path / "db" / "test.sqlite3"
    connection = connect(database)
    try:
        assert schema_version(connection) == 0
        assert migrate(connection) == 5
        assert schema_version(connection) == 5
        assert connection.execute("SELECT COUNT(*) FROM currencies").fetchone()[0] == 13
        assert connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 7
        assert_integrity(connection)
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    finally:
        connection.close()


def test_migration_is_idempotent(tmp_path) -> None:
    connection = connect(tmp_path / "test.sqlite3")
    try:
        assert migrate(connection) == 5
        assert migrate(connection) == 5
        assert connection.execute("SELECT COUNT(*) FROM currencies").fetchone()[0] == 13
    finally:
        connection.close()


def test_write_transaction_rolls_back(tmp_path) -> None:
    connection = connect(tmp_path / "test.sqlite3")
    try:
        migrate(connection)
        with pytest.raises(sqlite3.IntegrityError):
            with tx(connection, write=True):
                connection.execute(
                    "INSERT INTO currencies(code, name, symbol, minor_unit) VALUES (?, ?, ?, ?)",
                    ("BAD", "Bad", "?", 99),
                )
        count = connection.execute("SELECT COUNT(*) FROM currencies WHERE code = 'BAD'").fetchone()[
            0
        ]
        assert count == 0
    finally:
        connection.close()
