# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""App Builder backend: file-tree state + LLM-driven code generation.

The App Builder is an AI-powered landing-page / website builder (Google AI
Studio / Vercel v0 style). Users chat with a builder agent on the right rail;
the agent mutates an in-memory virtual file tree. The frontend renders that
file tree as a Code tab and a live Preview tab (iframe srcDoc assembled from
``index.html`` + referenced files).

This module registers ``app.builder.*`` JSON-RPC methods on the given
channel. State is persisted via ``pi_agent.state`` under feature
``app_builder``; every mutating handler replies with the fresh snapshot so
the frontend store can replace its slice atomically.

The builder agent routes through the main JiuwenClaw agent when the gateway
bridge is available, so it can use the normal planning/tool stack. The direct
feature LLM config remains as a fallback:
``FEATURES_API_BASE`` / ``FEATURES_MODEL_NAME`` / ``FEATURES_API_KEY`` /
``FEATURES_PROVIDER`` or global ``API_BASE`` / ``MODEL_NAME`` / ``API_KEY``.
"""

from __future__ import annotations

import datetime as _dt
import asyncio
import base64
import json
import logging
import os
import re
import shlex
import shutil
import socket
import subprocess
import uuid
import zipfile
from pathlib import Path
from typing import Any, Optional

from jiuwenclaw.auth import get_current_user_data_dir

from . import feature_llm
from . import state as pi_state
from .larry_image_gen import ImageGenError, generate_image

logger = logging.getLogger(__name__)

FEATURE = "app_builder"
FEATURE_LIBRARY = "app_builder_projects"
_COMMAND_OUTPUT_LIMIT = 40000
_DEFAULT_COMMAND_TIMEOUT_SECONDS = 120
_DEV_SERVER_LOG_LIMIT = 20000
_ZIP_MAX_FILE_BYTES = 25 * 1024 * 1024
_ALLOWED_COMMANDS = {
    "node", "node.exe",
    "npm", "npm.cmd", "npx", "npx.cmd",
    "pnpm", "pnpm.cmd",
    "yarn", "yarn.cmd",
    "python", "python.exe", "python3",
    "pip", "pip.exe", "pip3",
}
_DEV_SERVERS: dict[str, subprocess.Popen] = {}

# ---------------------------------------------------------------------------
# Builder system prompt (engineered for professional landing pages / sites)
# ---------------------------------------------------------------------------

BUILDER_SYSTEM_PROMPT = """You are **Canvas Builder**, a senior product designer + frontend engineer who ships award-tier marketing sites, landing pages, and web apps for modern SaaS companies. Think Linear, Vercel, Stripe, Framer, Arc, Raycast, Figma, Superhuman. That is the bar. Nothing less.

# Mission
Given a conversation and a virtual project file tree, produce polished, opinionated, visually striking sites. Beautiful by default. Distinctive. Specific. Real brand-aware copy, real layout, real typography, real color systems. Never "starter template" energy.

# Aesthetic compass (what "good" looks like)
- **Hierarchy**: giant hero headline (clamp 3.5rem–6rem), tight tracking (letter-spacing -0.02em to -0.04em), medium-weight sub, huge vertical rhythm between sections (clamp 80px–140px).
- **Typography**: pair a display font (Inter, Geist, Satoshi, General Sans, Space Grotesk, or similar) with sensible fallbacks. Use tabular-nums for pricing. Use real kerning and line-height (1.15 heads, 1.5–1.7 body).
- **Color**: one confident accent (not a default blue). Build a token system (`--bg`, `--surface`, `--surface-raised`, `--border`, `--border-strong`, `--fg`, `--muted`, `--accent`, `--accent-fg`). Dark-first for dev-tools / AI / fintech; light-first for wellness / consumer / enterprise SaaS — pick deliberately based on vertical.
- **Surfaces**: subtle gradients (`linear-gradient(180deg, rgba(255,255,255,0.04), transparent)`), soft 1px borders, optional inner glow, radii 10–16px for cards, 24–28px for hero surfaces. No harsh shadows.
- **Atmosphere**: tasteful background effects — grid backgrounds (CSS `background-image`), subtle radial gradients, aurora blurs (`filter: blur(120px)`), noise textures (inline SVG). No clip-art, no stock photos, no emoji as UI icons.
- **Icons**: always inline SVG. 24px stroke 1.5, geometric, rounded joins. Never icon-font CDN. Never Material Icons. Draw the paths.
- **Illustrations**: inline SVG for product mockups and decorative elements. Simulate the product UI in SVG or with pure CSS — floating cards, mock dashboards, code panes with syntax highlighting baked in as spans.
- **Motion**: subtle. `transition: 160ms cubic-bezier(0.2, 0, 0, 1)` for hover. Keyframe reveals on scroll (`IntersectionObserver` + `.is-visible` class toggling `translateY(12px)` → `translateY(0)` + opacity). Respect `prefers-reduced-motion`.
- **Interactions**: magnetic buttons, gradient borders on hover, numeric count-ups, smooth tab switching, accordion FAQ with ease, scroll-linked nav background opacity.

# Copy rules (this is where weak sites die)
- Headline: 5–9 words, promise-led, specific. e.g. "Ship faster than your competitors can meet." Not "Welcome to Fluxline."
- Sub: one clear sentence of who-it-is-for + what-it-does + why-now. No buzzwords without evidence.
- Feature tiles: 3-word title + one concrete sentence (benefit, not feature-list). Never "Fast. Secure. Reliable." triplets.
- CTAs: verb-first, outcome-flavored. "Start building" / "Get a 14-day trial" — not "Submit" / "Click here".
- Social proof: real-sounding company names + real-sounding roles ("Priya Ramesh, Head of Platform at Loom-like company"). Never "John Doe". Never "Company A".
- Pricing: include annual toggle, striketh monthly, highlight the middle tier with an accent ring + "Most popular" badge.
- FAQ: 5–7 genuine objections, not marketing fluff.

# Required section library (pull the ones that fit the brief)
Nav (sticky, blur-backdrop) · Hero (eyebrow pill · headline · sub · CTA row · hero visual) · Logo cloud · Feature grid (3–6 tiles w/ inline SVG) · Bento grid (large asymmetric) · "How it works" (numbered steps w/ connecting line) · Product showcase (mock UI in SVG/CSS) · Testimonials (quote cards w/ initials avatar) · Metrics strip · Pricing (3 tiers, toggle) · FAQ (accordion) · Final CTA section · Footer (4 columns + newsletter + socials).

# Engineering rules
- **Stack default**: vanilla HTML + modular CSS + one small JS file for interactions. No build step. No React unless user asks.
- **CSS**: custom properties for the design system at `:root`. BEM-ish class names. No `!important`. Media queries mobile-first. Use `@supports` sparingly.
- **JS**: vanilla, ES2022. Small. Use `IntersectionObserver`, `matchMedia`, `scroll` passive listeners. No jQuery. No lodash.
- **Accessibility**: semantic HTML (`header` / `nav` / `main` / `section` / `article` / `footer`), landmark aria-labels, focus-visible rings using `--accent`, keyboard-navigable accordions/tabs, color contrast ≥ 4.5:1 for body text.
- **Responsive**: mobile ≤ 480, tablet 481–960, desktop 961+. `max-width: 1200px` content, fluid typography with `clamp()`.
- **Performance**: no external fonts beyond 1 (or system stack). No webfonts for headlines unless essential. Preload critical CSS inline when tiny.
- **File layout** for single-page: `index.html` + `styles.css` + `app.js`. For multi-page: `index.html`, `pricing.html`, `about.html`, etc., sharing `styles.css`. For apps: feel free to split `components.css`, `layout.css`, `theme.css`.

# Absolute forbidden list
- Lorem ipsum · "Welcome to" · "Your text here" · emoji as icons · default browser buttons/inputs · placeholder images from placehold.it · Material Icons · Bootstrap classes · Tailwind CDN (unless user asks) · generic stock gradients (purple→pink) · "Sign up for our newsletter" without context · 3-word triplet feature sections ("Fast. Secure. Reliable.") · stock hero with "laptop mockup" · form without real validation styles.

# Tool — file_ops
You mutate the project by returning a JSON action payload in your reply.
Wrap the payload **exactly** in a fenced ```json-ops``` block. Example:

```json-ops
{
  "ops": [
    {"type": "write", "path": "index.html", "content": "<!doctype html>..."},
    {"type": "write", "path": "styles.css", "content": ":root{...}"},
    {"type": "delete", "path": "old.html"},
    {"type": "rename", "from": "foo.html", "to": "bar.html"},
    {"type": "set_active", "path": "index.html"}
  ],
  "summary": "One-sentence human summary of what changed."
}
```

Rules:
- The fenced block MUST be valid JSON.
- `write` replaces the whole file (never diffs). Provide the **full** new contents.
- Paths are POSIX (`src/components/Hero.tsx`), relative to project root. No leading `/`.
- For code changes, keep prose to one short summary sentence. Never paste file contents in normal chat prose.
- If the user only asks a question (no code change), omit the fenced block.

# Current project context
You will receive the current file tree and the full contents of the user's currently-active file on every turn. Use them. Never re-generate what already exists verbatim; edit it.

# Tone
Direct. Professional. Low ego. No filler. No "Sure! Here's...". Get to the work.
"""

BUILDER_SYSTEM_PROMPT += """

# Production-grade output contract
You are not a text-page generator. You are a full product builder operating in a virtual file system.

When the user asks for a landing page, website, dashboard, tool, or app, default to a complete multi-file project:
- `index.html` with semantic sections and real product-specific copy.
- `styles.css` with a full design-token system, responsive layout, states, and polished component styling.
- `app.js` for real interactions: nav state, tabs, accordions, pricing toggles, validation, filters, previews, counters, modals, or app behavior as appropriate.
- Additional files only when they improve organization, such as `pages/pricing.html`, `data.json`, or `README.md`.

For landing pages, the first build must include:
- Sticky nav, high-impact hero, concrete product visual/mock UI, social proof, feature/bento section, workflow/how-it-works, pricing or offer section, testimonials or metrics, FAQ, final CTA, and footer.
- At least one meaningful interaction in JavaScript.
- A theme that fits the product category. Avoid one-color purple/blue gradient sameness unless the user explicitly asks for it.
- Real-feeling names, metrics, objections, and use cases. Do not use placeholder text.
- A real layout system with clear section rhythm, card states, responsive breakpoints, and polished spacing. Never just stack text blocks in one narrow column.
- Output depth target: usually 3+ files, roughly 10k+ total characters, with CSS substantial enough to define a real design system and JS substantial enough to power actual interaction.

For apps/tools, build an actual usable first screen:
- State-driven UI in vanilla JS unless the user asks for another stack.
- Data model, empty/loading/error states, keyboard-friendly controls, forms with validation, and realistic sample data.
- If a backend is requested, create clear API/server files and explain run steps in `README.md`; the preview may still show the frontend.
- If the app needs dependencies, write a complete `package.json` with scripts such as `dev`, `build`, and `test`. The App Builder workspace can export files to disk and run allowed project-local commands after generation.
- Small apps should still look premium, not utilitarian. Use the same level of design craft as a marketing site: strong typography, tokens, surfaces, states, and polished interaction.
- When the user asks to plan first, operate in structured plan mode: define scope, architecture, visual system, implementation, verification, and packaging before writing files. Use the active build plan from context as the source of truth when present.
- The App Builder runtime can run commands, start a local dev server, package a zip artifact, and run Playwright-style screenshot QA. Prefer projects that expose normal scripts (`dev`, `build`, `test`) so those tools work predictably.

When the workspace is empty and the user asks to build something, your first response should usually create the complete initial project immediately. Do not waste the turn with a thin scaffold, generic prose, or a placeholder homepage.

Default stack guidance:
- Landing pages / marketing sites / brochure sites: premium multi-file HTML + CSS + JS with no build step unless the user explicitly asks for React or another framework.
- Interactive small apps / dashboards / tools: you may still use premium vanilla JS by default, but the UI must feel modern and robust with real states and realistic data.
- If the user explicitly asks for React/Vite/Next/Tailwind, honor that and create the necessary project files and scripts.

Use your available main-agent capabilities when helpful:
- Research real markets, brands, competitors, or APIs before writing if the prompt names a real company/product/site.
- Fetch URLs the user provides and adapt visual/copy direction from actual content.
- Reason like a senior frontend engineer before emitting file ops.

Before the final json-ops block, silently self-review:
- Does it look like a premium product, not a template?
- Does it have enough structure and copy depth?
- Does mobile work?
- Is there real interaction?
- Are all linked local CSS/JS files written?
- If this is a landing page, does it feel closer to v0 / Framer / a funded SaaS site than to a generic HTML exercise?
- If this is an app, does it have enough states, controls, and sample data to feel usable right away?

If the answer includes file changes, the final response MUST include exactly one valid `json-ops` block and the files must be complete, not excerpts.
"""


# ---------------------------------------------------------------------------
# LLM config — delegated to pi_agent.feature_llm so all feature modules share
# the same placeholder filter, provider defaults, and HTTP error mapping.
# ---------------------------------------------------------------------------


def _llm_config() -> dict[str, str]:
    return feature_llm.resolve_config()


def _llm_ready() -> bool:
    try:
        from jiuwenclaw.pi_agent import app_builder_agent

        if app_builder_agent.feature_enabled():
            return True
    except Exception:  # noqa: BLE001
        pass
    return feature_llm.is_ready(_llm_config())


def _quality_retry_enabled() -> bool:
    flag = os.environ.get("APP_BUILDER_ENABLE_QUALITY_RETRY", "").strip().lower()
    return flag in {"1", "true", "yes", "on"}


def _builder_image_provider() -> str:
    provider = (
        os.environ.get("VISION_PROVIDER")
        or os.environ.get("IMAGE_PROVIDER")
        or os.environ.get("APP_BUILDER_IMAGE_PROVIDER")
        or "OpenAI"
    ).strip().lower()
    aliases = {
        "openai": "openai",
        "stability": "stability",
        "replicate": "replicate",
    }
    return aliases.get(provider, provider)


def _builder_image_model(provider: str) -> str:
    configured = (
        os.environ.get("VISION_MODEL_NAME")
        or os.environ.get("IMAGE_MODEL_NAME")
        or os.environ.get("APP_BUILDER_IMAGE_MODEL")
        or ""
    ).strip()
    if configured:
        return configured
    defaults = {
        "openai": "gpt-image-1",
        "stability": "stable-diffusion-xl-1024-v1-0",
        "replicate": "black-forest-labs/flux-1.1-pro",
    }
    return defaults.get(provider, "gpt-image-1")


def _builder_image_key(provider: str) -> str:
    if provider == "openai":
        return (
            os.environ.get("VISION_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("API_KEY")
            or ""
        ).strip()
    if provider == "stability":
        return (os.environ.get("STABILITY_API_KEY") or "").strip()
    if provider == "replicate":
        return (os.environ.get("REPLICATE_API_TOKEN") or "").strip()
    return ""


def _looks_like_image_request(text: str) -> bool:
    lowered = (text or "").lower()
    return any(phrase in lowered for phrase in (
        "generate an image",
        "create an image",
        "make an image",
        "hero image",
        "replace the hero image",
        "replace the hero graphic",
        "illustration",
        "cover art",
        "background art",
        "artwork",
    ))


def _png_bytes_to_svg_asset(png_bytes: bytes, title: str) -> str:
    b64 = base64.b64encode(png_bytes).decode("ascii")
    safe_title = (title or "Generated artwork").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1536" role="img" aria-labelledby="generated-title">'
        f"<title id=\"generated-title\">{safe_title}</title>"
        '<rect width="1024" height="1536" fill="#05070d"/>'
        f'<image href="data:image/png;base64,{b64}" width="1024" height="1536" preserveAspectRatio="xMidYMid slice"/>'
        '</svg>'
    )


async def _maybe_generate_builder_image_asset(state: dict[str, Any], user_text: str) -> str:
    if not _looks_like_image_request(user_text):
        return ""

    provider = _builder_image_provider()
    api_key = _builder_image_key(provider)
    if not api_key:
        raise ImageGenError(
            "Image generation is not configured for App Builder. Set a Vision/OpenAI image API key in Settings first."
        )

    model = _builder_image_model(provider)
    prompt = user_text.strip()
    png_bytes = await generate_image(prompt, provider=provider, api_key=api_key, model=model)
    asset_path = "assets/generated-hero.svg"
    state.setdefault("files", {})
    state["files"][asset_path] = _png_bytes_to_svg_asset(png_bytes, "Generated hero artwork")
    if not state.get("activeFile") and not state["files"].get("index.html"):
        state["activeFile"] = asset_path
    return (
        "## Generated image asset\n"
        f"A fresh hero image asset is already available at `{asset_path}`.\n"
        "Use that exact file in the page and replace the previous hero visual with it.\n"
        "Do not describe the image instead of using it. Update the project files so the new asset is visibly used.\n\n"
    )


# ---------------------------------------------------------------------------
# Blank project state
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return _dt.datetime.now().isoformat(timespec="seconds")


def _default_command_policy() -> dict[str, Any]:
    return {
        "allowedCommands": sorted(_ALLOWED_COMMANDS),
        "allowPackageInstall": True,
        "allowPythonPackageInstall": True,
        "allowDevServer": True,
        "allowNetworkCommands": True,
    }


def _default_build_plan() -> dict[str, Any] | None:
    return None


def _default_state() -> dict[str, Any]:
    workspace_id = uuid.uuid4().hex[:12]
    return {
        "files": {},
        "activeFile": "",
        "previewMode": "code",  # 'preview' | 'code' | 'projects'
        "chat": [],
        "busy": False,
        "lastError": None,
        "llmReady": _llm_ready(),
        "updatedAt": _now_iso(),
        "currentProjectId": None,
        "projectName": "Untitled project",
        "workspaceId": workspace_id,
        "workspaceDir": "",
        "lastCommand": None,
        "lastAudit": None,
        "commandPolicy": _default_command_policy(),
        "devServer": None,
        "lastScreenshot": None,
        "lastArtifact": None,
        "buildPlan": _default_build_plan(),
    }


def _looks_like_legacy_starter(files: dict[str, str]) -> bool:
    if set(files.keys()) != {"index.html", "styles.css", "app.js"}:
        return False
    html = files.get("index.html", "")
    css = files.get("styles.css", "")
    js = files.get("app.js", "")
    return (
        "Canvas Builder Project" in html
        and "workspace-shell" in html
        and "workspace-panel" in css
        and "builderReady" in js
    )


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _load_state() -> dict[str, Any]:
    raw = pi_state.load_feature(FEATURE, default=None)
    if not isinstance(raw, dict) or "files" not in raw:
        return _default_state()
    # normalize
    files = raw.get("files") or {}
    if not isinstance(files, dict):
        files = {}
    files = {str(k): str(v) for k, v in files.items()}
    if _looks_like_legacy_starter(files):
        state = _default_state()
        state["chat"] = raw.get("chat") if isinstance(raw.get("chat"), list) else []
        state["currentProjectId"] = raw.get("currentProjectId") or None
        state["projectName"] = raw.get("projectName") or "Untitled project"
        return state
    active = str(raw.get("activeFile") or "")
    if active not in files:
        active = next(iter(files.keys()), "")
    chat = raw.get("chat") if isinstance(raw.get("chat"), list) else []
    policy = _default_command_policy()
    if isinstance(raw.get("commandPolicy"), dict):
        raw_policy = raw.get("commandPolicy") or {}
        allowed = raw_policy.get("allowedCommands")
        if isinstance(allowed, list):
            policy["allowedCommands"] = sorted({str(item).lower() for item in allowed if str(item).strip()})
        for key in ("allowPackageInstall", "allowPythonPackageInstall", "allowDevServer", "allowNetworkCommands"):
            if key in raw_policy:
                policy[key] = bool(raw_policy.get(key))
    return {
        "files": files,
        "activeFile": active,
        "previewMode": "code",
        "chat": chat,
        "busy": False,
        # Errors are transient: never rehydrate a stale error banner from disk.
        "lastError": None,
        "llmReady": _llm_ready(),
        "updatedAt": raw.get("updatedAt") or _now_iso(),
        "currentProjectId": raw.get("currentProjectId") or None,
        "projectName": raw.get("projectName") or "Untitled project",
        "workspaceId": raw.get("workspaceId") or uuid.uuid4().hex[:12],
        "workspaceDir": raw.get("workspaceDir") or "",
        "lastCommand": raw.get("lastCommand") if isinstance(raw.get("lastCommand"), dict) else None,
        "lastAudit": raw.get("lastAudit") if isinstance(raw.get("lastAudit"), dict) else None,
        "commandPolicy": policy,
        "devServer": raw.get("devServer") if isinstance(raw.get("devServer"), dict) else None,
        "lastScreenshot": raw.get("lastScreenshot") if isinstance(raw.get("lastScreenshot"), dict) else None,
        "lastArtifact": raw.get("lastArtifact") if isinstance(raw.get("lastArtifact"), dict) else None,
        "buildPlan": raw.get("buildPlan") if isinstance(raw.get("buildPlan"), dict) else None,
    }


def _save_state(state: dict[str, Any]) -> dict[str, Any]:
    state["updatedAt"] = _now_iso()
    state["llmReady"] = _llm_ready()
    pi_state.save_feature(FEATURE, state)
    return state


# ---------------------------------------------------------------------------
# Projects library (saved builds)
# ---------------------------------------------------------------------------


def _load_library() -> dict[str, dict[str, Any]]:
    raw = pi_state.load_feature(FEATURE_LIBRARY, default=None)
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for pid, rec in raw.items():
        if not isinstance(rec, dict):
            continue
        files = rec.get("files")
        if not isinstance(files, dict):
            continue
        out[str(pid)] = {
            "id": str(rec.get("id") or pid),
            "name": str(rec.get("name") or "Untitled project"),
            "files": {str(k): str(v) for k, v in files.items()},
            "activeFile": str(rec.get("activeFile") or next(iter(files.keys()), "")),
            "createdAt": rec.get("createdAt") or _now_iso(),
            "updatedAt": rec.get("updatedAt") or _now_iso(),
            "description": str(rec.get("description") or ""),
        }
    return out


def _save_library(lib: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    pi_state.save_feature(FEATURE_LIBRARY, lib)
    return lib


def _project_summary(rec: dict[str, Any]) -> dict[str, Any]:
    """A lightweight card view (no file contents) for the projects gallery."""
    files = rec.get("files") or {}
    file_count = len(files)
    html_preview = ""
    if "index.html" in files:
        html_preview = files["index.html"][:400]
    return {
        "id": rec["id"],
        "name": rec["name"],
        "description": rec.get("description") or "",
        "fileCount": file_count,
        "createdAt": rec.get("createdAt"),
        "updatedAt": rec.get("updatedAt"),
        "htmlPreview": html_preview,
    }


def _library_summary_list(lib: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    recs = list(lib.values())
    recs.sort(key=lambda r: r.get("updatedAt") or "", reverse=True)
    return [_project_summary(r) for r in recs]


# ---------------------------------------------------------------------------
# Path normalization & safety
# ---------------------------------------------------------------------------

_PATH_RE = re.compile(r"^[A-Za-z0-9_.\-/]+$")


def _safe_path(path: str) -> Optional[str]:
    path = (path or "").strip().lstrip("/")
    if not path or ".." in path.split("/"):
        return None
    if len(path) > 256:
        return None
    if not _PATH_RE.match(path):
        return None
    return path


def _workspace_root() -> Path:
    root = get_current_user_data_dir() / "app_builder_workspaces"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _workspace_id(state: dict[str, Any]) -> str:
    raw = str(state.get("currentProjectId") or state.get("workspaceId") or "").strip()
    if not raw:
        raw = uuid.uuid4().hex[:12]
        state["workspaceId"] = raw
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw).strip(".-")[:80]
    if not safe:
        safe = uuid.uuid4().hex[:12]
        state["workspaceId"] = safe
    return safe


def _workspace_dir(state: dict[str, Any]) -> Path:
    root = _workspace_root().resolve()
    path = (root / _workspace_id(state)).resolve()
    if root != path and root not in path.parents:
        raise ValueError("invalid workspace path")
    path.mkdir(parents=True, exist_ok=True)
    state["workspaceDir"] = str(path)
    return path


def _resolve_workspace_file(root: Path, rel_path: str) -> Path:
    safe = _safe_path(rel_path)
    if safe is None:
        raise ValueError(f"invalid path: {rel_path!r}")
    root_resolved = root.resolve()
    path = (root_resolved / safe).resolve()
    if root_resolved != path and root_resolved not in path.parents:
        raise ValueError(f"path escapes workspace: {rel_path!r}")
    return path


def _sync_files_to_workspace(state: dict[str, Any], *, clean: bool = False) -> dict[str, Any]:
    root = _workspace_dir(state)
    if clean and root.exists():
        resolved_root = root.resolve()
        workspace_root = _workspace_root().resolve()
        if workspace_root == resolved_root or workspace_root not in resolved_root.parents:
            raise ValueError("refusing to clean invalid workspace path")
        shutil.rmtree(resolved_root)
        resolved_root.mkdir(parents=True, exist_ok=True)
        root = resolved_root
    written: list[str] = []
    for rel_path, content in (state.get("files") or {}).items():
        target = _resolve_workspace_file(root, str(rel_path))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(content), encoding="utf-8", newline="\n")
        written.append(str(rel_path))
    state["workspaceDir"] = str(root)
    return {"workspaceDir": str(root), "written": sorted(written), "fileCount": len(written)}


def _policy_for_state(state: dict[str, Any]) -> dict[str, Any]:
    policy = _default_command_policy()
    incoming = state.get("commandPolicy")
    if isinstance(incoming, dict):
        if isinstance(incoming.get("allowedCommands"), list):
            allowed = {Path(str(item)).name.lower() for item in incoming["allowedCommands"] if str(item).strip()}
            policy["allowedCommands"] = sorted(allowed or _ALLOWED_COMMANDS)
        for key in ("allowPackageInstall", "allowPythonPackageInstall", "allowDevServer", "allowNetworkCommands"):
            if key in incoming:
                policy[key] = bool(incoming.get(key))
    return policy


def _is_package_install(args: list[str]) -> bool:
    if len(args) < 2:
        return False
    exe = Path(args[0]).name.lower()
    words = {part.lower() for part in args[1:4]}
    if exe in {"npm", "npm.cmd", "pnpm", "pnpm.cmd", "yarn", "yarn.cmd"}:
        return bool(words & {"install", "i", "add"})
    if exe in {"npx", "npx.cmd"}:
        return True
    return False


def _is_python_package_install(args: list[str]) -> bool:
    exe = Path(args[0]).name.lower() if args else ""
    lowered = [part.lower() for part in args]
    if exe in {"pip", "pip.exe", "pip3"}:
        return "install" in lowered
    return exe in {"python", "python.exe", "python3"} and "-m" in lowered and "pip" in lowered and "install" in lowered


def _parse_command(command: Any, state: Optional[dict[str, Any]] = None, *, for_dev_server: bool = False) -> list[str]:
    if isinstance(command, list):
        parts = [str(part).strip() for part in command if str(part).strip()]
    else:
        raw = str(command or "").strip()
        if not raw:
            parts = []
        else:
            parts = shlex.split(raw, posix=(os.name != "nt"))
    if not parts:
        raise ValueError("command is required")
    executable = Path(parts[0]).name.lower()
    policy = _policy_for_state(state or {})
    allowed_commands = {Path(str(item)).name.lower() for item in policy.get("allowedCommands") or _ALLOWED_COMMANDS}
    if executable not in allowed_commands:
        raise ValueError(f"command not allowed: {parts[0]}")
    if for_dev_server and not policy.get("allowDevServer", True):
        raise ValueError("dev server commands are disabled by policy")
    if _is_package_install(parts) and not policy.get("allowPackageInstall", True):
        raise ValueError("package install commands are disabled by policy")
    if _is_python_package_install(parts) and not policy.get("allowPythonPackageInstall", True):
        raise ValueError("Python package install commands are disabled by policy")
    if os.name == "nt" and executable in {"npm", "npx", "pnpm", "yarn"}:
        parts[0] = f"{parts[0]}.cmd"
    return parts


async def _run_workspace_command(state: dict[str, Any], command: Any, timeout_sec: int) -> dict[str, Any]:
    workspace = _workspace_dir(state)
    args = _parse_command(command, state)
    timeout_sec = max(5, min(int(timeout_sec or _DEFAULT_COMMAND_TIMEOUT_SECONDS), 600))
    started_at = _now_iso()
    started = _dt.datetime.now()
    env = dict(os.environ)
    env.setdefault("CI", "true")
    env.setdefault("NO_COLOR", "1")
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            cwd=str(workspace),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec)
        except asyncio.TimeoutError:
            proc.kill()
            stdout, _ = await proc.communicate()
            output = (stdout or b"").decode("utf-8", errors="replace")
            output = output[-_COMMAND_OUTPUT_LIMIT:]
            return {
                "command": args,
                "cwd": str(workspace),
                "exitCode": None,
                "timedOut": True,
                "output": output + f"\n\nCommand timed out after {timeout_sec}s.",
                "startedAt": started_at,
                "finishedAt": _now_iso(),
                "durationMs": int((_dt.datetime.now() - started).total_seconds() * 1000),
            }
        output = (stdout or b"").decode("utf-8", errors="replace")
        if len(output) > _COMMAND_OUTPUT_LIMIT:
            output = output[-_COMMAND_OUTPUT_LIMIT:]
            output = "[output truncated]\n" + output
        return {
            "command": args,
            "cwd": str(workspace),
            "exitCode": proc.returncode,
            "timedOut": False,
            "output": output,
            "startedAt": started_at,
            "finishedAt": _now_iso(),
            "durationMs": int((_dt.datetime.now() - started).total_seconds() * 1000),
        }
    except FileNotFoundError as exc:
        raise ValueError(f"command not found: {args[0]}") from exc


def _dev_server_key(state: dict[str, Any]) -> str:
    return _workspace_id(state)


def _find_free_port(preferred: int = 5173) -> int:
    for port in [preferred, 5174, 5175, 3000, 4173, 8000, 8080]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _app_builder_meta_dir(state: dict[str, Any]) -> Path:
    path = _workspace_dir(state) / ".app-builder"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_text_tail(path: Path, limit: int = _DEV_SERVER_LOG_LIMIT) -> str:
    if not path.exists():
        return ""
    data = path.read_bytes()
    if len(data) > limit:
        data = data[-limit:]
        prefix = b"[log truncated]\n"
        data = prefix + data
    return data.decode("utf-8", errors="replace")


def _dev_server_status(state: dict[str, Any]) -> dict[str, Any] | None:
    server = state.get("devServer") if isinstance(state.get("devServer"), dict) else None
    if not server:
        return None
    key = _dev_server_key(state)
    proc = _DEV_SERVERS.get(key)
    running = bool(proc and proc.poll() is None)
    if not running and server.get("status") == "running":
        server = {**server, "status": "stopped", "stoppedAt": _now_iso()}
        state["devServer"] = server
    log_path = Path(str(server.get("logPath") or ""))
    return {**server, "status": "running" if running else server.get("status", "stopped"), "log": _read_text_tail(log_path)}


def _start_dev_server(state: dict[str, Any], command: Any, port: int | None = None) -> dict[str, Any]:
    _sync_files_to_workspace(state, clean=False)
    selected_port = int(port or _find_free_port())
    command_text = str(command or "").strip() or f"npm run dev -- --host 127.0.0.1 --port {selected_port}"
    args = _parse_command(command_text, state, for_dev_server=True)
    key = _dev_server_key(state)
    existing = _DEV_SERVERS.get(key)
    if existing and existing.poll() is None:
        existing.terminate()
    meta_dir = _app_builder_meta_dir(state)
    log_path = meta_dir / "dev-server.log"
    log_file = log_path.open("ab")
    env = dict(os.environ)
    env.update({
        "CI": "true",
        "BROWSER": "none",
        "HOST": "127.0.0.1",
        "PORT": str(selected_port),
    })
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    try:
        proc = subprocess.Popen(
            args,
            cwd=str(_workspace_dir(state)),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            env=env,
            creationflags=creationflags,
        )
    finally:
        log_file.close()
    _DEV_SERVERS[key] = proc
    server = {
        "command": args,
        "port": selected_port,
        "url": f"http://127.0.0.1:{selected_port}",
        "status": "running",
        "pid": proc.pid,
        "logPath": str(log_path),
        "startedAt": _now_iso(),
    }
    state["devServer"] = server
    return _dev_server_status(state) or server


def _stop_dev_server(state: dict[str, Any]) -> dict[str, Any] | None:
    key = _dev_server_key(state)
    proc = _DEV_SERVERS.get(key)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    server = state.get("devServer") if isinstance(state.get("devServer"), dict) else None
    if server:
        server = {**server, "status": "stopped", "stoppedAt": _now_iso()}
        state["devServer"] = server
    return _dev_server_status(state)


def _create_zip_artifact(state: dict[str, Any]) -> dict[str, Any]:
    _sync_files_to_workspace(state, clean=False)
    workspace = _workspace_dir(state)
    meta_dir = _app_builder_meta_dir(state)
    name = f"{re.sub(r'[^A-Za-z0-9_.-]+', '-', str(state.get('projectName') or 'app-builder')).strip('-') or 'app-builder'}-{_dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    zip_path = meta_dir / name
    skip_parts = {"node_modules", ".git", ".app-builder", "__pycache__"}
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in workspace.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(workspace)
            if any(part in skip_parts for part in rel.parts):
                continue
            if path.stat().st_size > _ZIP_MAX_FILE_BYTES:
                continue
            zf.write(path, rel.as_posix())
    artifact = {
        "name": name,
        "path": str(zip_path),
        "sizeBytes": zip_path.stat().st_size,
        "createdAt": _now_iso(),
    }
    state["lastArtifact"] = artifact
    return artifact


def _artifact_blob(state: dict[str, Any]) -> dict[str, Any]:
    artifact = state.get("lastArtifact") if isinstance(state.get("lastArtifact"), dict) else None
    if not artifact:
        artifact = _create_zip_artifact(state)
    path = Path(str(artifact.get("path") or ""))
    workspace = _workspace_dir(state).resolve()
    if not path.exists() or workspace not in path.resolve().parents:
        raise ValueError("artifact not found")
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return {**artifact, "mimeType": "application/zip", "base64": data}


async def _run_screenshot_qa(state: dict[str, Any], url: str | None = None) -> dict[str, Any]:
    _sync_files_to_workspace(state, clean=False)
    target_url = (url or "").strip()
    if not target_url:
        status = _dev_server_status(state)
        if status and status.get("status") == "running" and status.get("url"):
            target_url = str(status["url"])
        else:
            target_url = _resolve_workspace_file(_workspace_dir(state), "index.html").as_uri()
    out_dir = _app_builder_meta_dir(state) / "screenshots"
    out_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, Any] = {
        "ok": False,
        "url": target_url,
        "checkedAt": _now_iso(),
        "screenshots": [],
        "errors": [],
        "metrics": {},
    }
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(
            "Playwright is not available in this Python environment. Install it with `python -m pip install playwright` and `python -m playwright install chromium`."
        )
        result["details"] = str(exc)
        state["lastScreenshot"] = result
        return result

    console_errors: list[str] = []
    page_errors: list[str] = []
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            response = await page.goto(target_url, wait_until="networkidle", timeout=30000)
            desktop_path = out_dir / "desktop.png"
            await page.screenshot(path=str(desktop_path), full_page=True)
            await page.set_viewport_size({"width": 390, "height": 844})
            mobile_path = out_dir / "mobile.png"
            await page.screenshot(path=str(mobile_path), full_page=True)
            metrics = await page.evaluate(
                """() => ({
                  title: document.title || '',
                  bodyTextLength: (document.body && document.body.innerText || '').trim().length,
                  scrollWidth: document.documentElement.scrollWidth,
                  scrollHeight: document.documentElement.scrollHeight,
                  linkCount: document.querySelectorAll('a').length,
                  buttonCount: document.querySelectorAll('button').length,
                  formCount: document.querySelectorAll('form').length
                })"""
            )
            await browser.close()
            result.update({
                "ok": not console_errors and not page_errors and int(metrics.get("bodyTextLength") or 0) > 100,
                "status": response.status if response else None,
                "screenshots": [str(desktop_path), str(mobile_path)],
                "errors": console_errors[:10] + page_errors[:10],
                "metrics": metrics,
            })
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(str(exc))
    state["lastScreenshot"] = result
    return result


# ---------------------------------------------------------------------------
# File ops application
# ---------------------------------------------------------------------------


def _apply_ops(state: dict[str, Any], ops: list[dict[str, Any]]) -> list[str]:
    applied: list[str] = []
    files: dict[str, str] = state["files"]
    first_written: Optional[str] = None
    explicit_active = False
    for op in ops:
        if not isinstance(op, dict):
            continue
        kind = op.get("type")
        if kind == "write":
            p = _safe_path(str(op.get("path") or ""))
            if p is None:
                continue
            content = op.get("content")
            if not isinstance(content, str):
                content = "" if content is None else json.dumps(content)
            files[p] = content
            if first_written is None:
                first_written = p
            applied.append(f"write {p}")
        elif kind == "delete":
            p = _safe_path(str(op.get("path") or ""))
            if p and p in files:
                del files[p]
                applied.append(f"delete {p}")
                if state.get("activeFile") == p:
                    state["activeFile"] = next(iter(files.keys()), "")
        elif kind == "rename":
            src = _safe_path(str(op.get("from") or ""))
            dst = _safe_path(str(op.get("to") or ""))
            if src and dst and src in files and dst not in files:
                files[dst] = files.pop(src)
                applied.append(f"rename {src} -> {dst}")
                if state.get("activeFile") == src:
                    state["activeFile"] = dst
        elif kind == "set_active":
            p = _safe_path(str(op.get("path") or ""))
            if p and p in files:
                state["activeFile"] = p
                explicit_active = True
                applied.append(f"active {p}")
    if first_written and not explicit_active:
        state["activeFile"] = first_written
    if applied:
        state["previewMode"] = "code"
    return applied


def _balanced_json_from(text: str) -> Optional[str]:
    start = -1
    for idx, ch in enumerate(text):
        if ch in "[{":
            start = idx
            break
    if start < 0:
        return None

    stack: list[str] = []
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "[{":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if not stack or ch != stack[-1]:
                return None
            stack.pop()
            if not stack:
                return text[start: idx + 1]
    return None


def _parse_ops_payload(raw: str) -> Optional[dict[str, Any]]:
    raw = (raw or "").strip()
    candidates = [raw]
    balanced = _balanced_json_from(raw)
    if balanced and balanced != raw:
        candidates.insert(0, balanced)
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and isinstance(parsed.get("ops"), list):
            return parsed
    return None


def _extract_ops_block(text: str) -> tuple[str, Optional[dict[str, Any]], bool]:
    """Extract a json-ops payload without letting malformed code leak into chat."""
    if not text:
        return text or "", None, False

    fence = re.search(r"```\s*json-ops\s*\n?", text, re.IGNORECASE)
    if fence:
        close = text.find("```", fence.end())
        raw = text[fence.end(): close if close >= 0 else len(text)].strip()
        prose_tail = text[close + 3:] if close >= 0 else ""
        prose = (text[: fence.start()] + prose_tail).strip()
        parsed = _parse_ops_payload(raw)
        if parsed is None:
            logger.warning("[app.builder] json-ops parse error; payload was not valid JSON")
        return prose, parsed, True

    if '"ops"' in text or "'ops'" in text:
        parsed = _parse_ops_payload(text)
        if parsed is not None:
            balanced = _balanced_json_from(text)
            if balanced:
                prose = text.replace(balanced, "").strip()
                return prose, parsed, True
    return text, None, False


def _looks_like_build_request(text: str) -> bool:
    lowered = (text or "").lower()
    return any(word in lowered for word in (
        "build", "create", "make", "generate", "design", "landing", "website",
        "site", "page", "app", "dashboard", "tool", "frontend",
    ))


def _infer_project_mode(text: str) -> str:
    lowered = (text or "").lower()
    if any(word in lowered for word in ("landing", "marketing", "homepage", "home page", "website", "site", "hero", "pricing", "faq")):
        return "landing"
    if any(word in lowered for word in ("dashboard", "app", "tool", "portal", "admin", "workspace", "crm", "kanban")):
        return "app"
    return "generic"


def _quality_report(files: dict[str, str], request: str = "") -> list[str]:
    issues: list[str] = []
    html = files.get("index.html", "")
    css = files.get("styles.css", "")
    js = files.get("app.js", "")
    total_len = sum(len(value or "") for value in files.values())
    mode = _infer_project_mode(request)

    if not html:
        issues.append("missing index.html")
    if len(css) < 3200:
        issues.append("styles.css is too thin for a production-quality build")
    if len(js) < 800:
        issues.append("app.js has little or no interaction")
    if len(files) < 3:
        issues.append("project should usually include at least index.html, styles.css, and app.js")
    if total_len < 12000:
        issues.append("overall project is too small and likely template-level")
    section_count = len(re.findall(r"<section\b|<article\b|<header\b|<footer\b|<main\b", html, flags=re.IGNORECASE))
    if section_count < 7:
        issues.append("not enough semantic sections for a complete landing/site experience")
    if not re.search(r"<(svg|img|picture|canvas)\b|class=[\"'][^\"']*(mock|visual|device|dashboard|product)", html, re.IGNORECASE):
        issues.append("missing a strong product visual or mock UI")
    if re.search(r"lorem ipsum|your text here|welcome to|fast\.\s*secure\.\s*reliable", html, re.IGNORECASE):
        issues.append("contains generic placeholder copy")
    if html and "styles.css" not in html and "<style" not in html.lower():
        issues.append("index.html does not link or inline CSS")
    if html and "app.js" not in html and "<script" not in html.lower():
        issues.append("index.html does not link or inline JavaScript")
    if css and ":root" not in css:
        issues.append("styles.css is missing a proper design-token system")
    if css and "clamp(" not in css:
        issues.append("styles.css is missing fluid typography or spacing via clamp()")
    if css and "@media" not in css:
        issues.append("styles.css is missing responsive breakpoints")
    if js and "addEventListener" not in js:
        issues.append("app.js is missing meaningful UI event handling")
    if mode == "landing":
        landing_signals = {
            "hero": re.search(r"hero", html, re.IGNORECASE),
            "nav": re.search(r"<nav\b", html, re.IGNORECASE),
            "pricing": re.search(r"pricing|plan|tier", html, re.IGNORECASE),
            "faq": re.search(r"faq|frequently asked|accordion", html, re.IGNORECASE),
            "proof": re.search(r"testimonial|logo cloud|trusted by|customer|metric|stats", html, re.IGNORECASE),
        }
        if not landing_signals["nav"]:
            issues.append("landing page is missing a proper navigation/header")
        if not landing_signals["hero"]:
            issues.append("landing page is missing a distinct hero section")
        if not landing_signals["pricing"]:
            issues.append("landing page is missing a pricing/offer section")
        if not landing_signals["faq"]:
            issues.append("landing page is missing an FAQ/objection-handling section")
        if not landing_signals["proof"]:
            issues.append("landing page is missing meaningful social proof, testimonials, or metrics")
    if mode == "app":
        if not re.search(r"empty|loading|error|validation|invalid|success", html + "\n" + js, re.IGNORECASE):
            issues.append("app build is missing explicit empty/loading/error or validation states")
        if not re.search(r"<form\b|<input\b|<button\b|<select\b|<textarea\b", html, re.IGNORECASE):
            issues.append("app build is missing interactive controls and form inputs")
    return issues


def _ops_preview_state(state: dict[str, Any], ops_payload: Optional[dict[str, Any]]) -> dict[str, Any]:
    preview = {**state, "files": dict(state.get("files") or {})}
    if ops_payload and isinstance(ops_payload.get("ops"), list):
        _apply_ops(preview, ops_payload["ops"])
    return preview


def _create_build_plan(prompt: str, state: dict[str, Any]) -> dict[str, Any]:
    request = str(prompt or "").strip() or "Build a production-ready app"
    has_files = bool(state.get("files"))
    steps = [
        ("scope", "Scope the product", "Turn the request into target users, primary workflow, core screens, data needs, and acceptance criteria."),
        ("architecture", "Choose the architecture", "Select files, dependencies, scripts, storage/API boundaries, and the preview/run strategy."),
        ("visual", "Design the visual system", "Define typography, color tokens, layout rhythm, states, responsive behavior, and product-specific UI patterns."),
        ("implementation", "Build the project", "Create or refactor complete files with frontend behavior, backend/API code when requested, and realistic sample data."),
        ("verification", "Run verification", "Export to disk, run allowed commands, audit project quality, and use screenshot QA/dev-server preview when useful."),
        ("package", "Package and handoff", "Create a zip artifact, update run instructions, and leave the project ready to iterate or deploy."),
    ]
    return {
        "id": uuid.uuid4().hex[:10],
        "request": request,
        "status": "planned",
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        "basedOnExistingFiles": has_files,
        "steps": [
            {"id": step_id, "title": title, "detail": detail, "status": "pending"}
            for step_id, title, detail in steps
        ],
    }


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------


async def _call_llm(messages: list[dict[str, str]]) -> str:
    """Call the App Builder LLM via the shared resolver/caller."""
    max_tokens = int(os.environ.get("APP_BUILDER_MAX_TOKENS", "16000"))
    return await feature_llm.call_llm(
        messages,
        _llm_config(),
        temperature=0.4,
        max_tokens=max_tokens,
    )


def _build_context_message(state: dict[str, Any], extra_context: str = "") -> str:
    files = state.get("files") or {}
    active = state.get("activeFile") or ""
    latest_request = ""
    chat = state.get("chat") if isinstance(state.get("chat"), list) else []
    for item in reversed(chat):
        if isinstance(item, dict) and item.get("role") == "user":
            latest_request = str(item.get("content") or "")
            break
    project_mode = _infer_project_mode(latest_request)
    tree = "\n".join(f"  - {p}" for p in sorted(files.keys()))
    active_body = files.get(active, "")
    if len(active_body) > 12000:
        active_body = active_body[:12000] + "\n/* ...truncated... */"
    plan = state.get("buildPlan") if isinstance(state.get("buildPlan"), dict) else None
    plan_block = ""
    if plan:
        plan_lines = [f"- [{step.get('status', 'pending')}] {step.get('title')}: {step.get('detail')}" for step in plan.get("steps", []) if isinstance(step, dict)]
        plan_block = (
            f"\n## Active structured build plan\nRequest: {plan.get('request')}\n"
            + "\n".join(plan_lines)
            + "\n"
        )
    return (
        f"## Inferred build mode\n{project_mode}\n\n"
        f"{extra_context}"
        f"## Project file tree\n{tree or '  (empty)'}\n\n"
        f"## Active file: `{active or '(none)'}`\n"
        f"```\n{active_body}\n```\n"
        f"{plan_block}"
        f"\n## File contents available to edit\n{_build_file_contents_digest(files, active)}\n"
    )


def _build_file_contents_digest(files: dict[str, str], active: str) -> str:
    budget = 36000
    chunks: list[str] = []
    for path in sorted(files.keys()):
        if path == active:
            continue
        body = files.get(path, "")
        if len(body) > 9000:
            body = body[:9000] + "\n/* ...truncated... */"
        block = f"### `{path}`\n```\n{body}\n```"
        if sum(len(c) for c in chunks) + len(block) > budget:
            chunks.append("(Additional files omitted from context budget. Ask for a specific file if needed.)")
            break
        chunks.append(block)
    return "\n\n".join(chunks) if chunks else "(No other files.)"


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------


def register_app_builder_handlers(channel: Any, agent_client: Any | None = None) -> None:
    """Register all ``app.builder.*`` RPC methods on ``channel``.

    ``agent_client`` is the gateway's :class:`WebSocketAgentServerClient`
    (or compatible). When supplied **and** ``APP_BUILDER_USE_MAIN_AGENT`` is
    set, the chat handler routes prompts through the main JiuWenClaw agent
    instead of the standalone ``feature_llm`` HTTP caller, giving the builder
    web search, web fetch, image generation, memory, and skill access.
    Falls back to the legacy ``_call_llm`` path when the flag is off or the
    main-agent dispatch fails.
    """
    from jiuwenclaw.pi_agent import app_builder_agent

    async def _reply(ws, req_id, state: dict[str, Any], *, extra: Optional[dict] = None, include_projects: bool = False) -> None:
        payload: dict[str, Any] = {"state": state}
        if include_projects:
            payload["projects"] = _library_summary_list(_load_library())
        if extra:
            payload.update(extra)
        await channel.send_response(ws, req_id, ok=True, payload=payload)

    async def _fail(ws, req_id, message: str, code: str = "BAD_REQUEST") -> None:
        await channel.send_response(ws, req_id, ok=False, error=message, code=code)

    def _p(params: Any) -> dict[str, Any]:
        return params if isinstance(params, dict) else {}

    async def _get_state(ws, req_id, params, session_id):  # noqa: ANN001
        await _reply(ws, req_id, _save_state(_load_state()), include_projects=True)

    async def _reset_project(ws, req_id, params, session_id):  # noqa: ANN001
        await _reply(ws, req_id, _save_state(_default_state()))

    async def _set_active_file(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        path = _safe_path(str(p.get("path") or ""))
        if path is None:
            await _fail(ws, req_id, "invalid path")
            return
        state = _load_state()
        if path not in state["files"]:
            await _fail(ws, req_id, "file not found", code="NOT_FOUND")
            return
        state["activeFile"] = path
        await _reply(ws, req_id, _save_state(state))

    async def _set_preview_mode(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        mode = str(p.get("mode") or "preview")
        if mode not in ("preview", "code", "projects"):
            mode = "preview"
        state = _load_state()
        state["previewMode"] = mode
        await _reply(ws, req_id, _save_state(state), include_projects=(mode == "projects"))

    async def _create_file(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        path = _safe_path(str(p.get("path") or ""))
        if path is None:
            await _fail(ws, req_id, "invalid path")
            return
        state = _load_state()
        if path in state["files"]:
            await _fail(ws, req_id, "file already exists", code="CONFLICT")
            return
        state["files"][path] = str(p.get("content") or "")
        state["activeFile"] = path
        await _reply(ws, req_id, _save_state(state))

    async def _update_file(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        path = _safe_path(str(p.get("path") or ""))
        if path is None:
            await _fail(ws, req_id, "invalid path")
            return
        state = _load_state()
        if path not in state["files"]:
            await _fail(ws, req_id, "file not found", code="NOT_FOUND")
            return
        state["files"][path] = str(p.get("content") or "")
        await _reply(ws, req_id, _save_state(state))

    async def _delete_file(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        path = _safe_path(str(p.get("path") or ""))
        if path is None:
            await _fail(ws, req_id, "invalid path")
            return
        state = _load_state()
        if path not in state["files"]:
            await _fail(ws, req_id, "file not found", code="NOT_FOUND")
            return
        del state["files"][path]
        if state.get("activeFile") == path:
            state["activeFile"] = next(iter(state["files"].keys()), "")
        await _reply(ws, req_id, _save_state(state))

    async def _rename_file(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        src = _safe_path(str(p.get("from") or ""))
        dst = _safe_path(str(p.get("to") or ""))
        if src is None or dst is None:
            await _fail(ws, req_id, "invalid path")
            return
        state = _load_state()
        if src not in state["files"]:
            await _fail(ws, req_id, "file not found", code="NOT_FOUND")
            return
        if dst in state["files"]:
            await _fail(ws, req_id, "destination exists", code="CONFLICT")
            return
        state["files"][dst] = state["files"].pop(src)
        if state.get("activeFile") == src:
            state["activeFile"] = dst
        await _reply(ws, req_id, _save_state(state))

    async def _chat(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        user_text = str(p.get("message") or "").strip()
        if not user_text:
            await _fail(ws, req_id, "empty message")
            return
        state = _load_state()

        # Append user message and persist before LLM call so UI can show it.
        user_msg = {"id": uuid.uuid4().hex[:10], "role": "user", "content": user_text, "at": _now_iso()}
        state["chat"].append(user_msg)
        state["busy"] = True
        state["lastError"] = None
        _save_state(state)

        # Build LLM conversation
        try:
            extra_context = await _maybe_generate_builder_image_asset(state, user_text)
            if extra_context:
                _save_state(state)
        except ImageGenError as exc:
            logger.warning("[app.builder] image generation failed: %s", exc)
            state = _load_state()
            state["busy"] = False
            state["lastError"] = f"Builder image error: {exc}"
            await _reply(ws, req_id, _save_state(state))
            return

        context_block = _build_context_message(state, extra_context)
        history: list[dict[str, str]] = [{"role": "system", "content": BUILDER_SYSTEM_PROMPT}]
        # Insert a context message before the latest user turn
        # Keep only last ~14 messages to limit tokens
        recent = state["chat"][-14:]
        for i, m in enumerate(recent):
            role = m.get("role") if m.get("role") in ("user", "assistant") else "user"
            content = str(m.get("content") or "")
            if i == len(recent) - 1 and role == "user":
                content = f"{context_block}\n---\n\nUser request:\n{content}"
            history.append({"role": role, "content": content})

        use_main_agent = False
        main_agent_query = ""
        user_id = str(p.get("user_id") or "").strip()
        try:
            use_main_agent = (
                agent_client is not None
                and app_builder_agent.feature_enabled()
                and app_builder_agent.should_route_request(
                    user_text,
                    has_files=bool(state.get("files")),
                )
            )
            if use_main_agent:
                # Flatten history into a single query string for the main agent.
                # The main agent does not accept a multi-turn messages array
                # via ``params``; per-session history is kept by its own
                # checkpointer (keyed by our ``app_builder::<id>`` session id).
                # We still send the persona + project context + the latest
                # user turn on every call so the agent has authoritative state
                # in the working set, even after a checkpoint restore.
                turn_blocks: list[str] = []
                # Earlier turns become a compact dialog log for grounding.
                if len(recent) > 1:
                    log_lines: list[str] = []
                    for m in recent[:-1]:
                        role = m.get("role") if m.get("role") in ("user", "assistant") else "user"
                        text = str(m.get("content") or "").strip()
                        if not text:
                            continue
                        log_lines.append(f"[{role}] {text}")
                    if log_lines:
                        turn_blocks.append(
                            "## Recent dialog (oldest first)\n" + "\n".join(log_lines)
                        )
                turn_blocks.append(
                    "## System role\n" + BUILDER_SYSTEM_PROMPT
                )
                turn_blocks.append(
                    "## Tools available in this run\n"
                    "You are running inside the JiuWenClaw main agent and have access to your full tool stack — "
                    "**web_search** (research design references, brand voice, competitor copy), "
                    "**web_fetch** (pull real product copy or hex tokens from URLs the user shares), "
                    "**vision_tools / image generation** (produce hero illustrations or background art when truly needed), "
                    "**memory** (remember the user's brand decisions across turns), and "
                    "**Open Design bridge tools** (`open_design_capability_snapshot`, `open_design_api_request`) "
                    "to access Open Design's full daemon API surface (`/api/skills`, `/api/design-systems`, "
                    "`/api/plugins`, `/api/runs`, `/api/projects`, `/api/media/*`, `/api/tools/*`, automations, and more).\n"
                    "The App Builder runtime also has project-local command execution, dev-server preview, "
                    "Playwright-style screenshot QA, zip packaging, and structured plan state exposed in the UI. "
                    "Create normal scripts and files that make those runtime tools useful.\n"
                    "Use them only when they materially improve the result. After tool work, you MUST return the "
                    "final ``json-ops`` fenced block as specified in the system role — that block is how files are "
                    "actually written. Prose outside the block is shown to the user as your message.\n"
                    "Important: during this App Builder run, do not call App Builder mutation tools such as "
                    "`features_app_builder_write_file` or `features_app_builder_delete_file`. Those tools are for "
                    "the main chat agent outside this builder bridge. Here, all project mutations must be expressed "
                    "only through the final json-ops block."
                )
                turn_blocks.append(context_block)
                turn_blocks.append(f"## User request\n{user_text}")
                query = "\n\n---\n\n".join(turn_blocks)
                main_agent_query = query
                try:
                    reply_text = await app_builder_agent.call_main_agent(
                        agent_client,
                        project_id=state.get("currentProjectId") or "scratch",
                        query=query,
                        user_id=user_id,
                        request_id=str(req_id) if req_id is not None else None,
                    )
                except Exception as bridge_exc:  # noqa: BLE001
                    logger.warning(
                        "[app.builder] main-agent dispatch failed, falling back to feature_llm: %s",
                        bridge_exc,
                    )
                    reply_text = await _call_llm(history)
            else:
                reply_text = await _call_llm(history)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[app.builder] LLM call failed: %s", exc)
            state = _load_state()
            state["busy"] = False
            state["lastError"] = f"Builder LLM error: {exc}"
            await _reply(ws, req_id, _save_state(state))
            return

        if _looks_like_build_request(user_text) and _quality_retry_enabled():
            _prose_check, ops_check, _had_ops_check = _extract_ops_block(reply_text)
            preview_state = _ops_preview_state(state, ops_check)
            quality_issues = _quality_report(preview_state.get("files") or {}, user_text)
            if quality_issues:
                repair_instruction = (
                    "The previous App Builder draft is not production-grade enough. "
                    "Regenerate a stronger complete build and return a fresh final json-ops block.\n\n"
                    "Quality issues to fix:\n- " + "\n- ".join(quality_issues) + "\n\n"
                    "Do not apologize. Do not explain limitations. Produce complete files with richer visual design, "
                    "real interactions, responsive states, and deeper product-specific copy."
                )
                try:
                    if use_main_agent and agent_client is not None:
                        repair_query = f"{main_agent_query}\n\n---\n\n## Mandatory quality repair\n{repair_instruction}"
                        reply_text = await app_builder_agent.call_main_agent(
                            agent_client,
                            project_id=state.get("currentProjectId") or "scratch",
                            query=repair_query,
                            user_id=user_id,
                            request_id=f"{req_id}_repair" if req_id is not None else None,
                        )
                    else:
                        repair_history = [
                            *history,
                            {"role": "assistant", "content": reply_text},
                            {"role": "user", "content": repair_instruction},
                        ]
                        reply_text = await _call_llm(repair_history)
                except Exception as repair_exc:  # noqa: BLE001
                    logger.warning("[app.builder] quality repair retry failed: %s", repair_exc)

        prose, ops_payload, had_ops_marker = _extract_ops_block(reply_text)
        applied: list[str] = []
        state = _load_state()  # reload in case
        if ops_payload and isinstance(ops_payload.get("ops"), list):
            applied = _apply_ops(state, ops_payload["ops"])
        summary = None
        if isinstance(ops_payload, dict):
            summary = ops_payload.get("summary")
        if had_ops_marker and not applied:
            state["lastError"] = "The builder returned file operations that could not be parsed or applied. Nothing was changed. Ask it to retry with smaller, valid file updates."
        assistant_msg = {
            "id": uuid.uuid4().hex[:10],
            "role": "assistant",
            "content": prose or (summary or ("Applied file updates." if applied else "I could not apply the file updates.")),
            "opsApplied": applied,
            "summary": summary,
            "at": _now_iso(),
        }
        state["chat"].append(assistant_msg)
        state["busy"] = False
        await _reply(ws, req_id, _save_state(state))

    async def _clear_chat(ws, req_id, params, session_id):  # noqa: ANN001
        state = _load_state()
        state["chat"] = []
        state["lastError"] = None
        await _reply(ws, req_id, _save_state(state))

    async def _export_workspace(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        state = _load_state()
        try:
            result = _sync_files_to_workspace(state, clean=bool(p.get("clean", True)))
            await _reply(ws, req_id, _save_state(state), extra={"workspace": result})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[app.builder.export_workspace] %s", exc)
            state["lastError"] = f"Workspace export failed: {exc}"
            await _reply(ws, req_id, _save_state(state))

    async def _run_command(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        state = _load_state()
        state["busy"] = True
        state["lastError"] = None
        _save_state(state)
        try:
            _sync_files_to_workspace(state, clean=bool(p.get("clean", False)))
            result = await _run_workspace_command(
                state,
                p.get("command") or "",
                int(p.get("timeoutSec") or _DEFAULT_COMMAND_TIMEOUT_SECONDS),
            )
            state["lastCommand"] = result
            if result.get("exitCode") not in (0, None):
                state["lastError"] = f"Command failed with exit code {result.get('exitCode')}"
            elif result.get("timedOut"):
                state["lastError"] = "Command timed out"
            await _reply(ws, req_id, _save_state({**state, "busy": False}), extra={"command": result})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[app.builder.run_command] %s", exc)
            state = _load_state()
            state["busy"] = False
            state["lastError"] = f"Command failed: {exc}"
            state["lastCommand"] = {
                "command": p.get("command") or "",
                "cwd": state.get("workspaceDir") or "",
                "exitCode": None,
                "timedOut": False,
                "output": str(exc),
                "startedAt": _now_iso(),
                "finishedAt": _now_iso(),
                "durationMs": 0,
            }
            await _reply(ws, req_id, _save_state(state), extra={"command": state["lastCommand"]})

    async def _audit_project(ws, req_id, params, session_id):  # noqa: ANN001
        state = _load_state()
        latest_request = ""
        chat = state.get("chat") if isinstance(state.get("chat"), list) else []
        for item in reversed(chat):
            if isinstance(item, dict) and item.get("role") == "user":
                latest_request = str(item.get("content") or "")
                break
        issues = _quality_report(state.get("files") or {}, latest_request)
        audit = {
            "passed": not issues,
            "issues": issues,
            "checkedAt": _now_iso(),
            "fileCount": len(state.get("files") or {}),
        }
        state["lastAudit"] = audit
        await _reply(ws, req_id, _save_state(state), extra={"audit": audit})

    async def _update_policy(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        state = _load_state()
        policy = _policy_for_state(state)
        incoming = p.get("policy") if isinstance(p.get("policy"), dict) else p
        if isinstance(incoming.get("allowedCommands"), list):
            allowed = {Path(str(item)).name.lower() for item in incoming["allowedCommands"] if str(item).strip()}
            policy["allowedCommands"] = sorted(allowed or _ALLOWED_COMMANDS)
        for key in ("allowPackageInstall", "allowPythonPackageInstall", "allowDevServer", "allowNetworkCommands"):
            if key in incoming:
                policy[key] = bool(incoming.get(key))
        state["commandPolicy"] = policy
        await _reply(ws, req_id, _save_state(state), extra={"policy": policy})

    async def _start_server(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        state = _load_state()
        state["lastError"] = None
        try:
            server = _start_dev_server(state, p.get("command") or "", int(p.get("port") or 0) or None)
            await _reply(ws, req_id, _save_state(state), extra={"devServer": server})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[app.builder.start_dev_server] %s", exc)
            state["lastError"] = f"Dev server failed: {exc}"
            await _reply(ws, req_id, _save_state(state))

    async def _stop_server(ws, req_id, params, session_id):  # noqa: ANN001
        state = _load_state()
        server = _stop_dev_server(state)
        await _reply(ws, req_id, _save_state(state), extra={"devServer": server})

    async def _server_status(ws, req_id, params, session_id):  # noqa: ANN001
        state = _load_state()
        server = _dev_server_status(state)
        await _reply(ws, req_id, _save_state(state), extra={"devServer": server})

    async def _create_zip(ws, req_id, params, session_id):  # noqa: ANN001
        state = _load_state()
        try:
            artifact = _create_zip_artifact(state)
            await _reply(ws, req_id, _save_state(state), extra={"artifact": artifact})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[app.builder.create_zip] %s", exc)
            state["lastError"] = f"Zip export failed: {exc}"
            await _reply(ws, req_id, _save_state(state))

    async def _get_artifact_blob(ws, req_id, params, session_id):  # noqa: ANN001
        state = _load_state()
        try:
            artifact = _artifact_blob(state)
            await _reply(ws, req_id, _save_state(state), extra={"artifact": artifact})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[app.builder.get_artifact_blob] %s", exc)
            state["lastError"] = f"Artifact download failed: {exc}"
            await _reply(ws, req_id, _save_state(state))

    async def _screenshot_qa(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        state = _load_state()
        result = await _run_screenshot_qa(state, str(p.get("url") or "") or None)
        if not result.get("ok") and result.get("errors"):
            state["lastError"] = f"Screenshot QA reported: {result['errors'][0]}"
        await _reply(ws, req_id, _save_state(state), extra={"screenshot": result})

    async def _create_plan(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        state = _load_state()
        plan = _create_build_plan(str(p.get("prompt") or ""), state)
        state["buildPlan"] = plan
        await _reply(ws, req_id, _save_state(state), extra={"plan": plan})

    # --- Projects library ---------------------------------------------------

    async def _list_projects(ws, req_id, params, session_id):  # noqa: ANN001
        await _reply(ws, req_id, _save_state(_load_state()), include_projects=True)

    async def _save_project(ws, req_id, params, session_id):  # noqa: ANN001
        """Save the current build to the project library. If `id` is provided
        and exists, overwrites that record (Save). Otherwise creates a new
        record (Save as new). Updates state.currentProjectId."""
        p = _p(params)
        state = _load_state()
        lib = _load_library()
        existing_id = str(p.get("id") or "").strip()
        name = str(p.get("name") or state.get("projectName") or "Untitled project").strip() or "Untitled project"
        description = str(p.get("description") or "").strip()
        if existing_id and existing_id in lib:
            rec = lib[existing_id]
            rec["name"] = name
            rec["description"] = description
            rec["files"] = dict(state.get("files") or {})
            rec["activeFile"] = state.get("activeFile") or rec["activeFile"]
            rec["updatedAt"] = _now_iso()
            project_id = existing_id
        else:
            project_id = uuid.uuid4().hex[:12]
            now = _now_iso()
            lib[project_id] = {
                "id": project_id,
                "name": name,
                "description": description,
                "files": dict(state.get("files") or {}),
                "activeFile": state.get("activeFile") or next(iter((state.get("files") or {}).keys()), ""),
                "createdAt": now,
                "updatedAt": now,
            }
        _save_library(lib)
        state["currentProjectId"] = project_id
        state["projectName"] = name
        await _reply(ws, req_id, _save_state(state), include_projects=True,
                     extra={"savedProjectId": project_id})

    async def _load_project(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        pid = str(p.get("id") or "").strip()
        lib = _load_library()
        if not pid or pid not in lib:
            await _fail(ws, req_id, "project not found", code="NOT_FOUND")
            return
        rec = lib[pid]
        state = _load_state()
        state["files"] = dict(rec.get("files") or {})
        active = str(rec.get("activeFile") or "")
        state["activeFile"] = active if active in state["files"] else next(iter(state["files"].keys()), "")
        state["currentProjectId"] = pid
        state["projectName"] = rec.get("name") or "Untitled project"
        state["previewMode"] = "code"
        state["lastError"] = None
        # New working session — fresh chat for clarity
        state["chat"] = []
        await _reply(ws, req_id, _save_state(state), include_projects=True)

    async def _delete_project(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        pid = str(p.get("id") or "").strip()
        lib = _load_library()
        if not pid or pid not in lib:
            await _fail(ws, req_id, "project not found", code="NOT_FOUND")
            return
        del lib[pid]
        _save_library(lib)
        state = _load_state()
        if state.get("currentProjectId") == pid:
            state["currentProjectId"] = None
        await _reply(ws, req_id, _save_state(state), include_projects=True)

    async def _rename_project(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        pid = str(p.get("id") or "").strip()
        new_name = str(p.get("name") or "").strip()
        if not new_name:
            await _fail(ws, req_id, "name required")
            return
        lib = _load_library()
        if not pid or pid not in lib:
            await _fail(ws, req_id, "project not found", code="NOT_FOUND")
            return
        lib[pid]["name"] = new_name
        lib[pid]["updatedAt"] = _now_iso()
        _save_library(lib)
        state = _load_state()
        if state.get("currentProjectId") == pid:
            state["projectName"] = new_name
        await _reply(ws, req_id, _save_state(state), include_projects=True)

    async def _duplicate_project(ws, req_id, params, session_id):  # noqa: ANN001
        p = _p(params)
        pid = str(p.get("id") or "").strip()
        lib = _load_library()
        if not pid or pid not in lib:
            await _fail(ws, req_id, "project not found", code="NOT_FOUND")
            return
        src = lib[pid]
        new_id = uuid.uuid4().hex[:12]
        now = _now_iso()
        lib[new_id] = {
            "id": new_id,
            "name": f"{src.get('name') or 'Untitled project'} (copy)",
            "description": src.get("description") or "",
            "files": dict(src.get("files") or {}),
            "activeFile": src.get("activeFile") or next(iter((src.get("files") or {}).keys()), ""),
            "createdAt": now,
            "updatedAt": now,
        }
        _save_library(lib)
        await _reply(ws, req_id, _save_state(_load_state()), include_projects=True,
                     extra={"savedProjectId": new_id})

    async def _new_project(ws, req_id, params, session_id):  # noqa: ANN001
        """Start a fresh blank project without touching the library."""
        p = _p(params)
        name = str(p.get("name") or "Untitled project").strip() or "Untitled project"
        state = _default_state()
        state["projectName"] = name
        state["currentProjectId"] = None
        await _reply(ws, req_id, _save_state(state), include_projects=True)

    methods = {
        "app.builder.get_state": _get_state,
        "app.builder.reset_project": _reset_project,
        "app.builder.set_active_file": _set_active_file,
        "app.builder.set_preview_mode": _set_preview_mode,
        "app.builder.create_file": _create_file,
        "app.builder.update_file": _update_file,
        "app.builder.delete_file": _delete_file,
        "app.builder.rename_file": _rename_file,
        "app.builder.chat": _chat,
        "app.builder.clear_chat": _clear_chat,
        "app.builder.export_workspace": _export_workspace,
        "app.builder.run_command": _run_command,
        "app.builder.audit_project": _audit_project,
        "app.builder.update_policy": _update_policy,
        "app.builder.start_dev_server": _start_server,
        "app.builder.stop_dev_server": _stop_server,
        "app.builder.dev_server_status": _server_status,
        "app.builder.create_zip": _create_zip,
        "app.builder.get_artifact_blob": _get_artifact_blob,
        "app.builder.screenshot_qa": _screenshot_qa,
        "app.builder.create_plan": _create_plan,
        "app.builder.list_projects": _list_projects,
        "app.builder.save_project": _save_project,
        "app.builder.load_project": _load_project,
        "app.builder.delete_project": _delete_project,
        "app.builder.rename_project": _rename_project,
        "app.builder.duplicate_project": _duplicate_project,
        "app.builder.new_project": _new_project,
    }
    for name, fn in methods.items():
        channel.register_method(name, fn)
    logger.info("[app.builder] registered %d RPC methods", len(methods))
