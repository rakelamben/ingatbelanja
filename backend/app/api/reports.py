from __future__ import annotations

import csv
import io
import json
from datetime import date, timedelta

from flask import Blueprint, current_app, g, jsonify, make_response, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..db import connect, tx
from ..errors import ProblemError
from ..security import require_auth
from ..utils import new_id, utc_now
from .ledger import require_member

reports_api = Blueprint("reports", __name__, url_prefix="/api/v1")


class BudgetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit_minor: int = Field(ge=0)
    start_date: str | None = None
    end_date: str | None = None


def _uid():
    return g.current_user["user_id"]


def _month_bounds(value: str) -> tuple[str, str]:
    try:
        first = date.fromisoformat(f"{value}-01")
    except ValueError as error:
        raise ProblemError(
            422, "PERIOD_INVALID", "Period must be YYYY-MM or use from/to"
        ) from error
    next_month = date(
        first.year + (first.month == 12), 1 if first.month == 12 else first.month + 1, 1
    )
    return first.isoformat(), (next_month - timedelta(days=1)).isoformat()


def _period():
    today = date.today()
    if request.args.get("from") and request.args.get("to"):
        return request.args["from"], request.args["to"]
    value = request.args.get("period") or today.strftime("%Y-%m")
    return _month_bounds(value)


def _json_value(value):
    return json.loads(value) if value else None


@reports_api.get("/ledgers/<ledger_id>/reports/summary")
@require_auth
def summary(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        ledger = require_member(connection, ledger_id, _uid())
        start, end = _period()
        receipts = connection.execute(
            "SELECT * FROM receipts WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL AND purchased_on BETWEEN ? AND ?",
            (ledger_id, start, end),
        ).fetchall()
        total = sum(row["total_ledger_minor"] or 0 for row in receipts)
        by_day = {}
        by_merchant = {}
        for row in receipts:
            by_day[row["purchased_on"]] = by_day.get(row["purchased_on"], 0) + (
                row["total_ledger_minor"] or 0
            )
            merchant = row["merchant"] or "Tanpa merchant"
            by_merchant.setdefault(merchant, [0, 0])
            by_merchant[merchant][0] += row["total_ledger_minor"] or 0
            by_merchant[merchant][1] += 1
        category_rows = connection.execute(
            "SELECT COALESCE(c.id, 'uncategorized') AS id, COALESCE(c.name, 'Belum dikategorikan') AS name, SUM(COALESCE(li.amount_ledger_minor, li.amount_minor, 0)) AS amount FROM line_items li JOIN receipts r ON r.id = li.receipt_id LEFT JOIN categories c ON c.id = li.category_id WHERE r.ledger_id = ? AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.purchased_on BETWEEN ? AND ? GROUP BY c.id, c.name ORDER BY amount DESC",
            (ledger_id, start, end),
        ).fetchall()
        categories = [
            {
                "category_id": None if row["id"] == "uncategorized" else row["id"],
                "name": row["name"],
                "amount_minor": row["amount"],
                "share_bp": round(row["amount"] * 10000 / total) if total else 0,
            }
            for row in category_rows
        ]
        period_start = date.fromisoformat(start)
        previous_end = period_start - timedelta(days=1)
        previous_start = previous_end - (date.fromisoformat(end) - period_start)
        previous = connection.execute(
            "SELECT COALESCE(SUM(total_ledger_minor), 0) FROM receipts WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL AND purchased_on BETWEEN ? AND ?",
            (ledger_id, previous_start.isoformat(), previous_end.isoformat()),
        ).fetchone()[0]
        diff = total - previous
        return jsonify(
            {
                "ledger_id": ledger_id,
                "currency": ledger["currency_code"],
                "period": {"from": start, "to": end},
                "total_minor": total,
                "count": len(receipts),
                "by_category": categories,
                "extras_minor": total - sum(row["amount"] for row in category_rows),
                "by_day": [
                    {"date": key, "amount_minor": value} for key, value in sorted(by_day.items())
                ],
                "top_merchants": [
                    {"name": key, "amount_minor": value[0], "count": value[1]}
                    for key, value in sorted(
                        by_merchant.items(), key=lambda item: item[1][0], reverse=True
                    )[:10]
                ],
                "compare": {
                    "prev_from": previous_start.isoformat(),
                    "prev_to": previous_end.isoformat(),
                    "prev_total_minor": previous,
                    "diff_minor": diff,
                    "pct_bp": round(diff * 10000 / previous) if previous else None,
                },
            }
        )
    finally:
        connection.close()


@reports_api.get("/ledgers/<ledger_id>/budgets")
@require_auth
def list_budgets(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid())
        return jsonify(
            {
                "budgets": [
                    dict(row)
                    for row in connection.execute(
                        "SELECT id, period, limit_minor, start_date, end_date, created_at, updated_at FROM budgets WHERE ledger_id = ? ORDER BY updated_at DESC, period",
                        (ledger_id,),
                    ).fetchall()
                ]
            }
        )
    finally:
        connection.close()


@reports_api.put("/ledgers/<ledger_id>/budgets/<period>")
@require_auth
def put_budget(ledger_id: str, period: str):
    try:
        payload = BudgetRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        raise ProblemError(422, "VALIDATION_ERROR", "Request body is invalid") from error

    start_date = payload.start_date
    end_date = payload.end_date

    if period == "CUSTOM":
        if not start_date or not end_date:
            raise ProblemError(
                422, "PERIOD_INVALID", "Custom budget requires start_date and end_date"
            )
        try:
            start_obj = date.fromisoformat(start_date)
            end_obj = date.fromisoformat(end_date)
        except ValueError as error:
            raise ProblemError(
                422, "PERIOD_INVALID", "Budget dates must be YYYY-MM-DD"
            ) from error
        if end_obj < start_obj:
            raise ProblemError(
                422, "PERIOD_INVALID", "end_date must be on or after start_date"
            )
    elif period == "ALL":
        if start_date and end_date:
            try:
                if date.fromisoformat(end_date) < date.fromisoformat(start_date):
                    raise ProblemError(
                        422, "PERIOD_INVALID", "end_date must be on or after start_date"
                    )
            except ValueError as error:
                raise ProblemError(
                    422, "PERIOD_INVALID", "Budget dates must be YYYY-MM-DD"
                ) from error
    else:
        if len(period) != 7 or period[4] != "-":
            raise ProblemError(
                422, "PERIOD_INVALID", "Budget period must be YYYY-MM, CUSTOM, or ALL"
            )
        default_start, default_end = _month_bounds(period)
        start_date = start_date or default_start
        end_date = end_date or default_end

    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid(), owner=True)
        now = utc_now()
        with tx(connection, write=True):
            connection.execute(
                "INSERT INTO budgets(id, ledger_id, period, limit_minor, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ledger_id, period) DO UPDATE SET limit_minor = excluded.limit_minor, start_date = excluded.start_date, end_date = excluded.end_date, updated_at = excluded.updated_at",
                (new_id(), ledger_id, period, payload.limit_minor, start_date, end_date, now, now),
            )
        return jsonify(
            dict(
                connection.execute(
                    "SELECT id, period, limit_minor, start_date, end_date, created_at, updated_at FROM budgets WHERE ledger_id = ? AND period = ?",
                    (ledger_id, period),
                ).fetchone()
            )
        )
    finally:
        connection.close()


@reports_api.delete("/ledgers/<ledger_id>/budgets/<period>")
@require_auth
def delete_budget(ledger_id: str, period: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid(), owner=True)
        with tx(connection, write=True):
            connection.execute(
                "DELETE FROM budgets WHERE ledger_id = ? AND period = ?", (ledger_id, period)
            )
        return "", 204
    finally:
        connection.close()


@reports_api.get("/ledgers/<ledger_id>/budgets/status")
@require_auth
def budget_status(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid())
        period = request.args.get("period") or date.today().strftime("%Y-%m")
        budget = connection.execute(
            "SELECT period, limit_minor, start_date, end_date FROM budgets "
            "WHERE ledger_id = ? AND period IN (?, 'CUSTOM', 'ALL') "
            "ORDER BY CASE WHEN period = ? THEN 0 WHEN period = 'CUSTOM' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1",
            (ledger_id, period, period),
        ).fetchone()

        if budget and budget["start_date"] and budget["end_date"]:
            start, end = budget["start_date"], budget["end_date"]
        elif period not in ("CUSTOM", "ALL"):
            start, end = _month_bounds(period)
        else:
            start, end = "0001-01-01", "9999-12-31"

        spent = connection.execute(
            # "SELECT COALESCE(SUM(total_ledger_minor), 0) FROM receipts WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL",
            "SELECT COALESCE(SUM(total_ledger_minor), 0) FROM receipts WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL AND purchased_on BETWEEN ? AND ?",
            (ledger_id,start, end),
        ).fetchone()[0]
        limit = budget["limit_minor"] if budget else None
        ratio = round(spent * 10000 / limit) if limit else None
        return jsonify(
            {
                "period": budget["period"] if budget else period,
                "start_date": budget["start_date"] if budget else start,
                "end_date": budget["end_date"] if budget else end,
                "limit_minor": limit,
                "spent_minor": spent,
                "ratio_bp": ratio,
                "level": "over"
                if ratio is not None and ratio >= 10000
                else "warning"
                if ratio is not None and ratio >= 8000
                else "normal",
            }
        )
    finally:
        connection.close()


@reports_api.get("/ledgers/<ledger_id>/activity")
@require_auth
def activity(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        ledger = require_member(connection, ledger_id, _uid())
        if ledger["type"] != "tracker":
            raise ProblemError(404, "ACTIVITY_NOT_FOUND", "Activity is only available for trackers")
        limit = min(max(int(request.args.get("limit", 30)), 1), 100)
        rows = connection.execute(
            "SELECT a.*, u.username, u.display_name FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.ledger_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?",
            (ledger_id, limit + 1),
        ).fetchall()
        return jsonify({"items": [dict(row) for row in rows[:limit]], "next_cursor": None})
    finally:
        connection.close()


@reports_api.get("/ledgers/<ledger_id>/export")
@require_auth
def export_ledger(ledger_id: str):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        require_member(connection, ledger_id, _uid())
        start, end = _period()
        rows = connection.execute(
            "SELECT r.purchased_on, r.merchant, r.total_ledger_minor, r.note, li.name, li.qty_milli, li.unit_minor, li.amount_ledger_minor, c.name AS category, u.username FROM line_items li JOIN receipts r ON r.id = li.receipt_id LEFT JOIN categories c ON c.id = li.category_id LEFT JOIN users u ON u.id = r.created_by WHERE r.ledger_id = ? AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.purchased_on BETWEEN ? AND ? ORDER BY r.purchased_on, r.id, li.id LIMIT 5001",
            (ledger_id, start, end),
        ).fetchall()
        if len(rows) > 5000:
            raise ProblemError(413, "EXPORT_TOO_LARGE", "Export is limited to 5000 items")
        if request.args.get("format", "csv") == "pdf":
            text = "IngatBelanjaan\n" + "\n".join(
                f"{row['purchased_on']} | {row['merchant'] or ''} | {row['name']} | {row['amount_ledger_minor'] or 0}"
                for row in rows
            )
            body = f"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\n% {text}".encode()
            response = make_response(body)
            response.headers["Content-Type"] = "application/pdf"
            return response
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(
            [
                "Tanggal",
                "Merchant",
                "Item",
                "Jumlah",
                "Harga satuan",
                "Nilai",
                "Kategori",
                "Diunggah oleh",
                "Catatan",
            ]
        )

        def safe(value):
            value = "" if value is None else str(value)
            return "'" + value if value.startswith(("=", "+", "-", "@", "\t")) else value

        for row in rows:
            writer.writerow(
                [
                    safe(row[key])
                    for key in (
                        "purchased_on",
                        "merchant",
                        "name",
                        "qty_milli",
                        "unit_minor",
                        "amount_ledger_minor",
                        "category",
                        "username",
                        "note",
                    )
                ]
            )
        response = make_response("\ufeff" + output.getvalue())
        response.headers["Content-Type"] = "text/csv; charset=utf-8"
        response.headers["Content-Disposition"] = "attachment; filename=ingatbelanjaan.csv"
        return response
    finally:
        connection.close()
