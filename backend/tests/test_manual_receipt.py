from decimal import Decimal

import httpx
from app import create_app
from app.config import Settings
from app.db import connect, migrate
from app.fx import FxService
from app.money import convert_minor, parse_amount


def make_app(tmp_path):
    settings = Settings(
        storage_dir=tmp_path / "storage",
        database_path=tmp_path / "storage" / "db.sqlite3",
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return create_app(settings)


def register(app):
    client = app.test_client()
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "manual", "password": "password-aman"},
    )
    return client, response.json["csrf_token"], response.json["personal_ledger_id"]


def test_parse_amount_and_round_half_up() -> None:
    assert parse_amount("Rp 12.500", 0) == 12500
    assert parse_amount("12.500,00", 0) == 12500
    assert parse_amount("$ 1,234.56", 2) == 123456
    assert parse_amount("1.234,56", 2) == 123456
    assert convert_minor(1, 2, 0, Decimal("1.005")) == 0
    assert convert_minor(100, 2, 0, Decimal("1.005")) == 1


def test_manual_receipt_uses_book_currency_and_item(tmp_path) -> None:
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)

    response = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/manual",
        json={
            "purchased_on": "2026-11-19",
            "amount_minor": 12500,
            "merchant_name": "Warung Pagi",
            "category_id": "system-food",
        },
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 201
    assert response.json["status"] == "confirmed"
    assert response.json["currency"] == "IDR"
    assert response.json["fx_source"] == "none"
    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        assert connection.execute("SELECT COUNT(*) FROM receipts").fetchone()[0] == 1
        assert (
            connection.execute("SELECT amount_ledger_minor FROM line_items").fetchone()[0] == 12500
        )
    finally:
        connection.close()


def test_manual_receipt_saves_categorized_items_with_fx_conversion(tmp_path) -> None:
    app = make_app(tmp_path)
    client, csrf, _ = register(app)
    tracker = client.post(
        "/api/v1/ledgers",
        json={"name": "Foreign expenses", "currency": "USD"},
        headers={"X-CSRF-Token": csrf},
    ).json

    response = client.post(
        f"/api/v1/ledgers/{tracker['id']}/receipts/manual",
        json={
            "purchased_on": "2026-11-19",
            "currency": "IDR",
            "amount_minor": 10000,
            "merchant_name": "Warung Pagi",
            "fx_rate": "0.0000625",
            "items": [
                {
                    "name": "Nasi",
                    "qty_milli": 1000,
                    "unit_price_minor": 5000,
                    "amount_minor": 5000,
                    "category_id": "system-food",
                },
                {
                    "name": "Teh",
                    "qty_milli": 1000,
                    "unit_price_minor": 3000,
                    "amount_minor": 3000,
                    "category_id": "system-food",
                },
            ],
        },
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 201
    assert [item["amount_ledger_minor"] for item in response.json["items"]] == [31, 19]
    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        rows = connection.execute(
            "SELECT name, category_id, amount_minor, amount_ledger_minor "
            "FROM line_items WHERE receipt_id = ? ORDER BY name",
            (response.json["id"],),
        ).fetchall()
        assert [(row["name"], row["amount_minor"], row["amount_ledger_minor"]) for row in rows] == [
            ("Nasi", 5000, 31),
            ("Teh", 3000, 19),
        ]
    finally:
        connection.close()


def test_fx_cache_is_used_after_first_request(tmp_path, monkeypatch) -> None:
    app = make_app(tmp_path)
    settings = app.config["SETTINGS"]
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"rate": 0.0000625, "date": "2026-11-18"}

    def fake_get(*args, **kwargs):
        calls.append((args, kwargs))
        return FakeResponse()

    monkeypatch.setattr(httpx, "get", fake_get)
    service = FxService(settings)
    first = service.resolve("2026-11-19", "IDR", "USD")
    second = service.resolve("2026-11-19", "IDR", "USD")

    assert first == second
    assert first["fx_date"] == "2026-11-18"
    assert len(calls) == 1


def test_manual_foreign_receipt_requires_rate_or_accepts_manual_rate(tmp_path, monkeypatch) -> None:
    app = make_app(tmp_path)
    client, csrf, _ = register(app)
    tracker = client.post(
        "/api/v1/ledgers",
        json={"name": "Dollar trip", "currency": "USD"},
        headers={"X-CSRF-Token": csrf},
    ).json

    def unavailable(*args, **kwargs):
        from app.money import FxUnavailable

        raise FxUnavailable("offline")

    monkeypatch.setattr(app.extensions["fx_service"], "resolve", unavailable)
    failed = client.post(
        f"/api/v1/ledgers/{tracker['id']}/receipts/manual",
        json={"purchased_on": "2026-11-19", "currency": "IDR", "amount_minor": 10000},
        headers={"X-CSRF-Token": csrf},
    )
    assert failed.status_code == 409
    assert failed.json["code"] == "FX_RATE_NEEDED"

    monkeypatch.setattr(
        app.extensions["fx_service"],
        "resolve",
        lambda *args, **kwargs: {"rate": "0.0000625", "fx_date": "2026-11-19", "source": "manual"},
    )
    accepted = client.post(
        f"/api/v1/ledgers/{tracker['id']}/receipts/manual",
        json={
            "purchased_on": "2026-11-19",
            "currency": "IDR",
            "amount_minor": 10000,
            "fx_rate": "0.0000625",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert accepted.status_code == 201
    assert accepted.json["fx_source"] == "manual"


def test_ledger_currency_cannot_change_after_receipt(tmp_path) -> None:
    app = make_app(tmp_path)
    client, csrf, _ = register(app)
    tracker = client.post(
        "/api/v1/ledgers",
        json={"name": "Currency lock", "currency": "IDR"},
        headers={"X-CSRF-Token": csrf},
    ).json
    client.post(
        f"/api/v1/ledgers/{tracker['id']}/receipts/manual",
        json={"purchased_on": "2026-11-19", "amount_minor": 10000},
        headers={"X-CSRF-Token": csrf},
    )

    response = client.patch(
        f"/api/v1/ledgers/{tracker['id']}",
        json={"currency": "USD"},
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 409
    assert response.json["code"] == "CURRENCY_LOCKED"
