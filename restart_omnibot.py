"""
restart_omnibot.py — OmniBot Project Restart Utility

Complete restart mechanism for Docker-based OmniBot project:
1. Pre-restart checks (Docker running, current status)
2. Graceful stop of all containers
3. Optional rebuild (--rebuild flag)
4. Start fresh with --force-recreate
5. Health verification loop (up to 120s)
6. Open browser on success

Usage:
    python restart_omnibot.py          # Quick restart (no rebuild)
    python restart_omnibot.py --rebuild # Full rebuild + restart
"""

import subprocess
import sys
import time
import webbrowser
import json
from pathlib import Path
from typing import List, Tuple, Optional

# ─── Configuration ───────────────────────────────────────────────────────────

PROJECT_ROOT = str(Path(__file__).parent.resolve())
COMPOSE_FILE = str(Path(PROJECT_ROOT) / "docker-compose.yml")

CONTAINERS = ["omnibot-backend", "omnibot-frontend", "omnibot-mongo", "omnibot-chroma"]
TIMEOUT = 120
POLL_INTERVAL = 5

# Docker Compose command — try V2 first, fall back to V1
_DOCKER_COMPOSE_CMD = None


def _get_docker_compose_cmd() -> str:
    """Determine whether to use 'docker compose' (V2) or 'docker-compose' (V1)."""
    global _DOCKER_COMPOSE_CMD
    if _DOCKER_COMPOSE_CMD is not None:
        return _DOCKER_COMPOSE_CMD
    # Try V2 first
    try:
        result = subprocess.run(
            ["docker", "compose", "version"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            _DOCKER_COMPOSE_CMD = "docker compose"
            return _DOCKER_COMPOSE_CMD
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    # Fall back to V1
    try:
        result = subprocess.run(
            ["docker-compose", "version"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            _DOCKER_COMPOSE_CMD = "docker-compose"
            return _DOCKER_COMPOSE_CMD
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    _DOCKER_COMPOSE_CMD = "docker compose"  # default guess
    return _DOCKER_COMPOSE_CMD


def _run_compose(args: List[str], timeout: int = 120) -> subprocess.CompletedProcess:
    """Run a docker-compose command and return the CompletedProcess."""
    cmd = _get_docker_compose_cmd().split() + args
    return subprocess.run(
        cmd,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _run_docker(args: List[str], timeout: int = 30) -> subprocess.CompletedProcess:
    """Run a docker command and return the CompletedProcess."""
    return subprocess.run(
        ["docker"] + args,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


# ─── UI Helpers ──────────────────────────────────────────────────────────────

def _banner():
    """Print a clean ASCII banner."""
    print("╔══════════════════════════════════════╗")
    print("║     OmniBot Project Restart           ║")
    print("╚══════════════════════════════════════╝")
    print()


def _step(num: int, total: int, label: str, status: str = "..."):
    """Print a step line with optional check/cross mark."""
    marks = {"ok": "✓", "fail": "✗", "skip": "⏭", "...": "..."}
    mark = marks.get(status, status)
    print(f"[{num}/{total}] {label} {mark}")


def _ok(msg: str):
    """Print a success line."""
    print(f"  ✅ {msg}")


def _err(msg: str):
    """Print an error line."""
    print(f"  ❌ {msg}")


def _info(msg: str):
    """Print an info line."""
    print(f"  ℹ️  {msg}")


# ─── Step 1: Pre-restart Checks ──────────────────────────────────────────────

def check_docker_running() -> bool:
    """Check if Docker Desktop / daemon is running."""
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return True
        _err(result.stderr.strip())
        return False
    except FileNotFoundError:
        _err("Docker executable not found on PATH")
        return False
    except subprocess.TimeoutExpired:
        _err("Docker info command timed out (is Docker Desktop running?)")
        return False
    except Exception as e:
        _err(f"Unexpected error checking Docker: {e}")
        return False


def print_current_status():
    """Print the status of each container before restart."""
    print()
    print("  Current container status:")
    try:
        result = _run_docker([
            "ps", "--format", "{{.Names}}\t{{.Status}}",
        ])
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().splitlines():
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    name, status = parts
                    if name in CONTAINERS:
                        icon = "🟢" if "healthy" in status.lower() or "up" in status.lower() else "🔴"
                        print(f"    {icon} {name}: {status}")
        else:
            print("    (no containers running)")
    except Exception as e:
        _info(f"Could not fetch container status: {e}")
    print()


# ─── Step 2: Graceful Stop ───────────────────────────────────────────────────

def stop_all() -> bool:
    """Stop all containers gracefully with --remove-orphans."""
    print()
    try:
        result = _run_compose(["down", "--remove-orphans"], timeout=60)
        if result.returncode == 0:
            _ok("All containers stopped")
            return True
        else:
            _err(f"docker compose down exited with code {result.returncode}")
            if result.stderr.strip():
                _info(result.stderr.strip()[:500])
            return False
    except subprocess.TimeoutExpired:
        _err("docker compose down timed out (60s)")
        return False
    except Exception as e:
        _err(f"Failed to stop containers: {e}")
        return False


# ─── Step 3: Optional Rebuild ────────────────────────────────────────────────

def rebuild() -> bool:
    """Rebuild all images with --no-cache."""
    print()
    _info("Rebuilding all images (this may take a while)...")
    try:
        result = _run_compose(["build", "--no-cache"], timeout=600)
        if result.returncode == 0:
            _ok("All images rebuilt")
            return True
        else:
            _err(f"Build failed with exit code {result.returncode}")
            if result.stderr.strip():
                # Show last few lines of build output
                lines = result.stderr.strip().splitlines()
                for line in lines[-10:]:
                    print(f"    {line}")
            return False
    except subprocess.TimeoutExpired:
        _err("Build timed out (600s)")
        return False
    except Exception as e:
        _err(f"Rebuild failed: {e}")
        return False


# ─── Step 4: Start Fresh ─────────────────────────────────────────────────────

def start_all() -> bool:
    """Start containers with --force-recreate."""
    print()
    _info("Starting all containers...")
    try:
        result = _run_compose(["up", "-d", "--force-recreate"], timeout=180)
        if result.returncode == 0:
            _ok("Containers started")
            return True
        else:
            _err(f"docker compose up failed with exit code {result.returncode}")
            if result.stderr.strip():
                lines = result.stderr.strip().splitlines()
                for line in lines[-10:]:
                    print(f"    {line}")
            return False
    except subprocess.TimeoutExpired:
        _err("docker compose up timed out (180s)")
        return False
    except Exception as e:
        _err(f"Failed to start containers: {e}")
        return False


# ─── Step 5: Health Verification ─────────────────────────────────────────────

def get_container_statuses() -> dict:
    """
    Get the status of all required containers.
    Returns: {container_name: {"status": str, "running": bool, "healthy": bool}}
    """
    statuses = {}
    try:
        result = _run_docker([
            "ps", "--format", "{{.Names}}\t{{.Status}}",
        ])
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    name, status_text = parts
                    if name in CONTAINERS:
                        lower = status_text.lower()
                        running = "up" in lower or "healthy" in lower
                        healthy = "healthy" in lower or (
                            "up" in lower and "unhealthy" not in lower
                        )
                        statuses[name] = {
                            "status": status_text,
                            "running": running,
                            "healthy": healthy,
                        }
    except Exception:
        pass

    # Fill in any missing containers as not running
    for name in CONTAINERS:
        if name not in statuses:
            statuses[name] = {
                "status": "not found",
                "running": False,
                "healthy": False,
            }

    return statuses


def wait_for_health() -> Tuple[bool, dict]:
    """
    Poll container health until all are healthy or timeout.
    Returns: (all_healthy, final_statuses)
    """
    print()
    _step(4, 4, "Waiting for health checks")

    start_time = time.time()
    last_statuses = {}

    while True:
        elapsed = int(time.time() - start_time)
        remaining = TIMEOUT - elapsed

        statuses = get_container_statuses()
        last_statuses = statuses

        # Print status for each container
        print(f"\r  [{elapsed}s] ", end="")
        all_healthy = True
        for name in CONTAINERS:
            s = statuses.get(name, {})
            status_text = s.get("status", "unknown")
            is_healthy = s.get("healthy", False)
            is_running = s.get("running", False)

            if is_healthy:
                print(f"{name} → ✅ healthy ", end="")
            elif is_running:
                print(f"{name} → ⏳ running ", end="")
                all_healthy = False
            else:
                print(f"{name} → ❌ {status_text} ", end="")
                all_healthy = False

        print()

        if all_healthy:
            return True, statuses

        if elapsed >= TIMEOUT:
            print()
            _err(f"Timeout reached ({TIMEOUT}s)")
            return False, statuses

        time.sleep(POLL_INTERVAL)


def show_failed_container_logs(statuses: dict):
    """Show last 20 log lines for any unhealthy containers."""
    for name in CONTAINERS:
        s = statuses.get(name, {})
        if not s.get("healthy", False) and not s.get("running", False):
            print()
            _err(f"Container '{name}' failed to start properly")
            _info(f"Last 20 log lines for {name}:")
            print()
            try:
                result = subprocess.run(
                    ["docker", "logs", "--tail", "20", name],
                    capture_output=True, text=True, timeout=15,
                )
                if result.stdout.strip():
                    for line in result.stdout.strip().splitlines()[-20:]:
                        print(f"    {line}")
                if result.stderr.strip():
                    for line in result.stderr.strip().splitlines()[-20:]:
                        print(f"    {line}")
            except Exception as e:
                _err(f"Could not fetch logs for {name}: {e}")
            print()


def print_final_summary(statuses: dict, all_healthy: bool):
    """Print a final success/failure summary."""
    print()
    print("  ─── Final Summary ───")
    print(f"  {'✅ ALL CONTAINERS RUNNING' if all_healthy else '❌ SOME CONTAINERS FAILED'}")
    print()
    for name in CONTAINERS:
        s = statuses.get(name, {})
        status_text = s.get("status", "unknown")
        is_healthy = s.get("healthy", False)
        is_running = s.get("running", False)
        if is_healthy:
            print(f"    ✅ {name}: {status_text}")
        elif is_running:
            print(f"    ⏳ {name}: {status_text} (still starting)")
        else:
            print(f"    ❌ {name}: {status_text}")
    print()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    """Main entry point for the restart script."""
    _banner()

    # Parse arguments
    do_rebuild = "--rebuild" in sys.argv
    skip_checks = "--skip-checks" in sys.argv  # hidden flag for internal use

    step_num = 0
    total_steps = 5 if do_rebuild else 4
    step_num += 1

    # ── Step 1: Pre-restart checks ──
    step_num = 1
    _step(step_num, total_steps, "Checking Docker Desktop")
    if not check_docker_running():
        _err("Docker Desktop is not running. Please start Docker Desktop and try again.")
        sys.exit(1)
    _ok("Docker is running")

    if not skip_checks:
        print_current_status()

    # ── Step 2: Stop all containers ──
    step_num = 2
    _step(step_num, total_steps, "Stopping all containers")
    stop_ok = stop_all()
    # Continue even if stop failed (best-effort)

    # ── Step 3: Rebuild (optional) ──
    step_num = 3
    if do_rebuild:
        _step(step_num, total_steps, "Rebuilding images (--no-cache)")
        rebuild_ok = rebuild()
        if not rebuild_ok:
            _err("Rebuild failed. Aborting.")
            sys.exit(1)
        _ok("Rebuild complete")
    else:
        _step(step_num, total_steps, "Skipping rebuild (use --rebuild to rebuild)")
        # Shift step numbers for non-rebuild path
        pass

    # ── Step 4: Start containers ──
    if do_rebuild:
        step_num = 4
    else:
        step_num = 3
    _step(step_num, total_steps, "Starting containers")
    start_ok = start_all()
    if not start_ok:
        _err("Failed to start containers")
        sys.exit(1)

    # ── Step 5: Health verification ──
    if do_rebuild:
        step_num = 5
    else:
        step_num = 4
    all_healthy, statuses = wait_for_health()

    print_final_summary(statuses, all_healthy)

    if all_healthy:
        _ok("All containers running! Opening browser...")
        print()
        try:
            webbrowser.open("http://localhost:5173")
        except Exception as e:
            _info(f"Could not open browser: {e}")

        # ── Launch system tray icon ──
        pythonw = Path(sys.executable).parent / "pythonw.exe"
        if pythonw.exists():
            try:
                subprocess.Popen(
                    [str(pythonw), "run_tray.py"],
                    cwd=PROJECT_ROOT,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                )
                _info("System tray icon launched")
            except Exception as e:
                _info(f"Could not launch tray icon: {e}")
        else:
            _info("pythonw.exe not found — skipping tray icon")

        print()
        print("  Services:")
        print("    Frontend:  http://localhost:5173")
        print("    Backend:   http://localhost:3001")
        print("    Backend API docs: http://localhost:3001/docs")
        print("    MongoDB:   localhost:27017")
        print("    ChromaDB:  localhost:8000")
        print()
    else:
        show_failed_container_logs(statuses)
        print()
        _err("Some containers failed to start. Check logs above for details.")
        print()
        _info("You can also run: docker compose logs --tail=50 [container_name]")
        sys.exit(1)


if __name__ == "__main__":
    main()