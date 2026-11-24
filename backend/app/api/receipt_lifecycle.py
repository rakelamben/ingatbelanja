from __future__ import annotations

import base64
import json
from datetime import date, datetime

from flask import Blueprint, current_app, g, jsonify, request, send_file
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..db import connect, tx
from ..errors import ProblemError
from ..money import convert_minor, validate_rate
from ..security import require_auth
from ..utils import new_id, normalize_text, utc_now
from .ledger import require_member

receipt_lifecycle_api = Blueprint("receipt_lifecycle", __name__, url_prefix="/api/v1")


class ItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = None
    name: str = Field(min_length=1, max_length=160)
    qty_milli: int = Field(default=1000, gt=0, le=9_223_372_036_854_775_807)
    unit_price_minor: int | None = Field(default=None, ge=0, le=9_223_372_036_854_775_807)
    amount_minor: int = Field(ge=0, le=9_223_372_036_854_775_807)
    category_id: str | None = None


class ReceiptPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_updated_at: str
    merchant_name: str | None = Field(default=None, max_length=160)
    purchased_on: date | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    total_minor: int | None = Field(default=None, ge=0, le=9_223_372_036_854_775_807)
    tax_minor: int | None = Field(default=None, ge=0)
    service_minor: int | None = Field(default=None, ge=0)
    discount_minor: int | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=1000)
    fx_rate: str | None = None
    items: list[ItemPatch] | None = None


class BudgetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit_minor: int = Field(ge=0)


def _uid() -> str:
    return g.current_user["user_id"]


def _version_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="microseconds")


def _parse_body(model):
    try:
        return model.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        raise ProblemError(422, "VALIDATION_ERROR", "Request body is invalid") from error


def _decode_cursor(value: str | None) -> tuple[str, str] | None:
    if not value:
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(value.encode() + b"=" * (-len(value) % 4)))
        return str(payload["date"]), str(payload["id"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise ProblemError(422, "CURSOR_INVALID", "Cursor is invalid") from error


def _cursor(purchased_on: str | None, receipt_id: str) -> str:
    return (
        base64.urlsafe_b64encode(
            json.dumps({"date": purchased_on or "", "id": receipt_id}).encode()
        )
        .decode()
        .rstrip("=")
    )


def _receipt(connection, receipt_id: str, *, allow_deleted: bool = False):
    row = connection.execute(
        "SELECT r.*, l.currency_code AS ledger_currency, m.role, u.username, u.display_name "
        "FROM receipts r JOIN ledger_members m ON m.ledger_id = r.ledger_id AND m.user_id = ? "
        "JOIN ledgers l ON l.id = r.ledger_id LEFT JOIN users u ON u.id = r.created_by "
        "WHERE r.id = ? AND (? OR r.deleted_at IS NULL)",
        (_uid(), receipt_id, int(allow_deleted)),
    ).fetchone()
    if not row or (row["status"] != "confirmed" and row["created_by"] != _uid()):
        raise ProblemError(404, "RECEIPT_NOT_FOUND", "Receipt not found")
    return row


def _detail(connection, row):
    items = connection.execute(
        "SELECT li.*, c.name AS category_name FROM line_items li LEFT JOIN categories c ON c.id = li.category_id WHERE li.receipt_id = ? ORDER BY li.created_at, li.id",
        (row["id"],),
    ).fetchall()
    return {
        "id": row["id"],
        "ledger_id": row["ledger_id"],
        "status": row["status"],
        "source": row["source"],
        "merchant_name": row["merchant"],
        "purchased_on": row["purchased_on"],
        "currency": row["currency_code"],
        "total_minor": row["total_minor"],
        "total_ledger_minor": row["total_ledger_minor"],
        "fx_rate": row["fx_rate"],
        "fx_date": row["fx_date"],
        "fx_source": row["fx_source"],
        "issues": json.loads(row["issues"] or "[]"),
        "note": row["note"],
        "created_by": {
            "id": row["created_by"],
            "username": row["username"],
            "display_name": row["display_name"],
        },
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "items": [dict(item) for item in items],
    }


@receipt_lifecycle_api.get("/ledgers/<ledger_id>/receipts")
@require_auth
def list_receipts(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid())
        limit = min(max(int(request.args.get("limit", 30)), 1), 100)
        cursor = _decode_cursor(request.args.get("cursor"))
        params: list = [ledger_id, _uid()]
        clauses = [
            "r.ledger_id = ?",
            "(r.status = 'confirmed' OR r.created_by = ?)",
            "r.deleted_at IS NULL",
        ]
        if request.args.get("status") == "confirmed":
            clauses.append("r.status = 'confirmed'")
        elif request.args.get("status") == "draft":
            clauses.append("r.status <> 'confirmed'")
        if request.args.get("from"):
            clauses.append("r.purchased_on >= ?")
            params.append(request.args["from"])
        if request.args.get("to"):
            clauses.append("r.purchased_on <= ?")
            params.append(request.args["to"])
        if request.args.get("category_id"):
            clauses.append(
                "EXISTS (SELECT 1 FROM line_items x WHERE x.receipt_id = r.id AND x.category_id = ?)"
            )
            params.append(request.args["category_id"])
        if request.args.get("min_minor"):
            clauses.append("r.total_ledger_minor >= ?")
            params.append(int(request.args["min_minor"]))
        if request.args.get("max_minor"):
            clauses.append("r.total_ledger_minor <= ?")
            params.append(int(request.args["max_minor"]))
        if request.args.get("created_by"):
            clauses.append("r.created_by = ?")
            params.append(request.args["created_by"])
        if request.args.get("q"):
            clauses.append(
                "(r.merchant_norm LIKE ? OR EXISTS (SELECT 1 FROM line_items x WHERE x.receipt_id = r.id AND x.name_norm LIKE ?))"
            )
            query = f"%{normalize_text(request.args['q'])}%"
            params.extend([query, query])
        if cursor:
            clauses.append(
                "(COALESCE(r.purchased_on, '') < ? OR (COALESCE(r.purchased_on, '') = ? AND r.id < ?))"
            )
            params.extend([cursor[0], cursor[0], cursor[1]])
        params.append(limit + 1)
        rows = connection.execute(
            f"SELECT r.*, u.username FROM receipts r LEFT JOIN users u ON u.id = r.created_by WHERE {' AND '.join(clauses)} ORDER BY COALESCE(r.purchased_on, '') DESC, r.id DESC LIMIT ?",
            params,
        ).fetchall()
        more = len(rows) > limit
        rows = rows[:limit]
        items = [
            {
                "id": row["id"],
                "status": row["status"],
                "merchant_name": row["merchant"],
                "purchased_on": row["purchased_on"],
                "currency": row["currency_code"],
                "total_minor": row["total_minor"],
                "total_ledger_minor": row["total_ledger_minor"],
                "created_by": row["username"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
        return jsonify(
            {
                "items": items,
                "next_cursor": _cursor(rows[-1]["purchased_on"], rows[-1]["id"]) if more else None,
            }
        )
    finally:
        connection.close()


@receipt_lifecycle_api.get("/ledgers/<ledger_id>/recent-items")
@require_auth
def list_recent_items(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid())
        try:
            limit = int(request.args.get("limit", 5))
        except ValueError as error:
            raise ProblemError(422, "LIMIT_INVALID", "Limit must be an integer") from error
        limit = min(max(limit, 1), 20)
        cursor = _decode_cursor(request.args.get("cursor"))
        clauses = [
            "r.ledger_id = ?",
            "r.status = 'confirmed'",
            "r.deleted_at IS NULL",
        ]
        params: list = [ledger_id]
        if cursor:
            clauses.append(
                "(li.created_at < ? OR (li.created_at = ? AND li.id < ?))"
            )
            params.extend([cursor[0], cursor[0], cursor[1]])
        params.append(limit + 1)
        rows = connection.execute(
            "SELECT li.id, li.receipt_id, li.category_id, c.name AS category_name, "
            "li.name, li.created_at, li.amount_minor, li.amount_ledger_minor, "
            "r.purchased_on, r.currency_code AS currency, l.currency_code AS ledger_currency "
            "FROM line_items li "
            "JOIN receipts r ON r.id = li.receipt_id "
            "JOIN ledgers l ON l.id = r.ledger_id "
            "LEFT JOIN categories c ON c.id = li.category_id "
            f"WHERE {' AND '.join(clauses)} "
            "ORDER BY li.created_at DESC, li.id DESC LIMIT ?",
            params,
        ).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        return jsonify(
            {
                "items": [dict(row) for row in rows],
                "next_cursor": _cursor(rows[-1]["created_at"], rows[-1]["id"])
                if has_more
                else None,
            }
        )
    finally:
        connection.close()


@receipt_lifecycle_api.get("/receipts/<receipt_id>")
@require_auth
def get_receipt(receipt_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        return jsonify(_detail(connection, _receipt(connection, receipt_id)))
    finally:
        connection.close()


@receipt_lifecycle_api.get("/receipts/<receipt_id>/status")
@require_auth
def receipt_status(receipt_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        row = _receipt(connection, receipt_id)
        return jsonify(
            {
                "id": row["id"],
                "status": row["status"],
                "issues": json.loads(row["issues"] or "[]"),
                "updated_at": row["updated_at"],
            }
        )
    finally:
        connection.close()


@receipt_lifecycle_api.patch("/receipts/<receipt_id>")
@require_auth
def patch_receipt(receipt_id: str):
    payload = _parse_body(ReceiptPatch)
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            row = _receipt(connection, receipt_id)
            if row["created_by"] != _uid() and not (
                row["created_by"] is None and row["role"] == "owner"
            ):
                raise ProblemError(
                    403, "RECEIPT_EDIT_FORBIDDEN", "Only the receipt creator can edit it"
                )
            if row["updated_at"] != payload.expected_updated_at:
                raise ProblemError(409, "STALE_EDIT", "Receipt changed since it was loaded")
            currency = payload.currency.upper() if payload.currency else row["currency_code"]
            purchased_on = (
                payload.purchased_on.isoformat()
                if payload.purchased_on
                else row["purchased_on"]
            )
            total_minor = (
                payload.total_minor if payload.total_minor is not None else row["total_minor"]
            )
            currency_rows = connection.execute(
                "SELECT code, minor_unit FROM currencies WHERE code IN (?, ?)",
                (currency, row["ledger_currency"]),
            ).fetchall()
            currency_units = {item["code"]: item["minor_unit"] for item in currency_rows}
            if currency not in currency_units:
                raise ProblemError(422, "CURRENCY_UNKNOWN", "Currency is not supported")
            if row["ledger_currency"] not in currency_units:
                raise ProblemError(422, "CURRENCY_UNKNOWN", "Book currency is not supported")
            fx_rate = (
                payload.fx_rate
                if payload.fx_rate is not None
                else (row["fx_rate"] if currency == row["currency_code"] else None)
            )
            fx_date = row["fx_date"]
            fx_source = row["fx_source"]
            if currency == row["ledger_currency"]:
                fx_rate = "1"
                fx_date = purchased_on
                fx_source = "none"
            elif fx_rate:
                try:
                    fx_rate = str(validate_rate(fx_rate))
                except ValueError as error:
                    raise ProblemError(422, "FX_RATE_INVALID", str(error)) from error
                fx_date = purchased_on
                if payload.fx_rate is not None and payload.fx_rate != row["fx_rate"]:
                    fx_source = "manual"
                else:
                    fx_source = fx_source or "manual"
            elif total_minor is not None or payload.items is not None:
                raise ProblemError(
                    409, "FX_RATE_NEEDED", "Provide an exchange rate before saving amounts"
                )
            total_ledger_minor = (
                convert_minor(
                    total_minor,
                    currency_units[currency],
                    currency_units[row["ledger_currency"]],
                    fx_rate,
                )
                if total_minor is not None and fx_rate
                else None
            )
            changes = {
                "merchant": payload.merchant_name,
                "purchased_on": purchased_on,
                "currency_code": currency,
                "total_minor": total_minor,
                "total_ledger_minor": total_ledger_minor,
                "fx_rate": fx_rate,
                "fx_date": fx_date,
                "fx_source": fx_source,
                "note": payload.note,
            }
            updates = []
            values = []
            for field, value in changes.items():
                if value is not None and value != row[field]:
                    updates.append(f"{field} = ?")
                    values.append(value)
                    connection.execute(
                        "INSERT INTO corrections(id, receipt_id, user_id, field_name, before_value, after_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            new_id(),
                            receipt_id,
                            _uid(),
                            field,
                            str(row[field]) if row[field] is not None else None,
                            str(value),
                            utc_now(),
                        ),
                    )
            if payload.items is not None:
                for item in payload.items:
                    if item.category_id and not connection.execute(
                        "SELECT 1 FROM categories WHERE id = ? AND (ledger_id IS NULL OR ledger_id = ?)",
                        (item.category_id, row["ledger_id"]),
                    ).fetchone():
                        raise ProblemError(
                            422, "CATEGORY_INVALID", "Category does not belong to this ledger"
                        )
                connection.execute("DELETE FROM line_items WHERE receipt_id = ?", (receipt_id,))
                for item in payload.items:
                    item_name = item.name.strip()
                    if not item_name:
                        raise ProblemError(422, "VALIDATION_ERROR", "Item name is required")
                    connection.execute(
                        "INSERT INTO line_items(id, receipt_id, category_id, name, name_norm, qty_milli, unit_minor, amount_minor, amount_ledger_minor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            item.id or new_id(),
                            receipt_id,
                            item.category_id,
                            item_name,
                            normalize_text(item_name),
                            item.qty_milli,
                            item.unit_price_minor,
                            item.amount_minor,
                            (
                                convert_minor(
                                    item.amount_minor,
                                    currency_units[currency],
                                    currency_units[row["ledger_currency"]],
                                    fx_rate,
                                )
                                if fx_rate
                                else None
                            ),
                            utc_now(),
                        ),
                    )
            elif currency != row["currency_code"] or fx_rate != row["fx_rate"]:
                for item in connection.execute(
                    "SELECT id, amount_minor FROM line_items WHERE receipt_id = ?",
                    (receipt_id,),
                ).fetchall():
                    connection.execute(
                        "UPDATE line_items SET amount_ledger_minor = ? WHERE id = ?",
                        (
                            convert_minor(
                                item["amount_minor"] or 0,
                                currency_units[currency],
                                currency_units[row["ledger_currency"]],
                                fx_rate,
                            )
                            if fx_rate
                            else None,
                            item["id"],
                        ),
                    )
            issues = json.loads(row["issues"] or "[]")
            if currency != row["ledger_currency"] and not fx_rate:
                if "FX_RATE_NEEDED" not in issues:
                    issues.append("FX_RATE_NEEDED")
            else:
                issues = [issue for issue in issues if issue != "FX_RATE_NEEDED"]
            if currency:
                issues = [issue for issue in issues if issue != "CURRENCY_AMBIGUOUS"]
            if issues != json.loads(row["issues"] or "[]"):
                updates.append("issues = ?")
                values.append(json.dumps(issues))
            if not updates and payload.items is None:
                return jsonify(_detail(connection, row))
            new_updated = _version_now()
            updates.extend(["updated_at = ?"])
            values.extend([new_updated, receipt_id])
            connection.execute(f"UPDATE receipts SET {', '.join(updates)} WHERE id = ?", values)
            if row["ledger_id"] and row["role"] == "owner":
                connection.execute(
                    "INSERT INTO activity_log(id, ledger_id, actor_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'receipt_updated', 'receipt', ?, ?)",
                    (new_id(), row["ledger_id"], _uid(), receipt_id, new_updated),
                )
            return jsonify(
                _detail(
                    connection,
                    connection.execute(
                        "SELECT r.*, l.currency_code AS ledger_currency, m.role, u.username, u.display_name FROM receipts r JOIN ledger_members m ON m.ledger_id = r.ledger_id AND m.user_id = ? JOIN ledgers l ON l.id = r.ledger_id LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?",
                        (_uid(), receipt_id),
                    ).fetchone(),
                )
            )
    finally:
        connection.close()


@receipt_lifecycle_api.post("/receipts/<receipt_id>/confirm")
@require_auth
def confirm_receipt(receipt_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            row = _receipt(connection, receipt_id)
            if row["created_by"] != _uid():
                raise ProblemError(
                    403, "RECEIPT_CONFIRM_FORBIDDEN", "Only the creator can confirm a receipt"
                )
            item_count = connection.execute(
                "SELECT COUNT(*) FROM line_items WHERE receipt_id = ?", (receipt_id,)
            ).fetchone()[0]
            issues = json.loads(row["issues"] or "[]")
            if (
                not row["purchased_on"]
                or not row["currency_code"]
                or row["total_minor"] is None
                or not item_count
                or any(issue in issues for issue in ("CURRENCY_AMBIGUOUS", "FX_RATE_NEEDED"))
            ):
                raise ProblemError(
                    409,
                    "NEEDS_RESOLUTION",
                    "Receipt has required fields or blocking issues to resolve",
                )
            now = utc_now()
            connection.execute(
                "UPDATE receipts SET status = 'confirmed', updated_at = ? WHERE id = ?",
                (now, receipt_id),
            )
            return jsonify({"id": receipt_id, "status": "confirmed", "updated_at": now})
    finally:
        connection.close()


@receipt_lifecycle_api.delete("/receipts/<receipt_id>")
@require_auth
def delete_receipt(receipt_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            row = _receipt(connection, receipt_id)
            if row["created_by"] != _uid() and row["role"] != "owner":
                raise ProblemError(403, "RECEIPT_DELETE_FORBIDDEN", "Delete permission is required")
            connection.execute(
                "UPDATE receipts SET deleted_at = ?, updated_at = ? WHERE id = ?",
                (utc_now(), utc_now(), receipt_id),
            )
        return "", 204
    finally:
        connection.close()


@receipt_lifecycle_api.post("/receipts/<receipt_id>/restore")
@require_auth
def restore_receipt(receipt_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            row = _receipt(connection, receipt_id, allow_deleted=True)
            if not row["deleted_at"] or _parse_deleted_age(row["deleted_at"]) > 30:
                raise ProblemError(409, "RESTORE_EXPIRED", "Receipt can no longer be restored")
            if row["created_by"] != _uid() and row["role"] != "owner":
                raise ProblemError(
                    403, "RECEIPT_RESTORE_FORBIDDEN", "Restore permission is required"
                )
            now = utc_now()
            connection.execute(
                "UPDATE receipts SET deleted_at = NULL, updated_at = ? WHERE id = ?",
                (now, receipt_id),
            )
            return jsonify({"id": receipt_id, "deleted_at": None, "updated_at": now})
    finally:
        connection.close()


def _parse_deleted_age(value: str) -> int:
    return max(
        0,
        (datetime.now().date() - datetime.fromisoformat(value.replace("Z", "+00:00")).date()).days,
    )


@receipt_lifecycle_api.post("/receipts/<receipt_id>/reprocess")
@require_auth
def reprocess_receipt(receipt_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        with tx(connection, write=True):
            row = _receipt(connection, receipt_id)
            if row["created_by"] != _uid() or row["source"] != "photo":
                raise ProblemError(
                    403,
                    "RECEIPT_REPROCESS_FORBIDDEN",
                    "Only the creator can reprocess a photo receipt",
                )
            if row["status"] == "confirmed":
                raise ProblemError(
                    409, "RECEIPT_ALREADY_CONFIRMED", "Confirmed receipts cannot be reprocessed"
                )
            now = utc_now()
            connection.execute(
                "UPDATE receipts SET status = 'processing', updated_at = ? WHERE id = ?",
                (now, receipt_id),
            )
            connection.execute(
                "INSERT INTO jobs(id, receipt_id, kind, status, available_at, created_at, updated_at) VALUES (?, ?, 'extract_receipt', 'queued', ?, ?, ?)",
                (new_id(), receipt_id, now, now, now),
            )
        return jsonify({"id": receipt_id, "status": "processing"}), 202
    finally:
        connection.close()


@receipt_lifecycle_api.get("/receipts/<receipt_id>/image/<kind>")
@require_auth
def receipt_image(receipt_id: str, kind: str):
    if kind not in {"original", "processed", "thumb"}:
        raise ProblemError(404, "IMAGE_NOT_FOUND", "Image kind not found")
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        row = _receipt(connection, receipt_id)
        image = connection.execute(
            "SELECT original_path, processed_path, thumb_path FROM receipt_images WHERE receipt_id = ?",
            (row["id"],),
        ).fetchone()
        if not image:
            raise ProblemError(404, "IMAGE_NOT_FOUND", "Receipt image not found")
        path = (current_app.config["SETTINGS"].storage_dir / image[f"{kind}_path"]).resolve()
        if not path.is_file():
            raise ProblemError(404, "IMAGE_NOT_FOUND", "Receipt image not found")
        return send_file(path, mimetype="image/jpeg", max_age=0)
    finally:
        connection.close()
