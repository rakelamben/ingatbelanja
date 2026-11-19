from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext


class AmountParseError(ValueError):
    pass


class FxUnavailable(RuntimeError):
    pass


def parse_amount(text: str, minor_unit: int = 0) -> int:
    """Parse common receipt notation into integer minor units."""
    if not isinstance(text, str):
        raise AmountParseError("amount must be text")
    value = text.strip().replace(" ", "")
    value = re.sub(
        r"(?i)(idr|usd|eur|gbp|jpy|sgd|myr|thb|aud|cad|chf|cny|krw|rp|[$€£¥฿₩])", "", value
    )
    value = re.sub(r"[-−]$", "", value)
    if not value or not re.fullmatch(r"[+-]?[\d.,]+", value):
        raise AmountParseError("invalid amount")

    sign = -1 if value.startswith("-") else 1
    value = value.lstrip("+-")
    separators = [index for index, char in enumerate(value) if char in ".,"]
    if not separators:
        number = Decimal(value)
    else:
        last = max(separators)
        fraction_length = len(value) - last - 1
        decimal_separator = fraction_length == minor_unit or (
            minor_unit == 0 and fraction_length == 2
        )
        if decimal_separator:
            integer_part = re.sub(r"[.,]", "", value[:last]) or "0"
            fraction_part = value[last + 1 :]
            number = Decimal(f"{integer_part}.{fraction_part}")
        else:
            number = Decimal(re.sub(r"[.,]", "", value))
    with localcontext() as context:
        context.prec = 28
        scaled = number * (Decimal(10) ** minor_unit)
        return sign * int(scaled.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def convert_minor(
    amount_minor: int, base_minor_unit: int, quote_minor_unit: int, rate: Decimal | str
) -> int:
    with localcontext() as context:
        context.prec = 28
        converted = (
            Decimal(amount_minor)
            / (Decimal(10) ** base_minor_unit)
            * Decimal(str(rate))
            * (Decimal(10) ** quote_minor_unit)
        )
        return int(converted.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def validate_rate(value: Decimal | str) -> Decimal:
    try:
        rate = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError("invalid exchange rate") from error
    if not rate.is_finite() or rate <= 0 or rate > Decimal("1000000000"):
        raise ValueError("exchange rate must be greater than 0 and at most 1000000000")
    if len(rate.as_tuple().digits) - rate.as_tuple().exponent > 28:
        raise ValueError("exchange rate has too many digits")
    return rate
