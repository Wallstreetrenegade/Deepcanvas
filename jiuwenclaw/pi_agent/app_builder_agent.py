# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""App Builder ↔ main-agent bridge.

Routes App Builder chat through the main JiuWenClaw agent (running in the
agentserver process) instead of pi_agent's own ``feature_llm`` HTTP client.

Why:
    The main agent already has the full tool stack — web search, web fetch,
    image generation, memory, skills, streaming, multi-step reasoning. Calling
    a raw OpenAI-compatible endpoint from pi_agent re-implements a subset of
    that and forfeits all of it. This bridge keeps the existing ``app.builder``
    JSON-RPC surface and the ``json-ops`` mutation contract, but lets the
    builder agent actually research, plan, and use tools before emitting the
    final ops block.

Architecture note:
    pi_agent runs inside the **gateway** process. The main agent runs inside
    the **agentserver** process. They communicate over the
    ``WebSocketAgentServerClient`` already wired into the gateway. This module
    just wraps that client with an App-Builder–shaped envelope.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import uuid
from typing import Any

from jiuwenclaw.e2a.models import E2AEnvelope
from jiuwenclaw.schema.message import ReqMethod

logger = logging.getLogger(__name__)


# Per-call hard cap. The main agent's plan mode can do tool calls + thinking
# which legitimately takes a while; align with the App Builder UI 180s timeout.
_STREAM_TIMEOUT_SECONDS = 170.0


def feature_enabled() -> bool:
    """True when App Builder may route chat through the main agent.

    Modes:
    - explicit on:  APP_BUILDER_USE_MAIN_AGENT=1/true/yes/on
    - explicit off: APP_BUILDER_USE_MAIN_AGENT=0/false/no/off
    - unset/auto:   enabled, but callers can still decide per-request
    """
    flag = os.environ.get("APP_BUILDER_USE_MAIN_AGENT", "").strip().lower()
    if flag in {"0", "false", "no", "off"}:
        return False
    return True


_MAIN_AGENT_ROUTE_PATTERNS = (
    r"\bsearch the web\b",
    r"\bweb search\b",
    r"\blook up\b",
    r"\bresearch\b",
    r"\bfetch\b",
    r"\bscrape\b",
    r"\byahoo finance\b",
    r"\blive data\b",
    r"\bcurrent data\b",
    r"\bmarket data\b",
    r"\bstock data\b",
    r"\bapi data\b",
    r"\bgithub\b",
    r"\brepo\b",
    r"\brepository\b",
    r"\bgit push\b",
    r"\bgit commit\b",
    r"\bcreate repo\b",
    r"\bclone repo\b",
    r"\bopen a url\b",
    r"\bvisit\b",
    r"\bbrowse\b",
    r"\bfind competitors\b",
    r"\bcompare competitors\b",
    r"\bpull data\b",
    r"\bdownload data\b",
    r"\bgenerate (an )?image\b",
    r"\bcreate (an )?image\b",
    r"\bhero image\b",
    r"\billustration\b",
)


def should_route_request(query: str, *, has_files: bool = False) -> bool:
    """Return True when this request should use the main agent tool stack."""
    flag = os.environ.get("APP_BUILDER_USE_MAIN_AGENT", "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        return True
    if flag in {"0", "false", "no", "off"}:
        return False

    text = (query or "").strip().lower()
    if not text:
        return False

    if any(re.search(pattern, text) for pattern in _MAIN_AGENT_ROUTE_PATTERNS):
        return True

    if has_files and any(token in text for token in ("refactor", "audit", "production ready", "improve architecture")):
        return True

    return False


def _session_id_for(project_id: str | None) -> str:
    """Stable per-project session id so the main agent keeps history scoped."""
    pid = (project_id or "").strip() or "scratch"
    # Keep the prefix readable in logs and short enough for any DB key.
    return f"app_builder::{pid[:64]}"


def _build_envelope(
    *,
    request_id: str,
    session_id: str,
    query: str,
    user_id: str = "",
    metadata: dict[str, Any] | None = None,
) -> E2AEnvelope:
    envelope_metadata = dict(metadata or {"source": "app_builder"})
    if user_id:
        envelope_metadata.setdefault("web_user_id", user_id)
    return E2AEnvelope(
        request_id=request_id,
        channel="web",
        user_id=user_id or None,
        session_id=session_id,
        method=ReqMethod.CHAT_SEND.value,
        params={
            "query": query,
            # plan mode lets the agent think + use tools before answering; we
            # rely on that for research-grade landing pages
            "mode": "agent.plan",
            **({"user_id": user_id} if user_id else {}),
        },
        is_stream=True,
        channel_context=envelope_metadata,
    )


def _extract_text(payload: Any) -> str:
    """Pull human-visible text out of a stream-chunk payload, if any."""
    if not isinstance(payload, dict):
        return ""
    event = payload.get("event_type") or ""
    # The agent emits text under several event names depending on the SDK.
    if event in {"chat.delta", "chat.text", "chat.message"}:
        return str(payload.get("content") or payload.get("text") or "")
    if event == "chat.final":
        return str(payload.get("content") or "")
    return ""


async def call_main_agent(
    agent_client: Any,
    *,
    project_id: str | None,
    query: str,
    user_id: str = "",
    request_id: str | None = None,
) -> str:
    """Send ``query`` to the main agent and return the full assistant reply.

    Streams chunks server-side so we collect the complete response — including
    the trailing ``json-ops`` block App Builder needs to apply — before
    returning. The frontend still gets a single atomic state update.

    Raises:
        RuntimeError: if no agent_client is configured or the stream errors.
        asyncio.TimeoutError: if the stream exceeds the per-call cap.
    """
    if agent_client is None:
        raise RuntimeError("agent_client is not configured for App Builder")

    rid = (request_id or uuid.uuid4().hex[:16]).strip()
    session_id = _session_id_for(project_id)
    envelope = _build_envelope(request_id=rid, session_id=session_id, query=query, user_id=user_id)

    logger.info(
        "[app_builder_agent] dispatch project=%s session=%s rid=%s query_len=%d",
        project_id, session_id, rid, len(query),
    )

    started = time.monotonic()
    text_parts: list[str] = []
    final_text: str | None = None
    error: str | None = None

    async def _consume() -> None:
        nonlocal final_text, error
        async for chunk in agent_client.send_request_stream(envelope):
            payload = chunk.payload if isinstance(chunk.payload, dict) else {}
            evt = payload.get("event_type") or ""
            if evt == "chat.error":
                error = str(payload.get("error") or payload.get("message") or "agent error")
                continue
            if evt == "chat.final":
                final_text = str(payload.get("content") or "")
                continue
            piece = _extract_text(payload)
            if piece:
                text_parts.append(piece)

    try:
        await asyncio.wait_for(_consume(), timeout=_STREAM_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.error(
            "[app_builder_agent] stream timeout after %.1fs project=%s rid=%s",
            time.monotonic() - started, project_id, rid,
        )
        raise

    if error:
        raise RuntimeError(error)

    # chat.final is canonical; fall back to concatenated deltas if missing.
    result = final_text if final_text is not None and final_text != "" else "".join(text_parts)
    elapsed = time.monotonic() - started
    logger.info(
        "[app_builder_agent] done project=%s rid=%s elapsed=%.1fs len=%d",
        project_id, rid, elapsed, len(result),
    )
    if not result:
        raise RuntimeError("main agent returned an empty response")
    return result
