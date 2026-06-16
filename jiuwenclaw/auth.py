# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""Lightweight product auth and per-user persistence context.

This module intentionally keeps the first SaaS auth layer small and local:
SQLite for users/sessions/settings, PBKDF2 password hashes, and bearer-style
session tokens passed through the WebChannel RPC envelope.
"""

from __future__ import annotations

import base64
from contextlib import contextmanager
import contextvars
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from jiuwenclaw.utils import get_user_workspace_dir

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PASSWORD_MIN_LEN = 8
_PBKDF2_ITERATIONS = 260_000
_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
_CURRENT_USER: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "jiuwenclaw_current_user",
    default=None,
)


class AuthError(RuntimeError):
    def __init__(self, message: str, code: str = "AUTH_ERROR") -> None:
        super().__init__(message)
        self.code = code


def _db_path() -> Path:
    root = get_user_workspace_dir() / "auth"
    root.mkdir(parents=True, exist_ok=True)
    return root / "auth.db"


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(_db_path())
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    _ensure_schema(con)
    return con


@contextmanager
def _connection():
    con = _connect()
    try:
        yield con
    finally:
        con.close()


def _ensure_schema(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            iterations INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, key)
        );
        """
    )
    con.commit()


def _now() -> int:
    return int(time.time())


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _hash_password(password: str, salt: bytes | None = None, iterations: int = _PBKDF2_ITERATIONS) -> tuple[str, str, int]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return (
        base64.b64encode(digest).decode("ascii"),
        base64.b64encode(salt).decode("ascii"),
        iterations,
    )


def _verify_password(password: str, *, expected_hash: str, salt: str, iterations: int) -> bool:
    try:
        salt_bytes = base64.b64decode(salt.encode("ascii"))
    except Exception:
        return False
    actual, _, _ = _hash_password(password, salt_bytes, iterations)
    return hmac.compare_digest(actual, expected_hash)


def _user_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _create_token(con: sqlite3.Connection, user_id: str) -> tuple[str, int]:
    token = secrets.token_urlsafe(40)
    now = _now()
    expires_at = now + _SESSION_TTL_SECONDS
    con.execute(
        "INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
        (_token_hash(token), user_id, now, expires_at, now),
    )
    return token, expires_at


def signup(email: str, password: str, display_name: str = "") -> dict[str, Any]:
    email_norm = _normalize_email(email)
    if not _EMAIL_RE.match(email_norm):
        raise AuthError("Enter a valid email address.", "INVALID_EMAIL")
    if len(password or "") < _PASSWORD_MIN_LEN:
        raise AuthError("Password must be at least 8 characters.", "WEAK_PASSWORD")
    display = (display_name or email_norm.split("@", 1)[0]).strip()[:80] or email_norm
    user_id = f"usr_{uuid.uuid4().hex}"
    password_hash, salt, iterations = _hash_password(password)
    now = _now()
    with _connection() as con:
        try:
            con.execute(
                """
                INSERT INTO users(id, email, display_name, password_hash, salt, iterations, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, email_norm, display, password_hash, salt, iterations, now, now),
            )
        except sqlite3.IntegrityError as exc:
            raise AuthError("An account already exists for that email.", "EMAIL_EXISTS") from exc
        token, expires_at = _create_token(con, user_id)
        con.commit()
        row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"user": _user_payload(row), "token": token, "expiresAt": expires_at}


def login(email: str, password: str) -> dict[str, Any]:
    email_norm = _normalize_email(email)
    with _connection() as con:
        row = con.execute("SELECT * FROM users WHERE email = ?", (email_norm,)).fetchone()
        if row is None or not _verify_password(
            password or "",
            expected_hash=row["password_hash"],
            salt=row["salt"],
            iterations=int(row["iterations"]),
        ):
            raise AuthError("Invalid email or password.", "INVALID_CREDENTIALS")
        token, expires_at = _create_token(con, row["id"])
        con.commit()
    return {"user": _user_payload(row), "token": token, "expiresAt": expires_at}


def authenticate_token(token: str | None) -> dict[str, Any] | None:
    raw = (token or "").strip()
    if not raw:
        return None
    now = _now()
    with _connection() as con:
        row = con.execute(
            """
            SELECT users.* FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (_token_hash(raw), now),
        ).fetchone()
        if row is None:
            return None
        con.execute(
            "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
            (now, _token_hash(raw)),
        )
        con.commit()
    return _user_payload(row)


def logout(token: str | None) -> None:
    raw = (token or "").strip()
    if not raw:
        return
    with _connection() as con:
        con.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(raw),))
        con.commit()


def set_current_user(user: dict[str, Any] | None) -> contextvars.Token:
    return _CURRENT_USER.set(user)


def reset_current_user(token: contextvars.Token) -> None:
    _CURRENT_USER.reset(token)


def get_current_user() -> dict[str, Any] | None:
    return _CURRENT_USER.get()


def require_current_user() -> dict[str, Any]:
    user = get_current_user()
    if not user:
        raise AuthError("Authentication required.", "AUTH_REQUIRED")
    return user


def get_current_user_id(default: str = "default") -> str:
    user = get_current_user()
    return str(user.get("id") if user else default)


def get_current_user_data_dir() -> Path:
    user_id = get_current_user_id()
    base = get_user_workspace_dir() / "users" / user_id
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_settings(user_id: str | None = None) -> dict[str, Any]:
    uid = user_id or require_current_user()["id"]
    with _connection() as con:
        rows = con.execute("SELECT key, value FROM user_settings WHERE user_id = ?", (uid,)).fetchall()
    out: dict[str, Any] = {}
    for row in rows:
        try:
            out[row["key"]] = json.loads(row["value"])
        except Exception:
            out[row["key"]] = row["value"]
    return out


def update_settings(settings: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    uid = user_id or require_current_user()["id"]
    now = _now()
    with _connection() as con:
        for key, value in settings.items():
            safe_key = str(key).strip()[:120]
            if not safe_key:
                continue
            con.execute(
                """
                INSERT INTO user_settings(user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (uid, safe_key, json.dumps(value, ensure_ascii=False), now),
            )
        con.commit()
    return get_settings(uid)