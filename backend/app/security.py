from __future__ import annotations

import hashlib
import secrets
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import wraps
from typing import Any
from urllib.parse import urlsplit

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from flask import current_app, g, request

from .db import connect
from .errors import ProblemError
from .utils import new_id, utc_now

PASSWORD_HASHER = PasswordHasher()
DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash("dummy-password-never-accepted")


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def password_hash(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def password_matches(password: str, encoded: str) -> bool:
    try:
        return PASSWORD_HASHER.verify(encoded, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def validate_password(password: str, field: str = "password") -> None:
    if not isinstance(password, str) or not 10 <= len(password) <= 128:
        raise ProblemError(422, "VALIDATION_ERROR", f"{field} must be 10-128 characters")


def validate_username(username: str) -> str:
    if not isinstance(username, str) or not 3 <= len(username) <= 32:
        raise ProblemError(422, "VALIDATION_ERROR", "username must be 3-32 characters")
    if not all(char.isalnum() or char == "_" for char in username):
        raise ProblemError(
            422, "VALIDATION_ERROR", "username may contain only letters, numbers, and _"
        )
    return username.casefold()


def create_session(connection, user_id: str) -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    raw_csrf = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    expires = now + timedelta(days=current_app.config["SETTINGS"].session_days)
    connection.execute(
        "INSERT INTO sessions(id, user_id, token_hash, csrf_hash, created_at, expires_at, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            new_id(),
            user_id,
            hash_token(raw_token),
            hash_token(raw_csrf),
            now.isoformat(),
            expires.isoformat(),
            now.isoformat(),
        ),
    )
    return raw_token, raw_csrf


def rotate_csrf() -> str:
    raw_csrf = secrets.token_urlsafe(32)
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        connection.execute(
            "UPDATE sessions SET csrf_hash = ? WHERE id = ?",
            (hash_token(raw_csrf), g.session["id"]),
        )
    finally:
        connection.close()
    return raw_csrf


def set_session_cookie(response, raw_token: str):
    settings = current_app.config["SETTINGS"]
    response.set_cookie(
        "ib_session",
        raw_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="Lax",
        path="/",
        max_age=settings.session_days * 86400,
    )
    return response


def load_session() -> None:
    raw_token = request.cookies.get("ib_session")
    if not raw_token:
        return
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    try:
        row = connection.execute(
            "SELECT s.*, u.username, u.display_name, u.ai_notice_ack_at "
            "FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL",
            (hash_token(raw_token), utc_now()),
        ).fetchone()
    finally:
        connection.close()
    if row:
        now = datetime.now(UTC)
        last_seen = datetime.fromisoformat(row["last_seen_at"].replace("Z", "+00:00"))
        if (now - last_seen).total_seconds() >= 300:
            rolling_expiry = now + timedelta(days=current_app.config["SETTINGS"].session_days)
            absolute_expiry = datetime.fromisoformat(
                row["created_at"].replace("Z", "+00:00")
            ) + timedelta(days=60)
            expires_at = min(rolling_expiry, absolute_expiry).isoformat()
            connection = connect(settings.database_path)
            try:
                connection.execute(
                    "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?",
                    (now.isoformat(), expires_at, row["id"]),
                )
            finally:
                connection.close()
        g.session = row
        g.current_user = row


def require_auth(function: Callable[..., Any]):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if not getattr(g, "current_user", None):
            raise ProblemError(401, "UNAUTHENTICATED", "Authentication is required")
        return function(*args, **kwargs)

    return wrapped


def check_csrf() -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"} or not request.path.startswith("/api/v1/"):
        return
    if request.endpoint in {"auth.register", "auth.login"}:
        return
    if not getattr(g, "session", None):
        return
    provided = request.headers.get("X-CSRF-Token", "")
    if not provided or not secrets.compare_digest(hash_token(provided), g.session["csrf_hash"]):
        raise ProblemError(403, "CSRF_INVALID", "CSRF token is invalid")


def check_origin() -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"} or not request.path.startswith("/api/v1/"):
        return
    origin = request.headers.get("Origin")
    if not origin:
        return
    allowed = {
        value.strip().rstrip("/")
        for value in current_app.config["SETTINGS"].allowed_origins.split(",")
        if value.strip()
    }
    same_host = urlsplit(origin).netloc == request.host
    if origin.rstrip("/") not in allowed and not same_host:
        raise ProblemError(403, "ORIGIN_INVALID", "Origin is not allowed")


class RateLimiter:
    def __init__(self) -> None:
        self._events: defaultdict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] >= window_seconds:
            events.popleft()
        if len(events) >= limit:
            raise ProblemError(429, "RATE_LIMITED", "Too many requests")
        events.append(now)
