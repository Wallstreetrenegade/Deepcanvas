# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Launch JiuwenClaw frontend/backend services with one command."""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from jiuwenclaw.utils import get_root_dir, is_package_installation

# Runtime data root used for writable state and config.
# In source mode this may still point at ~/.jiuwenclaw when the workspace has been initialized.
DATA_ROOT = get_root_dir()

# Package source root:
# - source mode: <repo>/jiuwenclaw
# - package mode: <site-packages>/jiuwenclaw
PACKAGE_DIR = Path(__file__).resolve().parent

# Frontend dev project root (contains package.json)
WEB_DEV_DIR = PACKAGE_DIR / "web"
PLUNK_DIR = PACKAGE_DIR.parent / "packages" / "plunk"
OPEN_DESIGN_DIR = PACKAGE_DIR.parent / "packages" / "open-design"
ServiceCommand = tuple[str, list[str], Path, dict[str, str] | None]


def _runtime_python() -> str:
    repo_root = PACKAGE_DIR.parent
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


def _launch_cwd() -> Path:
    if is_package_installation():
        return DATA_ROOT
    return PACKAGE_DIR.parent


def _build_commands(mode: str) -> list[ServiceCommand]:
    python_cmd = _runtime_python()
    launch_cwd = _launch_cwd()
    commands: list[ServiceCommand] = []

    # Always launch package modules so source/package layouts behave the same.
    if mode in ("all", "app", "dev"):
        commands.append(("app", [python_cmd, "-m", "jiuwenclaw.app"], launch_cwd, None))
    if mode == "all":
        commands.append(("web", [python_cmd, "-m", "jiuwenclaw.app_web"], launch_cwd, None))
    elif mode == "web":
        commands.append(("web", [python_cmd, "-m", "jiuwenclaw.app_web"], launch_cwd, None))
    elif mode == "dev":
        package_json = WEB_DEV_DIR / "package.json"
        if is_package_installation() and not package_json.exists():
            raise RuntimeError(
                "dev mode is unavailable in package installation; "
                "please run app/web mode, or use source checkout for frontend dev."
            )
        commands.append(("web-dev", ["npm", "run", "dev"], WEB_DEV_DIR, None))
    if mode in ("all", "app", "dev"):
        commands.extend(_build_optional_sidecars())
    return commands


def _is_env_truthy(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _build_optional_sidecars() -> list[ServiceCommand]:
    commands: list[ServiceCommand] = []
    if _is_env_truthy("PLUNK_AUTOSTART", default=False) and PLUNK_DIR.exists():
        commands.append(("plunk-api", ["yarn", "workspace", "api", "dev:server"], PLUNK_DIR, None))
        commands.append(
            (
                "plunk-web",
                ["yarn", "workspace", "web", "dev"],
                PLUNK_DIR,
                {
                    "PLUNK_BASE_PATH": "/mail",
                    "NEXT_PUBLIC_API_URI": "/mail-api",
                    "NEXT_PUBLIC_DASHBOARD_URI": "/mail",
                },
            )
        )
    if _is_env_truthy("OPEN_DESIGN_DAEMON_AUTOSTART", default=True) and OPEN_DESIGN_DIR.exists():
        commands.append(
            (
                "open-design-daemon",
                ["pnpm", "exec", "od", "--port", "7456", "--host", "127.0.0.1", "--no-open"],
                OPEN_DESIGN_DIR,
                None,
            )
        )
    return commands


def _start_process(
    name: str,
    cmd: list[str],
    cwd: Path,
    extra_env: dict[str, str] | None = None,
) -> subprocess.Popen[bytes]:
    print(f"[start_services] starting {name}: {' '.join(cmd)} (cwd={cwd})")
    # Windows: npm/npx resolve to .cmd shims; CreateProcess cannot spawn .cmd without a shell.
    if sys.platform == "win32" and cmd:
        first = cmd[0].lower()
        if first in ("npm", "npx", "pnpm", "yarn"):
            cmd = ["cmd", "/c", *cmd]
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    return subprocess.Popen(cmd, cwd=str(cwd), env=env)


def _terminate_processes(processes: dict[str, subprocess.Popen[bytes]]) -> None:
    for name, proc in processes.items():
        if proc.poll() is None:
            print(f"[start_services] terminating {name} (pid={proc.pid})")
            proc.terminate()

    deadline = time.time() + 8
    while time.time() < deadline:
        if all(proc.poll() is not None for proc in processes.values()):
            return
        time.sleep(0.2)

    for name, proc in processes.items():
        if proc.poll() is None:
            print(f"[start_services] killing {name} (pid={proc.pid})")
            proc.kill()


def _is_sidecar(name: str) -> bool:
    return name in {"plunk-api", "plunk-web", "open-design-daemon"}


def _run(mode: str) -> int:
    commands = _build_commands(mode)
    if not commands:
        print(f"[start_services] no commands to run for mode: {mode}")
        return 2

    processes: dict[str, subprocess.Popen[bytes]] = {}
    try:
        for name, cmd, cwd, extra_env in commands:
            processes[name] = _start_process(name, cmd, cwd, extra_env)

        while True:
            for name, proc in list(processes.items()):
                code = proc.poll()
                if code is not None:
                    print(f"[start_services] {name} exited with code {code}")
                    if _is_sidecar(name):
                        processes.pop(name)
                        break
                    return code
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[start_services] keyboard interrupt received, shutting down...")
        return 130
    finally:
        _terminate_processes(processes)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Launch JiuwenClaw services (frontend/backend).",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="all",
        choices=["all", "web", "app", "dev"],
        help="Start mode: all (default), web, app, or dev.",
    )
    return parser.parse_args()


def main() -> None:
    signal.signal(signal.SIGTERM, signal.default_int_handler)
    args = _parse_args()
    exit_code = _run(args.mode)
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
