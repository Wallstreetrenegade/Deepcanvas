import pytest

from jiuwenclaw.agentserver.tools import task_tools


def test_is_task_memory_enabled_prefers_env_override(monkeypatch):
    monkeypatch.setenv("TASK_MEMORY_ENABLED", "false")
    monkeypatch.setattr(
        "jiuwenclaw.config.get_config",
        lambda: {"task_memory": {"enabled": True}},
    )

    assert task_tools._is_task_memory_enabled() is False


def test_is_task_memory_enabled_uses_config_when_env_unset(monkeypatch):
    monkeypatch.delenv("TASK_MEMORY_ENABLED", raising=False)
    monkeypatch.setattr(
        "jiuwenclaw.config.get_config",
        lambda: {"task_memory": {"enabled": True}},
    )

    assert task_tools._is_task_memory_enabled() is True
