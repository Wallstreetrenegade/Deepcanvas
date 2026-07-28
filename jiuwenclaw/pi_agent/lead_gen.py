from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import httpx

logger = logging.getLogger(__name__)

_APIFY_INSTAGRAM_SYNC_URL = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items"
_APIFY_MCP_BASE_URL = "https://mcp.apify.com"
_APIFY_ACTOR_INSTAGRAM = "apify/instagram-scraper"
_APIFY_ACTOR_RAG = "apify/rag-web-browser"
_SOURCE_ORDER = (
    "url",
    "instagram",
    "facebook",
    "tiktok",
    "linkedin",
    "web",
    "maps",
    "reddit",
    "x",
    "youtube",
    "zillow",
    "realtor",
    "redfin",
    "loopnet",
)
_SOURCE_LABELS = {
    "url": "URL",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "tiktok": "TikTok",
    "linkedin": "LinkedIn",
    "web": "Web",
    "maps": "Maps",
    "reddit": "Reddit",
    "x": "X",
    "youtube": "YouTube",
    "zillow": "Zillow",
    "realtor": "Realtor",
    "redfin": "Redfin",
    "loopnet": "LoopNet",
}
_SOURCE_SITE_FILTERS = {
    "url": "",
    "facebook": "site:facebook.com",
    "tiktok": "site:tiktok.com",
    "linkedin": "site:linkedin.com/in OR site:linkedin.com/company",
    "web": "",
    "maps": "site:google.com/maps OR site:maps.google.com",
    "reddit": "site:reddit.com",
    "x": "site:x.com OR site:twitter.com",
    "youtube": "site:youtube.com",
    "zillow": "site:zillow.com",
    "realtor": "site:realtor.com",
    "redfin": "site:redfin.com",
    "loopnet": "site:loopnet.com",
}
_SOURCE_BADGES = {
    "url": "URL",
    "instagram": "IG",
    "facebook": "FB",
    "tiktok": "TT",
    "linkedin": "LI",
    "web": "WB",
    "maps": "MP",
    "reddit": "RD",
    "x": "X",
    "youtube": "YT",
    "zillow": "ZW",
    "realtor": "RE",
    "redfin": "RF",
    "loopnet": "LN",
}
_SOURCE_NATIVE_ACTORS = {
    "instagram": {
        "actorId": _APIFY_ACTOR_INSTAGRAM,
        "env": "LEAD_GEN_INSTAGRAM_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["profiles", "posts", "hashtags", "places"],
        "costWeight": 1.2,
    },
    "facebook": {
        "actorId": "apify/facebook-search-scraper",
        "env": "LEAD_GEN_FACEBOOK_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["pages", "profiles"],
        "costWeight": 2.0,
    },
    "tiktok": {
        "actorId": "clockworks/tiktok-scraper",
        "env": "LEAD_GEN_TIKTOK_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["profiles", "videos", "hashtags"],
        "costWeight": 1.4,
    },
    "linkedin": {
        "actorId": "automation-lab/linkedin-company-scraper",
        "env": "LEAD_GEN_LINKEDIN_ACTOR_ID",
        "mode": "native_direct_or_fallback",
        "resultTypes": ["companies"],
        "requiresDirectUrls": True,
        "costWeight": 1.5,
    },
    "maps": {
        "actorId": "compass/google-maps-extractor",
        "env": "LEAD_GEN_MAPS_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["places", "businesses"],
        "costWeight": 1.7,
    },
    "reddit": {
        "actorId": "trudax/reddit-scraper",
        "env": "LEAD_GEN_REDDIT_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["posts", "communities", "users"],
        "costWeight": 1.1,
    },
    "x": {
        "actorId": "khadinakbar/x-twitter-search-scraper",
        "env": "LEAD_GEN_X_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["people", "tweets", "media"],
        "costWeight": 1.4,
    },
    "youtube": {
        "actorId": "streamers/youtube-scraper",
        "env": "LEAD_GEN_YOUTUBE_ACTOR_ID",
        "mode": "native_mcp",
        "resultTypes": ["videos", "channels", "shorts"],
        "costWeight": 1.3,
    },
    "zillow": {
        "actorId": "",
        "env": "LEAD_GEN_ZILLOW_ACTOR_ID",
        "mode": "rag_or_configured_native",
        "resultTypes": ["properties", "agents", "owners"],
        "costWeight": 1.6,
    },
    "realtor": {
        "actorId": "",
        "env": "LEAD_GEN_REALTOR_ACTOR_ID",
        "mode": "rag_or_configured_native",
        "resultTypes": ["properties", "agents", "owners"],
        "costWeight": 1.6,
    },
    "redfin": {
        "actorId": "",
        "env": "LEAD_GEN_REDFIN_ACTOR_ID",
        "mode": "rag_or_configured_native",
        "resultTypes": ["properties", "agents", "owners"],
        "costWeight": 1.6,
    },
    "loopnet": {
        "actorId": "",
        "env": "LEAD_GEN_LOOPNET_ACTOR_ID",
        "mode": "rag_or_configured_native",
        "resultTypes": ["commercial_properties", "brokers", "owners"],
        "costWeight": 1.8,
    },
}
_LEAD_GEN_USAGE_FILE = Path.home() / ".deepcanvas" / "lead_gen_usage.json"
_DEFAULT_CREDIT_PACKAGES = [
    {"id": "starter", "label": "Starter", "credits": 500, "price": "$19", "highlight": False},
    {"id": "growth", "label": "Growth", "credits": 2000, "price": "$59", "highlight": True},
    {"id": "scale", "label": "Scale", "credits": 7500, "price": "$149", "highlight": False},
]


def _clean_text(value: Any, limit: int = 1200) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _split_query_parts(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"[\n,;]+", value) if part.strip()]


def _normalize_string_list(value: Any, limit: int = 50) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        raw = _split_query_parts(str(value or ""))
    out: list[str] = []
    for item in raw:
        text = _clean_text(item, 500)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _join_prompt_parts(*values: str) -> str:
    parts = [_clean_text(value, 400) for value in values if _clean_text(value, 400)]
    return " | ".join(parts)


def _env(*keys: str) -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value.strip()
    return ""


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name) or default)
    except Exception:  # noqa: BLE001
        return default


def _source_actor_id(source: str) -> str:
    spec = _SOURCE_NATIVE_ACTORS.get(source) or {}
    env_name = _clean_text(spec.get("env"), 80)
    override = _env(env_name) if env_name else ""
    return override or _clean_text(spec.get("actorId"), 120)


def _is_instagram_url(value: str) -> bool:
    try:
        parsed = urlparse(value if "://" in value else f"https://{value}")
    except Exception:  # noqa: BLE001
        return False
    host = (parsed.netloc or parsed.path).lower()
    return "instagram.com" in host


def _is_likely_url(value: str) -> bool:
    text = _clean_text(value, 500).lower()
    return "://" in text or "." in text and " " not in text


def _direct_values_for_source(source: str, params: dict[str, Any], query: str) -> list[str]:
    direct = _normalize_string_list(params.get("directUrls"), 80)
    direct.extend([part for part in _split_query_parts(query) if _is_likely_url(part)])
    if source == "linkedin":
        cleaned: list[str] = []
        for value in direct:
            text = value.strip()
            match = re.search(r"linkedin\.com/company/([^/?#\s]+)", text, flags=re.IGNORECASE)
            if match:
                text = match.group(1)
            if text and text not in cleaned:
                cleaned.append(text)
        return cleaned[:80]
    return list(dict.fromkeys(direct))[:80]


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
            prospect = _prospect_from_instagram_profile(raw)
            prospect.update(
                _source_metadata(
                    "instagram",
                    query=query,
                    url=_clean_text(prospect.get("profileUrl"), 500),
                    actor_id=_APIFY_ACTOR_INSTAGRAM,
                    mode="native",
                )
            )
            prospects.append(prospect)
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
        storages = value.get("storages")
        if isinstance(storages, dict):
            datasets = storages.get("datasets")
            if isinstance(datasets, dict):
                default_dataset = datasets.get("default")
                if isinstance(default_dataset, dict):
                    dataset_id = _clean_text(default_dataset.get("id"), 200)
                    if dataset_id:
                        return dataset_id
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


def _score_generic_actor_item(item: dict[str, Any], source: str) -> int:
    base = 56
    followers = item.get("followers") or item.get("followersCount") or item.get("followerCount") or item.get("subscribers")
    try:
        follower_count = int(str(followers or "0").replace(",", ""))
    except Exception:  # noqa: BLE001
        follower_count = 0
    if follower_count:
        base += int(min(20, math.log10(follower_count + 1) * 6))
    if item.get("email") or item.get("emails"):
        base += 12
    if item.get("website") or item.get("externalUrl"):
        base += 8
    if source in {"maps", "facebook", "linkedin"}:
        base += 5
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
    if source in {"zillow", "realtor", "redfin", "loopnet"}:
        return clean_title or domain or "Property listing", domain or _SOURCE_LABELS.get(source, "Real Estate"), "Real estate listing"
    if source == "url":
        return clean_title or domain or "Scraped URL", domain or "Website", "URL scrape"
    return clean_title or domain or _SOURCE_LABELS.get(source, "Lead"), domain or _SOURCE_LABELS.get(source, "Web"), ""


def _source_metadata(
    source: str,
    *,
    query: str = "",
    url: str = "",
    actor_id: str = "",
    mode: str = "",
) -> dict[str, str]:
    source_label = _SOURCE_LABELS.get(source, source.title())
    return {
        "sourceKey": source,
        "sourceLabel": source_label,
        "sourceQuery": _clean_text(query, 1200),
        "sourceUrl": _clean_text(url, 500),
        "sourceMode": mode or "rag",
        "sourceActorId": _clean_text(actor_id, 160),
        "scrapedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _prospect_from_rag_item(item: dict[str, Any], source: str, query: str = "") -> dict[str, Any]:
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
    if source in {"zillow", "realtor", "redfin", "loopnet"}:
        role = "Real estate listing"
    if source == "url":
        role = "URL scrape"
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
        **_source_metadata(source, query=query, url=url, actor_id=_APIFY_ACTOR_RAG, mode="rag"),
    }


def _first_text(item: dict[str, Any], *keys: str, limit: int = 240) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, list):
            value = next((entry for entry in value if entry), "")
        if isinstance(value, dict):
            value = value.get("name") or value.get("title") or value.get("url") or ""
        text = _clean_text(value, limit)
        if text:
            return text
    return ""


def _first_url(item: dict[str, Any]) -> str:
    for key in (
        "url",
        "profileUrl",
        "profileURL",
        "pageUrl",
        "pageURL",
        "link",
        "permalink",
        "website",
        "channelUrl",
        "videoUrl",
        "postUrl",
        "twitterUrl",
        "facebookUrl",
        "linkedinUrl",
        "externalUrl",
    ):
        text = _clean_text(item.get(key), 500)
        if text:
            return text
    return ""


def _prospect_from_actor_item(item: dict[str, Any], source: str, actor_id: str, query: str = "") -> dict[str, Any]:
    if source == "instagram" and (item.get("username") or item.get("fullName")):
        prospect = _prospect_from_instagram_profile(item)
        prospect.update(
            _source_metadata(
                source,
                query=query,
                url=_clean_text(prospect.get("profileUrl"), 500),
                actor_id=actor_id,
                mode="native",
            )
        )
        return prospect
    source_label = _SOURCE_LABELS.get(source, source.title())
    url = _first_url(item)
    name = _first_text(
        item,
        "name",
        "title",
        "fullName",
        "displayName",
        "username",
        "channelName",
        "pageName",
        "companyName",
        "authorName",
        "nickname",
        limit=180,
    )
    company = _first_text(item, "company", "organization", "businessName", "owner", "channelName", "pageName", limit=180)
    role = _first_text(item, "headline", "role", "categoryName", "category", "type", "industry", limit=180)
    summary = _first_text(item, "description", "bio", "biography", "about", "text", "caption", "snippet", limit=1000)
    location = _first_text(item, "location", "address", "city", "country", "state", "formattedAddress", limit=180)
    email = _first_text(item, "email", "emails", "contactEmail", limit=240)
    if not name:
        name = company or _host_label(url) or f"{source_label} lead"
    if not company:
        company = _host_label(url) or source_label
    if not role:
        role = f"{source_label} result"
    followers = _first_text(item, "followers", "followersCount", "followerCount", "subscribers", limit=40)
    tags = [source_label.lower()]
    for key in ("industry", "category", "categoryName", "type"):
        tag = _clean_text(item.get(key), 80)
        if tag and tag not in tags:
            tags.append(tag)
    signals = [
        {
            "id": f"{source}_actor",
            "label": "Native scraper",
            "detail": actor_id,
        }
    ]
    if followers:
        signals.append({"id": f"{source}_audience", "label": "Audience", "detail": followers})
    if email:
        signals.append({"id": f"{source}_email", "label": "Email found", "detail": email})
    if url:
        signals.append({"id": f"{source}_url", "label": "Source URL", "detail": url})
    return {
        "id": f"{source}_{abs(hash(url or json.dumps(item, sort_keys=True, default=str)[:240]))}",
        "name": name,
        "company": company,
        "role": role,
        "email": email,
        "source": source_label,
        "status": "new",
        "score": _score_generic_actor_item(item, source),
        "tags": tags[:8],
        "notes": [],
        "nextAction": "Review fit and save best contacts" if source != "url" else "Review scraped page details",
        "createdAt": "",
        "updatedAt": "",
        "profileUrl": url,
        "location": location or source_label,
        "experience": followers,
        "industry": _first_text(item, "industry", "category", "categoryName", limit=180) or source_label,
        "summary": summary or f"{name} from {source_label}.",
        "avatarColor": _avatar_color(name or url or source_label),
        "referenceBadges": [_SOURCE_BADGES.get(source, "WB")],
        "signals": signals[:5],
        **_source_metadata(source, query=query, url=url, actor_id=actor_id, mode="native"),
    }


def _html_title(value: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", value or "", flags=re.IGNORECASE | re.DOTALL)
    return _clean_text(re.sub(r"<[^>]+>", " ", match.group(1) if match else ""), 180)


def _html_description(value: str) -> str:
    patterns = [
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, value or "", flags=re.IGNORECASE | re.DOTALL)
        if match:
            return _clean_text(match.group(1), 900)
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", value or "", flags=re.IGNORECASE | re.DOTALL)
    body = re.sub(r"<[^>]+>", " ", body)
    return _clean_text(body, 900)


def _prospect_from_url_fetch(url: str, html: str, query: str = "") -> dict[str, Any]:
    title = _html_title(html) or _host_label(url)
    summary = _html_description(html) or title
    return {
        "id": f"url_{abs(hash(url))}",
        "name": title or "Scraped URL",
        "company": _host_label(url),
        "role": "URL scrape",
        "email": "",
        "source": "URL",
        "status": "new",
        "score": _score_source_result("url", url, title, summary),
        "tags": ["url", _host_label(url)],
        "notes": [],
        "nextAction": "Review scraped page details",
        "createdAt": "",
        "updatedAt": "",
        "profileUrl": url,
        "location": _host_label(url),
        "experience": "",
        "industry": "Website",
        "summary": summary,
        "avatarColor": _avatar_color(title or url),
        "referenceBadges": ["URL"],
        "signals": [
            {"id": "url_source", "label": "Fetched URL", "detail": url},
            {"id": "url_domain", "label": "Domain", "detail": _host_label(url)},
        ],
        **_source_metadata("url", query=query, url=url, mode="direct_url"),
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
    direct_urls: str = "",
) -> str:
    if source == "url":
        urls = _normalize_string_list(direct_urls, 20)
        url_part = " ".join(urls)
        query = _join_prompt_parts(url_part, request_text, include_keywords)
        return query or request_text
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


def _query_terms(request_text: str, include_keywords: str, geography: str, limit: int = 20) -> list[str]:
    joined = _join_prompt_parts(request_text, include_keywords)
    terms = _split_query_parts(joined)
    if not terms and joined:
        terms = [joined]
    if geography and terms:
        return [f"{term} {geography}".strip() for term in terms[:limit]]
    return terms[:limit] or [_clean_text(request_text, 240) or "business leads"]


def _freshness_to_reddit_time(freshness: str) -> str:
    text = freshness.lower()
    if any(token in text for token in ("hour", "today")):
        return "day"
    if "week" in text:
        return "week"
    if "month" in text:
        return "month"
    if "year" in text:
        return "year"
    return "all"


def _build_native_actor_input(
    source: str,
    request_text: str,
    geography: str,
    include_keywords: str,
    exclude_keywords: str,  # noqa: ARG001
    freshness: str,
    limit: int,
    params: dict[str, Any],
) -> dict[str, Any] | None:
    query = _join_prompt_parts(request_text, geography, include_keywords, freshness)
    direct = _direct_values_for_source(source, params, query)
    terms = _query_terms(request_text, include_keywords, geography)
    result_type = _clean_text(params.get("resultType"), 80).lower()
    try:
        max_posts = int(params.get("maxPosts") or 0)
    except Exception:  # noqa: BLE001
        max_posts = 0

    if source == "instagram":
        actor_input = _build_instagram_run_input(query, limit)
        if direct:
            actor_input["directUrls"] = direct[: min(limit, 25)]
            actor_input["resultsType"] = "details"
        if freshness:
            actor_input["onlyPostsNewerThan"] = freshness
        if max_posts > 0:
            actor_input["resultsLimit"] = max(1, min(max_posts, 100))
        return actor_input
    if source == "facebook":
        return {
            "categories": terms[:20],
            "locations": [geography] if geography else [],
            "resultsLimit": max(1, min(limit, 1000)),
        }
    if source == "tiktok":
        if direct:
            return {
                "profiles": [value.rstrip("/").split("/")[-1].lstrip("@") for value in direct[:20]],
                "resultsPerPage": max(1, min(max_posts or limit, 100)),
                "profileScrapeSections": ["videos"],
            }
        if result_type == "hashtags":
            return {
                "hashtags": [term.lstrip("#").replace(" ", "") for term in terms[:20]],
                "resultsPerPage": max(1, min(limit, 100)),
            }
        return {
            "searchQueries": terms[:20],
            "resultsPerPage": max(1, min(limit, 100)),
        }
    if source == "linkedin":
        if not direct:
            return None
        return {
            "companyUrls": direct[: min(limit, 100)],
            "maxCompanies": max(1, min(limit, 1000)),
        }
    if source == "maps":
        return {
            "searchStringsArray": terms[:20],
            "locationQuery": geography,
            "maxCrawledPlacesPerSearch": max(1, min(limit, 500)),
        }
    if source == "reddit":
        return {
            "searches": terms[:20],
            "searchCommunityName": _clean_text(params.get("community"), 120),
            "searchPosts": result_type not in {"communities", "users"},
            "searchComments": result_type == "comments",
            "searchCommunities": result_type == "communities",
            "searchUsers": result_type in {"users", "people"},
            "includeMediaLinks": False,
            "includeNSFW": False,
            "sort": "new",
            "time": _freshness_to_reddit_time(freshness),
            "maxItems": max(1, min(limit, 500)),
        }
    if source == "x":
        search_type = "People" if result_type in {"people", "profiles", "users"} else "Latest"
        return {
            "queries": terms[:20],
            "searchType": search_type,
            "maxResults": max(1, min(limit, 5000)),
            "maxPagesPerQuery": 5,
            "includeRaw": False,
            "dedupeResults": True,
        }
    if source == "youtube":
        if direct:
            return {
                "startUrls": [{"url": value} for value in direct[: min(limit, 50)]],
                "maxResults": max(0, min(limit, 999999)),
                "maxResultsShorts": 0,
                "maxResultStreams": 0,
                "downloadSubtitles": False,
            }
        return {
            "searchQueries": terms[:20],
            "maxResults": max(1, min(limit, 999999)),
            "maxResultsShorts": 0,
            "maxResultStreams": 0,
            "downloadSubtitles": False,
        }
    return None


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
        if dataset_id:
            rest_items = await self._fetch_dataset_items(dataset_id, limit)
            if rest_items:
                return rest_items
        if dataset_id and "get-actor-output" in self._tool_names:
            full_output = await self.call_tool("get-actor-output", {"datasetId": dataset_id, "limit": limit})
            items = _coerce_list_payload(full_output)
            if items:
                return items
        if dataset_id and "get-dataset-items" in self._tool_names:
            full_output = await self.call_tool("get-dataset-items", {"datasetId": dataset_id, "limit": limit})
            items = _coerce_list_payload(full_output)
            if items:
                return items
        return []

    async def _fetch_dataset_items(self, dataset_id: str, limit: int) -> list[dict[str, Any]]:
        url = f"https://api.apify.com/v2/datasets/{quote(dataset_id, safe='')}/items"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                url,
                params={
                    "token": self._token,
                    "clean": "true",
                    "format": "json",
                    "limit": max(1, min(limit, 1000)),
                },
            )
        if response.status_code >= 400:
            logger.warning("[lead_gen.dataset.%s] %s", dataset_id, response.text[:400])
            return []
        payload = response.json()
        return [item for item in payload if isinstance(item, dict)] if isinstance(payload, list) else []


def _clean_actor_ids(actor_ids: list[str]) -> list[str]:
    cleaned: list[str] = []
    for actor_id in actor_ids:
        text = _clean_text(actor_id, 120)
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


async def _run_instagram_mcp(client: _ApifyMcpClient, query: str, limit: int) -> list[dict[str, Any]]:
    items = await client.call_actor(_APIFY_ACTOR_INSTAGRAM, _build_instagram_run_input(query, limit), limit=limit)
    rows: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            prospect = _prospect_from_instagram_profile(item)
            prospect.update(
                _source_metadata(
                    "instagram",
                    query=query,
                    url=_clean_text(prospect.get("profileUrl"), 500),
                    actor_id=_APIFY_ACTOR_INSTAGRAM,
                    mode="native",
                )
            )
            rows.append(prospect)
    return rows


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
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    p = params if isinstance(params, dict) else {}
    query = _build_source_query(
        source,
        request_text,
        geography,
        include_keywords,
        exclude_keywords,
        freshness,
        _clean_text(p.get("directUrls"), 4000),
    )
    if source == "url":
        direct_rows = await _run_direct_url_fetch(
            _normalize_string_list(p.get("directUrls"), max(1, min(limit, 20))),
            query=query,
        )
        if direct_rows:
            return direct_rows
    items = await client.call_actor(_APIFY_ACTOR_RAG, _build_rag_input(query, limit), limit=limit)
    rows = [_prospect_from_rag_item(item, source, query=query) for item in items if isinstance(item, dict)]
    return rows


async def _run_direct_url_fetch(urls: list[str], query: str = "") -> list[dict[str, Any]]:
    if not urls:
        return []
    rows: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for raw_url in urls[:20]:
            url = raw_url if "://" in raw_url else f"https://{raw_url}"
            try:
                response = await client.get(
                    url,
                    headers={"user-agent": "DeepCanvasLeadGen/1.0"},
                )
                if response.status_code >= 400:
                    continue
                rows.append(_prospect_from_url_fetch(str(response.url), response.text[:250_000], query=query))
            except Exception as exc:  # noqa: BLE001
                logger.debug("[lead_gen.url.%s] %s", url, exc)
    return rows


async def _run_native_source_mcp(
    client: _ApifyMcpClient,
    source: str,
    request_text: str,
    geography: str,
    include_keywords: str,
    exclude_keywords: str,
    freshness: str,
    limit: int,
    params: dict[str, Any],
) -> list[dict[str, Any]] | None:
    actor_id = _source_actor_id(source)
    if not actor_id:
        return None
    actor_input = _build_native_actor_input(
        source,
        request_text,
        geography,
        include_keywords,
        exclude_keywords,
        freshness,
        limit,
        params,
    )
    if actor_input is None:
        return None
    items = await client.call_actor(actor_id, actor_input, limit=limit)
    source_query = _build_source_query(
        source,
        request_text,
        geography,
        include_keywords,
        exclude_keywords,
        freshness,
        _clean_text(params.get("directUrls"), 4000),
    )
    return [_prospect_from_actor_item(item, source, actor_id, query=source_query) for item in items if isinstance(item, dict)]


async def _run_apify_mcp_search(
    sources: list[str],
    request_text: str,
    geography: str,
    include_keywords: str,
    exclude_keywords: str,
    freshness: str,
    limit: int,
    params: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    token = _env("APIFY_API_KEY")
    if not token:
        raise RuntimeError("Add Apify API Key in settings first")

    actor_ids = [_APIFY_ACTOR_RAG]
    for source in sources:
        actor_id = _source_actor_id(source)
        if actor_id:
            actor_ids.append(actor_id)

    counts: dict[str, int] = {}
    prospects: list[dict[str, Any]] = []
    p = params if isinstance(params, dict) else {}
    async with _ApifyMcpClient(token, actor_ids) as client:
        for source in sources:
            try:
                rows = await _run_native_source_mcp(
                    client,
                    source,
                    request_text,
                    geography,
                    include_keywords,
                    exclude_keywords,
                    freshness,
                    limit,
                    p,
                )
                if rows is None or not rows:
                    rows = await _run_source_search_mcp(
                        client,
                        source,
                        request_text,
                        geography,
                        include_keywords,
                        exclude_keywords,
                        freshness,
                        limit,
                        p,
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
                else:
                    try:
                        fallback_rows = await _run_source_search_mcp(
                            client,
                            source,
                            request_text,
                            geography,
                            include_keywords,
                            exclude_keywords,
                            freshness,
                            limit,
                            p,
                        )
                        counts[source] = len(fallback_rows)
                        prospects.extend(fallback_rows)
                    except Exception as fallback_exc:  # noqa: BLE001
                        logger.warning("[lead_gen.rag_fallback.%s] %s", source, fallback_exc)
    return _dedupe_prospects(prospects), counts


def _usage_enabled() -> bool:
    return _bool_env("LEAD_GEN_CREDITS_ENABLED", False)


def _default_credit_balance() -> int:
    try:
        return int(os.getenv("LEAD_GEN_DEFAULT_CREDITS") or 500)
    except Exception:  # noqa: BLE001
        return 500


def _usage_key(session_id: Any, params: dict[str, Any] | None = None) -> str:
    p = params if isinstance(params, dict) else {}
    return _clean_text(p.get("userId") or p.get("accountId") or session_id or "local", 160) or "local"


def _read_usage() -> dict[str, Any]:
    try:
        if _LEAD_GEN_USAGE_FILE.exists():
            data = json.loads(_LEAD_GEN_USAGE_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
    except Exception as exc:  # noqa: BLE001
        logger.debug("[lead_gen.usage] read failed: %s", exc)
    return {}


def _write_usage(data: dict[str, Any]) -> None:
    try:
        _LEAD_GEN_USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _LEAD_GEN_USAGE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[lead_gen.usage] write failed: %s", exc)


def _credit_packages() -> list[dict[str, Any]]:
    raw = _env("LEAD_GEN_CREDIT_PACKAGES_JSON")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                packages = [item for item in parsed if isinstance(item, dict)]
                if packages:
                    return packages
        except Exception as exc:  # noqa: BLE001
            logger.warning("[lead_gen.credits] invalid package JSON: %s", exc)
    return [dict(item) for item in _DEFAULT_CREDIT_PACKAGES]


def _estimate_credits(sources: list[str], limit: int) -> int:
    base = _float_env("LEAD_GEN_CREDIT_BASE_PER_SOURCE", 3.0)
    per_result = _float_env("LEAD_GEN_CREDIT_PER_RESULT", 0.35)
    total = 0.0
    for source in sources:
        weight = float((_SOURCE_NATIVE_ACTORS.get(source) or {}).get("costWeight") or 1.0)
        total += base * weight
        total += max(1, limit) * per_result * weight
    return max(1, int(math.ceil(total)))


def _usage_payload(account_key: str) -> dict[str, Any]:
    data = _read_usage()
    record = data.get(account_key) if isinstance(data.get(account_key), dict) else {}
    balance = int(record.get("creditsRemaining") or _default_credit_balance())
    used = int(record.get("creditsUsed") or 0)
    return {
        "enabled": _usage_enabled(),
        "accountKey": account_key,
        "creditsRemaining": balance,
        "creditsUsed": used,
        "billingMode": "app_credits" if _usage_enabled() else "metering_preview",
        "updatedAt": _clean_text(record.get("updatedAt"), 80),
    }


def _charge_credits(account_key: str, credits: int) -> dict[str, Any]:
    if not _usage_enabled():
        payload = _usage_payload(account_key)
        payload["creditsCharged"] = 0
        return payload
    data = _read_usage()
    record = data.get(account_key) if isinstance(data.get(account_key), dict) else {}
    remaining = int(record.get("creditsRemaining") or _default_credit_balance())
    used = int(record.get("creditsUsed") or 0)
    if remaining < credits:
        raise RuntimeError(f"Not enough Lead Gen credits. Need {credits}, available {remaining}.")
    record["creditsRemaining"] = remaining - credits
    record["creditsUsed"] = used + credits
    record["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data[account_key] = record
    _write_usage(data)
    payload = _usage_payload(account_key)
    payload["creditsCharged"] = credits
    return payload


def _grant_credits(account_key: str, credits: int) -> dict[str, Any]:
    data = _read_usage()
    record = data.get(account_key) if isinstance(data.get(account_key), dict) else {}
    remaining = int(record.get("creditsRemaining") or _default_credit_balance())
    used = int(record.get("creditsUsed") or 0)
    record["creditsRemaining"] = remaining + max(0, credits)
    record["creditsUsed"] = used
    record["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data[account_key] = record
    _write_usage(data)
    return _usage_payload(account_key)


def _checkout_payload(account_key: str, package_id: str) -> dict[str, Any]:
    packages = _credit_packages()
    package = next((item for item in packages if _clean_text(item.get("id"), 80) == package_id), None)
    if not package:
        raise RuntimeError("Unknown credit package")
    credits = int(package.get("credits") or 0)
    checkout_template = _env("LEAD_GEN_CREDITS_CHECKOUT_URL", "LEAD_GEN_CHECKOUT_URL")
    if checkout_template:
        checkout_url = (
            checkout_template
            .replace("{package}", quote(package_id, safe=""))
            .replace("{credits}", quote(str(credits), safe=""))
            .replace("{account}", quote(account_key, safe=""))
        )
        return {
            "status": "checkout_ready",
            "package": package,
            "checkoutUrl": checkout_url,
            "usage": _usage_payload(account_key),
        }
    if _bool_env("LEAD_GEN_CREDITS_DEV_TOPUP_ENABLED", False):
        return {
            "status": "credited",
            "package": package,
            "checkoutUrl": "",
            "usage": _grant_credits(account_key, credits),
        }
    return {
        "status": "checkout_not_configured",
        "package": package,
        "checkoutUrl": "",
        "usage": _usage_payload(account_key),
        "message": "Checkout is not configured yet.",
    }


def _source_catalog_payload(account_key: str = "local") -> dict[str, Any]:
    api_key_configured = bool(_env("APIFY_API_KEY"))
    sources: list[dict[str, Any]] = []
    for source in _SOURCE_ORDER:
        actor_spec = _SOURCE_NATIVE_ACTORS.get(source) or {}
        actor_id = _source_actor_id(source)
        native = bool(actor_id and source != "web")
        sources.append({
            "key": source,
            "label": _SOURCE_LABELS.get(source, source.title()),
            "mode": actor_spec.get("mode") or "rag_mcp",
            "actorId": actor_id if native else _APIFY_ACTOR_RAG,
            "nativeActor": native,
            "requiresDirectUrls": bool(actor_spec.get("requiresDirectUrls")),
            "resultTypes": actor_spec.get("resultTypes") or ["web"],
            "available": api_key_configured,
            "fallback": source not in {"instagram"},
        })
    return {
        "apiKeyConfigured": api_key_configured,
        "mcpUrl": _APIFY_MCP_BASE_URL,
        "usage": _usage_payload(account_key),
        "sources": sources,
        "defaultSources": ["url", "instagram", "facebook", "tiktok", "linkedin", "maps", "reddit", "x", "youtube"],
        "advancedFields": ["directUrls"],
        "creditPackages": _credit_packages(),
    }


def register_lead_gen_handlers(channel: Any) -> None:
    async def _fail(ws, req_id, message: str, code: str = "BAD_REQUEST") -> None:
        await channel.send_response(ws, req_id, ok=False, error=message, code=code)

    async def _catalog(ws, req_id, params, session_id):  # noqa: ARG001
        account_key = _usage_key(session_id, params if isinstance(params, dict) else {})
        await channel.send_response(ws, req_id, ok=True, payload=_source_catalog_payload(account_key))

    async def _usage(ws, req_id, params, session_id):  # noqa: ARG001
        account_key = _usage_key(session_id, params if isinstance(params, dict) else {})
        await channel.send_response(ws, req_id, ok=True, payload=_usage_payload(account_key))

    async def _credit_packages_rpc(ws, req_id, params, session_id):  # noqa: ARG001
        account_key = _usage_key(session_id, params if isinstance(params, dict) else {})
        await channel.send_response(
            ws,
            req_id,
            ok=True,
            payload={"packages": _credit_packages(), "usage": _usage_payload(account_key)},
        )

    async def _checkout(ws, req_id, params, session_id):  # noqa: ARG001
        p = params if isinstance(params, dict) else {}
        package_id = _clean_text(p.get("packageId"), 80)
        if not package_id:
            return await _fail(ws, req_id, "Select a credit package")
        account_key = _usage_key(session_id, p)
        try:
            payload = _checkout_payload(account_key, package_id)
        except Exception as exc:  # noqa: BLE001
            return await _fail(ws, req_id, str(exc), "LEAD_GEN_CHECKOUT_FAILED")
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def _search(ws, req_id, params, session_id):  # noqa: ARG001
        p = params if isinstance(params, dict) else {}
        engine = _clean_text(p.get("engine"), 80).lower() or "apify_mcp"
        sources = _normalize_sources(p.get("sources"))
        request_text = _clean_text(p.get("request"), 1200) or _clean_text(p.get("criteriaText"), 1200)
        geography = _clean_text(p.get("geography"), 240)
        include_keywords = _clean_text(p.get("includeKeywords"), 400)
        exclude_keywords = _clean_text(p.get("excludeKeywords"), 400)
        freshness = _clean_text(p.get("freshness"), 120)
        direct_urls = _clean_text(p.get("directUrls"), 4000)
        query = _join_prompt_parts(request_text, geography, include_keywords, exclude_keywords, freshness, direct_urls) or _clean_text(
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

        account_key = _usage_key(session_id, p)
        credits_estimated = _estimate_credits(sources, limit)
        if _usage_enabled():
            usage = _usage_payload(account_key)
            if int(usage.get("creditsRemaining") or 0) < credits_estimated:
                return await _fail(
                    ws,
                    req_id,
                    f"Not enough Lead Gen credits. Need {credits_estimated}, available {usage.get('creditsRemaining', 0)}.",
                    "LEAD_GEN_CREDITS_REQUIRED",
                )

        try:
            prospects, counts = await _run_apify_mcp_search(
                sources=sources,
                request_text=request_text or query,
                geography=geography,
                include_keywords=include_keywords,
                exclude_keywords=exclude_keywords,
                freshness=freshness,
                limit=limit,
                params=p,
            )
            usage_payload = _charge_credits(account_key, _estimate_credits(sources, max(1, len(prospects) or limit)))
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
            message = f"{message} - {' - '.join(summary_parts)}"
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
                "counts": counts,
                "catalog": _source_catalog_payload(account_key),
                "usage": {
                    **usage_payload,
                    "creditsEstimated": credits_estimated,
                },
            },
        )

    channel.register_method("lead_gen.catalog", _catalog)
    channel.register_method("lead_gen.usage", _usage)
    channel.register_method("lead_gen.credit_packages", _credit_packages_rpc)
    channel.register_method("lead_gen.checkout", _checkout)
    channel.register_method("lead_gen.search", _search)
    logger.info("[lead_gen] registered lead_gen RPC methods")
