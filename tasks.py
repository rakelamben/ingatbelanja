from __future__ import annotations

import argparse
import importlib.util
import os
import secrets
import subprocess
import sys
import venv
from pathlib import Path
from importlib.metadata import version

from backend.app.config import Settings
from backend.app.db import assert_integrity, connect, migrate
from backend.app.worker import Worker, cleanup as worker_cleanup
from backend.app.security import password_hash, validate_password


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
