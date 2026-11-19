from __future__ import annotations

from dataclasses import dataclass

from flask import jsonify, request


@dataclass
class ProblemError(Exception):
    status: int
    code: str
    detail: str
    title: str = "Request failed"


def problem_response(error: ProblemError):
    request_id = getattr(request, "request_id", "unknown")
    payload = {
        "type": f"https://ingatbelanjaan.local/problems/{error.code.lower()}",
        "title": error.title,
        "status": error.status,
        "code": error.code,
        "detail": error.detail,
        "request_id": request_id,
    }
    response = jsonify(payload)
    response.status_code = error.status
    response.content_type = "application/problem+json"
    if error.code == "RATE_LIMITED":
        response.headers["Retry-After"] = "60"
    return response
