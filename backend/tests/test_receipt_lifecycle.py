import json

from app import create_app
from app.config import Settings
from app.db import connect, migrate


def make_app(tmp_path):
    settings = Settings(
        storage_dir=tmp_path / "storage", database_path=tmp_path / "storage" / "db.sqlite3"
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return create_app(settings)


def register(app):
    client = app.test_client()
    response = client.post(
        "/api/v1/auth/register", json={"username": "reviewer", "password": "password-aman"}
    )
    return client, response.json["csrf_token"], response.json["personal_ledger_id"]


def test_detail_patch_stale_delete_restore_and_report(tmp_path):
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)
    receipt = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/manual",
        json={"purchased_on": "2026-11-19", "amount_minor": 50000, "merchant_name": "=Unsafe"},
        headers={"X-CSRF-Token": csrf},
    ).json
    detail = client.get(f"/api/v1/receipts/{receipt['id']}")
    updated_at = detail.json["updated_at"]

    patched = client.patch(
        f"/api/v1/receipts/{receipt['id']}",
        json={"expected_updated_at": updated_at, "merchant_name": "Pasar"},
        headers={"X-CSRF-Token": csrf},
    )
    stale = client.patch(
        f"/api/v1/receipts/{receipt['id']}",
        json={"expected_updated_at": updated_at, "merchant_name": "Stale"},
        headers={"X-CSRF-Token": csrf},
    )
    listing = client.get(f"/api/v1/ledgers/{ledger_id}/receipts?status=confirmed")
    report = client.get(f"/api/v1/ledgers/{ledger_id}/reports/summary?period=2026-11")
    budget = client.put(
        f"/api/v1/ledgers/{ledger_id}/budgets/2026-11",
        json={"limit_minor": 100000},
        headers={"X-CSRF-Token": csrf},
    )
    export = client.get(f"/api/v1/ledgers/{ledger_id}/export?format=csv&period=2026-11")
    deleted = client.delete(f"/api/v1/receipts/{receipt['id']}", headers={"X-CSRF-Token": csrf})
    hidden = client.get(f"/api/v1/receipts/{receipt['id']}")
    restored = client.post(
        f"/api/v1/receipts/{receipt['id']}/restore", headers={"X-CSRF-Token": csrf}
    )

    assert patched.status_code == 200
    assert patched.json["merchant_name"] == "Pasar"
    assert stale.status_code == 409
    assert stale.json["code"] == "STALE_EDIT"
    assert listing.status_code == 200
    assert report.json["total_minor"] == 50000
    assert budget.status_code == 200
    assert export.status_code == 200
    assert export.data.startswith(b"\xef\xbb\xbf")
    assert b"'=Unsafe" in export.data or b"Pasar" in export.data
    assert deleted.status_code == 204
    assert hidden.status_code == 404
    assert restored.status_code == 200


def test_receipt_detail_returns_the_latest_extraction_candidate(tmp_path):
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)
    receipt = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/manual",
        json={"purchased_on": "2026-11-19", "amount_minor": 50000, "merchant_name": "Pasar"},
        headers={"X-CSRF-Token": csrf},
    ).json
    older_candidate = {"merchant": "Toko Lama", "items": []}
    latest_candidate = {
        "merchant": "Toko Baru",
        "purchased_on": "2026-11-19",
        "total_minor": 50000,
        "items": [{"name": "Beras", "amount_minor": 50000, "line_ids": ["r1"]}],
        "issues": [],
    }

    connection = connect(app.config["SETTINGS"].database_path)
    try:
        connection.executemany(
            "INSERT INTO extraction_runs(id, receipt_id, attempt, pipeline_version, rule_candidate, created_at) "
            "VALUES (?, ?, ?, 'test', ?, ?)",
            [
                ("run-1", receipt["id"], 1, json.dumps(older_candidate), "2026-11-19T10:00:00Z"),
                ("run-2", receipt["id"], 2, json.dumps(latest_candidate), "2026-11-19T11:00:00Z"),
            ],
        )
        connection.commit()
    finally:
        connection.close()

    response = client.get(f"/api/v1/receipts/{receipt['id']}")

    assert response.status_code == 200
    assert response.json["extraction_candidate"] == latest_candidate


def test_recent_items_are_ordered_by_input_time_and_include_category(tmp_path):
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)

    older = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/manual",
        json={
            "purchased_on": "2026-11-18",
            "amount_minor": 12500,
            "merchant_name": "Toko Lama",
            "category_id": "system-food",
        },
        headers={"X-CSRF-Token": csrf},
    ).json
    newer = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/manual",
        json={
            "purchased_on": "2026-11-17",
            "amount_minor": 23000,
            "merchant_name": "Toko Baru",
            "category_id": "system-transport",
        },
        headers={"X-CSRF-Token": csrf},
    ).json

    connection = connect(app.config["SETTINGS"].database_path)
    try:
        connection.execute(
            "UPDATE line_items SET created_at = ? WHERE receipt_id = ?",
            ("2026-11-20T10:00:00Z", older["id"]),
        )
        connection.execute(
            "UPDATE line_items SET created_at = ? WHERE receipt_id = ?",
            ("2026-11-20T11:00:00Z", newer["id"]),
        )
        connection.commit()
    finally:
        connection.close()

    response = client.get(f"/api/v1/ledgers/{ledger_id}/recent-items?limit=1")

    assert response.status_code == 200
    assert len(response.json["items"]) == 1
    assert response.json["items"][0]["receipt_id"] == newer["id"]
    assert response.json["items"][0]["category_name"] == "Transportasi"
    assert response.json["items"][0]["amount_ledger_minor"] == 23000
    assert response.json["items"][0]["purchased_on"] == "2026-11-17"
    assert response.json["next_cursor"]

    next_page = client.get(
        f"/api/v1/ledgers/{ledger_id}/recent-items?limit=1&cursor={response.json['next_cursor']}"
    )
    assert next_page.status_code == 200
    assert len(next_page.json["items"]) == 1
    assert next_page.json["items"][0]["receipt_id"] == older["id"]
    assert next_page.json["next_cursor"] is None


def test_patching_foreign_receipt_recalculates_ledger_amounts(tmp_path):
    app = make_app(tmp_path)
    client = app.test_client()
    session = client.post(
        "/api/v1/auth/register",
        json={"username": "reviewerfx", "password": "password-aman"},
        environ_overrides={"REMOTE_ADDR": "192.0.2.25"},
    ).json
    csrf = session["csrf_token"]
    tracker = client.post(
        "/api/v1/ledgers",
        json={"name": "USD book", "currency": "USD"},
        headers={"X-CSRF-Token": csrf},
    ).json
    receipt = client.post(
        f"/api/v1/ledgers/{tracker['id']}/receipts/manual",
        json={
            "purchased_on": "2026-11-19",
            "currency": "IDR",
            "amount_minor": 10000,
            "fx_rate": "0.0000625",
            "items": [
                {"name": "Nasi", "amount_minor": 5000, "category_id": "system-food"}
            ],
        },
        headers={"X-CSRF-Token": csrf},
    ).json
    detail = client.get(f"/api/v1/receipts/{receipt['id']}").json

    response = client.patch(
        f"/api/v1/receipts/{receipt['id']}",
        json={
            "expected_updated_at": detail["updated_at"],
            "total_minor": 20000,
            "fx_rate": "0.00005",
            "items": [
                {
                    "name": "Nasi",
                    "qty_milli": 1000,
                    "amount_minor": 10000,
                    "category_id": "system-food",
                }
            ],
        },
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 200
    assert response.json["total_ledger_minor"] == 100
    assert response.json["fx_rate"] == "0.00005"
    assert response.json["items"][0]["amount_ledger_minor"] == 50
