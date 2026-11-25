from app import create_app
from app.config import Settings
from app.db import connect, migrate
from app.utils import new_id, utc_now


def make_client(tmp_path):
    settings = Settings(
        storage_dir=tmp_path / "storage",
        database_path=tmp_path / "storage" / "db.sqlite3",
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return create_app(settings).test_client()


def test_register_login_me_and_logout(tmp_path) -> None:
    client = make_client(tmp_path)
    payload = {"username": "Rani_01", "password": "password-aman", "display_name": "Rani"}

    registered = client.post("/api/v1/auth/register", json=payload)

    assert registered.status_code == 201
    assert registered.json["csrf_token"]
    assert registered.json["personal_ledger_id"]
    csrf = registered.json["csrf_token"]
    assert "ib_session=" in registered.headers["Set-Cookie"]

    current = client.get("/api/v1/auth/me")
    assert current.status_code == 200
    csrf = current.json["csrf_token"]
    assert current.json["user"]["username"] == "Rani_01"

    logged_out = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logged_out.status_code == 204

    login = client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )
    assert login.status_code == 200


def test_csrf_origin_and_problem_contract(tmp_path) -> None:
    client = make_client(tmp_path)
    client.post(
        "/api/v1/auth/register",
        json={"username": "dimas", "password": "password-aman"},
    )
    response = client.post("/api/v1/auth/logout", headers={"Origin": "http://evil.invalid"})

    assert response.status_code == 403
    assert response.content_type == "application/problem+json"
    assert response.json["code"] == "ORIGIN_INVALID"
    assert response.json["request_id"]

    missing = client.get("/api/v1/auth/me")
    assert missing.status_code == 200


def test_local_frontend_origin_is_allowed_for_login(tmp_path) -> None:
    client = make_client(tmp_path)
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "nobody", "password": "password-aman"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 401
    assert response.json["code"] == "INVALID_CREDENTIALS"


def test_unauthenticated_mutation_has_structured_error(tmp_path) -> None:
    client = make_client(tmp_path)

    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 401
    assert response.content_type == "application/problem+json"
    assert response.json["code"] == "UNAUTHENTICATED"


def test_openapi_and_readiness(tmp_path) -> None:
    client = make_client(tmp_path)

    openapi = client.get("/api/v1/openapi.json")
    ready = client.get("/api/v1/health/ready")

    assert openapi.status_code == 200
    assert openapi.json["openapi"] == "3.0.3"
    assert "/auth/register" in openapi.json["paths"]
    assert ready.status_code == 200
    assert ready.json["schema_version"] == 5


def test_security_headers_and_request_id(tmp_path) -> None:
    client = make_client(tmp_path)

    response = client.get("/api/v1/health", headers={"X-Request-ID": "request-test-1"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "request-test-1"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "same-origin"


def test_general_rate_limit_returns_retry_header(tmp_path) -> None:
    client = make_client(tmp_path)

    for _ in range(300):
        client.get("/api/v1/auth/me")
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
    assert response.json["code"] == "RATE_LIMITED"


def test_lockout_after_five_failed_passwords(tmp_path) -> None:
    client = make_client(tmp_path)
    client.post("/api/v1/auth/register", json={"username": "lockme", "password": "password-aman"})
    body = {"username": "lockme", "password": "wrong-password"}

    responses = [client.post("/api/v1/auth/login", json=body) for _ in range(6)]

    assert [response.status_code for response in responses[:5]] == [401] * 5
    assert responses[5].status_code == 423
    assert responses[5].json["code"] == "ACCOUNT_LOCKED"


def test_expired_session_is_rejected(tmp_path) -> None:
    client = make_client(tmp_path)
    registered = client.post(
        "/api/v1/auth/register", json={"username": "expired", "password": "password-aman"}
    )
    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        connection.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00+00:00'")
    finally:
        connection.close()

    response = client.get("/api/v1/auth/me")

    assert registered.status_code == 201
    assert response.status_code == 401


def test_change_password_revokes_other_sessions(tmp_path) -> None:
    first = make_client(tmp_path)
    registered = first.post(
        "/api/v1/auth/register", json={"username": "change", "password": "password-lama"}
    )
    second = make_client(tmp_path)
    second.post("/api/v1/auth/login", json={"username": "change", "password": "password-lama"})
    response = first.post(
        "/api/v1/auth/change-password",
        json={"current_password": "password-lama", "new_password": "password-baru"},
        headers={"X-CSRF-Token": registered.json["csrf_token"]},
    )

    assert response.status_code == 204
    assert second.get("/api/v1/auth/me").status_code == 401
    login = second.post(
        "/api/v1/auth/login", json={"username": "change", "password": "password-baru"}
    )
    assert login.status_code == 200


def test_admin_reset_password_revokes_sessions(tmp_path, monkeypatch) -> None:
    import tasks

    client = make_client(tmp_path)
    registered = client.post(
        "/api/v1/auth/register", json={"username": "resetme", "password": "password-lama"}
    )
    settings = Settings(
        storage_dir=tmp_path / "storage", database_path=tmp_path / "storage" / "db.sqlite3"
    )
    monkeypatch.setattr(tasks, "Settings", lambda: settings)

    tasks.admin_reset_password("resetme", "password-baru")

    assert registered.status_code == 201
    assert client.get("/api/v1/auth/me").status_code == 401
    login = client.post(
        "/api/v1/auth/login", json={"username": "resetme", "password": "password-baru"}
    )
    assert login.status_code == 200


def test_delete_account_and_shared_tracker_guard(tmp_path) -> None:
    first = make_client(tmp_path)
    registered = first.post(
        "/api/v1/auth/register", json={"username": "owner", "password": "password-aman"}
    )
    second = make_client(tmp_path)
    second_registered = second.post(
        "/api/v1/auth/register", json={"username": "member", "password": "password-aman"}
    )
    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        tracker_id = new_id()
        now = utc_now()
        connection.execute(
            "INSERT INTO ledgers(id, name, type, currency_code, owner_id, created_at) "
            "VALUES (?, 'Shared', 'tracker', 'IDR', ?, ?)",
            (tracker_id, registered.json["user"]["id"], now),
        )
        connection.execute(
            "INSERT INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
            (tracker_id, registered.json["user"]["id"], now),
        )
        connection.execute(
            "INSERT INTO ledger_members(ledger_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
            (tracker_id, second_registered.json["user"]["id"], now),
        )
    finally:
        connection.close()
    blocked = first.delete(
        "/api/v1/auth/me",
        json={"password": "password-aman"},
        headers={"X-CSRF-Token": registered.json["csrf_token"]},
    )

    assert blocked.status_code == 409
    assert blocked.json["code"] == "OWNS_SHARED_TRACKER"
