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
