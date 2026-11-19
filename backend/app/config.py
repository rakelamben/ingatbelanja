from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_host: str = "0.0.0.0"
    app_port: int = 8000
    waitress_threads: int = 8
    storage_dir: Path = PROJECT_ROOT / "storage"
    database_path: Path = PROJECT_ROOT / "storage" / "db" / "ingatbelanjaan.sqlite3"
    session_days: int = 14
    cookie_secure: bool = False
    allow_registration: bool = True
    llm_provider: str = "fake"
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    llm_timeout_s: int = 20
    ocr_engine: str = "fake"
    ocr_model_tier: str = "medium"
    ocr_device: str = "cpu"
    ocr_cpu_threads: int | None = None
    ocr_doc_preprocess: bool = False
    log_level: str = "INFO"

    def ensure_directories(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
