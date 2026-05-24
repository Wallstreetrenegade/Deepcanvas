# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""Social Station — Larry Autonomous Agent (``social.larry.*`` RPC).

Implements the Larry TikTok-slideshow marketing methodology
(https://github.com/Upload-Post/upload-post-larry-marketing-skill) as an
autonomous agent that powers Social Station's "Auto" tab.

Capabilities (v1):

* **Onboarding config** — app profile, image-gen, posting
  schedule, cross-post targets.
* **Plan generation** — produces a full 6-slide slideshow plan (hook,
  caption, 6 image prompts, 6 overlay texts, CTA) via the default LLM
  using a Larry-style system prompt (Tier 1 hook formulas, 6-slide
  structure, 4-6 words/line overlay rules, caption template).
* **Daily report** — pulls Upload-Post analytics + history, applies the
  diagnostic framework (views × conversions → SCALE / FIX_CTA /
  FIX_HOOKS / FULL_RESET / APP_ISSUE), and returns a report + next-hook
  suggestions.
* **Chat** — conversational "Larry" persona the user can ask for tweaks,
  new hooks, or diagnosis.
* **Autonomous flag** — toggle that the existing scheduler respects
  (actual cron wiring is delegated to the Scheduler tab in v1).

Upload-Post credentials (apiKey + currentProfile) are inherited from the
Social Station feature state — the user does NOT re-enter them here.

State is persisted under feature ``social_larry``.
"""

from __future__ import annotations

import asyncio
import datetime as _dt
import json
import logging
import os
import re
import uuid
from typing import Any, Optional

from . import feature_llm
from . import state as pi_state
from .integrations.upload_post_client import (
    UploadPostAuthError,
    UploadPostClient,
    UploadPostError,
)
from .larry_image_gen import ImageGenError, generate_image
from .larry_overlay import add_overlay

logger = logging.getLogger(__name__)

FEATURE = "social_larry"
_SOCIAL_STATION_FEATURE = "social_station"

# Module-level scheduler state.
_scheduler_task: Optional[asyncio.Task] = None
_scheduler_started = False
_scheduler_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# LLM config (same stack as app_builder)
# ---------------------------------------------------------------------------


def _llm_config(state_cfg: Optional[dict[str, Any]] = None) -> dict[str, str]:
    """Resolve LLM credentials. Larry config wins over env vars when set."""
    if state_cfg is None:
        try:
            raw = pi_state.load_feature(FEATURE, default=None) or {}
            state_cfg = raw.get("config") if isinstance(raw, dict) else None
        except Exception:  # noqa: BLE001
            state_cfg = None
    cfg_llm: dict[str, Any] = {}
    if isinstance(state_cfg, dict):
        cfg_llm = state_cfg.get("llm") or {}
    return feature_llm.resolve_config({
        "provider": cfg_llm.get("provider"),
        "baseUrl":  cfg_llm.get("baseUrl"),
        "apiKey":   cfg_llm.get("apiKey"),
        "model":    cfg_llm.get("model"),
    })


def _llm_ready(state_cfg: Optional[dict[str, Any]] = None) -> bool:
    return feature_llm.is_ready(_llm_config(state_cfg))


async def _call_llm(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    max_tokens: int = 2500,
    state_cfg: Optional[dict[str, Any]] = None,
) -> str:
    return await feature_llm.call_llm(
        messages,
        _llm_config(state_cfg),
        temperature=temperature,
        max_tokens=max_tokens,
    )


# ---------------------------------------------------------------------------
# Larry system prompt — core methodology baked in
# ---------------------------------------------------------------------------


LARRY_SYSTEM_PROMPT = """You are **Larry**, an autonomous TikTok + multi-platform marketing agent for apps and products. You operate inside the user's Social Station. Your methodology is battle-tested (7M views on viral articles, 1M+ TikTok views, $670+/mo MRR for apps).

# Your job
Grow the user's app via AI-generated slideshow posts on TikTok / Instagram / YouTube / LinkedIn / Threads / Pinterest / Reddit / Bluesky — posted through Upload-Post in a SINGLE API call per post. You generate hooks, write text overlays, write captions, and diagnose performance. You never BS. You cite data when you have it.

# The non-negotiable craft rules

## The 6-slide slideshow formula (EXACTLY 6 slides)
1. HOOK — stop the scroll. Relatable problem, full hook text.
2. PROBLEM — amplify the pain. Build tension.
3. DISCOVERY — "So I tried this" / "Then I found..."
4. TRANSFORMATION 1 — first result. Reaction style: "Wait... this actually looks good?"
5. TRANSFORMATION 2 — escalate. Reaction: "Okay I'm obsessed."
6. CTA — app name + "link in bio" (rotate CTAs).

SAME subject, SAME angle, DIFFERENT styles across all 6 slides. Lock architecture / face shape / camera position in EVERY prompt.

## Hook tiers (from proven viral data)
- **Tier 1 (BEST) — Person + Conflict → AI → Changed Mind**
  - "I showed my [mum/landlord/boyfriend] what AI thinks our [room/look/body] should look like"
  - "[Person] wouldn't believe this is the same [room/face/outfit]"
- **Tier 2 — Relatable Budget Pain**
  - "POV: You have good taste but no budget"
  - "I can't afford an [expert] so I tried AI"
- **Tier 3 — Curiosity / Self-Discovery**
  - "I've always wondered what I'd look like with..."
  - "Everyone's getting [thing] but would it suit MY face?"

AVOID: fear/insecurity ("Am I ugly..."), self-complaints without conflict, pure price comparison without a character.

## Overlay text rules (Larry's exact formula)
- **4-6 words per line MAX**, use `\\n` for manual line breaks, 3-4 lines per slide.
- **REACTIONS not labels** — "Wait... is this actually the same kitchen??" NOT "Modern minimalist".
- No emoji (canvas can't render them reliably).
- Safe zones: no text in bottom 20% (TikTok controls) or top 10% (status bar).
- Rendering (handled downstream): dynamic font size by word count (7.5% / 6.5% / 5.0% of image width), 15% outline, centered at 28% from top, white fill + black stroke.

## Image prompt template (portrait 1024×1536)
```
iPhone photo of a [SPECIFIC CONTEXT]. [DETAILED SUBJECT DESCRIPTION].
Shot from [CAMERA POSITION]. [LOCKED ARCHITECTURAL / PHYSICAL DETAILS].
Natural phone camera quality, realistic lighting. Portrait orientation.
No text, no watermarks, no logos.
[Consistency anchors: "same window on left wall", "same grey sofa", etc.]
```
NEVER generic ("a nice living room"). ALWAYS specific. Use **gpt-image-1.5** when the provider is OpenAI — never gpt-image-1.

## Caption template
```
[hook matching slide 1] 😭 [2-3 sentences of relatable struggle].
So I found this app called [APP NAME] that [what it does in one sentence] —
you just [simple action] and it [result]. I tried [variant 1] and [variant 2]
and honestly?? [emotional reaction]. [funny/relatable closer]
#[niche1] #[niche2] #[niche3] #[niche4] #fyp
```
≤5 hashtags. Conversational. Mention the app NATURALLY. Long storytelling captions outperform short ones 3x.

## Posting schedule (user timezone)
07:30 · 16:30 · 21:00 — 3×/day minimum. 100 consistent posts beats 1 viral.

## Cross-post via Upload-Post (ONE API call)
Instagram (default), YouTube Shorts, LinkedIn, Threads, Pinterest, Reddit, Bluesky. Same slides, different algorithms, more surface area.

## TikTok = draft mode
Post to TikTok as DRAFT so the user can add a trending sound before publishing. Silent slideshows get buried. Trending sound = 10-100× reach.

# The diagnostic framework (apply in every daily report)
Two axes: **views** (impressions) × **conversions** (paid / signup).

| Views | Conversions | Verdict | Action |
|-------|-------------|---------|--------|
| HIGH | HIGH | 🟢 SCALE IT | 3 hook variations + cross-post everywhere |
| HIGH | LOW | 🟡 FIX CTA | Rotate slide-6 CTA, check landing page |
| LOW | HIGH | 🟡 FIX HOOKS | Keep CTA, test radically different hooks (Tier 1 person+conflict) |
| LOW | LOW | 🔴 FULL RESET | New format, new audience angle |
| HIGH views + HIGH downloads + LOW paying | 🔴 APP ISSUE | Pause posting, fix onboarding / paywall / pricing |

# Tone
Talk to the user like a human marketing partner. Short, direct, slightly witty. No corporate speak. Don't lecture. Ask one thing at a time. React to their answers. Celebrate wins. Call out broken CTAs. You're their TikTok co-founder, not a chatbot.
"""


LARRY_PLAN_INSTRUCTION = """Generate ONE complete 6-slide slideshow post plan for the app described in the config. Return EXACTLY this JSON shape (no prose before or after):

```json
{
  "title": "<short internal name for this plan, 4-6 words>",
  "hookTier": "tier1" | "tier2" | "tier3",
  "hookCategory": "<one of: person-conflict, budget-pain, curiosity, pov, listicle, before-after>",
  "slides": [
    {
      "slide": 1,
      "role": "HOOK",
      "overlay": "Text with \\n line breaks, 4-6 words per line, 3-4 lines",
      "imagePrompt": "iPhone photo of ... (specific, locked anchors)"
    },
    {"slide": 2, "role": "PROBLEM", "overlay": "...", "imagePrompt": "..."},
    {"slide": 3, "role": "DISCOVERY", "overlay": "...", "imagePrompt": "..."},
    {"slide": 4, "role": "TRANSFORMATION_1", "overlay": "...", "imagePrompt": "..."},
    {"slide": 5, "role": "TRANSFORMATION_2", "overlay": "...", "imagePrompt": "..."},
    {"slide": 6, "role": "CTA", "overlay": "...", "imagePrompt": "..."}
  ],
  "caption": "Long conversational caption per template with ≤5 hashtags including #fyp",
  "cta": "The exact CTA line used on slide 6",
  "platforms": ["tiktok", "instagram"],
  "notes": "One line: why you chose this hook + any CTA test recommendation"
}
```

Rules you MUST follow:
- ALL 6 slides share the SAME subject / camera angle / architectural anchors; only style/colors/reaction change.
- Overlay = REACTIONS not labels. 4-6 words per line, \\n breaks, 3-4 lines.
- Image prompts must be specific (name the room layout, lighting direction, objects) and include "iPhone photo" + "realistic lighting" + "No text, no watermarks, no logos".
- Hook must map to one of the three tiers above. Prefer Tier 1 unless the user's past data shows another tier winning.
- Caption follows the template: hook → problem → discovery → what the app does → result → ≤5 hashtags.
- CTA on slide 6 rotates across: "Download [App] — link in bio" / "[App] is free to try — link in bio" / "I used [App] for this — link in bio" / "Search [App] on the App Store".
Return ONLY the JSON block. No preamble."""


LARRY_REPORT_INSTRUCTION = """You are writing today's daily performance report for the user. You will be given:

1. The app config.
2. Upload-Post platform analytics (followers, impressions, reach, profile views, timeseries) for the last N days.
3. Upload-Post upload history (per-post success, post URLs, request_ids).
4. The hookPerformance log with past hooks tagged by requestId.

Apply the diagnostic framework. Return EXACTLY this JSON:

```json
{
  "date": "YYYY-MM-DD",
  "headline": "one-sentence verdict ending with an emoji (🟢 🟡 🔴)",
  "verdict": "SCALE" | "FIX_CTA" | "FIX_HOOKS" | "FULL_RESET" | "APP_ISSUE" | "NEEDS_DATA",
  "metrics": {
    "followers": <int>,
    "impressions": <int>,
    "reach": <int>,
    "postsInWindow": <int>,
    "conversions": <int or null>
  },
  "topPost": {"requestId": "...", "hook": "...", "impressions": <int>, "conversions": <int or null>},
  "worstPost": {"requestId": "...", "hook": "...", "impressions": <int>, "conversions": <int or null>},
  "whatIsWorking": ["bullet 1", "bullet 2"],
  "whatToChange": ["bullet 1", "bullet 2"],
  "suggestedHooks": ["hook 1", "hook 2", "hook 3"],
  "ctaRecommendation": "what CTA to try next"
}
```

Rules:
- Be concrete. Reference specific posts by hook text when possible.
- If there are 0 posts in the window, return verdict "NEEDS_DATA" and tell the user to post 3-5 times before checking again.
- If impressions are rising but conversions are flat → FIX_CTA.
- If impressions are low but conversions are stable → FIX_HOOKS with 3 Tier-1 person+conflict suggestions.
- Suggested hooks must follow the tier formulas and be tailored to the user's app category.
Return ONLY the JSON."""


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return _dt.datetime.now().isoformat(timespec="seconds")


def _default_config() -> dict[str, Any]:
    return {
        "app": {
            "name": "",
            "description": "",
            "audience": "",
            "problem": "",
            "differentiator": "",
            "appStoreUrl": "",
            "category": "other",
            "isMobileApp": True,
        },
        "llm": {
            # Larry's reasoning model. If apiKey/baseUrl/model are blank, falls
            # back to the global API_KEY/API_BASE/MODEL_NAME env vars.
            "provider": "openai",   # openai | anthropic | google | custom
            "apiKey": "",
            "baseUrl": "",          # e.g. https://api.openai.com/v1
            "model": "",            # e.g. gpt-4o, claude-sonnet-4-5, gemini-2.5-pro
        },
        "imageGen": {
            "provider": "openai",
            "model": "gpt-image-1.5",
            "basePrompt": "",
            "useBatchAPI": False,
            "apiKey": "",
        },
        "posting": {
            "schedule": ["07:30", "16:30", "21:00"],
            "timezone": "",
            "crossPost": ["tiktok", "instagram"],
        },
        "competitorResearch": {
            "lastResearchedAt": None,
            "competitors": [],          # list of {handle, platform, notes}
            "trackedHashtags": [],      # list of strings
            "nicheInsights": "",        # freeform notes Larry references in plans
        },
    }


def _default_state() -> dict[str, Any]:
    return {
        "config": _default_config(),
        "plans": [],              # list of plan objects (see _plan_stub)
        "reports": [],            # list of daily report objects, newest first
        "hookPerformance": [],    # list of {requestId, hook, cta, date, conversions?, impressions?}
        "chat": [],               # list of {role, content, ts}
        "autoEnabled": False,
        "lastReportAt": None,
        "lastAutoPosts": {},      # map of "YYYY-MM-DD:HH:MM" -> planId
        "onboardingComplete": False,
        "busy": False,
        "lastError": None,
        "llmReady": _llm_ready(_default_config()),
        "uploadPostReady": False,
        "currentProfile": "",
        "updatedAt": _now_iso(),
    }


def _load_state() -> dict[str, Any]:
    raw = pi_state.load_feature(FEATURE, default=None)
    if not isinstance(raw, dict) or "config" not in raw:
        return _default_state()
    merged = _default_state()
    merged.update(raw)
    # Ensure nested config shape
    cfg = merged.get("config") or {}
    if not isinstance(cfg, dict):
        cfg = {}
    base_cfg = _default_config()
    for k, v in base_cfg.items():
        if k not in cfg or not isinstance(cfg[k], type(v)):
            cfg[k] = v
        elif isinstance(v, dict):
            merged_sub = dict(v)
            merged_sub.update(cfg[k])
            cfg[k] = merged_sub
    cfg.pop("uploadPost", None)
    cfg.pop("revenuecat", None)
    merged["config"] = cfg
    merged["llmReady"] = _llm_ready(cfg)
    merged["busy"] = False
    return merged


def _save_state(state: dict[str, Any]) -> dict[str, Any]:
    state["updatedAt"] = _now_iso()
    cfg = state.get("config") or {}
    state["llmReady"] = _llm_ready(cfg)
    ss = pi_state.load_feature(_SOCIAL_STATION_FEATURE, default=None) or {}
    provider = (ss.get("provider") or {}) if isinstance(ss, dict) else {}
    provider_key = (provider.get("apiKey") or os.environ.get("UPLOAD_POST_API_KEY") or "").strip()
    provider_status = str(provider.get("status") or "").strip()
    current_profile = str(provider.get("currentProfile") or "").strip()
    state["uploadPostReady"] = bool(provider_key and provider_status == "ok")
    state["currentProfile"] = current_profile
    pi_state.save_feature(FEATURE, state)
    return state


# ---------------------------------------------------------------------------
# Upload-Post client (inherits from Social Station credentials)
# ---------------------------------------------------------------------------


def _upload_post_client(state_cfg: Optional[dict[str, Any]] = None) -> tuple[Optional[UploadPostClient], str]:
    """Return (client, profile).

    Larry intentionally inherits Upload-Post from Social Station. In SaaS /
    white-label mode, the operator API key is managed by Social Station and each
    customer maps to a Social Station/Upload-Post profile. Larry must not carry
    a separate credential override, because that can bypass profile isolation.
    """
    ss = pi_state.load_feature(_SOCIAL_STATION_FEATURE, default=None) or {}
    provider = (ss.get("provider") or {}) if isinstance(ss, dict) else {}
    if str(provider.get("status") or "") != "ok":
        return None, str(provider.get("currentProfile") or "").strip()
    key = (
        (provider.get("apiKey") or "").strip()
        or (os.environ.get("UPLOAD_POST_API_KEY") or "").strip()
    )
    profile = (provider.get("currentProfile") or "").strip()
    if not (key and profile):
        return None, profile
    try:
        return UploadPostClient(key), profile
    except Exception as exc:  # noqa: BLE001
        logger.warning("[social.larry] upload-post client init failed: %s", exc)
        return None, profile


def _connected_social_platforms() -> list[str]:
    ss = pi_state.load_feature(_SOCIAL_STATION_FEATURE, default=None) or {}
    connections = (ss.get("connections") or {}) if isinstance(ss, dict) else {}
    return [
        str(key)
        for key, conn in connections.items()
        if isinstance(conn, dict) and conn.get("connected")
    ]


def _target_platforms(cfg: dict[str, Any], requested: Optional[list[Any]] = None) -> list[str]:
    posting = (cfg.get("posting") or {}) if isinstance(cfg, dict) else {}
    configured = [str(p).strip() for p in (posting.get("crossPost") or []) if str(p).strip()]
    desired = [str(p).strip() for p in (requested or configured or ["tiktok", "instagram"]) if str(p).strip()]
    connected = set(_connected_social_platforms())
    if not connected:
        return []
    filtered = [p for p in desired if p in connected]
    if filtered:
        return filtered
    return [p for p in configured if p in connected]


def _has_image_key(cfg: dict[str, Any]) -> bool:
    img = (cfg.get("imageGen") or {}) if isinstance(cfg, dict) else {}
    provider = (img.get("provider") or "openai").strip().lower()
    return provider == "local" or bool(_image_gen_key(cfg))


def _valid_schedule_slots(slots: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(slots, list):
        return out
    for slot in slots:
        text = str(slot).strip()
        if re.fullmatch(r"[0-2]\d:[0-5]\d", text):
            hour = int(text[:2])
            if hour <= 23:
                out.append(text)
    return out


def _autonomy_readiness_issues(state: dict[str, Any]) -> list[str]:
    cfg = state.get("config") or {}
    app = cfg.get("app") or {}
    posting = cfg.get("posting") or {}
    client, profile = _upload_post_client(cfg)
    issues: list[str] = []
    if not _llm_ready(cfg):
        issues.append("Configure Larry's LLM provider, base URL, API key, and model.")
    if not (app.get("name") and app.get("description") and app.get("audience") and app.get("problem")):
        issues.append("Complete app name, description, audience, and main pain point.")
    if not _has_image_key(cfg):
        issues.append("Configure image generation API key or switch image provider to local.")
    if not (client and profile):
        issues.append("Connect Upload-Post in Social Station and select a profile.")
    if not _connected_social_platforms():
        issues.append("Connect at least one social account through Upload-Post.")
    if not _target_platforms(cfg):
        issues.append("Choose at least one connected destination in Auto posting settings.")
    if not _valid_schedule_slots(posting.get("schedule")):
        issues.append("Set at least one valid HH:MM posting time.")
    return issues


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------


_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_json(raw: str) -> Optional[dict]:
    raw = (raw or "").strip()
    if not raw:
        return None
    # Try fenced block first
    m = _JSON_BLOCK_RE.search(raw)
    candidate = m.group(1) if m else raw
    # Try candidate directly
    for attempt in (candidate, raw):
        try:
            parsed = json.loads(attempt)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    # Last-ditch: find first { ... last }
    first = raw.find("{")
    last = raw.rfind("}")
    if first >= 0 and last > first:
        try:
            parsed = json.loads(raw[first : last + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return None


def _plan_stub(data: dict, *, status: str = "draft") -> dict[str, Any]:
    plan_id = uuid.uuid4().hex[:12]
    now = _now_iso()
    return {
        "id": plan_id,
        "title": str(data.get("title") or "Untitled plan"),
        "hookTier": str(data.get("hookTier") or "tier1"),
        "hookCategory": str(data.get("hookCategory") or ""),
        "slides": data.get("slides") or [],
        "caption": str(data.get("caption") or ""),
        "cta": str(data.get("cta") or ""),
        "platforms": data.get("platforms") or ["tiktok", "instagram"],
        "notes": str(data.get("notes") or ""),
        "status": status,
        "createdAt": now,
        "updatedAt": now,
        "postedAt": None,
        "requestId": None,
    }


# ---------------------------------------------------------------------------
# Image generation + overlay rendering
# ---------------------------------------------------------------------------


def _image_gen_key(cfg: dict[str, Any]) -> str:
    """Resolve the image-gen API key from config or environment."""
    img = (cfg.get("imageGen") or {}) if isinstance(cfg, dict) else {}
    key = (img.get("apiKey") or "").strip()
    if key:
        return key
    # Fallbacks per provider
    provider = (img.get("provider") or "openai").strip().lower()
    if provider == "openai":
        return (os.environ.get("OPENAI_API_KEY") or os.environ.get("API_KEY") or "").strip()
    if provider == "stability":
        return (os.environ.get("STABILITY_API_KEY") or "").strip()
    if provider == "replicate":
        return (os.environ.get("REPLICATE_API_TOKEN") or "").strip()
    return ""


async def _render_plan_assets(plan: dict[str, Any], cfg: dict[str, Any]) -> list[bytes]:
    """Generate the 6 raw images, overlay each one, return final PNG bytes list."""
    img_cfg = (cfg.get("imageGen") or {}) if isinstance(cfg, dict) else {}
    provider = (img_cfg.get("provider") or "openai").strip().lower()
    model = (img_cfg.get("model") or "gpt-image-1.5").strip()
    base_prompt = (img_cfg.get("basePrompt") or "").strip()
    api_key = _image_gen_key(cfg)
    if not api_key:
        raise ImageGenError(
            f"No API key for image provider {provider!r}. Set imageGen.apiKey "
            f"in the Auto config or the appropriate env var."
        )

    slides = plan.get("slides") or []
    if len(slides) < 6:
        raise RuntimeError(f"plan has {len(slides)} slides; need 6")

    rendered: list[bytes] = []
    # Generate slides sequentially — image APIs are typically rate-limited and
    # we want failures to halt early rather than burn budget.
    for i, slide in enumerate(slides[:6]):
        prompt = (slide.get("imagePrompt") or "").strip()
        if not prompt:
            raise RuntimeError(f"slide {i + 1} has no imagePrompt")
        full_prompt = f"{base_prompt}\n\n{prompt}".strip() if base_prompt else prompt
        logger.info("[social.larry] generating slide %d/6 [%s/%s]", i + 1, provider, model)
        raw = await generate_image(full_prompt, provider=provider, api_key=api_key, model=model)
        overlay_text = (slide.get("overlay") or "").strip()
        final = add_overlay(raw, overlay_text) if overlay_text else raw
        rendered.append(final)
        logger.info("[social.larry] slide %d/6 ready (%d bytes)", i + 1, len(final))
    return rendered


async def _upload_plan(
    plan: dict[str, Any],
    *,
    images: list[bytes],
    profile: str,
    client: UploadPostClient,
    platforms: list[str],
    caption: str,
    title: str = "",
) -> dict[str, Any]:
    """Upload the rendered images to all target platforms in a single API call."""
    photos: list[tuple] = []
    for i, png in enumerate(images, start=1):
        photos.append((f"slide{i}.png", png, "image/png"))
    fields: dict[str, Any] = {
        "title": caption or title or "",
        "async_upload": True,
    }
    if title and title != caption:
        fields["caption"] = caption
    return await client.upload_photos(
        user=profile,
        platforms=platforms,
        photos=photos,
        fields=fields,
        idempotency_key=plan.get("id"),
    )


# ---------------------------------------------------------------------------
# Autonomous post pipeline (used by the scheduler loop)
# ---------------------------------------------------------------------------


async def _build_autonomous_plan(state: dict[str, Any]) -> Optional[dict[str, Any]]:
    """LLM-generates a fresh plan from the current config + recent history."""
    cfg = state.get("config") or {}
    if not _llm_ready(cfg):
        logger.info("[social.larry] autonomous plan skipped: LLM not configured")
        return None
    recent_hooks = [
        {"hook": h.get("hook"), "tier": h.get("hookTier"), "date": h.get("date")}
        for h in (state.get("hookPerformance") or [])[-15:]
    ]
    last_report = (state.get("reports") or [{}])[0] if state.get("reports") else {}
    user_msg = (
        f"## App config\n{json.dumps(cfg, indent=2, ensure_ascii=False)}\n\n"
        f"## Recent hooks\n{json.dumps(recent_hooks, indent=2, ensure_ascii=False)}\n\n"
        f"## Latest verdict\n{json.dumps({'verdict': last_report.get('verdict'), 'headline': last_report.get('headline')}, ensure_ascii=False)}\n\n"
        f"## Guidance\nGenerate a NEW post following the latest verdict's recommendation. "
        f"If verdict is FIX_HOOKS or FULL_RESET, change hook category. "
        f"If SCALE, repeat the proven category with a new angle. Do not reuse hooks already in the recent list."
    )
    messages = [
        {"role": "system", "content": LARRY_SYSTEM_PROMPT},
        {"role": "system", "content": LARRY_PLAN_INSTRUCTION},
        {"role": "user", "content": user_msg},
    ]
    raw = await _call_llm(messages, temperature=0.85, max_tokens=2500)
    parsed = _extract_json(raw)
    if not parsed or not isinstance(parsed.get("slides"), list):
        logger.warning("[social.larry] autonomous plan: LLM returned malformed JSON")
        return None
    plan = _plan_stub(parsed, status="draft")
    plan["platforms"] = _target_platforms(cfg, plan.get("platforms")) or plan.get("platforms") or []
    plan["autonomous"] = True
    return plan


async def _run_autonomous_post(slot_label: str) -> None:
    """Runs ONE full autonomous cycle: build plan -> render -> upload."""
    state = _load_state()
    if not state.get("autoEnabled"):
        return
    today = _dt.date.today().isoformat()
    slot_key = f"{today}:{slot_label}"
    if slot_key in (state.get("lastAutoPosts") or {}):
        return
    # Reserve the slot up-front to prevent double-posts on race.
    state.setdefault("lastAutoPosts", {})[slot_key] = "in-progress"
    state["busy"] = True
    state["lastError"] = None
    state = _save_state(state)

    client, profile = _upload_post_client()
    if not (client and profile):
        logger.warning("[social.larry] autonomous skipped: Upload-Post not configured")
        state = _load_state()
        state.setdefault("lastAutoPosts", {}).pop(slot_key, None)
        state["busy"] = False
        state["lastError"] = "Upload-Post not configured"
        _save_state(state)
        return

    try:
        plan = await _build_autonomous_plan(state)
        if not plan:
            raise RuntimeError("LLM returned no plan")
        # Persist plan immediately
        state = _load_state()
        state["plans"].insert(0, plan)
        state["plans"] = state["plans"][:50]
        state = _save_state(state)

        plan["status"] = "rendering"
        plan["updatedAt"] = _now_iso()
        state = _load_state()
        for pl in state["plans"]:
            if pl.get("id") == plan["id"]:
                pl.update(plan)
                break
        state = _save_state(state)

        images = await _render_plan_assets(plan, state["config"])
        target_platforms = _target_platforms(state["config"], plan.get("platforms"))
        if not target_platforms:
            raise RuntimeError("No connected Upload-Post platforms are available for Auto.")
        plan["platforms"] = target_platforms
        result = await _upload_plan(
            plan, images=images, profile=profile,
            client=client, platforms=target_platforms, caption=plan["caption"],
        )
        request_id = (
            (result or {}).get("request_id")
            or (result or {}).get("requestId")
            or ""
        )
        state = _load_state()
        for pl in state["plans"]:
            if pl.get("id") == plan["id"]:
                pl["status"] = "posted"
                pl["postedAt"] = _now_iso()
                pl["requestId"] = request_id or None
                pl["uploadResult"] = result
                pl["updatedAt"] = _now_iso()
                break
        if request_id:
            slides = plan.get("slides") or []
            hook_text = (slides[0].get("overlay") if slides else "") or plan.get("title") or ""
            state["hookPerformance"].append({
                "requestId": request_id,
                "hook": hook_text,
                "hookTier": plan.get("hookTier"),
                "cta": plan.get("cta"),
                "date": today,
                "platforms": target_platforms,
                "planId": plan["id"],
                "autonomous": True,
                "impressions": None,
                "conversions": None,
            })
            state["hookPerformance"] = state["hookPerformance"][-200:]
        state["lastAutoPosts"][slot_key] = plan["id"]
        state["busy"] = False
        _save_state(state)
        logger.info("[social.larry] AUTO posted plan %s for slot %s -> request_id=%s", plan["id"], slot_label, request_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("[social.larry] autonomous cycle failed for slot %s", slot_label)
        state = _load_state()
        # Free the slot so a later retry can attempt again on the next loop tick.
        state.setdefault("lastAutoPosts", {}).pop(slot_key, None)
        state["busy"] = False
        state["lastError"] = f"auto-post failed: {exc}"
        _save_state(state)


async def _run_autonomous_daily_report() -> None:
    """Runs the daily diagnostic report once per day."""
    state = _load_state()
    today = _dt.date.today().isoformat()
    if (state.get("lastReportAt") or "")[:10] == today:
        return
    if not _llm_ready():
        return
    client, profile = _upload_post_client()
    if not (client and profile):
        return
    try:
        analytics_blob = await client.analytics(
            profile, platforms=["tiktok", "instagram", "youtube", "linkedin", "threads"]
        )
    except (UploadPostAuthError, UploadPostError) as exc:
        analytics_blob = {"_error": f"analytics fetch failed: {exc}"}
    try:
        history_blob = await client.history(page=1, limit=50, profile_username=profile)
    except (UploadPostAuthError, UploadPostError) as exc:
        history_blob = {"_error": f"history fetch failed: {exc}"}

    state = _load_state()
    user_msg = (
        f"## App config\n{json.dumps(state['config'], indent=2, ensure_ascii=False)}\n\n"
        f"## Window\nLast 7 days.\n"
        f"## Upload-Post analytics\n{json.dumps(analytics_blob, indent=2, ensure_ascii=False)[:8000]}\n\n"
        f"## Upload-Post history\n{json.dumps(history_blob, indent=2, ensure_ascii=False)[:8000]}\n\n"
        f"## Hook performance log\n{json.dumps(state['hookPerformance'][-20:], indent=2, ensure_ascii=False)}"
    )
    messages = [
        {"role": "system", "content": LARRY_SYSTEM_PROMPT},
        {"role": "system", "content": LARRY_REPORT_INSTRUCTION},
        {"role": "user", "content": user_msg},
    ]
    try:
        raw = await _call_llm(messages, temperature=0.4, max_tokens=2000)
    except Exception as exc:  # noqa: BLE001
        logger.exception("[social.larry] auto daily report LLM failed")
        return
    parsed = _extract_json(raw) or {
        "date": today,
        "headline": "Couldn't parse a structured report — raw output attached.",
        "verdict": "NEEDS_DATA",
        "raw": raw,
    }
    parsed.setdefault("date", today)
    parsed["generatedAt"] = _now_iso()
    parsed["windowDays"] = 7
    parsed["autonomous"] = True
    state = _load_state()
    state["reports"].insert(0, parsed)
    state["reports"] = state["reports"][:30]
    state["lastReportAt"] = _now_iso()
    _save_state(state)
    logger.info("[social.larry] auto daily report stored: %s", parsed.get("verdict"))


def _local_now(tz_name: str) -> _dt.datetime:
    try:
        from zoneinfo import ZoneInfo
        return _dt.datetime.now(ZoneInfo(tz_name or "UTC"))
    except Exception:  # noqa: BLE001
        return _dt.datetime.utcnow()


async def _scheduler_tick() -> None:
    """Runs once per minute. Posts on schedule slots; runs daily report at 06:00."""
    state = _load_state()
    cfg = state.get("config") or {}
    posting = cfg.get("posting") or {}
    tz = posting.get("timezone") or "UTC"
    now = _local_now(tz)
    hh_mm = now.strftime("%H:%M")

    # Daily report at 06:00 local
    if hh_mm == "06:00":
        try:
            await _run_autonomous_daily_report()
        except Exception:  # noqa: BLE001
            logger.exception("[social.larry] daily report tick failed")

    if not state.get("autoEnabled"):
        return
    schedule = posting.get("schedule") or []
    # Match HH:MM slots exactly (loop runs every minute).
    if hh_mm in schedule:
        try:
            await _run_autonomous_post(hh_mm)
        except Exception:  # noqa: BLE001
            logger.exception("[social.larry] autonomous post tick failed")


async def _scheduler_loop() -> None:
    logger.info("[social.larry] scheduler loop started")
    # Align to the next minute boundary so we hit HH:MM accurately.
    while True:
        try:
            now = _dt.datetime.now()
            sleep_for = 60 - now.second + 0.5
            await asyncio.sleep(sleep_for)
            await _scheduler_tick()
        except asyncio.CancelledError:
            logger.info("[social.larry] scheduler loop cancelled")
            return
        except Exception:  # noqa: BLE001
            logger.exception("[social.larry] scheduler loop error")
            await asyncio.sleep(15)


def _ensure_scheduler_started() -> None:
    """Lazily kick off the scheduler the first time we're inside a running loop."""
    global _scheduler_started, _scheduler_task
    if _scheduler_started:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # no loop yet; will be started by first RPC call
    _scheduler_started = True
    _scheduler_task = loop.create_task(_scheduler_loop())


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------


def register_social_larry_handlers(channel: Any) -> None:  # noqa: C901
    """Register all ``social.larry.*`` RPC methods on ``channel``."""

    async def _reply(ws, req_id, state: dict[str, Any], *, extra: Optional[dict] = None) -> None:
        payload: dict[str, Any] = {"state": state}
        if extra:
            payload.update(extra)
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def _fail(ws, req_id, message: str) -> None:
        await channel.send_response(ws, req_id, ok=False, error={"message": message})

    def _set_busy(state: dict[str, Any], flag: bool, err: Optional[str] = None) -> None:
        state["busy"] = bool(flag)
        state["lastError"] = err

    # ---- get_state ----
    async def _get_state(ws, req_id, params, session_id):
        _ensure_scheduler_started()
        state = _save_state(_load_state())
        await _reply(ws, req_id, state)

    # ---- save_config ----
    async def _save_config(ws, req_id, params, session_id):
        p = params or {}
        state = _load_state()
        cfg = state["config"]
        for section in ("app", "imageGen", "llm", "posting", "competitorResearch"):
            if section in p and isinstance(p[section], dict):
                cfg[section] = {**cfg.get(section, {}), **p[section]}
        cfg.pop("uploadPost", None)
        cfg.pop("revenuecat", None)
        if isinstance((cfg.get("posting") or {}).get("schedule"), list):
            slots = _valid_schedule_slots(cfg["posting"].get("schedule"))
            cfg["posting"]["schedule"] = slots or ["07:30", "16:30", "21:00"]
        if isinstance((cfg.get("posting") or {}).get("crossPost"), list):
            cfg["posting"]["crossPost"] = _target_platforms(cfg, cfg["posting"].get("crossPost"))
        # Mark onboarding complete once the app has a name + description
        app = cfg.get("app") or {}
        if (app.get("name") or "").strip() and (app.get("description") or "").strip():
            state["onboardingComplete"] = True
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- toggle_auto ----
    async def _toggle_auto(ws, req_id, params, session_id):
        p = params or {}
        enable = bool(p.get("enabled"))
        state = _load_state()
        if enable:
            issues = _autonomy_readiness_issues(state)
            if issues:
                state["autoEnabled"] = False
                state["lastError"] = "Autonomous mode is not ready: " + " ".join(issues)
                state = _save_state(state)
                await _reply(ws, req_id, state)
                return
        state["autoEnabled"] = enable
        state["lastError"] = None
        state = _save_state(state)
        _ensure_scheduler_started()
        await _reply(ws, req_id, state)

    # ---- reset ----
    async def _reset(ws, req_id, params, session_id):
        state = _default_state()
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- clear_chat ----
    async def _clear_chat(ws, req_id, params, session_id):
        state = _load_state()
        state["chat"] = []
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- chat ----
    async def _chat(ws, req_id, params, session_id):
        p = params or {}
        user_msg = str(p.get("message") or "").strip()
        if not user_msg:
            await _fail(ws, req_id, "message is required")
            return
        state = _load_state()
        state["chat"].append({"role": "user", "content": user_msg, "ts": _now_iso()})
        _set_busy(state, True)
        _save_state(state)

        if not _llm_ready():
            state = _load_state()
            state["chat"].append({
                "role": "assistant",
                "content": "LLM isn't configured. Set FEATURES_PROVIDER / FEATURES_MODEL_NAME / FEATURES_API_BASE / FEATURES_API_KEY and try again.",
                "ts": _now_iso(),
            })
            _set_busy(state, False, "LLM not configured")
            state = _save_state(state)
            await _reply(ws, req_id, state)
            return

        # Build context: config + last 6 plans summary + last report summary
        ctx_parts: list[str] = []
        cfg = state["config"]
        ctx_parts.append("## App config\n" + json.dumps(cfg, indent=2, ensure_ascii=False))
        if state["plans"]:
            recent = state["plans"][-6:]
            brief = [
                {"title": pl["title"], "hookTier": pl["hookTier"], "status": pl["status"], "cta": pl["cta"]}
                for pl in recent
            ]
            ctx_parts.append("## Recent plans\n" + json.dumps(brief, indent=2, ensure_ascii=False))
        if state["reports"]:
            last = state["reports"][0]
            ctx_parts.append("## Last daily report\n" + json.dumps({
                "date": last.get("date"),
                "verdict": last.get("verdict"),
                "headline": last.get("headline"),
            }, indent=2, ensure_ascii=False))
        context_msg = "\n\n".join(ctx_parts)

        history = state["chat"][-20:]
        messages: list[dict[str, str]] = [{"role": "system", "content": LARRY_SYSTEM_PROMPT}]
        messages.append({"role": "system", "content": context_msg})
        for m in history:
            role = m.get("role") or "user"
            if role not in ("user", "assistant"):
                continue
            messages.append({"role": role, "content": str(m.get("content") or "")})

        try:
            reply = await _call_llm(messages, temperature=0.7, max_tokens=1500)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[social.larry] chat failed")
            state = _load_state()
            _set_busy(state, False, str(exc))
            state["chat"].append({"role": "assistant", "content": f"(error: {exc})", "ts": _now_iso()})
            state = _save_state(state)
            await _reply(ws, req_id, state)
            return

        state = _load_state()
        state["chat"].append({"role": "assistant", "content": reply.strip(), "ts": _now_iso()})
        _set_busy(state, False)
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- generate_plan ----
    async def _generate_plan(ws, req_id, params, session_id):
        p = params or {}
        guidance = str(p.get("guidance") or "").strip()
        state = _load_state()

        if not _llm_ready():
            await _fail(ws, req_id, "LLM not configured (set FEATURES_PROVIDER / FEATURES_MODEL_NAME / FEATURES_API_BASE / FEATURES_API_KEY).")
            return

        app = state["config"].get("app") or {}
        if not (app.get("name") and app.get("description")):
            await _fail(ws, req_id, "App profile is incomplete. Set at least name + description in config first.")
            return

        _set_busy(state, True)
        _save_state(state)

        cfg_blob = json.dumps(state["config"], indent=2, ensure_ascii=False)
        past_hooks = [pl.get("title") for pl in state["plans"][-8:] if pl.get("title")]
        past_hooks_blob = "\n".join(f"- {h}" for h in past_hooks) or "(none yet)"

        user_msg = (
            f"## App config\n{cfg_blob}\n\n"
            f"## Recent plan titles (avoid repeating)\n{past_hooks_blob}\n\n"
            f"## Extra guidance from user\n{guidance or '(none — use your judgement and the hook tier formulas)'}"
        )
        messages = [
            {"role": "system", "content": LARRY_SYSTEM_PROMPT},
            {"role": "system", "content": LARRY_PLAN_INSTRUCTION},
            {"role": "user", "content": user_msg},
        ]

        try:
            raw = await _call_llm(messages, temperature=0.85, max_tokens=2800)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[social.larry] generate_plan failed")
            state = _load_state()
            _set_busy(state, False, str(exc))
            state = _save_state(state)
            await _fail(ws, req_id, f"LLM error: {exc}")
            return

        parsed = _extract_json(raw)
        if not parsed or not isinstance(parsed.get("slides"), list) or len(parsed.get("slides") or []) < 6:
            state = _load_state()
            _set_busy(state, False, "LLM returned malformed plan JSON.")
            state = _save_state(state)
            await _fail(ws, req_id, "Couldn't parse a 6-slide plan from the LLM output. Try again.")
            return

        plan = _plan_stub(parsed)
        plan["platforms"] = _target_platforms(state["config"], plan.get("platforms")) or plan.get("platforms") or []
        state = _load_state()
        state["plans"].append(plan)
        _set_busy(state, False)
        state = _save_state(state)
        await _reply(ws, req_id, state, extra={"planId": plan["id"]})

    # ---- list_plans / delete_plan / rename_plan ----
    async def _list_plans(ws, req_id, params, session_id):
        state = _save_state(_load_state())
        await _reply(ws, req_id, state)

    async def _delete_plan(ws, req_id, params, session_id):
        p = params or {}
        plan_id = str(p.get("planId") or "").strip()
        if not plan_id:
            await _fail(ws, req_id, "planId is required")
            return
        state = _load_state()
        state["plans"] = [pl for pl in state["plans"] if pl.get("id") != plan_id]
        state = _save_state(state)
        await _reply(ws, req_id, state)

    async def _rename_plan(ws, req_id, params, session_id):
        p = params or {}
        plan_id = str(p.get("planId") or "").strip()
        title = str(p.get("title") or "").strip()
        if not (plan_id and title):
            await _fail(ws, req_id, "planId and title are required")
            return
        state = _load_state()
        for pl in state["plans"]:
            if pl.get("id") == plan_id:
                pl["title"] = title
                pl["updatedAt"] = _now_iso()
                break
        state = _save_state(state)
        await _reply(ws, req_id, state)

    async def _update_plan_caption(ws, req_id, params, session_id):
        p = params or {}
        plan_id = str(p.get("planId") or "").strip()
        caption = str(p.get("caption") or "")
        if not plan_id:
            await _fail(ws, req_id, "planId is required")
            return
        state = _load_state()
        for pl in state["plans"]:
            if pl.get("id") == plan_id:
                pl["caption"] = caption
                pl["updatedAt"] = _now_iso()
                break
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- run_daily_report ----
    async def _run_daily_report(ws, req_id, params, session_id):
        p = params or {}
        days = int(p.get("days") or 3)
        days = max(1, min(days, 14))
        state = _load_state()

        if not _llm_ready():
            await _fail(ws, req_id, "LLM not configured.")
            return

        client, profile = _upload_post_client()
        analytics_blob: dict[str, Any] = {}
        history_blob: dict[str, Any] = {}
        if client and profile:
            try:
                analytics_blob = await client.analytics(
                    profile,
                    platforms=["tiktok", "instagram", "youtube", "linkedin", "threads"],
                )
            except (UploadPostAuthError, UploadPostError) as exc:
                analytics_blob = {"_error": f"analytics fetch failed: {exc}"}
            try:
                history_blob = await client.history(page=1, limit=50, profile_username=profile)
            except (UploadPostAuthError, UploadPostError) as exc:
                history_blob = {"_error": f"history fetch failed: {exc}"}
        else:
            analytics_blob = {"_error": "Upload-Post not configured in Social Station."}
            history_blob = {"_error": "Upload-Post not configured in Social Station."}

        _set_busy(state, True)
        _save_state(state)

        user_msg = (
            f"## App config\n{json.dumps(state['config'], indent=2, ensure_ascii=False)}\n\n"
            f"## Window\nLast {days} days.\n"
            f"## Upload-Post analytics\n{json.dumps(analytics_blob, indent=2, ensure_ascii=False)[:8000]}\n\n"
            f"## Upload-Post history\n{json.dumps(history_blob, indent=2, ensure_ascii=False)[:8000]}\n\n"
            f"## Hook performance log\n{json.dumps(state['hookPerformance'][-20:], indent=2, ensure_ascii=False)}"
        )
        messages = [
            {"role": "system", "content": LARRY_SYSTEM_PROMPT},
            {"role": "system", "content": LARRY_REPORT_INSTRUCTION},
            {"role": "user", "content": user_msg},
        ]

        try:
            raw = await _call_llm(messages, temperature=0.4, max_tokens=2000)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[social.larry] daily report failed")
            state = _load_state()
            _set_busy(state, False, str(exc))
            state = _save_state(state)
            await _fail(ws, req_id, f"LLM error: {exc}")
            return

        parsed = _extract_json(raw) or {
            "date": _dt.date.today().isoformat(),
            "headline": "Couldn't parse a structured report — raw output attached. 🟡",
            "verdict": "NEEDS_DATA",
            "metrics": {},
            "raw": raw,
        }
        parsed.setdefault("date", _dt.date.today().isoformat())
        parsed["generatedAt"] = _now_iso()
        parsed["windowDays"] = days

        state = _load_state()
        state["reports"].insert(0, parsed)
        state["reports"] = state["reports"][:30]  # keep last 30
        state["lastReportAt"] = _now_iso()
        _set_busy(state, False)
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- post_plan — REAL: generate images, overlay, upload via Upload-Post ----
    async def _post_plan(ws, req_id, params, session_id):
        p = params or {}
        plan_id = str(p.get("planId") or "").strip()
        if not plan_id:
            await _fail(ws, req_id, "planId is required")
            return
        state = _load_state()
        plan = next((pl for pl in state["plans"] if pl.get("id") == plan_id), None)
        if not plan:
            await _fail(ws, req_id, "plan not found")
            return

        client, profile = _upload_post_client()
        if not (client and profile):
            await _fail(ws, req_id, "Publishing is not configured. Connect Social Station first, then select platforms in Auto.")
            return

        platforms = _target_platforms(state["config"], list(plan.get("platforms") or ["tiktok", "instagram"]))
        if not platforms:
            await _fail(ws, req_id, "No connected Upload-Post destinations are available for this plan.")
            return
        plan["platforms"] = platforms
        # Larry: TikTok posts as DRAFT so user can add trending audio. Upload-Post
        # does this automatically when async_upload is true on photos.
        caption = str(plan.get("caption") or "")
        if not caption:
            await _fail(ws, req_id, "plan has no caption")
            return

        _set_busy(state, True)
        plan["status"] = "rendering"
        plan["updatedAt"] = _now_iso()
        _save_state(state)

        try:
            images = await _render_plan_assets(plan, state["config"])
        except (ImageGenError, RuntimeError) as exc:
            logger.exception("[social.larry] image render failed")
            state = _load_state()
            for pl in state["plans"]:
                if pl.get("id") == plan_id:
                    pl["status"] = "render_failed"
                    pl["lastError"] = str(exc)
                    pl["updatedAt"] = _now_iso()
                    break
            _set_busy(state, False, f"image render failed: {exc}")
            state = _save_state(state)
            await _fail(ws, req_id, f"Image render failed: {exc}")
            return

        try:
            result = await _upload_plan(
                plan, images=images, profile=profile,
                client=client, platforms=platforms, caption=caption,
            )
        except (UploadPostAuthError, UploadPostError) as exc:
            logger.exception("[social.larry] upload failed")
            state = _load_state()
            for pl in state["plans"]:
                if pl.get("id") == plan_id:
                    pl["status"] = "upload_failed"
                    pl["lastError"] = str(exc)
                    pl["updatedAt"] = _now_iso()
                    break
            _set_busy(state, False, f"upload failed: {exc}")
            state = _save_state(state)
            await _fail(ws, req_id, f"Upload-Post upload failed: {exc}")
            return

        request_id = (
            (result or {}).get("request_id")
            or (result or {}).get("requestId")
            or ""
        )
        # Stamp plan + record hook performance for later analytics correlation
        state = _load_state()
        for pl in state["plans"]:
            if pl.get("id") == plan_id:
                pl["status"] = "posted"
                pl["postedAt"] = _now_iso()
                pl["requestId"] = request_id or None
                pl["uploadResult"] = result
                pl["updatedAt"] = _now_iso()
                break
        if request_id:
            slides = plan.get("slides") or []
            hook_text = (slides[0].get("overlay") if slides else "") or plan.get("title") or ""
            state["hookPerformance"].append({
                "requestId": request_id,
                "hook": hook_text,
                "hookTier": plan.get("hookTier"),
                "cta": plan.get("cta"),
                "date": _dt.date.today().isoformat(),
                "platforms": platforms,
                "planId": plan_id,
                "impressions": None,
                "conversions": None,
            })
            state["hookPerformance"] = state["hookPerformance"][-200:]
        _set_busy(state, False)
        state = _save_state(state)
        await _reply(ws, req_id, state, extra={
            "uploadResult": result,
            "requestId": request_id,
        })

    # ---- record_hook_performance (manual log; the daily cron writes here too) ----
    async def _record_hook_performance(ws, req_id, params, session_id):
        p = params or {}
        entry = {
            "requestId": str(p.get("requestId") or ""),
            "hook": str(p.get("hook") or ""),
            "cta": str(p.get("cta") or ""),
            "date": str(p.get("date") or _dt.date.today().isoformat()),
            "impressions": p.get("impressions"),
            "conversions": p.get("conversions"),
            "platforms": p.get("platforms") or {},
        }
        state = _load_state()
        state["hookPerformance"].append(entry)
        state["hookPerformance"] = state["hookPerformance"][-200:]
        state = _save_state(state)
        await _reply(ws, req_id, state)

    # ---- register all ----
    channel.register_method("social.larry.get_state", _get_state)
    channel.register_method("social.larry.save_config", _save_config)
    channel.register_method("social.larry.toggle_auto", _toggle_auto)
    channel.register_method("social.larry.reset", _reset)
    channel.register_method("social.larry.clear_chat", _clear_chat)
    channel.register_method("social.larry.chat", _chat)
    channel.register_method("social.larry.generate_plan", _generate_plan)
    channel.register_method("social.larry.list_plans", _list_plans)
    channel.register_method("social.larry.delete_plan", _delete_plan)
    channel.register_method("social.larry.rename_plan", _rename_plan)
    channel.register_method("social.larry.update_plan_caption", _update_plan_caption)
    channel.register_method("social.larry.run_daily_report", _run_daily_report)
    channel.register_method("social.larry.post_plan", _post_plan)
    channel.register_method("social.larry.record_hook_performance", _record_hook_performance)

    logger.info("[social.larry] handlers registered (14 methods)")
