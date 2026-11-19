from app import create_app


def test_health_endpoint() -> None:
    client = create_app().test_client()

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "service": "ingatbelanjaan-api"}


def test_settings_are_available() -> None:
    app = create_app()

    assert app.config["SETTINGS"].llm_provider == "fake"
    assert app.config["SETTINGS"].ocr_device == "cpu"
