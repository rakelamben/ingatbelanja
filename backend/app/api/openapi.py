from __future__ import annotations

OPENAPI_DOCUMENT = {
    "openapi": "3.0.3",
    "info": {"title": "IngatBelanjaan API", "version": "0.1.0"},
    "servers": [{"url": "/api/v1"}],
    "paths": {
        "/health": {
            "get": {
                "operationId": "health",
                "responses": {"200": {"description": "Service is healthy"}},
            }
        },
        "/health/ready": {
            "get": {
                "operationId": "readiness",
                "responses": {"200": {"description": "Ready"}, "503": {"description": "Not ready"}},
            }
        },
        "/auth/register": {
            "post": {
                "operationId": "register",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/RegisterRequest"}
                        }
                    },
                },
                "responses": {
                    "201": {"description": "Registered"},
                    "409": {"description": "Username taken"},
                },
            }
        },
        "/auth/login": {
            "post": {
                "operationId": "login",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/LoginRequest"}
                        }
                    },
                },
                "responses": {
                    "200": {"description": "Logged in"},
                    "401": {"description": "Invalid credentials"},
                },
            }
        },
        "/auth/me": {
            "get": {
                "operationId": "me",
                "responses": {
                    "200": {"description": "Current user"},
                    "401": {"description": "Unauthenticated"},
                },
            },
            "delete": {
                "operationId": "deleteAccount",
                "responses": {
                    "204": {"description": "Account deleted"},
                    "409": {"description": "Shared tracker owned"},
                },
            },
        },
        "/auth/logout": {
            "post": {"operationId": "logout", "responses": {"204": {"description": "Logged out"}}}
        },
        "/meta/currencies": {
            "get": {
                "operationId": "listCurrencies",
                "responses": {"200": {"description": "Supported currencies"}},
            }
        },
        "/ledgers/{ledgerId}/receipts/photo": {
            "post": {
                "operationId": "uploadReceiptPhoto",
                "parameters": [
                    {
                        "name": "ledgerId",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    },
                    {
                        "name": "Idempotency-Key",
                        "in": "header",
                        "required": True,
                        "schema": {"type": "string", "format": "uuid"},
                    },
                ],
                "requestBody": {
                    "required": True,
                    "content": {
                        "multipart/form-data": {
                            "schema": {
                                "type": "object",
                                "required": ["file"],
                                "properties": {
                                    "file": {"type": "string", "format": "binary"},
                                    "note": {"type": "string"},
                                    "is_handwritten": {"type": "boolean"},
                                },
                            }
                        }
                    },
                },
                "responses": {
                    "202": {"description": "Receipt queued"},
                    "415": {"description": "Unsupported media"},
                },
            }
        },
        "/auth/change-password": {
            "post": {
                "operationId": "changePassword",
                "responses": {"204": {"description": "Password changed"}},
            }
        },
        "/chat/threads": {
            "post": {"operationId": "createChatThread", "responses": {"201": {"description": "Thread created"}}},
            "get": {"operationId": "listChatThreads", "responses": {"200": {"description": "Chat threads"}}},
        },
        "/chat/threads/{threadId}/messages": {
            "get": {"operationId": "listChatMessages", "responses": {"200": {"description": "Chat messages"}}},
            "post": {
                "operationId": "sendChatMessage",
                "parameters": [{"name": "threadId", "in": "path", "required": True, "schema": {"type": "string"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["content"], "properties": {"content": {"type": "string", "maxLength": 500}}}}}},
                "responses": {"200": {"description": "Assistant response"}, "409": {"description": "AI consent required"}, "503": {"description": "LLM unavailable"}},
            },
        },
        "/chat/threads/{threadId}": {
            "delete": {"operationId": "deleteChatThread", "responses": {"204": {"description": "Thread deleted"}}},
        },
    },
    "components": {
        "schemas": {
            "RegisterRequest": {
                "type": "object",
                "required": ["username", "password"],
                "properties": {
                    "username": {"type": "string", "minLength": 3, "maxLength": 32},
                    "password": {"type": "string", "minLength": 10, "maxLength": 128},
                    "display_name": {"type": "string", "maxLength": 80},
                },
            },
            "LoginRequest": {
                "type": "object",
                "required": ["username", "password"],
                "properties": {"username": {"type": "string"}, "password": {"type": "string"}},
            },
            "Problem": {
                "type": "object",
                "required": ["type", "title", "status", "code", "detail", "request_id"],
            },
        }
    },
}
