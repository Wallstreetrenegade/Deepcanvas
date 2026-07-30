"""Team Up invitations, feature sharing, and teammate chat."""

from __future__ import annotations

import json
import shutil
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from jiuwenclaw import auth
from jiuwenclaw.utils import get_user_workspace_dir


SHAREABLE_FEATURES = frozenset({
    "storage", "kanban", "crm", "email", "project_flow", "social_posts",
    "social_station", "creative_studio", "lead_gen", "app_builder",
    "social_larry", "video_meeting",
})


def _now() -> int:
    return int(time.time())


def _ensure_schema(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            joined_at INTEGER NOT NULL,
            PRIMARY KEY (team_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS team_feature_grants (
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            feature TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (team_id, feature)
        );
        CREATE TABLE IF NOT EXISTS team_invites (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            invitee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            invitee_email TEXT NOT NULL,
            features_json TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            responded_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS team_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_invitee ON team_invites(invitee_user_id, status);
        CREATE INDEX IF NOT EXISTS idx_team_messages ON team_messages(team_id, id);
        """
    )
    con.commit()


def _team_root(team_id: str) -> Path:
    path = get_user_workspace_dir() / "teams" / team_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def shared_feature_dir(feature: str) -> Path | None:
    """Return the current user's shared PI directory when a feature is teamed up."""
    if feature not in SHAREABLE_FEATURES:
        return None
    user = auth.get_current_user()
    if not user:
        return None
    with auth._connection() as con:  # noqa: SLF001 - same product persistence boundary
        _ensure_schema(con)
        row = con.execute(
            """
            SELECT t.id FROM teams t
            JOIN team_members m ON m.team_id = t.id
            JOIN team_feature_grants g ON g.team_id = t.id
            WHERE m.user_id = ? AND g.feature = ?
              AND (SELECT COUNT(*) FROM team_members active WHERE active.team_id = t.id) > 1
            ORDER BY t.created_at ASC LIMIT 1
            """,
            (user["id"], feature),
        ).fetchone()
    if not row:
        return None
    path = _team_root(row["id"]) / "pi_agent"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _copy_owner_feature(team_id: str, owner_user_id: str, feature: str, *, overwrite: bool = False) -> None:
    source = get_user_workspace_dir() / "users" / owner_user_id / "pi_agent" / f"{feature}.json"
    if not source.is_file():
        return
    target_dir = _team_root(team_id) / "pi_agent"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / source.name
    if overwrite or not target.exists():
        shutil.copy2(source, target)


def _shared_feature_conflicts(con: sqlite3.Connection, user_id: str, features: list[str]) -> list[str]:
    if not features:
        return []
    placeholders = ", ".join("?" for _ in features)
    rows = con.execute(
        f"""SELECT DISTINCT g.feature FROM team_members m
            JOIN team_feature_grants g ON g.team_id = m.team_id
            WHERE m.user_id = ? AND g.feature IN ({placeholders})""",  # noqa: S608 - placeholders only
        (user_id, *features),
    ).fetchall()
    return sorted(row["feature"] for row in rows)


def _user_summary(con: sqlite3.Connection, user_id: str) -> dict[str, str]:
    row = con.execute("SELECT id, email, display_name FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"id": row["id"], "email": row["email"], "displayName": row["display_name"]} if row else {}


def _team_payload(con: sqlite3.Connection, team_id: str, current_user_id: str) -> dict[str, Any]:
    team = con.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
    members = con.execute(
        "SELECT user_id, role, joined_at FROM team_members WHERE team_id = ? ORDER BY joined_at",
        (team_id,),
    ).fetchall()
    features = [row["feature"] for row in con.execute(
        "SELECT feature FROM team_feature_grants WHERE team_id = ? ORDER BY feature", (team_id,)
    ).fetchall()]
    return {
        "id": team["id"],
        "name": team["name"],
        "ownerUserId": team["owner_user_id"],
        "features": features,
        "members": [
            {**_user_summary(con, row["user_id"]), "role": row["role"], "joinedAt": row["joined_at"]}
            for row in members
        ],
        "isOwner": team["owner_user_id"] == current_user_id,
        "createdAt": team["created_at"],
    }


def get_state() -> dict[str, Any]:
    user = auth.require_current_user()
    with auth._connection() as con:  # noqa: SLF001
        _ensure_schema(con)
        team_ids = [row["team_id"] for row in con.execute(
            "SELECT team_id FROM team_members WHERE user_id = ? ORDER BY joined_at", (user["id"],)
        ).fetchall()]
        invites = con.execute(
            """
            SELECT i.*, u.display_name AS inviter_name, u.email AS inviter_email, t.name AS team_name
            FROM team_invites i JOIN users u ON u.id = i.inviter_user_id
            JOIN teams t ON t.id = i.team_id
            WHERE i.invitee_user_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC
            """,
            (user["id"],),
        ).fetchall()
        return {
            "teams": [_team_payload(con, team_id, user["id"]) for team_id in team_ids],
            "invites": [{
                "id": row["id"], "teamId": row["team_id"], "teamName": row["team_name"],
                "inviterName": row["inviter_name"], "inviterEmail": row["inviter_email"],
                "features": json.loads(row["features_json"]), "createdAt": row["created_at"],
            } for row in invites],
            "shareableFeatures": sorted(SHAREABLE_FEATURES),
        }


def create_invite(email: str, features: list[str]) -> dict[str, Any]:
    inviter = auth.require_current_user()
    normalized_email = (email or "").strip().lower()
    selected = sorted({str(feature) for feature in features if str(feature) in SHAREABLE_FEATURES})
    if not selected:
        raise auth.AuthError("Select at least one feature to share.", "NO_FEATURES")
    if normalized_email == inviter["email"]:
        raise auth.AuthError("You cannot invite your own account.", "SELF_INVITE")
    now = _now()
    team_id = f"team_{uuid.uuid4().hex}"
    invite_id = f"inv_{uuid.uuid4().hex}"
    with auth._connection() as con:  # noqa: SLF001
        _ensure_schema(con)
        invitee = con.execute("SELECT * FROM users WHERE email = ?", (normalized_email,)).fetchone()
        if not invitee:
            raise auth.AuthError("That person needs a Deep Canvas account before you can invite them.", "USER_NOT_FOUND")
        conflicts = _shared_feature_conflicts(con, inviter["id"], selected)
        if conflicts:
            raise auth.AuthError(
                f"Already shared with another team: {', '.join(conflicts)}.", "FEATURE_ALREADY_SHARED"
            )
        team_name = f"{inviter['displayName']} + {invitee['display_name']}"
        con.execute("INSERT INTO teams(id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)",
                    (team_id, team_name, inviter["id"], now))
        con.execute("INSERT INTO team_members(team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
                    (team_id, inviter["id"], now))
        con.executemany("INSERT INTO team_feature_grants(team_id, feature, created_at) VALUES (?, ?, ?)",
                        [(team_id, feature, now) for feature in selected])
        con.execute(
            """INSERT INTO team_invites(id, team_id, inviter_user_id, invitee_user_id, invitee_email,
               features_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (invite_id, team_id, inviter["id"], invitee["id"], normalized_email, json.dumps(selected), now),
        )
        con.commit()
    for feature in selected:
        _copy_owner_feature(team_id, inviter["id"], feature)
    return {"inviteId": invite_id, "teamId": team_id, "features": selected}


def respond_to_invite(invite_id: str, accept: bool) -> dict[str, Any]:
    user = auth.require_current_user()
    now = _now()
    with auth._connection() as con:  # noqa: SLF001
        _ensure_schema(con)
        invite = con.execute(
            "SELECT * FROM team_invites WHERE id = ? AND invitee_user_id = ? AND status = 'pending'",
            (invite_id, user["id"]),
        ).fetchone()
        if not invite:
            raise auth.AuthError("Invitation not found or already answered.", "INVITE_NOT_FOUND")
        team_id = invite["team_id"]
        features = json.loads(invite["features_json"])
        if accept:
            conflicts = _shared_feature_conflicts(con, user["id"], features)
            if conflicts:
                raise auth.AuthError(
                    f"Already shared with another team: {', '.join(conflicts)}.", "FEATURE_ALREADY_SHARED"
                )
            # Refresh the staged workspace from the owner's latest private state before activation.
            for feature in features:
                _copy_owner_feature(team_id, invite["inviter_user_id"], feature, overwrite=True)
        status = "accepted" if accept else "declined"
        con.execute("UPDATE team_invites SET status = ?, responded_at = ? WHERE id = ?", (status, now, invite_id))
        if accept:
            con.execute(
                "INSERT OR IGNORE INTO team_members(team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
                (team_id, user["id"], now),
            )
        else:
            # A declined one-to-one invitation should not reserve the owner's features.
            con.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        con.commit()
    return {"accepted": accept, "teamId": team_id}


def list_messages(team_id: str, after_id: int = 0) -> dict[str, Any]:
    user = auth.require_current_user()
    with auth._connection() as con:  # noqa: SLF001
        _ensure_schema(con)
        member = con.execute("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?", (team_id, user["id"])).fetchone()
        if not member:
            raise auth.AuthError("You are not a member of that team.", "TEAM_ACCESS_DENIED")
        rows = con.execute(
            """SELECT m.id, m.body, m.created_at, m.sender_user_id, u.display_name, u.email
               FROM team_messages m JOIN users u ON u.id = m.sender_user_id
               WHERE m.team_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 250""",
            (team_id, max(0, int(after_id))),
        ).fetchall()
    return {"messages": [{
        "id": row["id"], "body": row["body"], "createdAt": row["created_at"],
        "senderUserId": row["sender_user_id"], "senderName": row["display_name"], "senderEmail": row["email"],
    } for row in rows]}


def send_message(team_id: str, body: str) -> dict[str, Any]:
    user = auth.require_current_user()
    clean = (body or "").strip()
    if not clean:
        raise auth.AuthError("Message cannot be empty.", "EMPTY_MESSAGE")
    if len(clean) > 4000:
        raise auth.AuthError("Message is too long.", "MESSAGE_TOO_LONG")
    now = _now()
    with auth._connection() as con:  # noqa: SLF001
        _ensure_schema(con)
        member = con.execute("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?", (team_id, user["id"])).fetchone()
        if not member:
            raise auth.AuthError("You are not a member of that team.", "TEAM_ACCESS_DENIED")
        cursor = con.execute("INSERT INTO team_messages(team_id, sender_user_id, body, created_at) VALUES (?, ?, ?, ?)",
                             (team_id, user["id"], clean, now))
        con.commit()
        message_id = cursor.lastrowid
    return {"id": message_id, "body": clean, "createdAt": now, "senderUserId": user["id"],
            "senderName": user["displayName"], "senderEmail": user["email"]}


def register_team_up_handlers(channel: Any) -> None:
    async def state_handler(ws, req_id, params, session_id):  # noqa: ANN001, ARG001
        await channel.send_response(ws, req_id, ok=True, payload=get_state())

    async def invite_handler(ws, req_id, params, session_id):  # noqa: ANN001, ARG001
        payload = create_invite(str((params or {}).get("email") or ""), list((params or {}).get("features") or []))
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def respond_handler(ws, req_id, params, session_id):  # noqa: ANN001, ARG001
        payload = respond_to_invite(str((params or {}).get("inviteId") or ""), bool((params or {}).get("accept")))
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def messages_handler(ws, req_id, params, session_id):  # noqa: ANN001, ARG001
        payload = list_messages(str((params or {}).get("teamId") or ""), int((params or {}).get("afterId") or 0))
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def send_handler(ws, req_id, params, session_id):  # noqa: ANN001, ARG001
        payload = send_message(str((params or {}).get("teamId") or ""), str((params or {}).get("body") or ""))
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    channel.register_method("team_up.state", state_handler)
    channel.register_method("team_up.invite", invite_handler)
    channel.register_method("team_up.respond", respond_handler)
    channel.register_method("team_up.messages", messages_handler)
    channel.register_method("team_up.send", send_handler)
