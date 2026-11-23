from app import create_app
from app.api.auth import limiter
from app.config import Settings
from app.db import connect, migrate


def make_client(tmp_path):
    limiter._events.clear()
    settings = Settings(
        storage_dir=tmp_path / "storage",
        database_path=tmp_path / "storage" / "db.sqlite3",
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return create_app(settings).test_client()


def register(client, username: str):
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "password-aman"},
    )
    return response, response.json["csrf_token"]


def test_tracker_owner_member_and_non_member_access(tmp_path) -> None:
    owner = make_client(tmp_path)
    owner_register, owner_csrf = register(owner, "owner")
    outsider = make_client(tmp_path)
    _, outsider_csrf = register(outsider, "outsider")
    member = make_client(tmp_path)
    _, member_csrf = register(member, "member")

    created = owner.post(
        "/api/v1/ledgers",
        json={"name": "Trip Bandung", "currency": "IDR"},
        headers={"X-CSRF-Token": owner_csrf},
    )
    ledger_id = created.json["id"]
    assert created.json["sum_spend"] == 0
    assert owner.get("/api/v1/ledgers").json["ledgers"][0]["sum_spend"] == 0
    invite = owner.post(
        f"/api/v1/ledgers/{ledger_id}/invites",
        json={"max_uses": 1},
        headers={"X-CSRF-Token": owner_csrf},
    )
    joined = member.post(
        "/api/v1/invites/join",
        json={"code": invite.json["code"]},
        headers={"X-CSRF-Token": member_csrf},
    )

    assert owner_register.status_code == 201
    assert created.status_code == 201
    assert outsider.get(f"/api/v1/ledgers/{ledger_id}").status_code == 404
    assert joined.status_code == 200
    assert member.get(f"/api/v1/ledgers/{ledger_id}").status_code == 200
    assert (
        owner.delete(
            f"/api/v1/ledgers/{ledger_id}/members/{member.get('/api/v1/auth/me').json['user']['id']}",
            headers={"X-CSRF-Token": owner_csrf},
        ).status_code
        == 204
    )


def test_invite_max_uses_and_owner_leave_rule(tmp_path) -> None:
    owner = make_client(tmp_path)
    _, owner_csrf = register(owner, "inviteowner")
    member = make_client(tmp_path)
    _, member_csrf = register(member, "inviteuser")
    ledger = owner.post(
        "/api/v1/ledgers",
        json={"name": "Project", "currency": "USD"},
        headers={"X-CSRF-Token": owner_csrf},
    ).json
    invite = owner.post(
        f"/api/v1/ledgers/{ledger['id']}/invites",
        json={"max_uses": 1},
        headers={"X-CSRF-Token": owner_csrf},
    ).json

    first_join = member.post(
        "/api/v1/invites/join", json={"code": invite["code"]}, headers={"X-CSRF-Token": member_csrf}
    )
    second_join = owner.post(
        "/api/v1/invites/join", json={"code": invite["code"]}, headers={"X-CSRF-Token": owner_csrf}
    )
    owner_leave = owner.post(
        f"/api/v1/ledgers/{ledger['id']}/leave", headers={"X-CSRF-Token": owner_csrf}
    )

    assert first_join.status_code == 200
    assert second_join.status_code == 404
    assert owner_leave.status_code == 409
    assert owner_leave.json["code"] == "OWNER_CANNOT_LEAVE"


def test_categories_are_owner_only_and_delete_uncategorizes_items(tmp_path) -> None:
    owner = make_client(tmp_path)
    _, owner_csrf = register(owner, "categoryowner")
    member = make_client(tmp_path)
    _, member_csrf = register(member, "categorymember")
    ledger = owner.post(
        "/api/v1/ledgers",
        json={"name": "Categories", "currency": "IDR"},
        headers={"X-CSRF-Token": owner_csrf},
    ).json
    invite = owner.post(
        f"/api/v1/ledgers/{ledger['id']}/invites",
        json={},
        headers={"X-CSRF-Token": owner_csrf},
    ).json
    member.post(
        "/api/v1/invites/join", json={"code": invite["code"]}, headers={"X-CSRF-Token": member_csrf}
    )
    category = owner.post(
        f"/api/v1/ledgers/{ledger['id']}/categories",
        json={"name": "Kopi"},
        headers={"X-CSRF-Token": owner_csrf},
    )
    member_create = member.post(
        f"/api/v1/ledgers/{ledger['id']}/categories",
        json={"name": "Rahasia"},
        headers={"X-CSRF-Token": member_csrf},
    )

    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        now = "2026-01-01T00:00:00Z"
        connection.execute(
            "INSERT INTO receipts(id, ledger_id, status, currency_code, source, created_at, updated_at) "
            "VALUES ('receipt-1', ?, 'confirmed', 'IDR', 'manual', ?, ?)",
            (ledger["id"], now, now),
        )
        connection.execute(
            "INSERT INTO line_items(id, receipt_id, category_id, name, name_norm, created_at) "
            "VALUES ('item-1', 'receipt-1', ?, 'Kopi', 'kopi', ?)",
            (category.json["id"], now),
        )
    finally:
        connection.close()
    deleted = owner.delete(
        f"/api/v1/categories/{category.json['id']}",
        headers={"X-CSRF-Token": owner_csrf},
    )
    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        item_category = connection.execute(
            "SELECT category_id FROM line_items WHERE id = 'item-1'"
        ).fetchone()[0]
    finally:
        connection.close()

    assert category.status_code == 201
    assert member_create.status_code == 403
    assert deleted.status_code == 204
    assert item_category is None
