# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""JSON-file backed state store for the PI Agent.

Each feature has its own file under ``<user_workspace>/pi_agent/``:

- ``kanban.json``        : list of KanbanCard-like dicts
- ``crm.json``           : CRM snapshot with leads, columns, filters, and view settings
- ``project_flow.json``  : Project Flow board snapshot with nodes, edges, AI prompts, generator metadata, and URL-ingested flows
- ``social_posts.json``  : list of drafted/scheduled/published posts

The shapes mirror the frontend Zustand stores so the frontend can push its
localStorage here with a single RPC call. The PI agent reads/writes these
files through a small helper that avoids touching disk on every attribute
access (cached with mtime invalidation).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

from jiuwenclaw.auth import get_current_user_data_dir

logger = logging.getLogger(__name__)

_LOCK = threading.RLock()
_CACHE: dict[str, tuple[float, Any]] = {}


def _base_dir() -> Path:
    base = get_current_user_data_dir() / "pi_agent"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _feature_path(feature: str) -> Path:
    safe = feature.replace("/", "_").replace("\\", "_")
    return _base_dir() / f"{safe}.json"


def load_feature(feature: str, default: Any = None) -> Any:
    """Load a feature's JSON blob. Returns ``default`` if file is missing."""
    path = _feature_path(feature)
    with _LOCK:
        if not path.exists():
            return default if default is not None else []
        try:
            mtime = path.stat().st_mtime
        except OSError:
            return default if default is not None else []
        cached = _CACHE.get(str(path))
        if cached and cached[0] == mtime:
            return cached[1]
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("[pi_agent.state] failed to read %s: %s", path, exc)
            return default if default is not None else []
        _CACHE[str(path)] = (mtime, data)
        return data


def save_feature(feature: str, data: Any) -> None:
    """Write a feature JSON blob atomically and refresh the cache."""
    path = _feature_path(feature)
    tmp = path.with_suffix(".json.tmp")
    with _LOCK:
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, path)
            try:
                _CACHE[str(path)] = (path.stat().st_mtime, data)
            except OSError:
                _CACHE.pop(str(path), None)
        except OSError as exc:
            logger.warning("[pi_agent.state] failed to write %s: %s", path, exc)


def list_features() -> list[str]:
    """Return all feature keys currently persisted on disk."""
    try:
        return sorted(p.stem for p in _base_dir().glob("*.json"))
    except OSError:
        return []


def base_dir_str() -> str:
    return str(_base_dir())
