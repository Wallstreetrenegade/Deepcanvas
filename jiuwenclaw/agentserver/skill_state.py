# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Pure helpers for reading skill enablement state.

These mirror the newer upstream runtime helpers and intentionally avoid a
SkillManager dependency so team/swarm code can query execution filters without
creating circular imports.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from jiuwenclaw.utils import get_agent_skills_dir

logger = logging.getLogger(__name__)


def get_state_file() -> Path:
    return get_agent_skills_dir() / "skills_state.json"


def normalize_skill_configs(raw_configs: Any) -> dict[str, dict[str, bool]]:
    if not isinstance(raw_configs, dict):
        return {}

    normalized: dict[str, dict[str, bool]] = {}
    for raw_name, raw_cfg in raw_configs.items():
        if not isinstance(raw_name, str):
            continue
        name = raw_name.strip()
        if not name:
            continue
        config = raw_cfg if isinstance(raw_cfg, dict) else {}
        normalized[name] = {"enabled": bool(config.get("enabled", True))}
    return normalized


def get_registered_skill_names(state: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for key in ("installed_plugins", "local_skills"):
        items = state.get(key, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if name:
                names.add(name)
    return names


def get_skill_enabled(state: dict[str, Any], skill_name: str) -> bool:
    if not skill_name:
        return True

    configs = state.get("skill_configs", {})
    if not isinstance(configs, dict):
        return True

    config = configs.get(skill_name)
    if not isinstance(config, dict):
        return True
    return bool(config.get("enabled", True))


def set_skill_enabled(state: dict[str, Any], skill_name: str, enabled: bool) -> None:
    configs = state.setdefault("skill_configs", {})
    if not isinstance(configs, dict):
        configs = {}
        state["skill_configs"] = configs
    configs[skill_name] = {"enabled": bool(enabled)}


def remove_skill_config(state: dict[str, Any], skill_name: str) -> bool:
    if not skill_name:
        return False
    configs = state.get("skill_configs")
    if not isinstance(configs, dict) or skill_name not in configs:
        return False
    del configs[skill_name]
    return True


def list_disabled_skills(state: dict[str, Any]) -> list[str]:
    configs = state.get("skill_configs", {})
    if not isinstance(configs, dict):
        return []

    disabled = []
    for name, config in configs.items():
        if not isinstance(name, str) or not isinstance(config, dict):
            continue
        if config.get("enabled") is False:
            disabled.append(name)
    return sorted(disabled)


def list_execution_disabled_skills(state: dict[str, Any]) -> list[str]:
    registered = get_registered_skill_names(state)
    if not registered:
        return []
    return [name for name in list_disabled_skills(state) if name in registered]


def load_execution_disabled_skills() -> list[str]:
    try:
        state_file = get_state_file()
        if state_file.exists():
            state = json.loads(state_file.read_text(encoding="utf-8"))
            return list_execution_disabled_skills(state)
    except Exception as exc:
        logger.warning("[SkillState] Failed to load disabled skills: %s", exc)
    return []


def filter_visible_skill_names(names: list[str]) -> list[str]:
    disabled = set(load_execution_disabled_skills())
    if not disabled:
        return names
    return [name for name in names if name not in disabled]
