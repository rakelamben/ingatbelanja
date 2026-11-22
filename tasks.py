from __future__ import annotations

import argparse
import importlib.util
import os
import secrets
import shutil
import subprocess
import sys
import venv
import zipfile
from datetime import date, timedelta
from pathlib import Path
from importlib.metadata import version

from backend.app.config import Settings
from backend.app.db import assert_integrity, connect, migrate, tx
from backend.app.worker import Worker, cleanup as worker_cleanup
from backend.app.security import password_hash, validate_password
from backend.app.utils import utc_now


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "storage"
VENV = ROOT / ".venv"
VENV_PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(command: list[str], cwd: Path = ROOT, *, check: bool = True) -> None:
    if os.name == "nt" and command and command[0] == "npm":
        command = ["npm.cmd", *command[1:]]
    print("$", " ".join(command))
    subprocess.run(command, cwd=cwd, check=check)


def python_for_tasks() -> str:
    return str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable


def setup() -> None:
    if not VENV_PYTHON.exists():
        print(f"Membuat virtual environment di {VENV}")
        venv.EnvBuilder(with_pip=True).create(VENV)
    run([str(VENV_PYTHON), "-m", "pip", "install", "--upgrade", "pip"])
    run(
        [
            str(VENV_PYTHON),
            "-m",
            "pip",
            "install",
            "-r",
            str(BACKEND / "requirements-dev.txt"),
        ]
    )
    run(["npm", "install"], FRONTEND)
    STORAGE.mkdir(exist_ok=True)
    print("Setup selesai. Jalankan: python tasks.py doctor")


def doctor() -> int:
    checks: list[tuple[str, bool, str]] = []
    checks.append(
        ("Python 3.12", sys.version_info[:2] == (3, 12), sys.version.split()[0])
    )
    try:
        if (
            importlib.util.find_spec("flask") is None
            or importlib.util.find_spec("pydantic_settings") is None
        ):
            raise ImportError("Flask or pydantic-settings is unavailable")
        checks.append(("Backend imports", True, f"Flask {version('Flask')}"))
    except ImportError as error:
        checks.append(("Backend imports", False, str(error)))
    checks.append(("storage writable", os.access(STORAGE, os.W_OK), str(STORAGE)))
    checks.append(
        ("frontend package", (FRONTEND / "package.json").exists(), "package.json")
    )
    checks.append(
        ("frontend dependencies", (FRONTEND / "node_modules").exists(), "node_modules")
    )
    failed = False
    for name, passed, detail in checks:
        print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}")
        failed |= not passed
    return 1 if failed else 0


def backend_test() -> None:
    run([python_for_tasks(), "-m", "pytest", "backend/tests"])


def migrate_database() -> None:
    settings = Settings()
    settings.ensure_directories()
    connection = connect(settings.database_path)
    try:
        applied = migrate(connection)
        assert_integrity(connection)
        print(f"Database schema version: {applied}")
    finally:
        connection.close()


def cleanup_storage() -> None:
    settings = Settings()
    settings.ensure_directories()
    result = worker_cleanup(settings, dry_run=False)
    print(f"Cleanup selesai: {result}")


def _backup_root(settings: Settings) -> Path:
    return settings.storage_dir / "backups"


def _assert_database_stopped(database_path: Path) -> None:
    """Fail closed when another process currently has the SQLite DB open."""
    connection = connect(database_path)
    try:
        connection.execute("BEGIN EXCLUSIVE")
        connection.execute("ROLLBACK")
    except Exception as error:
        raise SystemExit(
            "Database sedang dipakai. Matikan API dan worker sebelum restore."
        ) from error
    finally:
        connection.close()


def backup_database() -> None:
    settings = Settings()
    settings.ensure_directories()
    migrate_database()
    root = _backup_root(settings)
    root.mkdir(parents=True, exist_ok=True)
    stamp = utc_now().replace("-", "").replace(":", "").replace("+00:00", "")
    destination = root / f"ingatbelanjaan-{stamp}"
    temporary = root / f".{destination.name}.tmp"
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)
    try:
        source = connect(settings.database_path)
        target_path = temporary / "database.sqlite3"
        target = connect(target_path)
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()
        receipts = settings.storage_dir / "receipts"
        with zipfile.ZipFile(temporary / "receipts.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            if receipts.exists():
                for path in receipts.rglob("*"):
                    if path.is_file():
                        archive.write(path, path.relative_to(receipts).as_posix())
        (temporary / "manifest.txt").write_text(
            f"created_at={utc_now()}\nschema_version={schema_version_from_path(target_path)}\n",
            encoding="utf-8",
        )
        temporary.rename(destination)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    backups = sorted((path for path in root.glob("ingatbelanjaan-*") if path.is_dir()), reverse=True)
    for old in backups[settings.backup_keep :]:
        shutil.rmtree(old)
    print(f"Backup dibuat: {destination}")


def schema_version_from_path(path: Path) -> int:
    connection = connect(path)
    try:
        return int(connection.execute("PRAGMA user_version").fetchone()[0])
    finally:
        connection.close()


def restore_database(folder: str) -> None:
    settings = Settings()
    settings.ensure_directories()
    source_dir = Path(folder).expanduser().resolve()
    source_db = source_dir / "database.sqlite3"
    source_receipts = source_dir / "receipts.zip"
    if not source_db.is_file():
        raise SystemExit(f"Backup database tidak ditemukan: {source_db}")
    _assert_database_stopped(settings.database_path)
    check = connect(source_db)
    try:
        assert_integrity(check)
    finally:
        check.close()
    temporary_db = settings.database_path.with_suffix(".restore.tmp")
    shutil.copy2(source_db, temporary_db)
    os.replace(temporary_db, settings.database_path)
    if source_receipts.is_file():
        extracted = settings.storage_dir / ".receipts.restore"
        if extracted.exists():
            shutil.rmtree(extracted)
        extracted.mkdir()
        with zipfile.ZipFile(source_receipts) as archive:
            for member in archive.infolist():
                target = (extracted / member.filename).resolve()
                if extracted.resolve() not in target.parents:
                    raise SystemExit("Backup receipts berisi path yang tidak aman")
            archive.extractall(extracted)
        receipts = settings.storage_dir / "receipts"
        if receipts.exists():
            shutil.rmtree(receipts)
        extracted.rename(receipts)
    print(f"Restore selesai dari: {source_dir}")


def demo_data() -> None:
    settings = Settings()
    settings.ensure_directories()
    connection = connect(settings.database_path)
    try:
        migrate(connection)
        now = utc_now()
        users = {}
        with tx(connection, write=True):
            for username, display_name in (("demo_alice", "Demo Alice"), ("demo_bob", "Demo Bob")):
                user = connection.execute(
                    "SELECT id FROM users WHERE username_norm = ? AND deleted_at IS NULL",
                    (username,),
                ).fetchone()
                if user is None:
                    user_id = f"demo-user-{username.removeprefix('demo_')}"
                    connection.execute(
                        "INSERT INTO users(id, username, username_norm, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (user_id, username, username, display_name, password_hash("demo-password-123"), now),
                    )
                else:
                    user_id = user["id"]
                users[username] = user_id
            personal = {}
            for username in users:
                ledger = connection.execute(
                    "SELECT id FROM ledgers WHERE owner_id = ? AND type = 'personal' AND deleted_at IS NULL",
                    (users[username],),
                ).fetchone()
                if ledger is None:
                    ledger_id = f"demo-ledger-{username.removeprefix('demo_')}"
                    connection.execute(
                        "INSERT INTO ledgers(id, name, type, currency_code, owner_id, created_at) VALUES (?, ?, 'personal', 'IDR', ?, ?)",
                        (ledger_id, "Buku Pribadi", users[username], now),
                    )
                    connection.execute(
                        "INSERT INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
                        (ledger_id, users[username], now),
                    )
                else:
                    ledger_id = ledger["id"]
                personal[username] = ledger_id
            tracker_id = "demo-tracker-rumah"
            connection.execute(
                "INSERT OR IGNORE INTO ledgers(id, name, type, currency_code, owner_id, created_at) VALUES (?, 'Rumah Demo', 'tracker', 'IDR', ?, ?)",
                (tracker_id, users["demo_alice"], now),
            )
            for username in users:
                connection.execute(
                    "INSERT OR IGNORE INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
                    (tracker_id, users[username], "owner" if username == "demo_alice" else "member", now),
                )
            merchants = ("Pasar Demo", "Warung Demo", "Minimarket Demo", "Apotek Demo")
            for index in range(20):
                receipt_id = f"demo-receipt-{index + 1:02d}"
                purchased = (date.today() - timedelta(days=index)).isoformat()
                amount = 25_000 + (index * 7_500)
                connection.execute(
                    "INSERT OR IGNORE INTO receipts(id, ledger_id, created_by, status, merchant, merchant_norm, purchased_on, currency_code, total_minor, total_ledger_minor, source, created_at, updated_at) VALUES (?, ?, ?, 'confirmed', ?, ?, ?, 'IDR', ?, ?, 'manual', ?, ?)",
                    (receipt_id, tracker_id, users["demo_alice" if index % 2 == 0 else "demo_bob"], merchants[index % len(merchants)], merchants[index % len(merchants)].casefold(), purchased, amount, amount, now, now),
                )
        print("Data demo siap. User: demo_alice / demo_bob. Password: demo-password-123")
    finally:
        connection.close()


def run_worker() -> None:
    settings = Settings()
    settings.ensure_directories()
    Worker(settings).run_forever()


def admin_reset_password(username: str, new_password: str | None) -> None:
    if not username:
        raise SystemExit(
            "Usage: python tasks.py admin reset-password <username> [new-password]"
        )
    password = new_password or secrets.token_urlsafe(16)
    validate_password(password)
    settings = Settings()
    connection = connect(settings.database_path)
    try:
        with connection:
            user = connection.execute(
                "SELECT id FROM users WHERE username_norm = ? AND deleted_at IS NULL",
                (username.casefold(),),
            ).fetchone()
            if not user:
                raise SystemExit("User not found")
            connection.execute(
                "UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?",
                (password_hash(password), user["id"]),
            )
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
    finally:
        connection.close()
    print(f"Password reset untuk {username}. Password baru: {password}")


def backend_lint() -> None:
    run([python_for_tasks(), "-m", "ruff", "check", "backend"])


def frontend_build() -> None:
    run(["npm", "run", "build"], FRONTEND)


def frontend_test() -> None:
    run(["npm", "run", "test"], FRONTEND)


def quality_gate() -> None:
    """Run the local merge gate in the same order as CI."""
    migrate_database()
    backend_test()
    frontend_test()
    backend_lint()
    run(["npm", "run", "lint"], FRONTEND)
    frontend_build()
    if doctor() != 0:
        raise SystemExit("Doctor gate failed")


def dev() -> None:
    print(
        "Menjalankan backend development server. UI dijalankan di terminal kedua dengan `npm run dev` di frontend/."
    )
    api()


def api() -> None:
    run(
        [
            python_for_tasks(),
            "-m",
            "flask",
            "--app",
            "backend.app.wsgi:app",
            "run",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Perintah pengembangan IngatBelanjaan")
    parser.add_argument(
        "command",
        choices=[
            "setup",
            "doctor",
            "test",
            "quality",
            "lint",
            "build",
            "dev",
            "api",
            "worker",
            "migrate",
            "cleanup",
            "demo",
            "backup",
            "restore",
            "admin",
        ],
    )
    parser.add_argument("subcommand", nargs="?")
    parser.add_argument("username", nargs="?")
    parser.add_argument("new_password", nargs="?")
    args = parser.parse_args()
    commands = {
        "setup": setup,
        "doctor": doctor,
        "lint": lambda: (backend_lint(), run(["npm", "run", "lint"], FRONTEND)),
        "test": lambda: (backend_test(), frontend_test()),
        "quality": quality_gate,
        "build": frontend_build,
        "dev": dev,
        "api": api,
        "worker": run_worker,
        "migrate": migrate_database,
        "cleanup": cleanup_storage,
        "demo": demo_data,
        "backup": backup_database,
        "restore": lambda: restore_database(args.subcommand or ""),
    }
    if args.command == "admin":
        if args.subcommand != "reset-password":
            raise SystemExit(
                "Usage: python tasks.py admin reset-password <username> [new-password]"
            )
        admin_reset_password(args.username, args.new_password)
        return 0
    result = commands[args.command]()
    return result if isinstance(result, int) else 0


if __name__ == "__main__":
    raise SystemExit(main())
