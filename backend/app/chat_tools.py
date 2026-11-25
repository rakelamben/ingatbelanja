from __future__ import annotations

import re
from datetime import date, timedelta

from .db import connect
from .errors import ProblemError
from .utils import normalize_text


def _clean(value: str | None) -> str:
    return re.sub(r"[\x00-\x1f\x7f]", "", (value or ""))[:60]


def period_dates(period: str, start: str | None = None, end: str | None = None) -> tuple[str, str]:
    today = date.today()
    if period == "custom":
        if not start or not end:
            raise ProblemError(422, "PERIOD_INVALID", "Custom period requires from and to")
        return start, end
    if period == "today":
        return today.isoformat(), today.isoformat()
    if period == "yesterday":
        value = today - timedelta(days=1)
        return value.isoformat(), value.isoformat()
    if period == "last_7_days":
        return (today - timedelta(days=6)).isoformat(), today.isoformat()
    if period == "last_30_days":
        return (today - timedelta(days=29)).isoformat(), today.isoformat()
    if period in {"this_month", "last_month"}:
        first = today.replace(day=1)
        if period == "last_month":
            last = first - timedelta(days=1)
            first = last.replace(day=1)
            return first.isoformat(), last.isoformat()
        next_month = date(
            first.year + (first.month == 12), 1 if first.month == 12 else first.month + 1, 1
        )
        return first.isoformat(), (next_month - timedelta(days=1)).isoformat()
    raise ProblemError(422, "PERIOD_INVALID", "Unsupported period")


class ReadOnlyTools:
    def __init__(
        self,
        database_path,
        user_id: str,
        allowed_ledger_ids: set[str] | None = None,
    ):
        self.database_path = database_path
        self.user_id = user_id
        self.allowed_ledger_ids = allowed_ledger_ids

    def _accessible_ledgers(self, connection):
        rows = connection.execute(
            "SELECT l.* FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id "
            "WHERE m.user_id = ? AND l.deleted_at IS NULL ORDER BY l.type, l.created_at",
            (self.user_id,),
        ).fetchall()
        if self.allowed_ledger_ids is not None:
            rows = [row for row in rows if row["id"] in self.allowed_ledger_ids]
        return rows

    def _ledger(self, connection, ref: str):
        rows = self._accessible_ledgers(connection)
        if ref == "personal":
            row = next((item for item in rows if item["type"] == "personal"), None)
        else:
            row = next((item for item in rows if item["id"] == ref), None)
            if not row and ref.startswith("t"):
                trackers = [item for item in rows if item["type"] == "tracker"]
                try:
                    row = trackers[int(ref[1:]) - 1]
                except (ValueError, IndexError):
                    row = None
        if not row:
            raise ProblemError(404, "LEDGER_NOT_FOUND", "Ledger reference not found")
        return row

    def list_ledgers(self):
        connection = connect(self.database_path)
        try:
            rows = self._accessible_ledgers(connection)
            trackers = [
                {
                    "ref": f"t{index}",
                    "id": row["id"],
                    "name": _clean(row["name"]),
                    "type": row["type"],
                    "currency": row["currency_code"],
                }
                for index, row in enumerate(
                    [row for row in rows if row["type"] == "tracker"], 1
                )
            ]
            personals = [
                {
                    "ref": "personal",
                    "id": row["id"],
                    "name": _clean(row["name"]),
                    "type": row["type"],
                    "currency": row["currency_code"],
                }
                for row in rows
                if row["type"] == "personal"
            ]
            return personals + trackers
        finally:
            connection.close()

    def summary(
        self, ledger: str, period: str = "this_month", group_by: str = "none", start=None, end=None
    ):
        connection = connect(self.database_path)
        try:
            book = self._ledger(connection, ledger)
            start, end = period_dates(period, start, end)
            rows = connection.execute(
                "SELECT * FROM receipts WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL AND purchased_on BETWEEN ? AND ?",
                (book["id"], start, end),
            ).fetchall()
            total = sum(row["total_ledger_minor"] or 0 for row in rows)
            groups = {}
            if group_by == "day":
                for row in rows:
                    groups.setdefault(row["purchased_on"], [0, 0])
                    groups[row["purchased_on"]][0] += row["total_ledger_minor"] or 0
                    groups[row["purchased_on"]][1] += 1
            elif group_by == "merchant":
                for row in rows:
                    key = _clean(row["merchant"] or "Tanpa merchant")
                    groups.setdefault(key, [0, 0])
                    groups[key][0] += row["total_ledger_minor"] or 0
                    groups[key][1] += 1
            elif group_by == "category":
                for row in connection.execute(
                    "SELECT COALESCE(c.name, 'Belum dikategorikan') AS label, SUM(COALESCE(li.amount_ledger_minor, li.amount_minor, 0)) amount, COUNT(*) count FROM line_items li JOIN receipts r ON r.id = li.receipt_id LEFT JOIN categories c ON c.id = li.category_id WHERE r.ledger_id = ? AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.purchased_on BETWEEN ? AND ? GROUP BY c.name",
                    (book["id"], start, end),
                ).fetchall():
                    groups[row["label"]] = [row["amount"], row["count"]]
            return {
                "ledger_name": _clean(book["name"]),
                "currency": book["currency_code"],
                "period_resolved": {"from": start, "to": end},
                "total_minor": total,
                "count": len(rows),
                "groups": [
                    {
                        "label": key,
                        "amount_minor": value[0],
                        "display": f"{value[0]}",
                        "count": value[1],
                    }
                    for key, value in groups.items()
                ],
            }
        finally:
            connection.close()

    def search_items(
        self, ledger: str, keyword: str, period: str = "this_month", start=None, end=None
    ):
        if len(keyword) > 40:
            raise ProblemError(422, "KEYWORD_TOO_LONG", "Keyword is limited to 40 characters")
        connection = connect(self.database_path)
        try:
            book = self._ledger(connection, ledger)
            start, end = period_dates(period, start, end)
            query = f"%{normalize_text(keyword)}%"
            rows = connection.execute(
                "SELECT r.purchased_on, r.merchant, li.name, li.amount_ledger_minor FROM line_items li JOIN receipts r ON r.id = li.receipt_id WHERE r.ledger_id = ? AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.purchased_on BETWEEN ? AND ? AND li.name_norm LIKE ? ORDER BY r.purchased_on DESC LIMIT 20",
                (book["id"], start, end, query),
            ).fetchall()
            return {
                "ledger_name": _clean(book["name"]),
                "currency": book["currency_code"],
                "period_resolved": {"from": start, "to": end},
                "count": len(rows),
                "items": [
                    {
                        "date": row["purchased_on"],
                        "name": _clean(row["name"]),
                        "merchant": _clean(row["merchant"]),
                        "amount_minor": row["amount_ledger_minor"],
                    }
                    for row in rows
                ],
            }
        finally:
            connection.close()

    def budget_status(self, ledger: str):
        connection = connect(self.database_path)
        try:
            book = self._ledger(connection, ledger)
            current_month = date.today().strftime("%Y-%m")
            budget = connection.execute(
                "SELECT period, limit_minor, start_date, end_date FROM budgets "
                "WHERE ledger_id = ? AND period IN (?, 'CUSTOM', 'ALL') "
                "ORDER BY CASE WHEN period = ? THEN 0 WHEN period = 'CUSTOM' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1",
                (book["id"], current_month, current_month),
            ).fetchone()
            if not budget:
                return {
                    "ledger_name": _clean(book["name"]),
                    "currency": book["currency_code"],
                    "period": None,
                    "start_date": None,
                    "end_date": None,
                    "limit_minor": None,
                    "spent_minor": 0,
                    "ratio_bp": None,
                    "level": "none",
                }
            if budget["start_date"] and budget["end_date"]:
                start, end = budget["start_date"], budget["end_date"]
            elif budget["period"] not in ("CUSTOM", "ALL"):
                start, end = period_dates("this_month")
            else:
                start, end = "0001-01-01", "9999-12-31"

            spent = connection.execute(
                "SELECT COALESCE(SUM(total_ledger_minor), 0) FROM receipts "
                "WHERE ledger_id = ? AND status = 'confirmed' AND deleted_at IS NULL AND purchased_on BETWEEN ? AND ?",
                (book["id"], start, end),
            ).fetchone()[0]
            limit = budget["limit_minor"]
            ratio = round(spent * 10000 / limit) if limit else None
            level = (
                "over"
                if ratio is not None and ratio >= 10000
                else "warning"
                if ratio is not None and ratio >= 8000
                else "normal"
            )
            return {
                "ledger_name": _clean(book["name"]),
                "currency": book["currency_code"],
                "period": budget["period"],
                "start_date": start,
                "end_date": end,
                "limit_minor": limit,
                "spent_minor": spent,
                "ratio_bp": ratio,
                "level": level,
            }
        finally:
            connection.close()
