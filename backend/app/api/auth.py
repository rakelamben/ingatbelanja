from __future__ import annotations

import sqlite3

from flask import Blueprint, current_app, g, jsonify, make_response, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..db import connect, tx
from ..errors import ProblemError
from ..security import (
    DUMMY_PASSWORD_HASH,
    RateLimiter,
    create_session,
    password_hash,
    password_matches,
    require_auth,
    rotate_csrf,
    set_session_cookie,
    validate_password,
    validate_username,
)
from ..utils import new_id, utc_now

auth = Blueprint("auth", __name__, url_prefix="/api/v1/auth")
limiter = RateLimiter()


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=10, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


class PasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str


def json_body(model):
    try:
        return model.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        raise ProblemError(422, "VALIDATION_ERROR", "Request body is invalid") from error


def _session_response(user, csrf_token: str, ledger_id: str, status: int = 200):
    return make_response(
        jsonify(
            {
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "display_name": user["display_name"],
                },
                "csrf_token": csrf_token,
                "personal_ledger_id": ledger_id,
            }
        ),
        status,
    )


@auth.post("/register")
def register():
    settings = current_app.config["SETTINGS"]
    if not settings.allow_registration:
        raise ProblemError(403, "REGISTRATION_DISABLED", "Registration is disabled")
    limiter.check(f"register:{request.remote_addr}", 10)
    body = json_body(RegisterRequest)
    username_norm = validate_username(body.username)
    validate_password(body.password)
    now = utc_now()
    user_id = new_id()
    ledger_id = new_id()
    connection = connect(settings.database_path)
    try:
        with tx(connection, write=True):
            try:
                connection.execute(
                    "INSERT INTO users(id, username, username_norm, display_name, password_hash, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        user_id,
                        body.username,
                        username_norm,
                        body.display_name,
                        password_hash(body.password),
                        now,
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise ProblemError(
                    409, "USERNAME_TAKEN", "Username is already registered"
                ) from error
            connection.execute(
                "INSERT INTO ledgers(id, name, type, currency_code, owner_id, created_at) "
                "VALUES (?, ?, 'personal', 'IDR', ?, ?)",
                (ledger_id, f"Buku {body.display_name or body.username}", user_id, now),
            )
            connection.execute(
                "INSERT INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
                (ledger_id, user_id, now),
            )
            raw_token, raw_csrf = create_session(connection, user_id)
    finally:
        connection.close()
    response = _session_response(
        {"id": user_id, "username": body.username, "display_name": body.display_name},
        raw_csrf,
        ledger_id,
        201,
    )
    return set_session_cookie(response, raw_token)


@auth.post("/login")
def login():
    limiter.check(f"login:{request.remote_addr}", 10)
    body = json_body(LoginRequest)
    username_norm = validate_username(body.username)
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    authentication_error = None
    try:
        with tx(connection, write=True):
            user = connection.execute(
                "SELECT * FROM users WHERE username_norm = ? AND deleted_at IS NULL",
                (username_norm,),
            ).fetchone()
            if user and user["locked_until"] and user["locked_until"] > utc_now():
                raise ProblemError(423, "ACCOUNT_LOCKED", "Account is temporarily locked")
            valid = password_matches(
                body.password, user["password_hash"] if user else DUMMY_PASSWORD_HASH
            )
            if not user or not valid:
                if user:
                    failures = user["failed_login_count"] + 1
                    locked_until = None
                    if failures >= 5:
                        from datetime import UTC, datetime, timedelta

                        locked_until = (datetime.now(UTC) + timedelta(minutes=15)).isoformat()
                    connection.execute(
                        "UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?",
                        (failures, locked_until, user["id"]),
                    )
                authentication_error = ProblemError(
                    401, "INVALID_CREDENTIALS", "Username or password is incorrect"
                )
            else:
                connection.execute(
                    "UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?",
                    (user["id"],),
                )
                ledger = connection.execute(
                    "SELECT id FROM ledgers WHERE owner_id = ? AND type = 'personal' AND deleted_at IS NULL",
                    (user["id"],),
                ).fetchone()
                if not ledger:
                    raise ProblemError(500, "ACCOUNT_INCOMPLETE", "Personal ledger is missing")
                raw_token, raw_csrf = create_session(connection, user["id"])
    finally:
        connection.close()
    if authentication_error:
        raise authentication_error
    response = _session_response(user, raw_csrf, ledger["id"])
    return set_session_cookie(response, raw_token)


@auth.get("/me")
@require_auth
def me():
    user = g.current_user
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    try:
        ledger = connection.execute(
            "SELECT id FROM ledgers WHERE owner_id = ? AND type = 'personal' AND deleted_at IS NULL",
            (user["user_id"],),
        ).fetchone()
    finally:
        connection.close()
    if not ledger:
        raise ProblemError(500, "ACCOUNT_INCOMPLETE", "Personal ledger is missing")
    return jsonify(
        {
            "user": {
                "id": user["user_id"],
                "username": user["username"],
                "display_name": user["display_name"],
            },
            "csrf_token": rotate_csrf(),
            "personal_ledger_id": ledger["id"],
            "ai_notice_acknowledged": user["ai_notice_ack_at"] is not None,
        }
    )


@auth.post("/logout")
@require_auth
def logout():
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            connection.execute("DELETE FROM sessions WHERE id = ?", (g.session["id"],))
    finally:
        connection.close()
    response = make_response("", 204)
    response.delete_cookie("ib_session", path="/")
    return response


@auth.post("/ack-ai-notice")
@require_auth
def ack_ai_notice():
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            connection.execute(
                "UPDATE users SET ai_notice_ack_at = ? WHERE id = ?",
                (utc_now(), g.current_user["user_id"]),
            )
    finally:
        connection.close()
    return ("", 204)


@auth.post("/change-password")
@require_auth
def change_password():
    body = json_body(PasswordChangeRequest)
    validate_password(body.new_password, "new_password")
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    try:
        with tx(connection, write=True):
            user = connection.execute(
                "SELECT password_hash FROM users WHERE id = ?", (g.current_user["user_id"],)
            ).fetchone()
            if not user or not password_matches(body.current_password, user["password_hash"]):
                raise ProblemError(401, "INVALID_CREDENTIALS", "Current password is incorrect")
            connection.execute(
                "UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?",
                (password_hash(body.new_password), g.current_user["user_id"]),
            )
            connection.execute(
                "DELETE FROM sessions WHERE user_id = ? AND id <> ?",
                (g.current_user["user_id"], g.session["id"]),
            )
    finally:
        connection.close()
    return ("", 204)


@auth.delete("/me")
@require_auth
def delete_account():
    body = json_body(DeleteAccountRequest)
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    try:
        with tx(connection, write=True):
            user = connection.execute(
                "SELECT password_hash FROM users WHERE id = ?", (g.current_user["user_id"],)
            ).fetchone()
            if not user or not password_matches(body.password, user["password_hash"]):
                raise ProblemError(401, "INVALID_CREDENTIALS", "Password is incorrect")
            shared = connection.execute(
                "SELECT l.id FROM ledgers l "
                "JOIN ledger_members m ON m.ledger_id = l.id "
                "WHERE l.owner_id = ? AND l.type = 'tracker' "
                "GROUP BY l.id HAVING COUNT(m.user_id) > 1",
                (g.current_user["user_id"],),
            ).fetchone()
            if shared:
                raise ProblemError(
                    409,
                    "OWNS_SHARED_TRACKER",
                    "Leave or transfer shared trackers before deleting the account",
                )
            connection.execute(
                "UPDATE receipts SET created_by = NULL WHERE created_by = ? "
                "AND ledger_id IN (SELECT id FROM ledgers WHERE type = 'tracker' AND owner_id <> ?)",
                (g.current_user["user_id"], g.current_user["user_id"]),
            )
            connection.execute("DELETE FROM users WHERE id = ?", (g.current_user["user_id"],))
    finally:
        connection.close()
    response = make_response("", 204)
    response.delete_cookie("ib_session", path="/")
    return response
