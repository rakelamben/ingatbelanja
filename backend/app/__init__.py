from __future__ import annotations

import json
import logging
import sqlite3
import uuid

from flask import Flask, jsonify, request
from pydantic import ValidationError
from spectree import SpecTree

from .api.auth import auth
from .api.chat import chat_api
from .api.ledger import ledger_api
from .api.openapi import OPENAPI_DOCUMENT
from .api.receipt import receipt_api
from .api.receipt_lifecycle import receipt_lifecycle_api
from .api.reports import reports_api
from .config import Settings
from .db import assert_integrity, connect, schema_version
from .errors import ProblemError, problem_response
from .fx import FxService
from .security import RateLimiter, check_csrf, check_origin, load_session


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "level": record.levelname,
                "message": record.getMessage(),
                "logger": record.name,
            },
            ensure_ascii=False,
        )


def create_app(settings: Settings | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["SETTINGS"] = settings or Settings()
    app.config["SETTINGS"].ensure_directories()
    app.extensions["spectree"] = SpecTree("flask", app=app)
    app.extensions["rate_limiter"] = RateLimiter()
    app.register_blueprint(auth)
    app.register_blueprint(chat_api)
    app.register_blueprint(ledger_api)
    app.register_blueprint(receipt_api)
    app.register_blueprint(receipt_lifecycle_api)
    app.register_blueprint(reports_api)
    app.extensions["fx_service"] = FxService(app.config["SETTINGS"])

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    app.logger.handlers.clear()
    app.logger.addHandler(handler)
    app.logger.setLevel(app.config["SETTINGS"].log_level)

    @app.before_request
    def before_request():
        request.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        if request.path.startswith("/api/v1/"):
            if request.path not in {
                "/api/v1/health",
                "/api/v1/health/ready",
                "/api/v1/openapi.json",
                "/api/v1/docs",
            }:
                app.extensions["rate_limiter"].check(f"general:{request.remote_addr}", 300)
            load_session()
            check_origin()
            check_csrf()

    @app.errorhandler(ProblemError)
    def handle_problem(error: ProblemError):
        return problem_response(error)

    @app.errorhandler(sqlite3.OperationalError)
    def handle_database_error(error: sqlite3.OperationalError):
        if "locked" in str(error).lower():
            response = problem_response(ProblemError(503, "DB_BUSY", "Database is busy"))
            response.headers["Retry-After"] = "1"
            return response
        app.logger.exception("database error")
        return problem_response(ProblemError(500, "INTERNAL_ERROR", "Internal server error"))

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        return problem_response(ProblemError(422, "VALIDATION_ERROR", "Request is invalid"))

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        app.logger.exception("unhandled request error")
        return problem_response(ProblemError(500, "INTERNAL_ERROR", "Internal server error"))

    @app.after_request
    def security_headers(response):
        response.headers["X-Request-ID"] = getattr(request, "request_id", "unknown")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    @app.get("/api/health")
    def health() -> tuple[dict, int]:
        return jsonify({"status": "ok", "service": "ingatbelanjaan-api"}), 200

    @app.get("/api/v1/health")
    def api_health():
        return jsonify({"status": "ok", "service": "ingatbelanjaan-api"}), 200

    @app.get("/api/health/ready")
    @app.get("/api/v1/health/ready")
    def readiness():
        settings = app.config["SETTINGS"]
        try:
            connection = connect(settings.database_path)
            try:
                current_version = schema_version(connection)
                assert_integrity(connection)
            finally:
                connection.close()
            if current_version < settings.required_schema_version:
                raise RuntimeError("database migration is required")
        except Exception as error:
            return problem_response(ProblemError(503, "NOT_READY", str(error)))
        return jsonify({"status": "ready", "schema_version": current_version}), 200

    @app.get("/api/v1/openapi.json")
    def openapi():
        return jsonify(OPENAPI_DOCUMENT)

    @app.get("/api/v1/docs")
    def docs():
        return jsonify({"openapi": "/api/v1/openapi.json"})

    @app.get("/")
    def root() -> tuple[dict, int]:
        return jsonify({"name": "IngatBelanjaan", "status": "ready"}), 200

    return app
