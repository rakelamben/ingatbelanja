from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal


def new_id() -> str:
    return str(uuid.uuid4())


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    lowered = without_marks.casefold()
    cleaned = re.sub(r"[^\w\s]", " ", lowered, flags=re.UNICODE)
    return " ".join(cleaned.split())


def money_to_minor(value: Decimal | str | int | float, decimal_places: int) -> int:
    amount = Decimal(str(value)) * (Decimal(10) ** decimal_places)
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def qty_to_milli(value: Decimal | str | int | float) -> int:
    quantity = Decimal(str(value)) * 1000
    return int(quantity.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
