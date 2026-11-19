from __future__ import annotations

from decimal import Decimal

import httpx

from .config import Settings
from .db import connect
from .money import FxUnavailable, validate_rate
from .utils import utc_now


class FxService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def resolve(
        self,
        rate_date: str,
        base_code: str,
        quote_code: str,
        manual_rate: str | Decimal | None = None,
    ) -> dict[str, str]:
        if base_code == quote_code:
            return {"rate": "1", "fx_date": rate_date, "source": "none"}
        if manual_rate is not None:
            rate = validate_rate(manual_rate)
            return {"rate": str(rate), "fx_date": rate_date, "source": "manual"}

        connection = connect(self.settings.database_path)
        try:
            cached = connection.execute(
                "SELECT rate, rate_date, effective_date, source FROM fx_rates "
                "WHERE rate_date = ? AND base_code = ? AND quote_code = ?",
                (rate_date, base_code, quote_code),
            ).fetchone()
        finally:
            connection.close()
        if cached:
            return {
                "rate": cached["rate"],
                "fx_date": cached["effective_date"] or cached["rate_date"],
                "source": cached["source"],
            }

        url = f"{self.settings.fx_base_url.rstrip('/')}/rate/{base_code}/{quote_code}"
        try:
            response = httpx.get(
                url, params={"date": rate_date}, timeout=self.settings.fx_timeout_s
            )
            response.raise_for_status()
            payload = response.json()
            rate = validate_rate(payload["rate"])
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise FxUnavailable("exchange rate is unavailable") from error
        effective_date = str(payload.get("date") or payload.get("effective_date") or rate_date)
        connection = connect(self.settings.database_path)
        try:
            connection.execute(
                "INSERT OR REPLACE INTO fx_rates(rate_date, base_code, quote_code, rate, effective_date, source, fetched_at) "
                "VALUES (?, ?, ?, ?, ?, 'frankfurter', ?)",
                (rate_date, base_code, quote_code, str(rate), effective_date, utc_now()),
            )
        finally:
            connection.close()
        return {"rate": str(rate), "fx_date": effective_date, "source": "frankfurter"}
