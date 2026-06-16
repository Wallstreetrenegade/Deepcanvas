from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
from typing import Any
from urllib.parse import quote, urlparse

import httpx

logger = logging.getLogger(__name__)

_APIFY_INSTAGRAM_SYNC_URL = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items"
_APIFY_MCP_BASE_URL = "https://mcp.apify.com"
_APIFY_ACTOR_INSTAGRAM = "apify/instagram-scraper"
_APIFY_ACTOR_RAG = "apify/rag-web-browser"
_SOURCE_ORDER = ("instagram", "facebook", "tiktok", "linkedin", "web", "maps", "reddit", "x", "youtube")
_SOURCE_LABELS = {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "tiktok": "TikTok",
    "linkedin": "LinkedIn",
    "web": "Web",
    "maps": "Maps",
    "reddit": "Reddit",
    "x": "X",
    "youtube": "YouTube",
}
_SOURCE_SITE_FILTERS = {
    "facebook": "site:facebook.com",
    "tiktok": "site:tiktok.com",
    "linkedin": "site:linkedin.com/in OR site:linkedin.com/company",
    "web": "",
    "maps": "site:google.com/maps OR site:maps.google.com",
    "reddit": "site:reddit.com",
    "x": "site:x.com OR site:twitter.com",
    "youtube": "site:youtube.com",
}
_SOURCE_BADGES = {
    "instagram": "IG",
    "facebook": "FB",
    "tiktok": "TT",
    "linkedin": "LI",
    "web": "WB",
    "maps": "MP",
    "reddit": "RD",
    "x": "X",
    "youtube": "YT",
}


def _clean_text(value: Any, limit: int = 1200) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _split_query_parts(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"[\n,;]+", value) if part.strip()]


def _join_prompt_parts(*values: str) -> str:
    parts = [_clean_text(value, 400) for value in values if _clean_text(value, 400)]
    return " | ".join(parts)


def _env(*keys: str) -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value.strip()
    return ""


def _is_instagram_url(value: str) -> bool:
    try:
        parsed = urlparse(value if "://" in value else f"https://{value}")
    except Exception:  # noqa: BLE001
        return False
    host = (parsed.netloc or parsed.path).lower()
    return "instagram.com" in host


def _format_count(value: Any, fallback: str = "Public profile") -> str:
    try:
        count = int(value or 0)
    except Exception:  # noqa: BLE001
        count = 0
    if count <= 0:
        return fallback
    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M"
    if count >= 1_000:
        return f"{count / 1_000:.1f}K"
    return str(count)


def _avatar_color(seed: str) -> str:
    palette = [
        "#7d95ad",
        "#6b8cff",
        "#d97150",
        "#7d6bff",
        "#3bb3a4",
        "#d48b32",
        "#5a8ca8",
        "#8a63d2",
    ]
    return palette[sum(ord(ch) for ch in seed) % len(palette)]


def _score_profile(item: dict[str, Any]) -> int:
    followers = int(item.get("followersCount") or 0)
    posts = int(item.get("postsCount") or 0)
    base = 45
    if followers > 0:
        base += int(min(30, math.log10(followers + 1) * 8))
    if posts > 0:
        base += int(min(12, math.log10(posts + 1) * 5))
    if item.get("verified"):
        base += 8
    if item.get("isBusinessAccount"):
        base += 5
    if item.get("externalUrl"):
        base += 4
    return max(1, min(99, base))


def _instagram_profile_url(item: dict[str, Any]) -> str:
    username = _clean_text(item.get("username"), 120)
    if username:
        return f"https://www.instagram.com/{username}/"
    return _clean_text(item.get("inputUrl"), 500)


def _instagram_reference_badges(item: dict[str, Any]) -> list[str]:
    badges = ["IG"]
    if item.get("verified"):
        badges.append("VR")
    if item.get("externalUrl"):
        badges.append("WB")
    if item.get("isBusinessAccount"):
        badges.append("BZ")
    return badges[:4]


def _instagram_signals(item: dict[str, Any]) -> list[dict[str, str]]:
    followers = int(item.get("followersCount") or 0)
    posts = int(item.get("postsCount") or 0)
    signals: list[dict[str, str]] = []
    if item.get("verified"):
        signals.append({
            "id": "verified",
            "label": "Verified profile",
            "detail": "Instagram marks this account as verified.",
        })
    if item.get("isBusinessAccount"):
        signals.append({
            "id": "business",
            "label": "Business account",
            "detail": _clean_text(item.get("businessCategoryName"), 160) or "Configured as a business account.",
        })
    if followers:
        signals.append({
            "id": "followers",
            "label": "Followers",
            "detail": f"{_format_count(followers, '0')} followers",
        })
    if posts:
        signals.append({
            "id": "posts",
            "label": "Posts",
            "detail": f"{_format_count(posts, '0')} posts published",
        })
    if item.get("externalUrl"):
        signals.append({
            "id": "website",
            "label": "External website",
            "detail": _clean_text(item.get("externalUrl"), 180),
        })
    return signals[:4]


def _prospect_from_instagram_profile(item: dict[str, Any]) -> dict[str, Any]:
    username = _clean_text(item.get("username"), 120)
    full_name = _clean_text(item.get("fullName"), 160) or username or "Instagram profile"
    category = _clean_text(item.get("businessCategoryName"), 160)
    biography = _clean_text(item.get("biography"), 1000)
    posts = int(item.get("postsCount") or 0)
    tags = [
        tag
        for tag in [
            category,
            "instagram",
            "verified" if item.get("verified") else "",
            "business" if item.get("isBusinessAccount") else "",
        ]
        if tag
    ]
    profile_url = _instagram_profile_url(item)
    location = _clean_text(item.get("addressCityName"), 180) or "Instagram"
    experience = f"{_format_count(posts, '0')} posts"
    company = category or "Instagram"
    role = "Business profile" if item.get("isBusinessAccount") else "Instagram creator"
    if item.get("verified"):
        role = "Verified creator"
    return {
        "id": f"instagram_{_clean_text(item.get('id'), 120) or username or 'profile'}",
        "name": full_name,
        "company": company,
        "role": role,
        "email": "",
        "source": "Instagram",
        "status": "new",
        "score": _score_profile(item),
        "tags": tags[:6],
        "notes": [],
        "nextAction": "Review profile fit and outreach angle",
        "createdAt": "",
        "updatedAt": "",
        "profileUrl": profile_url,
        "location": location,
        "experience": experience,
        "industry": category or "Instagram",
        "summary": biography or f"{full_name} on Instagram.",
        "avatarColor": _avatar_color(username or full_name),
        "referenceBadges": _instagram_reference_badges(item),
        "signals": _instagram_signals(item),
    }


def _build_instagram_run_input(query: str, limit: int) -> dict[str, Any]:
    parts = _split_query_parts(query)
    direct_urls = [part for part in parts if _is_instagram_url(part)]
    if direct_urls:
        return {
            "resultsType": "details",
            "directUrls": direct_urls[: min(limit, 25)],
        }
    return {
        "resultsType": "details",
        "search": query,
        "searchType": "profile",
        "searchLimit": max(1, min(limit, 250)),
    }


async def _run_apify_instagram_rest(query: str, limit: int) -> list[dict[str, Any]]:
    token = _env("APIFY_API_KEY")
    if not token:
        raise RuntimeError("Add APIFY API Key in settings first")

    run_input = _build_instagram_run_input(query, limit)
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            _APIFY_INSTAGRAM_SYNC_URL,
            params={"token": token},
            json=run_input,
        )
    if response.status_code >= 400:
        try:
            payload = response.json()
        except Exception:  # noqa: BLE001
            payload = {}
        message = (
            payload.get("error", {}).get("message")
            or payload.get("message")
            or response.text[:400]
            or "Instagram scrape failed"
        )
        raise RuntimeError(str(message))
    payload = response.json()
    items = payload if isinstance(payload, list) else payload.get("items", [])
    if not isinstance(items, list):
        return []
    prospects: list[dict[str, Any]] = []
    for raw in items:
        if isinstance(raw, dict):
            prospects.append(_prospect_from_instagram_profile(raw))
    return prospects


def _normalize_sources(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    allowed = set(_SOURCE_ORDER)
    normalized: list[str] = []
    for item in value:
        text = _clean_text(item, 40).lower()
        if text in allowed and text not in normalized:
            normalized.append(text)
    return normalized


def _json_from_text(value: str) -> Any:
    text = (value or "").strip()
    if not text:
        return None
    candidates = [text]
    fenced = re.findall(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL | re.IGNORECASE)
    candidates.extend(fenced)
    for candidate in candidates:
        snippet = candidate.strip()
        try:
            return json.loads(snippet)
        except Exception:  # noqa: BLE001
            pass
        for opener, closer in (("{", "}"), ("[", "]")):
            start = snippet.find(opener)
            end = snippet.rfind(closer)
            if start >= 0 and end > start:
                try:
                    return json.loads(snippet[start : end + 1])
                except Exception:  # noqa: BLE001
                    continue
    return None


def _coerce_list_payload(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("items", "data", "results", "output", "records"):
            nested = value.get(key)
            if isinstance(nested, list):
                return [item for item in nested if isinstance(item, dict)]
        if all(isinstance(item, dict) for item in value.values() if isinstance(item, list)):
            for item in value.values():
                if isinstance(item, list):
                    return [row for row in item if isinstance(row, dict)]
    return []


def _extract_dataset_id(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("datasetId", "defaultDatasetId", "dataset_id", "default_dataset_id"):
            dataset_id = _clean_text(value.get(key), 200)
            if dataset_id:
                return dataset_id
        for nested in value.values():
            dataset_id = _extract_dataset_id(nested)
            if dataset_id:
                return dataset_id
    if isinstance(value, list):
        for item in value:
            dataset_id = _extract_dataset_id(item)
            if dataset_id:
                return dataset_id
    return ""


def _host_label(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        host = ""
    host = host.removeprefix("www.")
    if not host:
        return "Website"
    return host


def _score_source_result(source: str, url: str, title: str, summary: str) -> int:
    base = 58
    domain = _host_label(url)
    if domain:
        base += 6
    if title:
        base += 8
    if summary:
        base += 10
    if source == "linkedin" and "linkedin.com" in url:
        base += 6
    if source == "instagram" and "instagram.com" in url:
        base += 6
    return max(1, min(98, base))


def _source_title_parts(source: str, title: str, url: str) -> tuple[str, str, str]:
    clean_title = _clean_text(title, 180)
    domain = _host_label(url)
    if source == "linkedin":
        parts = [part.strip() for part in re.split(r"[|\-·•]", clean_title) if part.strip()]
        if len(parts) >= 2:
            return parts[0], parts[1], "LinkedIn profile"
    if source == "youtube":
        parts = [part.strip() for part in re.split(r"[|\-·•]", clean_title) if part.strip()]
        if len(parts) >= 2:
            return parts[0], parts[1], "YouTube channel"
    return clean_title or domain or _SOURCE_LABELS.get(source, "Lead"), domain or _SOURCE_LABELS.get(source, "Web"), ""


def _prospect_from_rag_item(item: dict[str, Any], source: str) -> dict[str, Any]:
    search_result = item.get("searchResult") if isinstance(item.get("searchResult"), dict) else {}
    url = _clean_text(item.get("url") or item.get("loadedUrl") or search_result.get("url"), 500)
    title = _clean_text(item.get("title") or item.get("pageTitle") or search_result.get("title"), 180)
    snippet = _clean_text(
        item.get("description")
        or item.get("text")
        or item.get("markdown")
        or search_result.get("description"),
        900,
    )
    name, company, role = _source_title_parts(source, title, url)
    if not role:
        role = f"{_SOURCE_LABELS.get(source, 'Web')} result"
    if source == "maps":
        role = "Map listing"
    summary = snippet or title or f"{name} from {_SOURCE_LABELS.get(source, 'Web')}"
    source_label = _SOURCE_LABELS.get(source, "Web")
    signal_detail = _clean_text(search_result.get("description") or item.get("description"), 220) or "Matched the search request."
    tags = [source_label.lower(), _host_label(url)]
    return {
        "id": f"{source}_{abs(hash(url or title or name))}",
        "name": name or source_label,
        "company": company or source_label,
        "role": role,
        "email": "",
        "source": source_label,
        "status": "new",
        "score": _score_source_result(source, url, title, summary),
        "tags": [tag for tag in tags if tag][:6],
        "notes": [],
        "nextAction": "Review fit and save best contacts",
        "createdAt": "",
        "updatedAt": "",
        "profileUrl": url,
        "location": _host_label(url),
        "experience": "",
        "industry": source_label,
        "summary": summary,
        "avatarColor": _avatar_color(name or url or source_label),
        "referenceBadges": [_SOURCE_BADGES.get(source, "WB"), "WB"],
        "signals": [
            {
                "id": f"{source}_source",
                "label": f"{source_label} match",
                "detail": signal_detail,
            },
            {
                "id": f"{source}_domain",
                "label": "Source URL",
                "detail": url or "No URL returned",
            },
        ],
    }


def _dedupe_prospects(prospects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for prospect in prospects:
        if not isinstance(prospect, dict):
            continue
        url = _clean_text(prospect.get("profileUrl"), 500).lower()
        name = _clean_text(prospect.get("name"), 180).lower()
        key = url or f"{name}|{_clean_text(prospect.get('company'), 180).lower()}"
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(prospect)
    return unique


def _build_source_query(
    source: str,
    request_text: str,
    geography: str,
    include_keywords: str,
    exclude_keywords: str,
    freshness: str,
) -> str:
    positive = [request_text, geography, include_keywords, freshness]
    parts = [_clean_text(value, 240) for value in positive if _clean_text(value, 240)]
    query = " ".join(parts)
    filter_text = _SOURCE_SITE_FILTERS.get(source, "")
    if filter_text:
        query = f"{filter_text} {query}".strip()
    excludes = [term for term in _split_query_parts(exclude_keywords) if term]
    if excludes:
        query = f"{query} {' '.join(f'-{term}' for term in excludes)}".strip()
    return query


class _ApifyMcpAuth(httpx.Auth):
    def __init__(self, token: str):
        self._token = token

    async def async_auth_flow(self, request: httpx.Request):
        request.headers["Authorization"] = f"Bearer {self._token}"
        yield request


class _ApifyMcpClient:
    def __init__(self, token: str, actor_ids: list[str]):
        self._token = token
        self._actor_ids = actor_ids
        self._tool_names: set[str] = set()
        self._session = None
        self._streams_cm = None
        self._session_cm = None

    @staticmethod
    def _build_url(actor_ids: list[str]) -> str:
        tools = ["actors", "docs", *_clean_actor_ids(actor_ids)]
        encoded = quote(",".join(dict.fromkeys(tools)), safe=",/")
        return f"{_APIFY_MCP_BASE_URL}?tools={encoded}&telemetry-enabled=false"

    async def __aenter__(self):
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client

        self._streams_cm = streamablehttp_client(
            self._build_url(self._actor_ids),
            timeout=90.0,
            auth=_ApifyMcpAuth(self._token),
        )
        read, write, _ = await self._streams_cm.__aenter__()
        self._session_cm = ClientSession(read, write, sampling_callback=None)
        self._session = await self._session_cm.__aenter__()
        await asyncio.wait_for(self._session.initialize(), timeout=90.0)
        tools = await self._session.list_tools()
        self._tool_names = {tool.name for tool in tools.tools}
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._session_cm is not None:
            await self._session_cm.__aexit__(exc_type, exc, tb)
        if self._streams_cm is not None:
            await self._streams_cm.__aexit__(exc_type, exc, tb)

    def _resolve_actor_tool_name(self, actor_id: str) -> str:
        actor_name = actor_id.split("/", 1)[-1].lower()
        slash_name = actor_id.lower().replace("/", "-slash-")
        hyphen_name = actor_id.lower().replace("/", "-")
        candidates = [
            slash_name,
            hyphen_name,
            actor_name,
            actor_id.lower(),
        ]
        for candidate in candidates:
            for tool_name in self._tool_names:
                lower_name = tool_name.lower()
                if lower_name == candidate:
                    return tool_name
            for tool_name in self._tool_names:
                lower_name = tool_name.lower()
                if candidate in lower_name or actor_name in lower_name:
                    return tool_name
        return slash_name

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        if self._session is None:
            raise RuntimeError("Apify MCP session is not connected")
        result = await self._session.call_tool(tool_name, arguments=arguments)
        text_parts: list[str] = []
        for part in getattr(result, "content", []) or []:
            if hasattr(part, "text") and isinstance(part.text, str):
                text_parts.append(part.text)
        joined = "\n".join(text_parts).strip()
        parsed = _json_from_text(joined)
        return parsed if parsed is not None else joined

    async def call_actor(self, actor_id: str, actor_input: dict[str, Any], *, limit: int = 25) -> list[dict[str, Any]]:
        tool_name = self._resolve_actor_tool_name(actor_id)
        payload = await self.call_tool(tool_name, actor_input)
        items = _coerce_list_payload(payload)
        if items:
            return items
        dataset_id = _extract_dataset_id(payload)
        if dataset_id and "get-actor-output" in self._tool_names:
            full_output = await self.call_tool("get-actor-output", {"datasetId": dataset_id, "limit": limit})
            items = _coerce_list_payload(full_output)
            if items:
                return items
        return []


def _clean_actor_ids(actor_ids: list[str]) -> list[str]:
    cleaned: list[str] = []
    for actor_id in actor_ids:
        text = _clean_text(actor_id, 120)
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


async def _run_instagram_mcp(client: _ApifyMcpClient, query: str, limit: int) -> list[dict[str, Any]]:
    items = await client.call_actor(_APIFY_ACTOR_INSTAGRAM, _build_instagram_run_input(query, limit), limit=limit)
    return [_prospect_from_instagram_profile(item) for item in items if isinstance(item, dict)]


def _build_rag_input(query: str, limit: int) -> dict[str, Any]:
    return {
        "query": query,
        "maxResults": max(1, min(limit, 10)),
        "outputFormats": ["markdown"],
        "scrapingTool": "raw-http",
        "requestTimeoutSecs": 40,
        "maxRequestRetries": 1,
        "removeCookieWarnings": True,
    }


async def _run_source_search_mcp(
    client: _ApifyMcpClient,
    source: str,
    request_text: str,
    geography: str,
    include_keywords: str,
    exclude_keywords: str,
    freshness: str,
    limit: int,
) -> list[dict[str, Any]]:
    query = _build_source_query(source, request_text, geography, include_keywords, exclude_keywords, freshness)
    items = await client.call_actor(_APIFY_ACTOR_RAG, _build_rag_input(query, limit), limit=limit)
    return [_prospect_from_rag_item(item, source) for item in items if isinstance(item, dict)]


async def _run_apify_mcp_search(
    sources: list[str],
    request_text: str,
    geography: str,
    include_keywords: str,
    exclude_keywords: str,
    freshness: str,
    limit: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    token = _env("APIFY_API_KEY")
    if not token:
        raise RuntimeError("Add Apify API Key in settings first")

    actor_ids = [_APIFY_ACTOR_RAG]
    if "instagram" in sources:
        actor_ids.append(_APIFY_ACTOR_INSTAGRAM)

    counts: dict[str, int] = {}
    prospects: list[dict[str, Any]] = []
    async with _ApifyMcpClient(token, actor_ids) as client:
        for source in sources:
            try:
                if source == "instagram":
                    rows = await _run_instagram_mcp(
                        client,
                        _join_prompt_parts(request_text, geography, include_keywords, freshness),
                        limit,
                    )
                else:
                    rows = await _run_source_search_mcp(
                        client,
                        source,
                        request_text,
                        geography,
                        include_keywords,
                        exclude_keywords,
                        freshness,
                        limit,
                    )
                counts[source] = len(rows)
                prospects.extend(rows)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[lead_gen.mcp.%s] %s", source, exc)
                counts[source] = 0
                if source == "instagram":
                    fallback_rows = await _run_apify_instagram_rest(
                        _join_prompt_parts(request_text, geography, include_keywords, freshness),
                        limit,
                    )
                    counts[source] = len(fallback_rows)
                    prospects.extend(fallback_rows)
    return _dedupe_prospects(prospects), counts


def register_lead_gen_handlers(channel: Any) -> None:
    async def _fail(ws, req_id, message: str, code: str = "BAD_REQUEST") -> None:
        await channel.send_response(ws, req_id, ok=False, error=message, code=code)

    async def _search(ws, req_id, params, session_id):  # noqa: ARG001
        p = params if isinstance(params, dict) else {}
        engine = _clean_text(p.get("engine"), 80).lower() or "apify_mcp"
        sources = _normalize_sources(p.get("sources"))
        request_text = _clean_text(p.get("request"), 1200) or _clean_text(p.get("criteriaText"), 1200)
        geography = _clean_text(p.get("geography"), 240)
        include_keywords = _clean_text(p.get("includeKeywords"), 400)
        exclude_keywords = _clean_text(p.get("excludeKeywords"), 400)
        freshness = _clean_text(p.get("freshness"), 120)
        query = _join_prompt_parts(request_text, geography, include_keywords, exclude_keywords, freshness) or _clean_text(
            p.get("query"), 1200
        )
        try:
            limit = int(p.get("limit") or 25)
        except Exception:  # noqa: BLE001
            limit = 25
        if not request_text and not query:
            return await _fail(ws, req_id, "Add search criteria first")
        if not sources:
            return await _fail(ws, req_id, "Select at least one source")
        if engine not in {"apify_mcp", "apify"}:
            return await _fail(ws, req_id, f"{engine} is not wired yet", "NOT_IMPLEMENTED")

        try:
            prospects, counts = await _run_apify_mcp_search(
                sources=sources,
                request_text=request_text or query,
                geography=geography,
                include_keywords=include_keywords,
                exclude_keywords=exclude_keywords,
                freshness=freshness,
                limit=limit,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("[lead_gen.search] %s", exc)
            return await _fail(ws, req_id, str(exc), "LEAD_GEN_SEARCH_FAILED")

        summary_parts = [
            f"{_SOURCE_LABELS[source]} {counts.get(source, 0)}"
            for source in sources
            if source in counts
        ]
        message = f"Loaded {len(prospects)} leads"
        if summary_parts:
            message = f"{message} • {' • '.join(summary_parts)}"
        await channel.send_response(
            ws,
            req_id,
            ok=True,
            payload={
                "engine": "apify_mcp",
                "sources": sources,
                "query": query,
                "message": message,
                "prospects": prospects,
            },
        )

    channel.register_method("lead_gen.search", _search)
    logger.info("[lead_gen] registered lead_gen.search RPC method")
