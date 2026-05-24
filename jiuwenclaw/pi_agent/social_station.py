# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""Social Station backend: state + RPC handlers.

This module registers 24 ``social.station.*`` JSON-RPC methods on the given
channel.  The canonical state blob is persisted via ``pi_agent.state`` under
feature ``social_station``; each handler returns ``{state: <full snapshot>}``
so the frontend store can replace its slice atomically.
"""

from __future__ import annotations

import asyncio
import base64
import datetime as _dt
import logging
import os
import re
import uuid
import xml.etree.ElementTree as ET
from typing import Any, Optional

import httpx


# Upload-Post credentials can be supplied by the server operator (white-label
# env vars) or by a local user in the Social Station setup panel.
_ENV_API_KEY = "UPLOAD_POST_API_KEY"
_ENV_DEFAULT_PROFILE = "UPLOAD_POST_DEFAULT_PROFILE"


def _env_api_key() -> str:
    return (os.environ.get(_ENV_API_KEY) or "").strip()


def _env_default_profile() -> str:
    return (os.environ.get(_ENV_DEFAULT_PROFILE) or "default").strip() or "default"

from . import state as pi_state
from .integrations.upload_post_client import (
    UploadPostAuthError,
    UploadPostClient,
    UploadPostError,
)

logger = logging.getLogger(__name__)

FEATURE = "social_station"

# ---------------------------------------------------------------------------
# Platform catalog (11 supported + rss is tracked separately)
# ---------------------------------------------------------------------------

PLATFORM_CATALOG: list[dict[str, Any]] = [
    {"key": "tiktok",          "label": "TikTok",          "dailyCap": 15,  "supports": ["video"]},
    {"key": "instagram",       "label": "Instagram",       "dailyCap": 50,  "supports": ["video", "photo", "reel", "story", "carousel"]},
    {"key": "x",               "label": "X / Twitter",     "dailyCap": 50,  "supports": ["text", "photo", "video", "thread", "poll"]},
    {"key": "facebook",        "label": "Facebook",        "dailyCap": 25,  "supports": ["text", "photo", "video"]},
    {"key": "linkedin",        "label": "LinkedIn",        "dailyCap": 150, "supports": ["text", "photo", "video", "document"]},
    {"key": "youtube",         "label": "YouTube",         "dailyCap": 10,  "supports": ["video"]},
    {"key": "threads",         "label": "Threads",         "dailyCap": 50,  "supports": ["text", "photo", "video"]},
    {"key": "pinterest",       "label": "Pinterest",       "dailyCap": 20,  "supports": ["photo", "video"]},
    {"key": "reddit",          "label": "Reddit",          "dailyCap": 40,  "supports": ["text", "photo", "video", "link"]},
    {"key": "bluesky",         "label": "Bluesky",         "dailyCap": 50,  "supports": ["text", "photo", "video"]},
    {"key": "google_business", "label": "Google Business", "dailyCap": 10,  "supports": ["text", "photo", "cta", "event", "offer"]},
]
PLATFORM_KEYS: tuple[str, ...] = tuple(p["key"] for p in PLATFORM_CATALOG)


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

def _today() -> _dt.date:
    return _dt.datetime.now().date()


def _now_iso() -> str:
    return _dt.datetime.now().isoformat(timespec="seconds")


def _empty_connection(label: str) -> dict[str, Any]:
    return {
        "connected": False,
        "enabled": False,
        "displayName": label,
        "handle": "",
        "accountId": "",
        "tokenRef": "",
        "status": "disconnected",
        "lastSyncAt": None,
        "oauthConfigured": False,
        "scopes": [],
        "notes": "",
    }


def _default_state() -> dict[str, Any]:
    today = _today()
    connections = {p["key"]: _empty_connection(p["label"]) for p in PLATFORM_CATALOG}
    return {
        "view": {
            "visibleYear": today.year,
            "visibleMonth": today.month,  # 1..12
            "selectedDate": today.isoformat(),
            "calendarMode": "month",
            "activeTab": "creation",
            "feedFilter": "all",
        },
        "platforms": PLATFORM_CATALOG,
        "connections": connections,
        "composer": _default_composer(),
        "posts": [],
        "provider": {
            "apiKey": "",
            "apiKeyConfigured": False,
            "credentialSource": "missing",  # missing | environment | user
            "status": "missing_key",
            "profiles": [],
            "currentProfile": "",
            "lastError": None,
            "lastSyncAt": None,
        },
        "automation": {"enabled": False, "rules": [], "notes": ""},
        "rss": {"feeds": [], "previewEntries": [], "lastError": None},
        "updatedAt": _now_iso(),
    }


def _default_composer() -> dict[str, Any]:
    return {
        "activePlatforms": [],
        "caption": "",
        "title": "",
        "firstComment": "",
        "scheduleMode": "now",  # now | at | queue
        "scheduleDate": "",
        "timezone": "UTC",
        "mediaAssets": [],
        "platformMeta": _default_platform_meta(),
        "platformOverrides": {},
        "lastError": None,
    }


def _default_platform_meta() -> dict[str, Any]:
    return {
        "facebook": {"facebook_page_id": ""},
        "pinterest": {"pinterest_board_id": "", "pinterest_link": ""},
        "reddit": {"subreddit": "", "reddit_title": "", "flair_id": ""},
        "google_business": {
            "gbp_location_id": "",
            "cta_type": "",
            "cta_url": "",
            "event": {"title": "", "start": "", "end": ""},
            "offer": {"title": "", "coupon_code": "", "redeem_url": "", "terms": ""},
        },
        "youtube": {
            "youtube_title": "",
            "youtube_description": "",
            "youtube_privacy": "public",
            "youtube_tags": [],
        },
        "tiktok": {
            "tiktok_post_mode": "DIRECT_POST",
            "tiktok_privacy_status": "PUBLIC_TO_EVERYONE",
            "tiktok_disable_comments": False,
            "tiktok_disable_duet": False,
            "tiktok_disable_stitch": False,
            "tiktok_brand_content_toggle": False,
            "tiktok_brand_organic_toggle": False,
        },
        "instagram": {"instagram_share_mode": "feed"},  # feed|reel|story|carousel
        "x": {"x_poll": None, "thread": []},
        "linkedin": {"is_document": False, "linkedin_page_urn": ""},
        "threads": {},
        "bluesky": {},
    }


def _load_state() -> dict[str, Any]:
    raw = pi_state.load_feature(FEATURE, default=None)
    if not isinstance(raw, dict):
        raw = _default_state()
        pi_state.save_feature(FEATURE, raw)
    state = _normalize_state(raw) if isinstance(raw, dict) else _default_state()
    env_key = _env_api_key()
    prov = state["provider"]
    if env_key:
        if prov.get("apiKey") != env_key:
            prov["apiKey"] = env_key
            prov["apiKeyConfigured"] = True
            if prov.get("status") == "missing_key":
                prov["status"] = "error"
        prov["credentialSource"] = "environment"
    else:
        saved_key = str(prov.get("apiKey") or "").strip()
        prov["apiKeyConfigured"] = bool(saved_key)
        prov["credentialSource"] = "user" if saved_key else "missing"
        if not saved_key:
            prov["apiKey"] = ""
            prov["status"] = "missing_key"
    return state


def _normalize_state(raw: dict[str, Any]) -> dict[str, Any]:
    """Migrate older state blobs to the current schema."""
    base = _default_state()
    if isinstance(raw.get("view"), dict):
        base["view"].update({k: v for k, v in raw["view"].items() if v is not None})
    if isinstance(raw.get("connections"), dict):
        for key, conn in raw["connections"].items():
            if key in base["connections"] and isinstance(conn, dict):
                base["connections"][key].update(conn)
    if isinstance(raw.get("composer"), dict):
        comp = _default_composer()
        comp.update({k: v for k, v in raw["composer"].items() if v is not None})
        # nested defaults
        if isinstance(raw["composer"].get("platformMeta"), dict):
            merged = _default_platform_meta()
            for k, v in raw["composer"]["platformMeta"].items():
                if isinstance(v, dict):
                    merged.setdefault(k, {}).update(v)
                else:
                    merged[k] = v
            comp["platformMeta"] = merged
        if not isinstance(comp.get("mediaAssets"), list):
            comp["mediaAssets"] = []
        # drop platforms that aren't supported
        comp["activePlatforms"] = [
            p for p in (comp.get("activePlatforms") or []) if p in PLATFORM_KEYS
        ]
        base["composer"] = comp
    if isinstance(raw.get("posts"), list):
        base["posts"] = raw["posts"]
    if isinstance(raw.get("provider"), dict):
        base["provider"].update(raw["provider"])
    if isinstance(raw.get("automation"), dict):
        base["automation"].update(raw["automation"])
    if isinstance(raw.get("rss"), dict):
        base["rss"].update({k: v for k, v in raw["rss"].items() if v is not None})
        if not isinstance(base["rss"].get("feeds"), list):
            base["rss"]["feeds"] = []
        if not isinstance(base["rss"].get("previewEntries"), list):
            base["rss"]["previewEntries"] = []
    base["platforms"] = PLATFORM_CATALOG
    return base


def _save_state(state: dict[str, Any]) -> dict[str, Any]:
    state["platforms"] = PLATFORM_CATALOG
    state["updatedAt"] = _now_iso()
    pi_state.save_feature(FEATURE, state)
    return state


def _platform_key_from_any(value: Any) -> str:
    if isinstance(value, str):
        raw = value
    elif isinstance(value, dict):
        raw = str(
            value.get("key")
            or value.get("platform")
            or value.get("name")
            or value.get("id")
            or ""
        )
    else:
        raw = ""
    key = raw.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "twitter": "x",
        "x_twitter": "x",
        "googlebusiness": "google_business",
        "google_my_business": "google_business",
        "youtube_shorts": "youtube",
        "instagram_reels": "instagram",
    }
    return aliases.get(key, key)


def _profile_from_raw(raw: Any) -> dict[str, Any]:
    if isinstance(raw, str):
        return {
            "username": raw,
            "displayName": raw,
            "status": "active",
            "connectedPlatforms": [],
            "lastSyncAt": _now_iso(),
        }
    if not isinstance(raw, dict):
        return {}
    connected_raw = (
        raw.get("connected_platforms")
        or raw.get("connectedPlatforms")
        or raw.get("platforms_connected")
        or raw.get("platforms")
        or raw.get("accounts")
        or []
    )
    if isinstance(connected_raw, dict):
        connected_raw = [k for k, v in connected_raw.items() if v]
    connected = []
    for item in connected_raw if isinstance(connected_raw, list) else []:
        key = _platform_key_from_any(item)
        if key in PLATFORM_KEYS and key not in connected:
            connected.append(key)
    username = str(raw.get("username") or raw.get("user") or raw.get("profile_username") or "").strip()
    return {
        "username": username,
        "displayName": raw.get("display_name") or raw.get("displayName") or username,
        "status": raw.get("status") or "active",
        "connectedPlatforms": connected,
        "lastSyncAt": raw.get("updated_at") or raw.get("lastSyncAt") or _now_iso(),
    }


def _apply_connected_platforms(state: dict[str, Any], platforms: list[str]) -> None:
    connected_set = {p for p in platforms if p in PLATFORM_KEYS}
    for key, conn in state["connections"].items():
        is_connected = key in connected_set
        conn["connected"] = is_connected
        conn["oauthConfigured"] = is_connected
        conn["status"] = "connected" if is_connected else "disconnected"
        conn["lastSyncAt"] = _now_iso()
        if not is_connected:
            conn["enabled"] = False
    active = [p for p in state["composer"].get("activePlatforms") or [] if p in connected_set]
    state["composer"]["activePlatforms"] = active


async def _sync_profiles_and_connections(state: dict[str, Any], client: UploadPostClient) -> dict[str, Any]:
    prov = state["provider"]
    try:
        resp = await client.list_users()
    except UploadPostError as exc:
        prov["lastError"] = exc.message
        return state
    raw_profiles = resp.get("profiles") or resp.get("users") or resp.get("data") or []
    profiles = [p for p in (_profile_from_raw(x) for x in raw_profiles) if p.get("username")]
    prov["profiles"] = profiles
    if not prov.get("currentProfile") and profiles:
        prov["currentProfile"] = profiles[0]["username"]

    current = str(prov.get("currentProfile") or "").strip()
    current_profile = next((p for p in profiles if p.get("username") == current), None)
    if current and (not current_profile or not current_profile.get("connectedPlatforms")):
        try:
            detail = await client.get_user(current)
            current_profile = _profile_from_raw(detail.get("profile") or detail.get("user") or detail)
            if current_profile.get("username"):
                replaced = False
                for idx, profile in enumerate(profiles):
                    if profile.get("username") == current_profile["username"]:
                        profiles[idx] = current_profile
                        replaced = True
                        break
                if not replaced:
                    profiles.append(current_profile)
                prov["profiles"] = profiles
        except UploadPostError as exc:
            prov["lastError"] = exc.message

    current_profile = next((p for p in profiles if p.get("username") == current), None)
    _apply_connected_platforms(state, list((current_profile or {}).get("connectedPlatforms") or []))
    prov["lastSyncAt"] = _now_iso()
    if not prov.get("lastError"):
        prov["lastError"] = None
    return state


def _client(state: dict[str, Any]) -> Optional[UploadPostClient]:
    key = (state.get("provider") or {}).get("apiKey") or ""
    if not key:
        return None
    try:
        return UploadPostClient(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[social.station] client init failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------

def register_social_station_handlers(channel: Any) -> None:  # noqa: C901 - many handlers
    """Register all ``social.station.*`` RPC methods on ``channel``."""

    async def _reply(ws, req_id, state: dict[str, Any], *, extra: Optional[dict] = None) -> None:
        payload: dict[str, Any] = {"state": state}
        if extra:
            payload.update(extra)
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def _fail(ws, req_id, message: str, code: str = "BAD_REQUEST") -> None:
        await channel.send_response(ws, req_id, ok=False, error=message, code=code)

    def _ensure_dict(params: Any) -> dict[str, Any]:
        return params if isinstance(params, dict) else {}

    async def _ensure_provider_ready(state: dict[str, Any]) -> dict[str, Any]:
        """Validate Upload-Post and sync real profile/platform state."""
        prov = state["provider"]
        client = _client(state)
        if client is None:
            prov["status"] = "missing_key"
            prov["apiKeyConfigured"] = False
            prov["credentialSource"] = "missing"
            return state
        try:
            me = await client.me()
            prov["status"] = "ok"
            prov["apiKeyConfigured"] = True
            prov["account"] = me.get("user") or me
            prov["lastSyncAt"] = _now_iso()
            prov["lastError"] = None
        except UploadPostAuthError as exc:
            prov["status"] = "error"
            prov["lastError"] = exc.message
            return state
        except UploadPostError as exc:
            prov["status"] = "error"
            prov["lastError"] = exc.message
            return state
        # Ensure default profile exists and is selected.
        if not prov.get("currentProfile"):
            username = _env_default_profile()
            try:
                await client.create_user(username)
            except UploadPostError as exc:
                if exc.status not in (400, 409):
                    prov["lastError"] = exc.message
                    return state
            prov["currentProfile"] = username
        await _sync_profiles_and_connections(state, client)
        return state

    # ------------- view -------------

    async def _get_state(ws, req_id, params, session_id):
        state = _load_state()
        state = await _ensure_provider_ready(state)
        await _reply(ws, req_id, _save_state(state))

    async def _shift_visible_month(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        direction = int(p.get("direction", 1))
        state = _load_state()
        y, m = state["view"]["visibleYear"], state["view"]["visibleMonth"]
        m += direction
        while m < 1:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1
        state["view"]["visibleYear"] = y
        state["view"]["visibleMonth"] = m
        await _reply(ws, req_id, _save_state(state))

    async def _jump_to_today(ws, req_id, params, session_id):
        state = _load_state()
        today = _today()
        state["view"]["visibleYear"] = today.year
        state["view"]["visibleMonth"] = today.month
        state["view"]["selectedDate"] = today.isoformat()
        await _reply(ws, req_id, _save_state(state))

    async def _shift_visible_period(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        direction = -1 if int(p.get("direction", 1)) < 0 else 1
        state = _load_state()
        mode = str(state["view"].get("calendarMode") or "month")
        if mode == "week":
            try:
                selected = _dt.date.fromisoformat(str(state["view"].get("selectedDate") or _today().isoformat()))
            except ValueError:
                selected = _today()
            selected = selected + _dt.timedelta(days=7 * direction)
            state["view"]["selectedDate"] = selected.isoformat()
            state["view"]["visibleYear"] = selected.year
            state["view"]["visibleMonth"] = selected.month
        else:
            y, m = state["view"]["visibleYear"], state["view"]["visibleMonth"]
            m += direction
            while m < 1:
                m += 12
                y -= 1
            while m > 12:
                m -= 12
                y += 1
            state["view"]["visibleYear"] = y
            state["view"]["visibleMonth"] = m
        await _reply(ws, req_id, _save_state(state))

    async def _set_selected_date(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        date = str(p.get("date") or "").strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            return await _fail(ws, req_id, "date must be YYYY-MM-DD")
        state = _load_state()
        state["view"]["selectedDate"] = date
        try:
            selected = _dt.date.fromisoformat(date)
            state["view"]["visibleYear"] = selected.year
            state["view"]["visibleMonth"] = selected.month
        except ValueError:
            pass
        await _reply(ws, req_id, _save_state(state))

    async def _set_calendar_mode(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        mode = str(p.get("mode") or "month").strip()
        if mode not in ("month", "week"):
            return await _fail(ws, req_id, "mode must be month|week")
        state = _load_state()
        state["view"]["calendarMode"] = mode
        await _reply(ws, req_id, _save_state(state))

    async def _set_active_tab(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        tab = str(p.get("tab") or "").strip()
        if tab not in ("creation", "automation", "feed", "auto"):
            return await _fail(ws, req_id, "tab must be creation|automation|feed|auto")
        state = _load_state()
        state["view"]["activeTab"] = tab
        await _reply(ws, req_id, _save_state(state))

    async def _set_feed_filter(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        flt = str(p.get("filter") or "all").strip() or "all"
        state = _load_state()
        state["view"]["feedFilter"] = flt
        await _reply(ws, req_id, _save_state(state))

    # ------------- connections -------------

    async def _toggle_connected_platform(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        platform = str(p.get("platform") or "")
        if platform not in PLATFORM_KEYS:
            return await _fail(ws, req_id, f"unknown platform: {platform}")
        state = _load_state()
        state = await _ensure_provider_ready(state)
        await _reply(ws, req_id, _save_state(state))

    async def _toggle_enabled_platform(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        platform = str(p.get("platform") or "")
        if platform not in PLATFORM_KEYS:
            return await _fail(ws, req_id, f"unknown platform: {platform}")
        state = _load_state()
        conn = state["connections"][platform]
        if not conn.get("connected"):
            return await _fail(ws, req_id, f"Connect {platform} in Upload-Post before enabling it")
        conn["enabled"] = not bool(conn.get("enabled"))
        await _reply(ws, req_id, _save_state(state))

    async def _update_connection(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        platform = str(p.get("platform") or "")
        patch = p.get("patch") or {}
        if platform not in PLATFORM_KEYS:
            return await _fail(ws, req_id, f"unknown platform: {platform}")
        if not isinstance(patch, dict):
            return await _fail(ws, req_id, "patch must be object")
        state = _load_state()
        state["connections"][platform].update(
            {k: v for k, v in patch.items() if v is not None}
        )
        await _reply(ws, req_id, _save_state(state))

    # ------------- Upload-Post provider -------------

    async def _set_upload_post_api_key(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        key = str(p.get("apiKey") or "").strip()
        state = _load_state()
        if _env_api_key() and key and key != _env_api_key():
            return await _fail(ws, req_id, "Upload-Post API key is managed by server configuration", "LOCKED")
        state["provider"]["apiKey"] = key
        state["provider"]["apiKeyConfigured"] = bool(key)
        state["provider"]["credentialSource"] = "user" if key else "missing"
        state["provider"]["lastError"] = None
        if not key:
            state["provider"]["status"] = "missing_key"
            state["provider"]["profiles"] = []
            state["provider"]["currentProfile"] = ""
            return await _reply(ws, req_id, _save_state(state))
        client = UploadPostClient(key)
        try:
            me = await client.me()
            state["provider"]["status"] = "ok"
            state["provider"]["apiKeyConfigured"] = True
            state["provider"]["lastSyncAt"] = _now_iso()
            state["provider"]["account"] = me.get("user") or me
            username = state["provider"].get("currentProfile") or _env_default_profile()
            try:
                await client.create_user(username)
            except UploadPostError as create_exc:
                if create_exc.status not in (400, 409):
                    raise
            state["provider"]["currentProfile"] = username
            await _sync_profiles_and_connections(state, client)
        except UploadPostAuthError as exc:
            state["provider"]["status"] = "error"
            state["provider"]["lastError"] = exc.message
        except UploadPostError as exc:
            state["provider"]["status"] = "error"
            state["provider"]["lastError"] = exc.message
        await _reply(ws, req_id, _save_state(state))

    async def _list_profiles(ws, req_id, params, session_id):
        state = _load_state()
        client = _client(state)
        if client is None:
            return await _fail(ws, req_id, "Upload-Post API key not set", "BAD_REQUEST")
        try:
            state = await _sync_profiles_and_connections(state, client)
        except UploadPostError as exc:
            state["provider"]["lastError"] = exc.message
            return await _reply(ws, req_id, _save_state(state))
        await _reply(ws, req_id, _save_state(state))

    async def _ensure_profile(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        username = str(p.get("username") or "").strip()
        if not username:
            return await _fail(ws, req_id, "username required")
        state = _load_state()
        client = _client(state)
        if client is None:
            return await _fail(ws, req_id, "Upload-Post API key not set")
        try:
            await client.create_user(username)
        except UploadPostError as exc:
            # 409/400 = user exists; ignore and proceed
            if exc.status not in (400, 409):
                state["provider"]["lastError"] = exc.message
                return await _reply(ws, req_id, _save_state(state))
        state["provider"]["currentProfile"] = username
        await _sync_profiles_and_connections(state, client)
        state["provider"]["lastError"] = None
        await _reply(ws, req_id, _save_state(state))

    async def _generate_connect_url(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        state = _load_state()
        username = str(p.get("username") or state["provider"].get("currentProfile") or "").strip()
        if not username:
            return await _fail(ws, req_id, "username required")
        client = _client(state)
        if client is None:
            return await _fail(ws, req_id, "Upload-Post API key not set")
        platforms = p.get("platforms") or None
        redirect_url = p.get("redirectUrl") or None
        if isinstance(platforms, list):
            platforms = [x for x in (_platform_key_from_any(v) for v in platforms) if x in PLATFORM_KEYS]
        try:
            resp = await client.generate_jwt(
                username,
                redirect_url=redirect_url,
                platforms=platforms,
                show_calendar=bool(p.get("showCalendar", False)),
                readonly_calendar=bool(p.get("readonlyCalendar", False)),
            )
        except UploadPostError as exc:
            return await _fail(ws, req_id, exc.message, "UPSTREAM_ERROR")
        url = resp.get("access_url") or resp.get("url") or ""
        state["provider"]["lastConnectAt"] = _now_iso()
        state["provider"]["lastError"] = None if url else "Upload-Post did not return a connect URL"
        state = _save_state(state)
        await _reply(ws, req_id, state, extra={"connectUrl": url, "raw": resp})

    # ------------- composer / media / publish -------------

    async def _update_draft(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        patch = p.get("patch") or {}
        if not isinstance(patch, dict):
            return await _fail(ws, req_id, "patch must be object")
        state = _load_state()
        composer = state["composer"]
        # shallow merge except platformMeta / platformOverrides (deep merge)
        for k, v in patch.items():
            if k in ("platformMeta", "platformOverrides") and isinstance(v, dict):
                target = composer.setdefault(k, {})
                for pk, pv in v.items():
                    if isinstance(pv, dict) and isinstance(target.get(pk), dict):
                        target[pk].update(pv)
                    else:
                        target[pk] = pv
            elif k == "activePlatforms" and isinstance(v, list):
                composer[k] = [x for x in v if x in PLATFORM_KEYS]
            else:
                composer[k] = v
        await _reply(ws, req_id, _save_state(state))

    async def _upload_media(ws, req_id, params, session_id):
        """Register media assets from the frontend into the composer.

        Expects ``files: [{name, kind, dataUrl, sizeBytes?, durationSec?}]``.
        In Pass 1 we simply persist them (dataUrl is kept in-state so the UI can
        render thumbnails + re-post later). Pass 2 will swap this for disk
        storage and trigger the FFmpeg editor for per-platform reformatting.
        """
        p = _ensure_dict(params)
        files = p.get("files") or []
        if not isinstance(files, list):
            return await _fail(ws, req_id, "files must be array")
        state = _load_state()
        composer = state["composer"]
        assets = composer.setdefault("mediaAssets", [])
        added: list[dict[str, Any]] = []
        for raw in files:
            if not isinstance(raw, dict):
                continue
            data_url = str(raw.get("dataUrl") or "")
            kind = str(raw.get("kind") or _infer_kind(data_url, raw.get("name") or ""))
            asset = {
                "id": str(raw.get("id") or uuid.uuid4().hex),
                "name": str(raw.get("name") or f"asset-{uuid.uuid4().hex[:6]}"),
                "kind": kind,  # photo|video|document
                "dataUrl": data_url,
                "thumbnailUrl": raw.get("thumbnailUrl") or (data_url if kind == "photo" else ""),
                "sizeBytes": int(raw.get("sizeBytes") or 0),
                "durationSec": float(raw.get("durationSec") or 0.0),
                "mimeType": raw.get("mimeType") or _mime_from_data_url(data_url),
                "addedAt": _now_iso(),
            }
            assets.append(asset)
            added.append(asset)
        await _reply(ws, req_id, _save_state(state), extra={"added": added})

    async def _publish_post(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        state = _load_state()
        client = _client(state)
        if client is None:
            return await _fail(ws, req_id, "Upload-Post API key not set")
        username = state["provider"].get("currentProfile") or ""
        if not username:
            return await _fail(ws, req_id, "No Upload-Post profile selected")
        composer = state["composer"]
        draft = p.get("draft") if isinstance(p.get("draft"), dict) else composer
        platforms = [x for x in (draft.get("activePlatforms") or []) if x in PLATFORM_KEYS]
        if not platforms:
            return await _fail(ws, req_id, "Select at least one platform")
        disconnected = [p for p in platforms if not state["connections"].get(p, {}).get("connected")]
        if disconnected:
            return await _fail(ws, req_id, f"Connect these Upload-Post accounts first: {', '.join(disconnected)}")

        caption = str(draft.get("caption") or "")
        title = str(draft.get("title") or "")
        media = draft.get("mediaAssets") or []
        meta = draft.get("platformMeta") or {}

        fields = _build_publish_fields(platforms, caption, title, draft, meta)
        schedule_mode = draft.get("scheduleMode") or "now"
        if schedule_mode == "at" and draft.get("scheduleDate"):
            fields["scheduled"] = True
            fields["scheduled_date"] = str(draft["scheduleDate"])
            fields["timezone"] = str(draft.get("timezone") or "UTC")
        elif schedule_mode == "queue":
            fields["queue"] = True

        # Classify media
        videos = [a for a in media if a.get("kind") == "video"]
        photos = [a for a in media if a.get("kind") == "photo"]
        docs = [a for a in media if a.get("kind") == "document"]

        idem_key = uuid.uuid4().hex
        post_id = uuid.uuid4().hex
        post_record: dict[str, Any] = {
            "id": post_id,
            "status": "publishing",
            "platforms": platforms,
            "caption": caption,
            "title": title,
            "firstComment": draft.get("firstComment") or "",
            "scheduledFor": fields.get("scheduled_date") if schedule_mode == "at" else None,
            "publishedAt": None,
            "mediaAssets": media,
            "platformMeta": meta,
            "platformResults": {},
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
        }
        state["posts"].insert(0, post_record)
        _save_state(state)

        try:
            if videos:
                asset = videos[0]
                resp = await client.upload_video(
                    user=username,
                    platforms=platforms,
                    video=_asset_to_upload_tuple(asset),
                    fields=fields,
                    idempotency_key=idem_key,
                )
            elif photos:
                resp = await client.upload_photos(
                    user=username,
                    platforms=platforms,
                    photos=[_asset_to_upload_tuple(a) for a in photos],
                    fields=fields,
                    idempotency_key=idem_key,
                )
            elif docs and "linkedin" in platforms:
                resp = await client.upload_document(
                    user=username,
                    document=_asset_to_upload_tuple(docs[0]),
                    title=title or "Document",
                    fields=fields,
                    idempotency_key=idem_key,
                )
            else:
                resp = await client.upload_text(
                    user=username,
                    platforms=platforms,
                    title=title or caption[:80] or "Post",
                    fields=fields,
                    idempotency_key=idem_key,
                )
            post_record["uploadPostRequestId"] = resp.get("request_id")
            post_record["uploadPostJobId"] = resp.get("job_id")
            post_record["platformResults"] = resp.get("results") or resp.get("platforms") or {}
            if schedule_mode == "now":
                post_record["status"] = "published" if resp.get("success") else "failed"
                post_record["publishedAt"] = _now_iso()
            else:
                post_record["status"] = "scheduled"
            post_record["lastError"] = None if resp.get("success", True) else (resp.get("error") or "upload failed")
            post_record["updatedAt"] = _now_iso()
            # clear composer
            state["composer"] = _default_composer()
        except UploadPostError as exc:
            post_record["status"] = "failed"
            post_record["lastError"] = exc.message
            post_record["updatedAt"] = _now_iso()
        await _reply(ws, req_id, _save_state(state), extra={"postId": post_id})

    # ------------- posts / queue -------------

    async def _create_post(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        post = p.get("post") or {}
        if not isinstance(post, dict):
            return await _fail(ws, req_id, "post must be object")
        state = _load_state()
        post.setdefault("id", uuid.uuid4().hex)
        post.setdefault("status", "draft")
        post.setdefault("createdAt", _now_iso())
        post["updatedAt"] = _now_iso()
        state["posts"].insert(0, post)
        await _reply(ws, req_id, _save_state(state))

    async def _update_post(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        post_id = str(p.get("id") or "")
        patch = p.get("patch") or {}
        if not post_id or not isinstance(patch, dict):
            return await _fail(ws, req_id, "id + patch required")
        state = _load_state()
        client = _client(state)
        found = False
        for post in state["posts"]:
            if post.get("id") == post_id:
                post.update(patch)
                post["updatedAt"] = _now_iso()
                found = True
                # Propagate schedule edits upstream if we have a job_id
                job_id = post.get("uploadPostJobId")
                if client and job_id and any(k in patch for k in ("scheduledFor", "caption", "title", "timezone")):
                    try:
                        await client.edit_schedule(
                            str(job_id),
                            scheduled_date=post.get("scheduledFor"),
                            timezone=post.get("timezone"),
                            title=post.get("title"),
                            caption=post.get("caption"),
                        )
                    except UploadPostError as exc:
                        post["lastError"] = exc.message
                break
        if not found:
            return await _fail(ws, req_id, "post not found", "NOT_FOUND")
        await _reply(ws, req_id, _save_state(state))

    async def _delete_post(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        post_id = str(p.get("id") or "")
        if not post_id:
            return await _fail(ws, req_id, "id required")
        state = _load_state()
        client = _client(state)
        remaining = []
        for post in state["posts"]:
            if post.get("id") == post_id:
                job_id = post.get("uploadPostJobId")
                if client and job_id and post.get("status") == "scheduled":
                    try:
                        await client.cancel_schedule(str(job_id))
                    except UploadPostError as exc:
                        logger.info("[social.station] cancel failed: %s", exc)
                continue
            remaining.append(post)
        state["posts"] = remaining
        await _reply(ws, req_id, _save_state(state))

    # ------------- automation (stub for Pass 1) -------------

    async def _update_automation(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        patch = p.get("patch") or {}
        if not isinstance(patch, dict):
            return await _fail(ws, req_id, "patch must be object")
        state = _load_state()
        state["automation"].update(patch)
        await _reply(ws, req_id, _save_state(state))

    # ------------- RSS -------------

    async def _upsert_rss_feed(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        feed = p.get("feed") or {}
        if not isinstance(feed, dict) or not feed.get("url"):
            return await _fail(ws, req_id, "feed.url required")
        state = _load_state()
        feeds = state["rss"].setdefault("feeds", [])
        feed_id = feed.get("id") or uuid.uuid4().hex
        existing = next((f for f in feeds if f.get("id") == feed_id), None)
        merged = {
            "id": feed_id,
            "name": feed.get("name") or feed.get("url"),
            "url": feed["url"],
            "prompt": feed.get("prompt", ""),
            "enabled": bool(feed.get("enabled", True)),
            "publishTargets": feed.get("publishTargets") or [],
            "lastPolledAt": feed.get("lastPolledAt"),
            "entryCount": int(feed.get("entryCount") or 0),
            "updatedAt": _now_iso(),
        }
        if existing:
            existing.update(merged)
        else:
            feeds.append(merged)
        await _reply(ws, req_id, _save_state(state))

    async def _remove_rss_feed(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        feed_id = str(p.get("id") or "")
        if not feed_id:
            return await _fail(ws, req_id, "id required")
        state = _load_state()
        state["rss"]["feeds"] = [f for f in state["rss"].get("feeds", []) if f.get("id") != feed_id]
        await _reply(ws, req_id, _save_state(state))

    async def _preview_rss_feed(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        url = str(p.get("url") or "").strip()
        if not url:
            return await _fail(ws, req_id, "url required")
        state = _load_state()
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as h:
                resp = await h.get(url, headers={"User-Agent": "Jiuwen-SocialStation/1.0"})
                resp.raise_for_status()
                entries = _parse_rss_entries(resp.text)
            state["rss"]["previewEntries"] = entries[:20]
            state["rss"]["lastError"] = None
        except Exception as exc:  # noqa: BLE001
            state["rss"]["lastError"] = str(exc)
            state["rss"]["previewEntries"] = []
        await _reply(ws, req_id, _save_state(state))

    # ------------- agent bridge (stub) -------------

    async def _launch_agent(ws, req_id, params, session_id):
        p = _ensure_dict(params)
        state = _load_state()
        state["automation"]["lastLaunch"] = {
            "at": _now_iso(),
            "intent": p.get("intent") or "",
            "payload": p.get("payload") or {},
        }
        await _reply(ws, req_id, _save_state(state))

    # --- register every method ---

    methods = {
        "social.station.get_state": _get_state,
        "social.station.shift_visible_month": _shift_visible_month,
        "social.station.shift_visible_period": _shift_visible_period,
        "social.station.jump_to_today": _jump_to_today,
        "social.station.set_selected_date": _set_selected_date,
        "social.station.set_calendar_mode": _set_calendar_mode,
        "social.station.set_active_tab": _set_active_tab,
        "social.station.set_feed_filter": _set_feed_filter,
        "social.station.toggle_connected_platform": _toggle_connected_platform,
        "social.station.toggle_enabled_platform": _toggle_enabled_platform,
        "social.station.update_connection": _update_connection,
        "social.station.set_upload_post_api_key": _set_upload_post_api_key,
        "social.station.list_profiles": _list_profiles,
        "social.station.ensure_profile": _ensure_profile,
        "social.station.generate_connect_url": _generate_connect_url,
        "social.station.update_draft": _update_draft,
        "social.station.upload_media": _upload_media,
        "social.station.publish_post": _publish_post,
        "social.station.create_post": _create_post,
        "social.station.update_post": _update_post,
        "social.station.delete_post": _delete_post,
        "social.station.update_automation": _update_automation,
        "social.station.upsert_rss_feed": _upsert_rss_feed,
        "social.station.remove_rss_feed": _remove_rss_feed,
        "social.station.preview_rss_feed": _preview_rss_feed,
        "social.station.launch_agent": _launch_agent,
    }
    for name, fn in methods.items():
        channel.register_method(name, fn)
    logger.info("[social.station] registered %d RPC methods", len(methods))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.*)$", re.DOTALL)


def _mime_from_data_url(data_url: str) -> str:
    m = _DATA_URL_RE.match(data_url or "")
    return m.group(1) if m else ""


def _infer_kind(data_url: str, name: str) -> str:
    mime = _mime_from_data_url(data_url) or ""
    if mime.startswith("image/"):
        return "photo"
    if mime.startswith("video/"):
        return "video"
    lower = (name or "").lower()
    if any(lower.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp")):
        return "photo"
    if any(lower.endswith(ext) for ext in (".mp4", ".mov", ".webm", ".mkv")):
        return "video"
    if any(lower.endswith(ext) for ext in (".pdf", ".doc", ".docx")):
        return "document"
    return "photo"


def _asset_to_upload_tuple(asset: dict[str, Any]) -> tuple:
    """Convert a stored media asset (dataUrl) into an httpx upload tuple."""
    data_url = asset.get("dataUrl") or ""
    name = asset.get("name") or f"asset-{uuid.uuid4().hex[:6]}"
    m = _DATA_URL_RE.match(data_url)
    if not m:
        # Treat as already-decoded bytes (unlikely in Pass 1 but future-proof)
        return (name, (asset.get("bytes") or b""), asset.get("mimeType") or "application/octet-stream")
    mime = m.group(1)
    raw = base64.b64decode(m.group(2))
    return (name, raw, mime)


def _build_publish_fields(
    platforms: list[str],
    caption: str,
    title: str,
    draft: dict[str, Any],
    meta: dict[str, Any],
) -> dict[str, Any]:
    fields: dict[str, Any] = {"caption": caption, "description": caption}
    if title:
        fields["title"] = title
    if draft.get("firstComment"):
        fields["first_comment"] = draft["firstComment"]
    # Per-platform metadata — only include keys Upload-Post recognizes.
    if "facebook" in platforms:
        fb = meta.get("facebook") or {}
        if fb.get("facebook_page_id"):
            fields["facebook_page_id"] = fb["facebook_page_id"]
    if "pinterest" in platforms:
        pin = meta.get("pinterest") or {}
        if pin.get("pinterest_board_id"):
            fields["pinterest_board_id"] = pin["pinterest_board_id"]
        if pin.get("pinterest_link"):
            fields["pinterest_link"] = pin["pinterest_link"]
    if "reddit" in platforms:
        rd = meta.get("reddit") or {}
        if rd.get("subreddit"):
            fields["subreddit"] = rd["subreddit"]
        if rd.get("reddit_title"):
            fields["reddit_title"] = rd["reddit_title"]
        if rd.get("flair_id"):
            fields["flair_id"] = rd["flair_id"]
    if "google_business" in platforms:
        gbp = meta.get("google_business") or {}
        if gbp.get("gbp_location_id"):
            fields["gbp_location_id"] = gbp["gbp_location_id"]
        if gbp.get("cta_type"):
            fields["cta_type"] = gbp["cta_type"]
        if gbp.get("cta_url"):
            fields["cta_url"] = gbp["cta_url"]
    if "youtube" in platforms:
        yt = meta.get("youtube") or {}
        if yt.get("youtube_title"):
            fields["youtube_title"] = yt["youtube_title"]
        if yt.get("youtube_description"):
            fields["youtube_description"] = yt["youtube_description"]
        if yt.get("youtube_privacy"):
            fields["youtube_privacy"] = yt["youtube_privacy"]
        if yt.get("youtube_tags"):
            fields["youtube_tags"] = yt["youtube_tags"]
    if "tiktok" in platforms:
        tt = meta.get("tiktok") or {}
        for k in (
            "tiktok_post_mode", "tiktok_privacy_status",
            "tiktok_disable_comments", "tiktok_disable_duet", "tiktok_disable_stitch",
            "tiktok_brand_content_toggle", "tiktok_brand_organic_toggle",
        ):
            if k in tt and tt[k] is not None and tt[k] != "":
                fields[k] = tt[k]
    if "instagram" in platforms:
        ig = meta.get("instagram") or {}
        if ig.get("instagram_share_mode"):
            fields["instagram_share_mode"] = ig["instagram_share_mode"]
    if "linkedin" in platforms:
        li = meta.get("linkedin") or {}
        if li.get("linkedin_page_urn"):
            fields["linkedin_page_urn"] = li["linkedin_page_urn"]
    # Per-platform caption/title overrides
    overrides = draft.get("platformOverrides") or {}
    for plat, ov in overrides.items():
        if plat not in platforms or not isinstance(ov, dict):
            continue
        if ov.get("caption"):
            fields[f"{plat}_caption"] = ov["caption"]
        if ov.get("title"):
            fields[f"{plat}_title"] = ov["title"]
        if ov.get("firstComment"):
            fields[f"{plat}_first_comment"] = ov["firstComment"]
    return fields


def _parse_rss_entries(xml_text: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return entries
    # RSS 2.0
    for item in root.iter("item"):
        entries.append({
            "title": _text(item, "title"),
            "link": _text(item, "link"),
            "description": _text(item, "description"),
            "publishedAt": _text(item, "pubDate"),
        })
    if entries:
        return entries
    # Atom
    ns = {"a": "http://www.w3.org/2005/Atom"}
    for item in root.findall("a:entry", ns):
        link_el = item.find("a:link", ns)
        entries.append({
            "title": _text(item, "a:title", ns),
            "link": link_el.get("href", "") if link_el is not None else "",
            "description": _text(item, "a:summary", ns),
            "publishedAt": _text(item, "a:published", ns) or _text(item, "a:updated", ns),
        })
    return entries


def _text(el: ET.Element, path: str, ns: Optional[dict] = None) -> str:
    found = el.find(path, ns) if ns else el.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""
