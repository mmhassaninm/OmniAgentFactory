"""
tray_manager.py — OmniBot System Tray Manager

Windows system tray icon monitoring Docker container health.
Color-coded icon: GREEN (all 4 healthy), ORANGE (partial), RED (all down).
All icons generated programmatically via Pillow — no external files needed.

Usage: pythonw run_tray.py  (use the wrapper, not this file directly)

CRITICAL: Every subprocess.run() uses CREATE_NO_WINDOW to prevent
flashing black CMD windows every 10 seconds on Windows.
"""

import pystray
from pystray import MenuItem as item
from PIL import Image, ImageDraw
import subprocess
import threading
import webbrowser
import time
import sys
import os

# Hide all subprocess console windows on Windows (0x08000000)
_CREATE_NO_WINDOW = 0x08000000

# ── Icon Generator (no external files needed) ──────────────────
def make_icon(color=(0, 200, 0)):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([4, 4, 60, 60], fill=color)
    return img

# ── Container Health Check ──────────────────────────────────────
CONTAINERS = [
    "omnibot-backend",
    "omnibot-frontend",
    "omnibot-mongo",
    "omnibot-chroma",
]

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def get_running_containers():
    try:
        r = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=15,
            creationflags=_CREATE_NO_WINDOW,
        )
        if r.returncode == 0:
            return [n.strip() for n in r.stdout.strip().splitlines() if n.strip()]
        return []
    except Exception:
        return []


def get_container_status_text():
    """Return human-readable status string for the tooltip."""
    running = get_running_containers()
    count = sum(1 for c in CONTAINERS if c in running)
    if count == len(CONTAINERS):
        return "All 4 containers healthy"
    elif count > 0:
        return f"{count}/{len(CONTAINERS)} containers running"
    else:
        return "No containers running"


def get_icon_color():
    running = get_running_containers()
    count = sum(1 for c in CONTAINERS if c in running)
    if count == len(CONTAINERS):
        return (0, 200, 0)      # green — all healthy
    elif count > 0:
        return (255, 165, 0)    # orange — partial
    else:
        return (200, 0, 0)      # red — all down


# ── Menu Actions ───────────────────────────────────────────────
def open_frontend(icon, menu_item):
    webbrowser.open("http://localhost:5173")


def open_backend(icon, menu_item):
    webbrowser.open("http://localhost:3001/docs")


def view_status(icon, menu_item):
    """Show a Windows notification with current container statuses."""
    running = get_running_containers()
    lines = []
    for c in CONTAINERS:
        if c in running:
            lines.append(f"✓ {c}")
        else:
            lines.append(f"✗ {c}")
    msg = "\n".join(lines)
    try:
        icon.notify(msg, "OmniBot Container Status")
    except Exception:
        pass


def restart_project(icon, menu_item):
    threading.Thread(
        target=lambda: subprocess.run(
            ["docker-compose", "restart"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
            creationflags=_CREATE_NO_WINDOW,
        ),
        daemon=True
    ).start()
    try:
        icon.notify("Restarting all containers...", "OmniBot")
    except Exception:
        pass


def stop_project(icon, menu_item):
    """Run docker-compose down, then remove the tray icon."""
    try:
        subprocess.run(
            ["docker-compose", "down"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=_CREATE_NO_WINDOW,
        )
        try:
            icon.notify("All containers stopped.", "OmniBot")
        except Exception:
            pass
    except Exception:
        pass
    # Stop the icon after a short delay
    def _stop():
        time.sleep(1.5)
        icon.stop()
    threading.Thread(target=_stop, daemon=True).start()


def exit_tray(icon, menu_item):
    """Remove tray icon only — keep containers running."""
    icon.stop()


# ── Update icon color every 10 seconds ─────────────────────────
def updater(icon):
    while True:
        time.sleep(10)
        try:
            color = get_icon_color()
            icon.icon = make_icon(color)
            status_text = get_container_status_text()
            icon.title = f"OmniBot — {status_text}"
        except Exception:
            pass


# ── Main Entry Point ───────────────────────────────────────────
def main():
    color = get_icon_color()
    image = make_icon(color)

    menu = pystray.Menu(
        item("OmniBot Tray", None, enabled=False),
        pystray.Menu.SEPARATOR,
        item("🌐 Open OmniBot",        open_frontend, default=True),
        item("⚙️  Backend API Docs",    open_backend),
        pystray.Menu.SEPARATOR,
        item("📋 View Status",         view_status),
        pystray.Menu.SEPARATOR,
        item("🔄 Restart Project",     restart_project),
        item("🛑 Stop Project",        stop_project),
        pystray.Menu.SEPARATOR,
        item("❌ Exit Tray",           exit_tray),
    )

    icon = pystray.Icon(
        name="OmniBot",
        icon=image,
        title="OmniBot — Starting...",
        menu=menu,
    )

    # Start background updater thread
    t = threading.Thread(target=updater, args=(icon,), daemon=True)
    t.start()

    # THIS IS THE KEY LINE — run() must be called on the main thread
    icon.run()


if __name__ == "__main__":
    main()