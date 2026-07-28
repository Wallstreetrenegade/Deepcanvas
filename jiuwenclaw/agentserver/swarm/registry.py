# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

"""Central registration for provider-based swarm assembly."""

from __future__ import annotations

from typing import Any

from openjiuwen.agent_evolving.trajectory import InMemoryTrajectoryRegistry
from openjiuwen.agent_teams.rails.registration import ensure_harness_elements_registered
from openjiuwen.agent_teams.schema.build_context import register_build_context_factory

from jiuwenclaw.config import get_config
from jiuwenclaw.agentserver.swarm.context import SwarmBuildContext

_REGISTERED = False
_TRAJECTORY_REGISTRIES: dict[tuple[str, str], Any] = {}


def _trajectory_registry_for(seed: dict[str, Any]) -> Any:
    key = (str(seed.get("session_id") or ""), str(seed.get("team_id") or ""))
    registry = _TRAJECTORY_REGISTRIES.get(key)
    if registry is None:
        registry = InMemoryTrajectoryRegistry()
        _TRAJECTORY_REGISTRIES[key] = registry
    return registry


def _build_swarm_context_from_seed(seed: dict[str, Any]) -> SwarmBuildContext:
    return SwarmBuildContext.from_seed(
        seed,
        config=get_config(),
        trajectory_registry=_trajectory_registry_for(seed),
    )


def register_swarm_providers() -> None:
    """Register openJiuwen built-ins and Deepcanvas swarm context rebuilding.

    This first layer intentionally avoids importing upstream provider modules
    whose JiuwenSwarm paths do not exist in Deepcanvas yet. Local providers can
    be added behind this entry point as they are mapped to existing modules.
    """
    global _REGISTERED
    if _REGISTERED:
        return

    ensure_harness_elements_registered()
    register_build_context_factory(_build_swarm_context_from_seed)
    _REGISTERED = True


__all__ = ["register_swarm_providers"]
