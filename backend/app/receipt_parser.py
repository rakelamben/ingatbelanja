from __future__ import annotations

import re

from .money import AmountParseError, parse_amount

TOTAL_RE = re.compile(r"\b(grand\s+total|total|jumlah|tagihan)\b", re.I)
MERCHANT_RE = re.compile(r"[a-zA-Z][a-zA-Z .&'-]{2,}")


def parse_rule_candidate(rows: list[dict], currency: str = "IDR") -> dict:
    merchant = next(
        (row["text"].strip() for row in rows[:5] if MERCHANT_RE.fullmatch(row["text"].strip())),
        None,
    )
    total = None
    total_line_id = None
    items = []
    for row in rows:
        numbers = re.findall(r"(?:Rp|IDR|\$|€|£)?\s*[\d.,]+", row["text"], re.I)
        amount = None
        if numbers:
            try:
                amount = parse_amount(numbers[-1], 0 if currency in {"IDR", "JPY", "KRW"} else 2)
            except AmountParseError:
                amount = None
        if amount is not None and TOTAL_RE.search(row["text"]):
            total, total_line_id = amount, row["id"]
        elif amount is not None and not re.search(
            r"subtotal|pajak|tax|diskon|service|tunai|cash|kembali", row["text"], re.I
        ):
            name = row["text"][: row["text"].rfind(numbers[-1])].strip(" -:")
            if name:
                items.append({"name": name, "amount_minor": amount, "line_ids": [row["id"]]})
    issues = []
    if total is None:
        issues.append("EXTRACTION_FAILED")
    if (
        total is not None
        and items
        and abs(sum(item["amount_minor"] for item in items) - total)
        > max(100, round(total * 0.005))
    ):
        issues.append("TOTAL_MISMATCH")
    return {
        "merchant": merchant,
        "currency": currency,
        "total_minor": total,
        "total_line_id": total_line_id,
        "items": items,
        "issues": issues,
    }
