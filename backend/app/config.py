from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
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
    fx_base_url: str = "https://api.frankfurter.dev/v2"
    fx_timeout_s: float = 5.0
    required_schema_version: int = 5
    max_upload_mb: int = 12
    max_image_pixels: int = 40_000_000
    min_image_short_side: int = 480
    max_original_side: int = 3000
    max_processed_side: int = 2000
    max_thumb_side: int = 480
    ocr_mean_conf_min: float = 0.80
    ocr_low_conf: float = 0.70
    job_lease_s: int = 300
    job_max_attempts: int = 3
    job_retry_delays_s: str = "10,60"
    worker_cycle_s: float = 5.0
    soft_delete_days: int = 30
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    backup_keep: int = 7
    limit_chat_per_day: int = 40
    llm_max_output_tokens: int = 800
    llm_max_tool_calls: int = 5
    groq_base_url: str = "https://api.groq.com/openai/v1"

    @field_validator("ocr_cpu_threads", mode="before")
    @classmethod
    def empty_threads_are_automatic(cls, value):
        return None if value == "" else value

    def ensure_directories(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
