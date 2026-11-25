from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from .money import AmountParseError, parse_amount

TOTAL_RE = re.compile(
    r"\b(grand\s+total|total\s+belanja|total\s+bayar|total|jumlah|tagihan|amount\s+due)\b",
    re.I,
)
NON_FINAL_TOTAL_RE = re.compile(
    r"\b(sub\s*-?\s*total|total\s+(?:item|qty|pcs|diskon|hemat|pajak))\b",
    re.I,
)
TAX_RE = re.compile(r"\b(pajak|ppn|pb1|tax)\b", re.I)
SERVICE_RE = re.compile(r"\b(service(?:\s+charge)?|biaya\s+layanan)\b", re.I)
DISCOUNT_RE = re.compile(r"\b(diskon|discount|potongan|hemat|voucher)\b", re.I)
EXCLUDED_ITEM_RE = re.compile(
    r"\b(sub\s*-?\s*total|tunai|cash|kembali(?:an)?|change|bayar|dibayar|debit|kredit|credit|"
    r"qris|ovo|gopay|dana|shopeepay|transfer|card|edc|telp|kasir|npwp|"
    r"no\.?\s*(?:struk|nota|telp|hp|wa)|total\s+(?:item|qty|pcs))\b",
    re.I,
)
PRICE_LIKE_RE = re.compile(
    r"(?:Rp\.?|IDR|USD|EUR|GBP|JPY|SGD|MYR|THB|AUD|CAD|CHF|CNY|KRW|[$€£¥฿₩])\s*\d|"
    r"\b\d{1,3}(?:[.,]\d{3})+\b|"
    r"\b\d+[.,]\d{2}\b",
    re.I,
)
MONEY_RE = re.compile(
    r"(?<![\w/])(?:(?:Rp\.?|IDR|USD|EUR|GBP|JPY|SGD|MYR|THB|AUD|CAD|CHF|CNY|KRW|[$€£¥฿₩])\s*)?"
    r"[+-]?\d[\d.,]*(?!\w)",
    re.I,
)
QTY_ONLY_PREFIX_RE = re.compile(
    r"^\s*(?P<qty>\d+(?:[.,]\d+)?)\s*[x×]\s*(?P<unit>\d[\d.,]*)\s*$",
    re.I,
)
ISO_DATE_RE = re.compile(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b")
LOCAL_DATE_RE = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b")
MONTH_DATE_RE = re.compile(r"\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(20\d{2})\b", re.I)
MONTHS = {
    "jan": 1,
    "januari": 1,
    "feb": 2,
    "februari": 2,
    "mar": 3,
    "maret": 3,
    "apr": 4,
    "april": 4,
    "mei": 5,
    "may": 5,
    "jun": 6,
    "juni": 6,
    "jul": 7,
    "juli": 7,
    "agu": 8,
    "agustus": 8,
    "aug": 8,
    "sep": 9,
    "september": 9,
    "okt": 10,
    "oktober": 10,
    "oct": 10,
    "nov": 11,
    "november": 11,
    "des": 12,
    "desember": 12,
    "dec": 12,
}


def _date_from_parts(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _parse_date(text: str) -> str | None:
    match = ISO_DATE_RE.search(text)
    if match:
        year, month, day = map(int, match.groups())
        return _date_from_parts(year, month, day)

    match = LOCAL_DATE_RE.search(text)
    if match:
        first, second, year = map(int, match.groups())
        if year < 100:
            year += 2000
        return _date_from_parts(year, second, first) or _date_from_parts(year, first, second)

    match = MONTH_DATE_RE.search(text)
    if match:
        day, month_name, year = match.groups()
        month = MONTHS.get(month_name.casefold()[:3], MONTHS.get(month_name.casefold()))
        if month:
            return _date_from_parts(int(year), month, int(day))
    return None


def _line_ids(row: dict) -> list[str]:
    return [str(value) for value in row.get("line_ids", [row.get("id")]) if value is not None]


def _confidence(row: dict) -> float | None:
    value = row.get("confidence")
    return float(value) if value is not None else None


def _looks_like_merchant(text: str) -> bool:
    if len(re.findall(r"[^\W\d_]", text, re.UNICODE)) < 2:
        return False
    if _parse_date(text) or PRICE_LIKE_RE.search(text):
        return False
    if TOTAL_RE.search(text) or NON_FINAL_TOTAL_RE.search(text) or EXCLUDED_ITEM_RE.search(text):
        return False
    return True


def _parse_quantity_and_unit_price(prefix: str, currency: str) -> tuple[str, int, int | None]:
    match = re.search(
        r"^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*[x×]\s*(?P<unit>\d[\d.,]*)\s*$",
        prefix,
        re.I,
    )
    if not match:
        return prefix.strip(" -:"), 1000, None

    try:
        quantity = Decimal(match.group("qty").replace(",", "."))
        qty_milli = int((quantity * 1000).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        unit_minor = parse_amount(
            match.group("unit"), 0 if currency in {"IDR", "JPY", "KRW"} else 2
        )
    except (InvalidOperation, AmountParseError):
        return prefix.strip(" -:"), 1000, None

    if qty_milli <= 0:
        return prefix.strip(" -:"), 1000, None
    return match.group("name").strip(" -:"), qty_milli, unit_minor


def parse_rule_candidate(rows: list[dict], currency: str = "IDR") -> dict:
    merchant = None
    merchant_line_ids: list[str] = []
    merchant_confidence = None
    purchased_on = None
    date_line_ids: list[str] = []
    date_confidence = None
    total = None
    total_line_ids: list[str] = []
    total_confidence = None
    tax_minor = 0
    service_minor = 0
    discount_minor = 0
    items = []
    pending_name_row: dict | None = None
    minor_unit = 0 if currency in {"IDR", "JPY", "KRW"} else 2

    for row in rows:
        text = str(row.get("text", "")).strip()
        if not text:
            continue

        if purchased_on is None:
            parsed_date = _parse_date(text)
            if parsed_date:
                purchased_on = parsed_date
                date_line_ids = _line_ids(row)
                date_confidence = _confidence(row)
                pending_name_row = None
                continue

        if merchant is None and len(merchant_line_ids) == 0 and _looks_like_merchant(text):
            merchant = text
            merchant_line_ids = _line_ids(row)
            merchant_confidence = _confidence(row)
            continue

        matches = list(MONEY_RE.finditer(text))
        if not matches:
            if (
                re.search(r"[^\W\d_]", text, re.UNICODE)
                and not EXCLUDED_ITEM_RE.search(text)
                and not NON_FINAL_TOTAL_RE.search(text)
                and not TOTAL_RE.search(text)
            ):
                pending_name_row = row
            else:
                pending_name_row = None
            continue

        try:
            amount = parse_amount(matches[-1].group(0), minor_unit)
        except AmountParseError:
            amount = None

        if amount is None:
            pending_name_row = None
            continue

        if TOTAL_RE.search(text) and not NON_FINAL_TOTAL_RE.search(text):
            total = amount
            total_line_ids = _line_ids(row)
            total_confidence = _confidence(row)
            pending_name_row = None
            continue

        if TAX_RE.search(text):
            tax_minor += amount
            pending_name_row = None
            continue

        if SERVICE_RE.search(text):
            service_minor += amount
            pending_name_row = None
            continue

        if DISCOUNT_RE.search(text):
            discount_minor += abs(amount)
            pending_name_row = None
            continue

        if NON_FINAL_TOTAL_RE.search(text) or EXCLUDED_ITEM_RE.search(text):
            pending_name_row = None
            continue

        prefix = text[: matches[-1].start()].strip()
        qty_only = QTY_ONLY_PREFIX_RE.match(prefix)
        if qty_only:
            if pending_name_row is None:
                continue
            combined_prefix = f"{str(pending_name_row.get('text', '')).strip()} {prefix}"
            name, qty_milli, unit_price_minor = _parse_quantity_and_unit_price(
                combined_prefix, currency
            )
            item_line_ids = _line_ids(pending_name_row) + _line_ids(row)
            pending_conf = _confidence(pending_name_row)
            row_conf = _confidence(row)
            confs = [c for c in (pending_conf, row_conf) if c is not None]
            item_conf = sum(confs) / len(confs) if confs else None
            pending_name_row = None
        else:
            pending_name_row = None
            if not prefix or not re.search(r"[^\W\d_]", prefix, re.UNICODE):
                continue
            name, qty_milli, unit_price_minor = _parse_quantity_and_unit_price(prefix, currency)
            item_line_ids = _line_ids(row)
            item_conf = _confidence(row)

        if name:
            items.append(
                {
                    "name": name,
                    "qty_milli": qty_milli,
                    "unit_price_minor": unit_price_minor,
                    "amount_minor": amount,
                    "line_ids": item_line_ids,
                    "confidence": item_conf,
                }
            )

    issues = []
    if merchant is None:
        issues.append("MERCHANT_MISSING")
    if purchased_on is None:
        issues.append("DATE_MISSING")
    if total is None:
        issues.append("EXTRACTION_FAILED")
    if not items:
        issues.append("ITEMS_NOT_DETECTED")
    if total is not None and items:
        items_sum = sum(item["amount_minor"] for item in items)
        adjusted_sum = items_sum + tax_minor + service_minor - discount_minor
        tolerance = max(100, round(total * 0.005))
        if abs(items_sum - total) > tolerance and abs(adjusted_sum - total) > tolerance:
            issues.append("TOTAL_MISMATCH")

    return {
        "merchant": merchant,
        "merchant_line_ids": merchant_line_ids,
        "merchant_confidence": merchant_confidence,
        "purchased_on": purchased_on,
        "date_line_ids": date_line_ids,
        "date_confidence": date_confidence,
        "currency": currency,
        "total_minor": total,
        "total_line_ids": total_line_ids,
        "total_confidence": total_confidence,
        "items": items,
        "issues": issues,
    }
