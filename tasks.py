from __future__ import annotations

import argparse
import os
import subprocess
import sys
import venv
from pathlib import Path
from importlib.metadata import version

from backend.app.config import Settings
from backend.app.db import assert_integrity, connect, migrate, schema_version
from backend.app.storage import cleanup_orphans


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
    run([str(VENV_PYTHON), "-m", "pip", "install", "-r", str(BACKEND / "requirements-dev.txt")])
    run(["npm", "install"], FRONTEND)
    STORAGE.mkdir(exist_ok=True)
    print("Setup selesai. Jalankan: python tasks.py doctor")


def doctor() -> int:
    checks: list[tuple[str, bool, str]] = []
    checks.append(("Python 3.12", sys.version_info[:2] == (3, 12), sys.version.split()[0]))
    try:
        import flask  # noqa: PLC0415
        import pydantic_settings  # noqa: PLC0415

        checks.append(("Backend imports", True, f"Flask {version('Flask')}"))
    except ImportError as error:
        checks.append(("Backend imports", False, str(error)))
    checks.append(("storage writable", os.access(STORAGE, os.W_OK), str(STORAGE)))
    checks.append(("frontend package", (FRONTEND / "package.json").exists(), "package.json"))
    checks.append(("frontend dependencies", (FRONTEND / "node_modules").exists(), "node_modules"))
    failed = False
    for name, passed, detail in checks:
        print(f"[{ 'PASS' if passed else 'FAIL' }] {name}: {detail}")
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
    orphaned = cleanup_orphans(settings.storage_dir, settings.database_path, dry_run=False)
    print(f"Removed orphan files: {len(orphaned)}")


def backend_lint() -> None:
    run([python_for_tasks(), "-m", "ruff", "check", "backend"])


def frontend_build() -> None:
    run(["npm", "run", "build"], FRONTEND)


def frontend_test() -> None:
    run(["npm", "run", "test"], FRONTEND)


def dev() -> None:
    print("Menjalankan backend development server. UI dijalankan di terminal kedua dengan `npm run dev` di frontend/.")
    api()


def api() -> None:
    run([python_for_tasks(), "-m", "flask", "--app", "backend.app.wsgi:app", "run", "--host", "0.0.0.0", "--port", "8000"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Perintah pengembangan IngatBelanjaan")
    parser.add_argument(
        "command",
        choices=["setup", "doctor", "test", "lint", "build", "dev", "api", "migrate", "cleanup"],
    )
    args = parser.parse_args()
    commands = {
        "setup": setup,
        "doctor": doctor,
        "lint": lambda: (backend_lint(), run(["npm", "run", "lint"], FRONTEND)),
        "test": lambda: (backend_test(), frontend_test()),
        "build": frontend_build,
        "dev": dev,
        "api": api,
        "migrate": migrate_database,
        "cleanup": cleanup_storage,
    }
    result = commands[args.command]()
    return result if isinstance(result, int) else 0


if __name__ == "__main__":
    raise SystemExit(main())
