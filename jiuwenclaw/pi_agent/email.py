from __future__ import annotations

import asyncio
import html
import logging
import os
import smtplib
import ssl
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

import httpx

from . import state as pi_state

FEATURE = "email"
logger = logging.getLogger(__name__)

_ALLOWED_ENGINES = {"resend", "postmark", "ses", "smtp"}
_DEFAULT_FROM = "hello@deepcanvas.ai"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _env(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value.strip()
    return default


def _default_draft() -> dict[str, Any]:
    return {
        "to": "",
        "cc": "",
        "bcc": "",
        "from": _env("EMAIL_FROM_ADDRESS", "EMAIL_ADDRESS", default=_DEFAULT_FROM),
        "subject": "",
        "body": "",
        "templateId": None,
        "campaignId": None,
    }


def _default_state() -> dict[str, Any]:
    now = _now_iso()
    return {
        "schemaVersion": 1,
        "engine": _env("EMAIL_ENGINE", default="resend") or "resend",
        "rightPanel": "templates",
        "draft": _default_draft(),
        "templates": [],
        "campaigns": [],
        "inbox": [],
        "sent": [],
        "selectedInboxId": None,
        "lastSavedAt": now,
    }


def _clean_text(value: Any, limit: int = 12000) -> str:
    return str(value or "").strip()[:limit]


def _normalize_emails(value: Any) -> str:
    seen: set[str] = set()
    items: list[str] = []
    for raw in _clean_text(value, 2000).replace(";", ",").split(","):
        email = raw.strip().lower()
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)
        items.append(email)
    return ", ".join(items)


def _split_emails(value: Any) -> list[str]:
    text = _normalize_emails(value)
    return [item.strip() for item in text.split(",") if item.strip()]


def _normalize_draft(value: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    return {
        "to": _normalize_emails(raw.get("to")),
        "cc": _normalize_emails(raw.get("cc")),
        "bcc": _normalize_emails(raw.get("bcc")),
        "from": _clean_text(raw.get("from"), 240) or fallback.get("from") or _DEFAULT_FROM,
        "subject": _clean_text(raw.get("subject"), 240),
        "body": _clean_text(raw.get("body"), 12000),
        "templateId": _clean_text(raw.get("templateId"), 80) or None,
        "campaignId": _clean_text(raw.get("campaignId"), 80) or None,
    }


def _normalize_state(value: Any) -> dict[str, Any]:
    base = _default_state()
    raw = value if isinstance(value, dict) else {}
    engine = _clean_text(raw.get("engine"), 40).lower()
    base["engine"] = engine if engine in _ALLOWED_ENGINES else base["engine"]
    if raw.get("rightPanel") in {"inbox", "templates", "campaigns"}:
        base["rightPanel"] = raw["rightPanel"]
    base["draft"] = _normalize_draft(raw.get("draft"), base["draft"])
    for key in ("templates", "campaigns", "inbox", "sent"):
        if isinstance(raw.get(key), list):
            base[key] = [item for item in raw[key] if isinstance(item, dict)]
    selected = _clean_text(raw.get("selectedInboxId"), 80)
    base["selectedInboxId"] = selected or None
    base["lastSavedAt"] = _clean_text(raw.get("lastSavedAt"), 40) or base["lastSavedAt"]
    return base


def _load_state() -> dict[str, Any]:
    return _normalize_state(pi_state.load_feature(FEATURE, default=None))


def _save_state(state: dict[str, Any]) -> dict[str, Any]:
    state["lastSavedAt"] = _now_iso()
    pi_state.save_feature(FEATURE, state)
    return state


def _html_body(text: str) -> str:
    escaped = html.escape(text or "")
    return f"<div>{escaped.replace(chr(10), '<br />')}</div>"


def _resolve_engine(requested: str | None) -> str:
    engine = (requested or "").strip().lower() or _env("EMAIL_ENGINE", default="resend").lower() or "resend"
    if engine not in _ALLOWED_ENGINES:
        raise ValueError(f"unsupported email engine: {engine}")
    return engine


def _resolve_smtp_settings(engine: str) -> dict[str, Any]:
    if engine == "ses":
        host = _env("SMTP_HOST", default="email-smtp.us-east-1.amazonaws.com")
        port = int(_env("SMTP_PORT", default="587") or "587")
    else:
        host = _env("SMTP_HOST", default="smtp.gmail.com")
        port = int(_env("SMTP_PORT", default="587") or "587")
    username = _env("SMTP_USERNAME", "EMAIL_ADDRESS")
    password = _env("SMTP_PASSWORD", "EMAIL_TOKEN")
    use_tls = _env("SMTP_USE_TLS", default="true").lower() not in {"0", "false", "no"}
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "use_tls": use_tls,
    }


async def _send_via_resend(draft: dict[str, Any]) -> dict[str, Any]:
    api_key = _env("EMAIL_API_KEY", "EMAIL_TOKEN")
    if not api_key:
        raise RuntimeError("Resend API key is missing")
    api_base = _env("EMAIL_API_BASE", default="https://api.resend.com")
    payload = {
        "from": draft["from"],
        "to": _split_emails(draft["to"]),
        "cc": _split_emails(draft["cc"]),
        "bcc": _split_emails(draft["bcc"]),
        "subject": draft["subject"],
        "text": draft["body"],
        "html": _html_body(draft["body"]),
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{api_base.rstrip('/')}/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
    data = response.json() if response.content else {}
    if response.status_code >= 400:
        raise RuntimeError(str(data.get("message") or data.get("error") or response.text[:300]))
    return {"providerMessageId": data.get("id") or ""}


async def _send_via_postmark(draft: dict[str, Any]) -> dict[str, Any]:
    api_key = _env("EMAIL_API_KEY", "EMAIL_TOKEN")
    if not api_key:
        raise RuntimeError("Postmark server token is missing")
    api_base = _env("EMAIL_API_BASE", default="https://api.postmarkapp.com")
    payload = {
        "From": draft["from"],
        "To": draft["to"],
        "Cc": draft["cc"],
        "Bcc": draft["bcc"],
        "Subject": draft["subject"],
        "TextBody": draft["body"],
        "HtmlBody": _html_body(draft["body"]),
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{api_base.rstrip('/')}/email",
            headers={"X-Postmark-Server-Token": api_key, "Content-Type": "application/json"},
            json=payload,
        )
    data = response.json() if response.content else {}
    if response.status_code >= 400 or (data.get("ErrorCode") and int(data.get("ErrorCode") or 0) != 0):
        raise RuntimeError(str(data.get("Message") or response.text[:300]))
    return {"providerMessageId": data.get("MessageID") or ""}


def _smtp_send_sync(draft: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    if not settings["host"] or not settings["username"] or not settings["password"]:
        raise RuntimeError("SMTP host, username, and password are required")
    message = EmailMessage()
    message["From"] = draft["from"]
    message["To"] = draft["to"]
    if draft["cc"]:
        message["Cc"] = draft["cc"]
    if draft["bcc"]:
        message["Bcc"] = draft["bcc"]
    reply_to = _env("EMAIL_REPLY_TO")
    if reply_to:
        message["Reply-To"] = reply_to
    message["Subject"] = draft["subject"]
    message.set_content(draft["body"])
    message.add_alternative(_html_body(draft["body"]), subtype="html")
    recipients = _split_emails(draft["to"]) + _split_emails(draft["cc"]) + _split_emails(draft["bcc"])
    if not recipients:
        raise RuntimeError("At least one recipient is required")
    with smtplib.SMTP(settings["host"], settings["port"], timeout=60) as smtp:
        smtp.ehlo()
        if settings["use_tls"]:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        smtp.login(settings["username"], settings["password"])
        smtp.send_message(message, from_addr=draft["from"], to_addrs=recipients)
    return {"providerMessageId": uuid.uuid4().hex}


async def _send_via_smtp_like(engine: str, draft: dict[str, Any]) -> dict[str, Any]:
    settings = _resolve_smtp_settings(engine)
    return await asyncio.to_thread(_smtp_send_sync, draft, settings)


async def _send_email(engine: str, draft: dict[str, Any]) -> dict[str, Any]:
    if engine == "resend":
        return await _send_via_resend(draft)
    if engine == "postmark":
        return await _send_via_postmark(draft)
    if engine in {"smtp", "ses"}:
        return await _send_via_smtp_like(engine, draft)
    raise ValueError(f"unsupported email engine: {engine}")


def _build_test_draft(engine: str, target: str) -> dict[str, Any]:
    target_email = _normalize_emails(target)
    if not target_email:
        raise ValueError("Add a recipient or valid from address before testing")
    sender = _env("EMAIL_FROM_ADDRESS", "EMAIL_ADDRESS", default=_DEFAULT_FROM) or _DEFAULT_FROM
    return {
        "to": target_email,
        "cc": "",
        "bcc": "",
        "from": sender,
        "subject": f"Deep Canvas {engine.title()} test",
        "body": "Deep Canvas email transport test.",
        "templateId": None,
        "campaignId": None,
    }


def register_email_handlers(channel: Any) -> None:
    async def _reply(ws, req_id, *, state: dict[str, Any], extra: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"state": state}
        if extra:
            payload.update(extra)
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def _fail(ws, req_id, message: str, code: str = "BAD_REQUEST") -> None:
        await channel.send_response(ws, req_id, ok=False, error=message, code=code)

    async def _get_state(ws, req_id, params, session_id):
        await _reply(ws, req_id, state=_save_state(_load_state()))

    async def _send(ws, req_id, params, session_id):
        p = params if isinstance(params, dict) else {}
        requested_engine = _clean_text(p.get("engine"), 40)
        state = _load_state()
        draft = _normalize_draft(p.get("draft"), state["draft"])
        lead_ids = p.get("leadIds") if isinstance(p.get("leadIds"), list) else []
        if not _split_emails(draft["to"]):
            return await _fail(ws, req_id, "Add at least one recipient")
        if not draft["subject"]:
            return await _fail(ws, req_id, "Subject is required")
        if not draft["body"]:
            return await _fail(ws, req_id, "Email body is required")
        engine = _resolve_engine(requested_engine or state.get("engine"))
        try:
            delivery = await _send_email(engine, draft)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[email.send] %s", exc)
            return await _fail(ws, req_id, str(exc), "EMAIL_SEND_FAILED")

        sent_item = {
            "id": f"sent_{uuid.uuid4().hex[:10]}",
            "to": _split_emails(draft["to"]),
            "from": draft["from"],
            "subject": draft["subject"],
            "body": draft["body"],
            "status": "sent",
            "createdAt": _now_iso(),
            "leadIds": [str(item).strip() for item in lead_ids if str(item).strip()],
            "engine": engine,
            "providerMessageId": delivery.get("providerMessageId") or "",
        }
        state["engine"] = engine
        state["sent"] = [sent_item, *[item for item in state.get("sent", []) if isinstance(item, dict)]][:100]
        campaign_id = draft.get("campaignId")
        if campaign_id:
            updated_campaigns: list[dict[str, Any]] = []
            for campaign in state.get("campaigns", []):
                if not isinstance(campaign, dict):
                    continue
                if str(campaign.get("id") or "") == str(campaign_id):
                    campaign = {
                        **campaign,
                        "recipientCount": max(int(campaign.get("recipientCount") or 0), len(sent_item["to"])),
                        "status": "sent",
                        "updatedAt": _now_iso(),
                    }
                updated_campaigns.append(campaign)
            state["campaigns"] = updated_campaigns
        state["draft"] = _default_draft()
        state = _save_state(state)
        await _reply(ws, req_id, state=state, extra={"sentItem": sent_item})

    async def _test_provider(ws, req_id, params, session_id):
        p = params if isinstance(params, dict) else {}
        state = _load_state()
        requested_engine = _clean_text(p.get("engine"), 40)
        engine = _resolve_engine(requested_engine or state.get("engine"))
        target = _clean_text(p.get("target"), 240) or state.get("draft", {}).get("to") or state.get("draft", {}).get("from")
        try:
            draft = _build_test_draft(engine, str(target))
            delivery = await _send_email(engine, draft)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[email.test_provider] %s", exc)
            return await _fail(ws, req_id, str(exc), "EMAIL_TEST_FAILED")
        await channel.send_response(
            ws,
            req_id,
            ok=True,
            payload={
                "engine": engine,
                "target": draft["to"],
                "providerMessageId": delivery.get("providerMessageId") or "",
                "message": f"Test email sent to {draft['to']}",
            },
        )

    methods = {
        "email.get_state": _get_state,
        "email.send": _send,
        "email.test_provider": _test_provider,
    }
    for name, fn in methods.items():
        channel.register_method(name, fn)
    logger.info("[email] registered %d RPC methods", len(methods))
