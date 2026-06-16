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

_ALLOWED_ENGINES = {"plunk", "resend", "postmark", "ses", "smtp"}
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
        "schemaVersion": 2,
        "engine": _env("EMAIL_ENGINE", default="plunk") or "plunk",
        "domain": _env("EMAIL_DOMAIN", "PLUNK_DOMAIN"),
        "domainStatus": "unknown",
        "serviceStatus": "unknown",
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
    base["domain"] = _clean_text(raw.get("domain"), 240) or base["domain"]
    base["domainStatus"] = _clean_text(raw.get("domainStatus"), 40) or base["domainStatus"]
    base["serviceStatus"] = _clean_text(raw.get("serviceStatus"), 40) or base["serviceStatus"]
    if raw.get("rightPanel") in {"inbox", "templates", "campaigns", "domains"}:
        base["rightPanel"] = raw["rightPanel"]
    base["draft"] = _normalize_draft(raw.get("draft"), base["draft"])
    for key in ("templates", "campaigns", "inbox", "sent"):
        if isinstance(raw.get(key), list):
            base[key] = [item for item in raw[key] if isinstance(item, dict)]
    if isinstance(raw.get("domains"), list):
        base["domains"] = [item for item in raw["domains"] if isinstance(item, dict)]
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
    engine = (requested or "").strip().lower() or _env("EMAIL_ENGINE", default="plunk").lower() or "plunk"
    if engine not in _ALLOWED_ENGINES:
        raise ValueError(f"unsupported email engine: {engine}")
    return engine


def _plunk_base() -> str:
    return _env("PLUNK_API_BASE", "EMAIL_API_BASE", default="https://next-api.useplunk.com").rstrip("/")


def _plunk_key() -> str:
    return _env("PLUNK_SECRET_KEY", "EMAIL_API_KEY", "EMAIL_TOKEN")


def _plunk_project_id() -> str:
    return _env("PLUNK_PROJECT_ID")


async def _plunk_request(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    timeout: float = 60.0,
) -> Any:
    api_key = _plunk_key()
    if not api_key:
        raise RuntimeError("Plunk secret key is missing")
    url = f"{_plunk_base()}/{path.lstrip('/')}"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.request(method.upper(), url, headers=headers, json=json_body, params=params)
    data: Any = response.json() if response.content else {}
    if response.status_code >= 400:
        error = data.get("error") if isinstance(data, dict) else None
        message = ""
        if isinstance(error, dict):
            message = str(error.get("message") or error.get("code") or "")
        if not message and isinstance(data, dict):
            message = str(data.get("message") or data.get("error") or "")
        raise RuntimeError(message or response.text[:300] or f"Plunk request failed: {response.status_code}")
    if isinstance(data, dict) and data.get("success") is False:
        error = data.get("error")
        if isinstance(error, dict):
            raise RuntimeError(str(error.get("message") or error.get("code") or "Plunk request failed"))
        raise RuntimeError(str(error or "Plunk request failed"))
    return data


def _unwrap_plunk_data(value: Any) -> Any:
    if isinstance(value, dict) and value.get("success") is True and "data" in value:
        return value.get("data")
    return value


async def _send_via_plunk(draft: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "from": draft["from"],
        "to": _split_emails(draft["to"]),
        "subject": draft["subject"],
        "body": _html_body(draft["body"]),
    }
    if draft.get("templateId"):
        payload["template"] = draft["templateId"]
    if draft.get("cc"):
        payload["cc"] = _split_emails(draft["cc"])
    if draft.get("bcc"):
        payload["bcc"] = _split_emails(draft["bcc"])
    data = _unwrap_plunk_data(await _plunk_request("POST", "/v1/send", json_body=payload, timeout=90.0))
    provider_id = ""
    if isinstance(data, dict):
        provider_id = str(data.get("email") or data.get("messageId") or data.get("id") or "")
    return {"providerMessageId": provider_id}


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
    if engine == "plunk":
        return await _send_via_plunk(draft)
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


def _normalize_remote_template(value: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    name = _clean_text(value.get("name") or value.get("title"), 120)
    template_id = _clean_text(value.get("id"), 100)
    if not template_id or not name:
        return None
    return {
        "id": template_id,
        "name": name,
        "subject": _clean_text(value.get("subject"), 240),
        "body": _clean_text(value.get("body") or value.get("html"), 12000),
        "updatedAt": _clean_text(value.get("updatedAt") or value.get("createdAt"), 40) or _now_iso(),
        "remote": True,
        "index": index,
    }


def _normalize_remote_campaign(value: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    name = _clean_text(value.get("name") or value.get("title"), 120)
    campaign_id = _clean_text(value.get("id"), 100)
    if not campaign_id or not name:
        return None
    status = _clean_text(value.get("status"), 40).lower() or "draft"
    return {
        "id": campaign_id,
        "name": name,
        "subject": _clean_text(value.get("subject"), 240),
        "templateId": _clean_text(value.get("templateId") or value.get("template"), 100) or None,
        "recipientCount": int(value.get("recipientCount") or value.get("totalRecipients") or 0),
        "status": status if status in {"draft", "queued", "sent"} else "draft",
        "updatedAt": _clean_text(value.get("updatedAt") or value.get("createdAt"), 40) or _now_iso(),
        "remote": True,
        "index": index,
    }


def _items_from_list_response(value: Any) -> list[Any]:
    if isinstance(value, dict) and isinstance(value.get("data"), list):
        return value["data"]
    if isinstance(value, list):
        return value
    return []


async def _refresh_plunk_state(state: dict[str, Any]) -> dict[str, Any]:
    if _resolve_engine(state.get("engine")) != "plunk" or not _plunk_key():
        state["serviceStatus"] = "not_configured"
        return state
    try:
        config = await _plunk_request("GET", "/config", timeout=20.0)
        state["serviceStatus"] = "ready" if isinstance(config, dict) else "ready"
    except Exception as exc:  # noqa: BLE001
        state["serviceStatus"] = "error"
        state["serviceError"] = str(exc)
        return state
    try:
        templates = _items_from_list_response(await _plunk_request("GET", "/templates", params={"limit": 50}, timeout=30.0))
        normalized = [_normalize_remote_template(item, idx) for idx, item in enumerate(templates)]
        state["templates"] = [item for item in normalized if item]
    except Exception as exc:  # noqa: BLE001
        state["templatesError"] = str(exc)
    try:
        campaigns = _items_from_list_response(await _plunk_request("GET", "/campaigns", params={"limit": 50}, timeout=30.0))
        normalized = [_normalize_remote_campaign(item, idx) for idx, item in enumerate(campaigns)]
        state["campaigns"] = [item for item in normalized if item]
    except Exception as exc:  # noqa: BLE001
        state["campaignsError"] = str(exc)
    project_id = _plunk_project_id()
    if project_id:
        try:
            domains = _items_from_list_response(await _plunk_request("GET", f"/domains/project/{project_id}", timeout=30.0))
            state["domains"] = domains
            domain_name = _env("EMAIL_DOMAIN", "PLUNK_DOMAIN")
            match = next((item for item in domains if isinstance(item, dict) and item.get("domain") == domain_name), None)
            if isinstance(match, dict):
                state["domainStatus"] = "verified" if match.get("verified") or match.get("status") == "verified" else "pending"
        except Exception as exc:  # noqa: BLE001
            state["domainsError"] = str(exc)
    return state


async def _create_plunk_template(template: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "name": template["name"],
        "from": template.get("from") or _env("EMAIL_FROM_ADDRESS", "EMAIL_ADDRESS", default=_DEFAULT_FROM),
        "subject": template.get("subject") or "",
        "body": _html_body(template.get("body") or ""),
    }
    data = await _plunk_request("POST", "/templates", json_body=payload, timeout=60.0)
    return _normalize_remote_template(data, 0) or {**template, "remote": False}


async def _create_plunk_campaign(campaign: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "name": campaign["name"],
        "from": draft.get("from") or _env("EMAIL_FROM_ADDRESS", "EMAIL_ADDRESS", default=_DEFAULT_FROM),
        "subject": draft.get("subject") or campaign.get("subject") or "",
        "body": _html_body(draft.get("body") or ""),
    }
    if draft.get("templateId"):
        payload["templateId"] = draft["templateId"]
    data = await _plunk_request("POST", "/campaigns", json_body=payload, timeout=60.0)
    return _normalize_remote_campaign(data, 0) or {**campaign, "remote": False}


def register_email_handlers(channel: Any) -> None:
    async def _reply(ws, req_id, *, state: dict[str, Any], extra: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"state": state}
        if extra:
            payload.update(extra)
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def _fail(ws, req_id, message: str, code: str = "BAD_REQUEST") -> None:
        await channel.send_response(ws, req_id, ok=False, error=message, code=code)

    async def _get_state(ws, req_id, params, session_id):
        state = await _refresh_plunk_state(_load_state())
        await _reply(ws, req_id, state=_save_state(state))

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

    async def _save_template(ws, req_id, params, session_id):
        p = params if isinstance(params, dict) else {}
        state = _load_state()
        raw = p.get("template") if isinstance(p.get("template"), dict) else {}
        template = {
            "id": _clean_text(raw.get("id"), 100) or f"template_{uuid.uuid4().hex[:10]}",
            "name": _clean_text(raw.get("name"), 120),
            "subject": _clean_text(raw.get("subject"), 240),
            "body": _clean_text(raw.get("body"), 12000),
            "updatedAt": _now_iso(),
        }
        if not template["name"]:
            return await _fail(ws, req_id, "Template name is required")
        if not template["subject"] and not template["body"]:
            return await _fail(ws, req_id, "Template needs a subject or body")
        try:
            if _resolve_engine(state.get("engine")) == "plunk" and _plunk_key():
                template = await _create_plunk_template(template)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[email.save_template] %s", exc)
            template["remoteError"] = str(exc)
        existing = [item for item in state.get("templates", []) if isinstance(item, dict) and item.get("id") != template["id"]]
        state["templates"] = [template, *existing][:100]
        state = _save_state(state)
        await _reply(ws, req_id, state=state, extra={"template": template})

    async def _create_campaign(ws, req_id, params, session_id):
        p = params if isinstance(params, dict) else {}
        state = _load_state()
        draft = _normalize_draft(p.get("draft"), state["draft"])
        name = _clean_text(p.get("name"), 120) or draft["subject"] or "Campaign"
        campaign = {
            "id": f"campaign_{uuid.uuid4().hex[:10]}",
            "name": name,
            "subject": draft["subject"],
            "templateId": draft.get("templateId"),
            "recipientCount": len(_split_emails(draft["to"])),
            "status": "draft",
            "updatedAt": _now_iso(),
        }
        if not draft["subject"] and not draft["body"]:
            return await _fail(ws, req_id, "Campaign needs an email subject or body")
        try:
            if _resolve_engine(state.get("engine")) == "plunk" and _plunk_key():
                campaign = await _create_plunk_campaign(campaign, draft)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[email.create_campaign] %s", exc)
            campaign["remoteError"] = str(exc)
        state["campaigns"] = [campaign, *[item for item in state.get("campaigns", []) if isinstance(item, dict) and item.get("id") != campaign["id"]]][:100]
        state["draft"] = {**draft, "campaignId": campaign["id"]}
        state = _save_state(state)
        await _reply(ws, req_id, state=state, extra={"campaign": campaign})

    async def _sync(ws, req_id, params, session_id):
        state = await _refresh_plunk_state(_load_state())
        await _reply(ws, req_id, state=_save_state(state))

    async def _add_domain(ws, req_id, params, session_id):
        p = params if isinstance(params, dict) else {}
        domain = _clean_text(p.get("domain"), 240) or _env("EMAIL_DOMAIN", "PLUNK_DOMAIN")
        if not domain:
            return await _fail(ws, req_id, "Domain is required")
        try:
            result = await _plunk_request("POST", "/domains", json_body={"domain": domain}, timeout=60.0)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[email.add_domain] %s", exc)
            return await _fail(ws, req_id, str(exc), "EMAIL_DOMAIN_FAILED")
        state = _load_state()
        state["domain"] = domain
        state["domainStatus"] = "pending"
        state = _save_state(state)
        await _reply(ws, req_id, state=state, extra={"domain": result})

    async def _verify_domain(ws, req_id, params, session_id):
        p = params if isinstance(params, dict) else {}
        domain_id = _clean_text(p.get("domainId"), 120)
        if not domain_id:
            return await _fail(ws, req_id, "Domain id is required")
        try:
            result = await _plunk_request("GET", f"/domains/{domain_id}/verify", timeout=60.0)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[email.verify_domain] %s", exc)
            return await _fail(ws, req_id, str(exc), "EMAIL_DOMAIN_VERIFY_FAILED")
        state = await _refresh_plunk_state(_load_state())
        await _reply(ws, req_id, state=_save_state(state), extra={"domain": result})

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
        "email.sync": _sync,
        "email.save_template": _save_template,
        "email.create_campaign": _create_campaign,
        "email.add_domain": _add_domain,
        "email.verify_domain": _verify_domain,
    }
    for name, fn in methods.items():
        channel.register_method(name, fn)
    logger.info("[email] registered %d RPC methods", len(methods))
