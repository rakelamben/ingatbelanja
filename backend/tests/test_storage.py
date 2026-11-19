from app.db import connect, migrate
from app.storage import cleanup_orphans, write_atomic


def test_write_atomic_replaces_file_without_temp_leftovers(tmp_path) -> None:
    relative = write_atomic(tmp_path / "storage", "receipts/a.txt", b"hello")

    assert relative.as_posix() == "receipts/a.txt"
    assert (tmp_path / "storage" / "receipts" / "a.txt").read_bytes() == b"hello"
    assert list((tmp_path / "storage" / "receipts").glob("*.tmp")) == []


def test_cleanup_orphans_dry_run_and_delete(tmp_path) -> None:
    storage = tmp_path / "storage"
    database = tmp_path / "database.sqlite3"
    write_atomic(storage, "receipts/known.txt", b"known")
    write_atomic(storage, "receipts/orphan.txt", b"orphan")
    connection = connect(database)
    try:
        migrate(connection)
        connection.execute(
            "INSERT INTO users(id, username, username_norm, password_hash, created_at) "
            "VALUES ('u', 'u', 'u', 'hash', '2026-01-01T00:00:00Z')"
        )
    finally:
        connection.close()

    # No image row references either file, so both are candidates.
    candidates = cleanup_orphans(storage, database, dry_run=True)
    assert {path.as_posix() for path in candidates} == {"receipts/known.txt", "receipts/orphan.txt"}
    cleanup_orphans(storage, database, dry_run=False)
    assert not (storage / "receipts" / "orphan.txt").exists()
