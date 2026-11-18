"""Parser aturan minimal untuk spike; bukan implementasi domain production."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


@dataclass(frozen=True)
class ParsedReceipt:
    merchant: str | None
    purchased_on: str | None
    total_minor: int | None
    item_total_minor: int


def parse_amount(text: str) -> int | None:
    """Parse nominal IDR sederhana menjadi integer minor unit."""
    value = re.sub(r"(?i)(idr|rp)\s*", "", text).strip()
    value = value.replace(" ", "")
    if not re.fullmatch(r"\d[\d.,]*", value):
        return None

    # Spike memakai kebijakan IDR: separator diperlakukan sebagai ribuan.
    digits = re.sub(r"[.,]", "", value)
    try:
        return int(Decimal(digits).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError):
        return None


def parse_lines(lines: list[str]) -> ParsedReceipt:
    cleaned = [line.strip() for line in lines if line.strip()]
    merchant = cleaned[0] if cleaned and not re.search(r"\d", cleaned[0]) else None
    date = next(
        (match.group(0) for line in cleaned if (match := re.search(r"\b\d{2}/\d{2}/\d{4}\b", line))),
        None,
    )
    normalized_date = None
    if date:
        day, month, year = date.split("/")
        normalized_date = f"{year}-{month}-{day}"

    item_total = 0
    total = None
    for line in cleaned:
        # Require an explicit currency marker in this spike so dates and
        # unrelated trailing numbers are not mistaken for money.
        amount_match = re.search(r"(?:Rp|IDR)\s*([\d.,]+)\s*$", line, re.I)
        if not amount_match:
            continue
        amount = parse_amount(amount_match.group(0))
        if amount is None:
            continue
        if re.search(r"\btotal\b", line, re.I):
            total = amount
        elif not re.search(r"subtotal|pajak|tax|diskon|tunai|kembali", line, re.I):
            item_total += amount

    return ParsedReceipt(merchant, normalized_date, total, item_total)


def validate(parsed: ParsedReceipt, expected_total: int, expected_date: str) -> tuple[bool, list[str]]:
    issues: list[str] = []
    if parsed.total_minor != expected_total:
        issues.append("TOTAL_INCORRECT")
    if parsed.purchased_on != expected_date:
        issues.append("DATE_INCORRECT")
    if parsed.total_minor is not None and parsed.item_total_minor > parsed.total_minor:
        issues.append("ITEM_SUM_EXCEEDS_TOTAL")
    return not issues, issues
