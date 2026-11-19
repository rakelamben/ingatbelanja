from __future__ import annotations

import json
import re
from datetime import date

from flask import Blueprint, current_app, g, jsonify, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..chat_tools import ReadOnlyTools
from ..chat_verifier import verify_answer
from ..db import connect, tx
from ..errors import ProblemError
from ..llm import LLMUnavailable, build_llm
from ..security import RateLimiter, require_auth
from ..utils import new_id, utc_now

chat_api = Blueprint("chat", __name__, url_prefix="/api/v1")


class MessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=500)


def _uid():
    return g.current_user["user_id"]


def _body():
    try:
        return MessageRequest.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        raise ProblemError(422, "VALIDATION_ERROR", "Request body is invalid") from error


def _thread(connection, thread_id):
    row = connection.execute(
        "SELECT * FROM chat_threads WHERE id = ? AND user_id = ?", (thread_id, _uid())
    ).fetchone()
    if not row:
        raise ProblemError(404, "THREAD_NOT_FOUND", "Chat thread not found")
    return row


@chat_api.post("/chat/threads")
@require_auth
def create_thread():
    thread_id = new_id()
    now = utc_now()
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        connection.execute(
            "INSERT INTO chat_threads(id, user_id, title, created_at, updated_at) VALUES (?, ?, 'Percakapan baru', ?, ?)",
            (thread_id, _uid(), now, now),
        )
        return jsonify(
            {"id": thread_id, "title": "Percakapan baru", "created_at": now, "updated_at": now}
        ), 201
    finally:
        connection.close()


@chat_api.get("/chat/threads")
@require_auth
def list_threads():
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        rows = connection.execute(
            "SELECT id, title, created_at, updated_at FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC",
            (_uid(),),
        ).fetchall()
        return jsonify({"threads": [dict(row) for row in rows]})
    finally:
        connection.close()


@chat_api.get("/chat/threads/<thread_id>/messages")
@require_auth
def list_messages(thread_id):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        _thread(connection, thread_id)
        rows = connection.execute(
            "SELECT id, role, content, tool_calls, blocks, verified, created_at FROM chat_messages WHERE thread_id = ? ORDER BY created_at, id",
            (thread_id,),
        ).fetchall()
        return jsonify(
            {
                "messages": [
                    {
                        **dict(row),
                        "tool_calls": json.loads(row["tool_calls"]) if row["tool_calls"] else None,
                        "blocks": json.loads(row["blocks"]) if row["blocks"] else None,
                        "verified": bool(row["verified"]),
                    }
                    for row in rows
                ]
            }
        )
    finally:
        connection.close()


@chat_api.post("/chat/threads/<thread_id>/messages")
@require_auth
def send_message(thread_id):
    payload = _body()
    settings = current_app.config["SETTINGS"]
    limiter: RateLimiter = current_app.extensions["rate_limiter"]
    limiter.check(f"chat:{_uid()}", 20)
    busy = current_app.extensions.setdefault("chat_busy", set())
    if _uid() in busy:
        raise ProblemError(429, "CHAT_BUSY", "Another chat request is running")
    busy.add(_uid())
    try:
        connection = connect(settings.database_path)
        try:
            _thread(connection, thread_id)
            user = connection.execute(
                "SELECT ai_notice_ack_at FROM users WHERE id = ?", (_uid(),)
            ).fetchone()
            if not user or not user["ai_notice_ack_at"]:
                raise ProblemError(
                    409, "AI_NOTICE_REQUIRED", "AI notice must be acknowledged first"
                )
            usage_date = date.today().isoformat()
            with tx(connection, write=True):
                usage = connection.execute(
                    "SELECT chat_count FROM llm_usage WHERE user_id = ? AND usage_date = ?",
                    (_uid(), usage_date),
                ).fetchone()
                if usage and usage["chat_count"] >= settings.limit_chat_per_day:
                    raise ProblemError(429, "QUOTA_EXCEEDED", "Daily chat quota exceeded")
                connection.execute(
                    "INSERT INTO llm_usage(user_id, usage_date, chat_count) VALUES (?, ?, 1) ON CONFLICT(user_id, usage_date) DO UPDATE SET chat_count = chat_count + 1",
                    (_uid(), usage_date),
                )
                now = utc_now()
                connection.execute(
                    "INSERT INTO chat_messages(id, thread_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)",
                    (new_id(), thread_id, payload.content, now),
                )
                history = connection.execute(
                    "SELECT role, content FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 6",
                    (thread_id,),
                ).fetchall()
            tools = ReadOnlyTools(settings.database_path, _uid())
            try:
                result = build_llm(settings).answer(
                    payload.content, {"history": [dict(row) for row in reversed(history)]}, tools
                )
            except LLMUnavailable as error:
                raise ProblemError(503, "LLM_UNAVAILABLE", str(error)) from error
            allowed = set(re.findall(r"\d[\d.,]*", result.get("content", "")))
            for call in result.get("tool_calls", []):
                tool_result = call.get("result", {})
                allowed.update(
                    str(value)
                    for value in tool_result.values()
                    if isinstance(value, (int, float, str))
                )
            content, verified = verify_answer(result.get("content", ""), allowed, payload.content)
            blocks = []
            for call in result.get("tool_calls", []):
                value = call.get("result", {})
                if value.get("groups"):
                    blocks.append(
                        {
                            "type": "table",
                            "title": "Ringkasan",
                            "columns": ["Kelompok", "Jumlah"],
                            "rows": [[item["label"], item["display"]] for item in value["groups"]],
                        }
                    )
            connection = connect(settings.database_path)
            try:
                with tx(connection, write=True):
                    message_id = new_id()
                    now = utc_now()
                    connection.execute(
                        "INSERT INTO chat_messages(id, thread_id, role, content, tool_calls, blocks, verified, created_at) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)",
                        (
                            message_id,
                            thread_id,
                            content,
                            json.dumps(result.get("tool_calls", [])),
                            json.dumps(blocks),
                            int(verified),
                            now,
                        ),
                    )
                    connection.execute(
                        "UPDATE chat_threads SET title = CASE WHEN title = 'Percakapan baru' THEN ? ELSE title END, updated_at = ? WHERE id = ?",
                        (payload.content[:40], now, thread_id),
                    )
                return jsonify(
                    {
                        "id": message_id,
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                        "blocks": blocks,
                        "verified": verified,
                        "created_at": now,
                    }
                )
            finally:
                connection.close()
        finally:
            connection.close()
    finally:
        busy.discard(_uid())


@chat_api.delete("/chat/threads/<thread_id>")
@require_auth
def delete_thread(thread_id):
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        _thread(connection, thread_id)
        connection.execute("DELETE FROM chat_threads WHERE id = ?", (thread_id,))
        return "", 204
    finally:
        connection.close()
