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
