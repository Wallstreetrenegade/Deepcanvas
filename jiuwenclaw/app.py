# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""Orchestrate AgentServer + Gateway in two processes (split layout, one command).

Runs ``jiuwenclaw.app_agentserver`` then ``jiuwenclaw.app_gateway`` with the same
environment as a normal CLI launch. Web RPC handlers live in ``app_web_handlers``.
"""

from __future__ import annotations

import subprocess
import sys
import time
import os
from pathlib import Path

from dotenv import load_dotenv

from jiuwenclaw.utils import get_user_workspace_dir, get_env_file, prepare_workspace, cleanup_team_files


_workspace_dir = get_user_workspace_dir()
_config_file = _workspace_dir / "config" / "config.yaml"
_new_workspace = _workspace_dir / "agent" / "jiuwenclaw_workspace"
_old_workspace = _workspace_dir / "agent" / "workspace"

# 始终清理 Team 旧版本遗留文件（幂等操作，在 prepare_workspace 之前执行）
cleanup_team_files(_workspace_dir)

# Initialize if config doesn't exist, or if legacy workspace exists but new doesn't (migration)
if not _config_file.exists() or (_old_workspace.exists() and not _new_workspace.exists()):
    prepare_workspace(overwrite=False)

load_dotenv(dotenv_path=get_env_file())


def _runtime_python() -> str:
    repo_root = Path(__file__).resolve().parent.parent
    candidates = [
        repo_root / ".codex-runtime" / "local-venv" / "Scripts" / "python.exe",
        repo_root / ".venv" / "Scripts" / "python.exe",
        repo_root / ".codex-runtime" / "local-venv" / "bin" / "python",
        repo_root / ".venv" / "bin" / "python",
    ]
    probe = "from dotenv import load_dotenv; import openjiuwen.harness"
    for candidate in candidates:
        if not candidate.exists():
            continue
        result = subprocess.run(
            [str(candidate), "-c", probe],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode == 0:
            return str(candidate)
    return sys.executable


def _env_truthy(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _start_open_design_sidecar() -> subprocess.Popen | None:
    if not _env_truthy("OPEN_DESIGN_DAEMON_AUTOSTART", default=True):
        return None
    repo_root = Path(__file__).resolve().parent.parent
    open_design_dir = repo_root / "packages" / "open-design"
    if not open_design_dir.exists():
        return None
    cmd = ["pnpm", "exec", "od", "--port", "7456", "--host", "127.0.0.1", "--no-open"]
    if sys.platform == "win32":
        cmd = ["cmd", "/c", *cmd]
    return subprocess.Popen(cmd, cwd=str(open_design_dir))


def main() -> None:
    python = _runtime_python()

    agent = subprocess.Popen([python, "-m", "jiuwenclaw.app_agentserver"])
    gateway = None
    open_design = None
    try:
        open_design = _start_open_design_sidecar()
        time.sleep(0.4)
        gateway = subprocess.Popen([python, "-m", "jiuwenclaw.app_gateway"])
    except Exception:
        if agent.poll() is None:
            agent.terminate()
        raise

    procs: list[subprocess.Popen] = [agent] + ([gateway] if gateway else []) + ([open_design] if open_design else [])

    def _terminate_all() -> None:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        deadline = time.time() + 12
        while time.time() < deadline:
            if all(p.poll() is not None for p in procs):
                break
            time.sleep(0.1)
        for p in procs:
            if p.poll() is None:
                p.kill()

    exit_code = 0
    try:
        while True:
            if agent.poll() is not None:
                exit_code = agent.returncode or 0
                break
            if gateway is not None and gateway.poll() is not None:
                exit_code = gateway.returncode or 0
                break
            time.sleep(0.25)
    except KeyboardInterrupt:
        exit_code = 130
    finally:
        _terminate_all()

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
