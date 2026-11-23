from __future__ import annotations

import secrets
import sqlite3
from datetime import UTC, datetime, timedelta

from flask import Blueprint, current_app, g, jsonify, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..db import connect, tx
from ..errors import ProblemError
from ..security import require_auth
from ..utils import new_id, normalize_text, utc_now

ledger_api = Blueprint("ledger", __name__, url_prefix="/api/v1")
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class TrackerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    currency: str = Field(min_length=3, max_length=3)


class LedgerPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    currency: str | None = Field(default=None, min_length=3, max_length=3)


class InviteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_in_hours: int = Field(default=72, ge=1, le=720)
    max_uses: int = Field(default=1, ge=1, le=1000)


class JoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=6, max_length=16)


class CategoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=50)


def body(model):
    try:
        return model.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        raise ProblemError(422, "VALIDATION_ERROR", "Request body is invalid") from error


def _user_id() -> str:
    return g.current_user["user_id"]


def _open_connection():
    return connect(current_app.config["SETTINGS"].database_path)


def require_member(connection, ledger_id: str, user_id: str, *, owner: bool = False):
    row = connection.execute(
        "SELECT l.*, m.role FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id "
        "WHERE l.id = ? AND m.user_id = ? AND l.deleted_at IS NULL",
        (ledger_id, user_id),
    ).fetchone()
    if not row:
        raise ProblemError(404, "LEDGER_NOT_FOUND", "Ledger not found")
    if owner and row["role"] != "owner":
        raise ProblemError(403, "OWNER_REQUIRED", "Ledger owner permission is required")
    return row


def log_activity(
    connection, ledger_id: str, action: str, entity_type: str, entity_id: str | None = None
):
    connection.execute(
        "INSERT INTO activity_log(id, ledger_id, actor_id, action, entity_type, entity_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (new_id(), ledger_id, _user_id(), action, entity_type, entity_id, utc_now()),
    )


def _ledger_json(connection, row):
    member_count = connection.execute(
        "SELECT COUNT(*) FROM ledger_members WHERE ledger_id = ?", (row["id"],)
    ).fetchone()[0]
    receipts = connection.execute(
        "SELECT * FROM receipts WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL",
        (row["id"],),
    ).fetchall()
    total = sum(row["total_ledger_minor"] or 0 for row in receipts)
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "currency": row["currency_code"],
        "role": row["role"],
        "member_count": member_count,
        "created_at": row["created_at"],
        "sum_spend": total
    }


@ledger_api.get("/ledgers")
@require_auth
def list_ledgers():
    connection = _open_connection()
    try:
        rows = connection.execute(
            "SELECT l.*, m.role FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id "
            "WHERE m.user_id = ? AND l.deleted_at IS NULL ORDER BY l.type, l.created_at",
            (_user_id(),),
        ).fetchall()
        return jsonify({"ledgers": [_ledger_json(connection, row) for row in rows]})
    finally:
        connection.close()


@ledger_api.post("/ledgers")
@require_auth
def create_tracker():
    payload = body(TrackerRequest)
    currency = payload.currency.upper()
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            if not connection.execute(
                "SELECT 1 FROM currencies WHERE code = ?", (currency,)
            ).fetchone():
                raise ProblemError(422, "CURRENCY_UNKNOWN", "Currency is not supported")
            ledger_id = new_id()
            now = utc_now()
            connection.execute(
                "INSERT INTO ledgers(id, name, type, currency_code, owner_id, created_at) "
                "VALUES (?, ?, 'tracker', ?, ?, ?)",
                (ledger_id, payload.name.strip(), currency, _user_id(), now),
            )
            connection.execute(
                "INSERT INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
                (ledger_id, _user_id(), now),
            )
            log_activity(connection, ledger_id, "tracker_created", "ledger", ledger_id)
            row = connection.execute(
                "SELECT l.*, m.role FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id "
                "WHERE l.id = ? AND m.user_id = ?",
                (ledger_id, _user_id()),
            ).fetchone()
        return jsonify(_ledger_json(connection, row)), 201
    finally:
        connection.close()


@ledger_api.get("/ledgers/<ledger_id>")
@require_auth
def get_ledger(ledger_id: str):
    connection = _open_connection()
    try:
        row = require_member(connection, ledger_id, _user_id())
        members = connection.execute(
            "SELECT u.id, u.username, u.display_name, m.role, m.joined_at "
            "FROM ledger_members m JOIN users u ON u.id = m.user_id "
            "WHERE m.ledger_id = ? ORDER BY m.role DESC, m.joined_at",
            (ledger_id,),
        ).fetchall()
        result = _ledger_json(connection, row)
        result["members"] = [dict(member) for member in members]
        return jsonify(result)
    finally:
        connection.close()


@ledger_api.patch("/ledgers/<ledger_id>")
@require_auth
def patch_ledger(ledger_id: str):
    payload = body(LedgerPatchRequest)
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            ledger = require_member(connection, ledger_id, _user_id(), owner=True)
            if ledger["type"] != "tracker":
                raise ProblemError(
                    403, "PERSONAL_LEDGER_IMMUTABLE", "Personal ledger cannot be changed"
                )
            if payload.currency and payload.currency.upper() != ledger["currency_code"]:
                if connection.execute(
                    "SELECT 1 FROM receipts WHERE ledger_id = ? LIMIT 1", (ledger_id,)
                ).fetchone():
                    raise ProblemError(
                        409, "CURRENCY_LOCKED", "Ledger currency cannot change after receipts exist"
                    )
                currency = payload.currency.upper()
                if not connection.execute(
                    "SELECT 1 FROM currencies WHERE code = ?", (currency,)
                ).fetchone():
                    raise ProblemError(422, "CURRENCY_UNKNOWN", "Currency is not supported")
            else:
                currency = ledger["currency_code"]
            connection.execute(
                "UPDATE ledgers SET name = ?, currency_code = ? WHERE id = ?",
                (payload.name.strip() if payload.name else ledger["name"], currency, ledger_id),
            )
            log_activity(connection, ledger_id, "tracker_updated", "ledger", ledger_id)
        return get_ledger(ledger_id)
    finally:
        connection.close()


@ledger_api.delete("/ledgers/<ledger_id>")
@require_auth
def delete_ledger(ledger_id: str):
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            ledger = require_member(connection, ledger_id, _user_id(), owner=True)
            if ledger["type"] != "tracker":
                raise ProblemError(
                    403, "PERSONAL_LEDGER_IMMUTABLE", "Personal ledger cannot be deleted"
                )
            connection.execute("DELETE FROM ledgers WHERE id = ?", (ledger_id,))
        return ("", 204)
    finally:
        connection.close()


@ledger_api.post("/ledgers/<ledger_id>/leave")
@require_auth
def leave_ledger(ledger_id: str):
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            ledger = require_member(connection, ledger_id, _user_id())
            if ledger["role"] == "owner":
                raise ProblemError(409, "OWNER_CANNOT_LEAVE", "Tracker owner cannot leave")
            connection.execute(
                "DELETE FROM ledger_members WHERE ledger_id = ? AND user_id = ?",
                (ledger_id, _user_id()),
            )
            log_activity(connection, ledger_id, "member_left", "user", _user_id())
        return ("", 204)
    finally:
        connection.close()


@ledger_api.delete("/ledgers/<ledger_id>/members/<user_id>")
@require_auth
def kick_member(ledger_id: str, user_id: str):
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            require_member(connection, ledger_id, _user_id(), owner=True)
            target = connection.execute(
                "SELECT role FROM ledger_members WHERE ledger_id = ? AND user_id = ?",
                (ledger_id, user_id),
            ).fetchone()
            if not target:
                raise ProblemError(404, "MEMBER_NOT_FOUND", "Member not found")
            if target["role"] == "owner":
                raise ProblemError(409, "OWNER_CANNOT_KICK", "Tracker owner cannot be removed")
            connection.execute(
                "DELETE FROM ledger_members WHERE ledger_id = ? AND user_id = ?",
                (ledger_id, user_id),
            )
            log_activity(connection, ledger_id, "member_kicked", "user", user_id)
        return ("", 204)
    finally:
        connection.close()


@ledger_api.post("/ledgers/<ledger_id>/invites")
@require_auth
def create_invite(ledger_id: str):
    payload = body(InviteRequest)
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            require_member(connection, ledger_id, _user_id(), owner=True)
            code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(10))
            now = datetime.now(UTC)
            expires = now + timedelta(hours=payload.expires_in_hours)
            invite_id = new_id()
            connection.execute(
                "INSERT INTO ledger_invites(id, ledger_id, code, created_by, created_at, expires_at, max_uses) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    invite_id,
                    ledger_id,
                    code,
                    _user_id(),
                    now.isoformat(),
                    expires.isoformat(),
                    payload.max_uses,
                ),
            )
            log_activity(connection, ledger_id, "invite_created", "invite", invite_id)
        return jsonify(
            {
                "id": invite_id,
                "code": code,
                "expires_at": expires.isoformat(),
                "max_uses": payload.max_uses,
            }
        ), 201
    finally:
        connection.close()


@ledger_api.get("/ledgers/<ledger_id>/invites")
@require_auth
def list_invites(ledger_id: str):
    connection = _open_connection()
    try:
        require_member(connection, ledger_id, _user_id(), owner=True)
        rows = connection.execute(
            "SELECT id, code, created_at, expires_at, max_uses, use_count, revoked_at "
            "FROM ledger_invites WHERE ledger_id = ? AND revoked_at IS NULL AND expires_at > ? "
            "ORDER BY created_at DESC",
            (ledger_id, utc_now()),
        ).fetchall()
        return jsonify({"invites": [dict(row) for row in rows]})
    finally:
        connection.close()


@ledger_api.delete("/ledgers/<ledger_id>/invites/<invite_id>")
@require_auth
def revoke_invite(ledger_id: str, invite_id: str):
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            require_member(connection, ledger_id, _user_id(), owner=True)
            updated = connection.execute(
                "UPDATE ledger_invites SET revoked_at = ? WHERE id = ? AND ledger_id = ? AND revoked_at IS NULL",
                (utc_now(), invite_id, ledger_id),
            ).rowcount
            if not updated:
                raise ProblemError(404, "INVITE_INVALID", "Invite not found")
            log_activity(connection, ledger_id, "invite_revoked", "invite", invite_id)
        return ("", 204)
    finally:
        connection.close()


@ledger_api.post("/invites/join")
@require_auth
def join_invite():
    payload = body(JoinRequest)
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            invite = connection.execute(
                "SELECT * FROM ledger_invites WHERE code = ? AND revoked_at IS NULL "
                "AND expires_at > ? AND use_count < max_uses",
                (payload.code.upper(), utc_now()),
            ).fetchone()
            if not invite:
                raise ProblemError(404, "INVITE_INVALID", "Invite is invalid")
            if connection.execute(
                "SELECT 1 FROM ledger_members WHERE ledger_id = ? AND user_id = ?",
                (invite["ledger_id"], _user_id()),
            ).fetchone():
                raise ProblemError(409, "ALREADY_MEMBER", "User is already a member")
            connection.execute(
                "INSERT INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
                (invite["ledger_id"], _user_id(), utc_now()),
            )
            connection.execute(
                "UPDATE ledger_invites SET use_count = use_count + 1 WHERE id = ? AND use_count < max_uses",
                (invite["id"],),
            )
            log_activity(connection, invite["ledger_id"], "member_joined", "user", _user_id())
        return jsonify({"ledger_id": invite["ledger_id"]}), 200
    finally:
        connection.close()


@ledger_api.get("/ledgers/<ledger_id>/categories")
@require_auth
def list_categories(ledger_id: str):
    connection = _open_connection()
    try:
        require_member(connection, ledger_id, _user_id())
        rows = connection.execute(
            "SELECT id, name, is_system, ledger_id FROM categories "
            "WHERE ledger_id IS NULL OR ledger_id = ? ORDER BY is_system DESC, name",
            (ledger_id,),
        ).fetchall()
        return jsonify({"categories": [dict(row) for row in rows]})
    finally:
        connection.close()


@ledger_api.post("/ledgers/<ledger_id>/categories")
@require_auth
def create_category(ledger_id: str):
    payload = body(CategoryRequest)
    name = payload.name.strip()
    name_norm = normalize_text(name)
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            require_member(connection, ledger_id, _user_id(), owner=True)
            count = connection.execute(
                "SELECT COUNT(*) FROM categories WHERE ledger_id = ?", (ledger_id,)
            ).fetchone()[0]
            if count >= 15:
                raise ProblemError(
                    409, "CATEGORY_LIMIT", "A ledger can have at most 15 custom categories"
                )
            try:
                category_id = new_id()
                connection.execute(
                    "INSERT INTO categories(id, ledger_id, name, name_norm, is_system, created_at) "
                    "VALUES (?, ?, ?, ?, 0, ?)",
                    (category_id, ledger_id, name, name_norm, utc_now()),
                )
            except sqlite3.IntegrityError as error:
                raise ProblemError(409, "CATEGORY_EXISTS", "Category already exists") from error
            log_activity(connection, ledger_id, "category_created", "category", category_id)
        return jsonify(
            {"id": category_id, "ledger_id": ledger_id, "name": name, "is_system": 0}
        ), 201
    finally:
        connection.close()


@ledger_api.patch("/categories/<category_id>")
@require_auth
def patch_category(category_id: str):
    payload = body(CategoryRequest)
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            category = connection.execute(
                "SELECT * FROM categories WHERE id = ? AND ledger_id IS NOT NULL", (category_id,)
            ).fetchone()
            if not category:
                raise ProblemError(404, "CATEGORY_NOT_FOUND", "Custom category not found")
            require_member(connection, category["ledger_id"], _user_id(), owner=True)
            try:
                connection.execute(
                    "UPDATE categories SET name = ?, name_norm = ? WHERE id = ?",
                    (payload.name.strip(), normalize_text(payload.name), category_id),
                )
            except sqlite3.IntegrityError as error:
                raise ProblemError(409, "CATEGORY_EXISTS", "Category already exists") from error
            log_activity(
                connection, category["ledger_id"], "category_updated", "category", category_id
            )
        return jsonify(
            {
                "id": category_id,
                "ledger_id": category["ledger_id"],
                "name": payload.name.strip(),
                "is_system": 0,
            }
        )
    finally:
        connection.close()


@ledger_api.delete("/categories/<category_id>")
@require_auth
def delete_category(category_id: str):
    connection = _open_connection()
    try:
        with tx(connection, write=True):
            category = connection.execute(
                "SELECT * FROM categories WHERE id = ? AND ledger_id IS NOT NULL", (category_id,)
            ).fetchone()
            if not category:
                raise ProblemError(404, "CATEGORY_NOT_FOUND", "Custom category not found")
            require_member(connection, category["ledger_id"], _user_id(), owner=True)
            connection.execute(
                "UPDATE line_items SET category_id = NULL WHERE category_id = ?", (category_id,)
            )
            connection.execute("DELETE FROM categories WHERE id = ?", (category_id,))
            log_activity(
                connection, category["ledger_id"], "category_deleted", "category", category_id
            )
        return ("", 204)
    finally:
        connection.close()
