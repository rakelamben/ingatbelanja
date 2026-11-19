from __future__ import annotations

from flask import Flask, jsonify

from .config import Settings


def create_app(settings: Settings | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["SETTINGS"] = settings or Settings()

    @app.get("/api/health")
    def health() -> tuple[dict, int]:
        return jsonify({"status": "ok", "service": "ingatbelanjaan-api"}), 200

    @app.get("/")
    def root() -> tuple[dict, int]:
        return jsonify({"name": "IngatBelanjaan", "status": "ready"}), 200

    return app
