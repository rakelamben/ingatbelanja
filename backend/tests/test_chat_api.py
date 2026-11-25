from app import create_app
from app.config import Settings
from app.db import connect, migrate


def make_app(tmp_path, provider="fake"):
    settings = Settings(
        storage_dir=tmp_path / "storage",
        database_path=tmp_path / "storage" / "db.sqlite3",
        llm_provider=provider,
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return create_app(settings)


def register(app):
    client = app.test_client()
    response = client.post(
        "/api/v1/auth/register", json={"username": "chatuser", "password": "password-aman"}
    )
    return client, response.json["csrf_token"]


def test_chat_requires_consent_and_fake_provider_is_read_only(tmp_path):
    app = make_app(tmp_path)
    client, csrf = register(app)
    thread = client.post("/api/v1/chat/threads", headers={"X-CSRF-Token": csrf}).json
    denied = client.post(
        f"/api/v1/chat/threads/{thread['id']}/messages",
        json={"content": "Berapa total belanja saya?"},
        headers={"X-CSRF-Token": csrf},
    )
    acknowledged = client.post("/api/v1/auth/ack-ai-notice", headers={"X-CSRF-Token": csrf})
    answer = client.post(
        f"/api/v1/chat/threads/{thread['id']}/messages",
        json={"content": "Berapa total belanja saya?"},
        headers={"X-CSRF-Token": csrf},
    )
    messages = client.get(f"/api/v1/chat/threads/{thread['id']}/messages")

    assert denied.status_code == 409
    assert denied.json["code"] == "AI_NOTICE_REQUIRED"
    assert acknowledged.status_code == 204
    assert answer.status_code == 200
    assert answer.json["verified"] is True
    assert messages.status_code == 200
    assert len(messages.json["messages"]) == 2


def test_chat_none_provider_and_private_thread_access(tmp_path):
    app = make_app(tmp_path, provider="none")
    client, csrf = register(app)
    client.post("/api/v1/auth/ack-ai-notice", headers={"X-CSRF-Token": csrf})
    thread = client.post("/api/v1/chat/threads", headers={"X-CSRF-Token": csrf}).json
    unavailable = client.post(
        f"/api/v1/chat/threads/{thread['id']}/messages",
        json={"content": "Total belanja?"},
        headers={"X-CSRF-Token": csrf},
    )

    assert unavailable.status_code == 503
    assert unavailable.json["code"] == "LLM_UNAVAILABLE"


def test_chat_watched_ledgers_filtering_and_budget_intent(tmp_path):
    app = make_app(tmp_path)
    client, csrf = register(app)
    client.post("/api/v1/auth/ack-ai-notice", headers={"X-CSRF-Token": csrf})
    ledgers = client.get("/api/v1/ledgers").json["ledgers"]
    personal_id = next(item["id"] for item in ledgers if item["type"] == "personal")

    tracker_a = client.post(
        "/api/v1/ledgers",
        json={"name": "Liburan", "currency": "IDR"},
        headers={"X-CSRF-Token": csrf},
    ).json
    tracker_b = client.post(
        "/api/v1/ledgers",
        json={"name": "Kantor", "currency": "IDR"},
        headers={"X-CSRF-Token": csrf},
    ).json

    client.post(
        f"/api/v1/ledgers/{tracker_a['id']}/receipts/manual",
        json={
            "purchased_on": "2026-11-20",
            "currency": "IDR",
            "amount_minor": 150000,
            "items": [{"name": "Tiket", "amount_minor": 150000}],
        },
        headers={"X-CSRF-Token": csrf},
    )
    client.post(
        f"/api/v1/ledgers/{tracker_b['id']}/receipts/manual",
        json={
            "purchased_on": "2026-11-20",
            "currency": "IDR",
            "amount_minor": 99000,
            "items": [{"name": "Printer", "amount_minor": 99000}],
        },
        headers={"X-CSRF-Token": csrf},
    )
    client.put(
        f"/api/v1/ledgers/{tracker_a['id']}/budgets/CUSTOM",
        json={"limit_minor": 500000, "start_date": "2026-11-01", "end_date": "2026-11-30"},
        headers={"X-CSRF-Token": csrf},
    )

    thread = client.post("/api/v1/chat/threads", headers={"X-CSRF-Token": csrf}).json

    # Only watch tracker_a (personal is always enforced on server too)
    list_res = client.post(
        f"/api/v1/chat/threads/{thread['id']}/messages",
        json={"content": "Daftar buku apa saja yang diawasi?", "ledger_ids": [tracker_a["id"]]},
        headers={"X-CSRF-Token": csrf},
    )
    assert list_res.status_code == 200
    assert "Liburan" in list_res.json["content"]
    assert "Kantor" not in list_res.json["content"]
    assert personal_id

    budget_res = client.post(
        f"/api/v1/chat/threads/{thread['id']}/messages",
        json={"content": "Bagaimana status anggaran saya?", "ledger_ids": [tracker_a["id"]]},
        headers={"X-CSRF-Token": csrf},
    )
    assert budget_res.status_code == 200
    assert budget_res.json["verified"] is True
    assert any(b["title"] == "Status Anggaran" for b in budget_res.json["blocks"])

    oos_res = client.post(
        f"/api/v1/chat/threads/{thread['id']}/messages",
        json={"content": "Siapa penemu lampu pijar?", "ledger_ids": [tracker_a["id"]]},
        headers={"X-CSRF-Token": csrf},
    )
    assert oos_res.status_code == 200
    assert "pengeluaran" in oos_res.json["content"].lower()

