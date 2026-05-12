import sys
import os
import traceback
from datetime import datetime
from pathlib import Path

# --- Global Crash Handler (MUST be before anything else) ---
def _fatal(exc_type, exc_value, exc_tb):
    """Catch ALL unhandled exceptions, log them, and keep window open."""
    msg = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
    root = str(Path(__file__).parent.resolve())
    log_dir = Path(root) / "Project_Docs" / "Logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    try:
        (log_dir / "fatal_error.log").write_text(
            f"[{datetime.now()}] CRASH:\n{msg}", encoding="utf-8"
        )
    except:
        pass
    try:
        sys.__stderr__.write(f"\n{'='*50}\nCRASH DETECTED!\n{'='*50}\n{msg}\n")
    except:
        pass
    try:
        input("\nPress Enter to exit...")
    except:
        pass
    sys.exit(1)

sys.excepthook = _fatal

# --- Silent Redirection for pythonw.exe ---
PROJECT_ROOT = str(Path(__file__).parent.resolve())
LOG_DIR = Path(PROJECT_ROOT) / "Project_Docs" / "Logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Truncate or rotate log files if they exceed 50 MB (52,428,800 bytes)
for log_name in ["omnibot.log", "omnibot_errors.log"]:
    log_path = LOG_DIR / log_name
    if log_path.exists() and log_path.stat().st_size > 50 * 1024 * 1024:
        try:
            backup_path = LOG_DIR / f"{log_name}.old"
            if backup_path.exists():
                backup_path.unlink()
            log_path.rename(backup_path)
        except Exception:
            try:
                log_path.write_text("", encoding="utf-8")
            except Exception:
                pass

# Redirect stdout and stderr to log files (REQUIRED for pythonw.exe)
# Must happen BEFORE any other import that might print
_log_file = open(LOG_DIR / "omnibot.log", "a", encoding="utf-8", buffering=1)
_err_file = open(LOG_DIR / "omnibot_errors.log", "a", encoding="utf-8", buffering=1)
sys.stdout = _log_file
sys.stderr = _err_file

# --- Other Imports ---
import subprocess
import time
import signal
import psutil
import logging
from datetime import datetime
from PIL import Image, ImageDraw
import pystray
import threading

# Configure Standard Logging
logging.basicConfig(
    filename=str(LOG_DIR / "omnibot.log"),
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    encoding="utf-8"
)
log = logging.getLogger("OmniBot")

def log_message(msg: str):
    log.info(msg)
    try:
        _log_file.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        _log_file.flush()
    except Exception:
        pass

# --- Configuration ---
SHORTCUT_NAME = "OmniBot Factory"
SHORTCUT_PATH = os.path.join(os.environ["USERPROFILE"], "Desktop", f"{SHORTCUT_NAME}.lnk")
ICON_PATH = os.path.join(PROJECT_ROOT, "launcher_icon.png")

# Process Targets
TARGET_PORT_BACKEND = 3001
TARGET_PORT_FRONTEND = 5173

# Global Processes List and Tray Icon
_processes: list[subprocess.Popen] = []
_tray_icon = None

# --- LM Studio VRAM Management ---
def manage_lm_studio(action="startup"):
    """
    Dynamically load/unload models in LM Studio to manage VRAM.
    action: "startup" (unload all, load embedding), "shutdown" (unload all)
    """
    log_message(f"--- LM Studio VRAM Management: {action.upper()} ---")
    import urllib.request
    import json
    
    base_url = "http://127.0.0.1:1234"
    
    try:
        # 1. Fetch ACTUALLY loaded models
        models = []
        try:
            req = urllib.request.Request(f"{base_url}/api/v0/models", method="GET")
            with urllib.request.urlopen(req, timeout=5) as response:
                m_data = json.loads(response.read().decode('utf-8'))
                models = m_data if isinstance(m_data, list) else m_data.get("data", [])
        except Exception:
            req = urllib.request.Request(f"{base_url}/v1/models", method="GET")
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    models = data.get("data", [])
            except Exception: pass

        loaded_ids = [m['id'] for m in models]
        log_message(f"Current VRAM: {loaded_ids}")
        
        # 2. Unload
        for model_id in loaded_ids:
            for endpoint in ["/api/v0/model/unload", "/v1/models/unload"]:
                try:
                    p = json.dumps({"model": model_id}).encode('utf-8')
                    r = urllib.request.Request(base_url + endpoint, data=p, headers={'Content-Type': 'application/json'}, method="POST")
                    with urllib.request.urlopen(r, timeout=3) as res:
                        if res.status == 200: break
                except Exception: pass
        
        if action == "startup":
            embed_model = "text-embedding-bge-m3"
            log_message(f"Waking up Embedding: {embed_model}...")
            p = json.dumps({"model": embed_model, "input": "."}).encode('utf-8')
            r = urllib.request.Request(f"{base_url}/v1/embeddings", data=p, headers={'Content-Type': 'application/json'}, method="POST")
            try:
                with urllib.request.urlopen(r, timeout=10) as res: pass
            except Exception: pass
                
    except Exception as e:
        log_message(f"Critical error during LM Studio Memory Management: {e}")

# --- Process Lifecycle Management ---
DETACHED_FLAGS = 0
if sys.platform == "win32":
    DETACHED_FLAGS = subprocess.CREATE_NO_WINDOW

_LOG_MAX_BYTES = 20 * 1024 * 1024  # 20 MB per log file

def _rotate_log(path: str):
    """Truncate log file if it exceeds the size limit."""
    try:
        if os.path.exists(path) and os.path.getsize(path) > _LOG_MAX_BYTES:
            with open(path, "w", encoding="utf-8") as f:
                f.write(f"[{datetime.now().isoformat()}] Log rotated (exceeded {_LOG_MAX_BYTES // (1024*1024)} MB)\n")
            log_message(f"[LAUNCHER] Rotated log: {os.path.basename(path)}")
    except Exception:
        pass

def launch_process(cmd: list, cwd: str, out_log: str, err_log: str, shell: bool = False):
    _rotate_log(out_log)
    _rotate_log(err_log)
    out = open(out_log, "a", encoding="utf-8")
    err = open(err_log, "a", encoding="utf-8")
    return subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=out,
        stderr=err,
        creationflags=DETACHED_FLAGS,  # ← NO black window
        shell=shell,
        close_fds=True
    )

def kill_processes(skip_if_already_done=False):
    """Ruthlessly terminates all project-related processes."""
    if skip_if_already_done:
        log_message("[CLEANUP] Skipping redundant process termination (already done by launcher)")
        return
        
    log_message("Initiating process termination...")
    
    # Names of processes to target (be specific to avoid killing unrelated processes)
    target_names = ["node.exe", "python.exe", "pythonw.exe"]
    current_pid = os.getpid()
    
    # OPTIMIZATION: Use a set to track pids to avoid duplicate kills
    killed_pids = set()
    
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if proc.info['pid'] == current_pid or proc.info['pid'] in killed_pids:
                    continue
                    
                name = proc.info['name'].lower()
                cmdline = proc.info['cmdline']
                
                if name in target_names:
                    # Check if the process is related to OmniBot
                    cmd_str = " ".join(cmdline) if cmdline else ""
                    if "OmniBot" in cmd_str or "main:app" in cmd_str or "vite" in cmd_str or "launcher.py" in cmd_str or "src/server.js" in cmd_str:
                        log_message(f"Killing PID {proc.info['pid']} ({name})")
                        proc.kill()
                        killed_pids.add(proc.info['pid'])
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
    except Exception as e:
        log_message(f"[CLEANUP] Error during process iteration: {e}")
    
    # Optionally clean up specific ports (faster than full process_iter if we already did it)
    # Skipped if already_done_by_launcher flag is set
    
    # DO NOT call manage_lm_studio here — it takes too long and blocks startup
    log_message("[CLEANUP] Process termination complete")

def wait_for_service(name: str, url: str, timeout: int = 60) -> bool:
    """Wait until a service is actually responding, not just launched."""
    import urllib.request
    start = time.time()
    attempt = 0
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "OmniBot/1.0"})
            with urllib.request.urlopen(req, timeout=1) as response:
                if response.status in (200, 302):
                    log_message(f"✓ {name} is ready (after {int(time.time() - start)}s)")
                    return True
        except Exception:
            pass  # Connection refused, timeout, or other network errors — service not ready
        
        # Log less frequently (every 3 attempts = every 1.5 seconds)
        attempt += 1
        if attempt % 3 == 0:
            elapsed = int(time.time() - start)
            log_message(f"  Waiting for {name}... ({elapsed}s)")
        
        time.sleep(0.5)  # Check more frequently (every 500ms)
    
    log_message(f"⚠️  ERROR: {name} failed to start within {timeout}s")
    return False

def launch_backend():
    backend_dir = os.path.join(PROJECT_ROOT, "backend")
    venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(venv_python):
        # Resolve to currently running python interpreter (highly robust for Conda/Miniconda)
        current_python = sys.executable
        if "pythonw.exe" in current_python.lower():
            current_python = current_python.lower().replace("pythonw.exe", "python.exe")
        venv_python = current_python
    
    log_message("Starting Unified Python FastAPI Backend...")
    cmd = [venv_python, "-m", "uvicorn", "main:app", "--port", "3001", "--host", "0.0.0.0"]
    out_log = os.path.join(PROJECT_ROOT, "backend_out.log")
    err_log = os.path.join(PROJECT_ROOT, "backend_err.log")
    return launch_process(cmd, backend_dir, out_log, err_log)

def launch_frontend():
    log_message("Starting Frontend Server...")
    cmd = ["npm", "run", "dev"]
    cwd = os.path.join(PROJECT_ROOT, "frontend")
    out_log = os.path.join(PROJECT_ROOT, "frontend_out.log")
    err_log = os.path.join(PROJECT_ROOT, "frontend_err.log")
    return launch_process(cmd, cwd, out_log, err_log, shell=True)

# --- System Tray Implementation ---
def _create_tray_image() -> Image.Image:
    """Create tray icon — use existing .ico if available, else generate"""
    icon_paths = [
        Path(PROJECT_ROOT) / "assets" / "icon.ico",
        Path(PROJECT_ROOT) / "assets" / "icon.png", 
        Path(PROJECT_ROOT) / "frontend" / "public" / "favicon.ico",
        Path(PROJECT_ROOT) / "launcher_icon.png"
    ]
    for path in icon_paths:
        if path.exists():
            try:
                return Image.open(str(path)).resize((64, 64))
            except Exception:
                pass
    
    # Generate a simple icon if none found
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([4, 4, 60, 60], fill=(99, 102, 241))  # indigo circle
    draw.text((18, 18), "OB", fill="white")
    return img

def _graceful_shutdown(icon, item=None):
    """Called ONLY when user clicks Exit in tray menu."""
    log_message("[TRAY] Exit requested — shutting down all services...")
    
    # Stop tray icon first
    icon.stop()
    
    # Kill all subprocesses cleanly
    for proc in _processes:
        try:
            if proc.poll() is None:  # still running
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    log_message(f"[TRAY] Force killed PID {proc.pid}")
        except Exception as e:
            log_message(f"[TRAY] Error stopping process: {e}")
            
    # Run absolute ruthless cleanup
    try:
        kill_processes()
    except Exception as e:
        log_message(f"[TRAY] Error during final process cleanup: {e}")
    
    log_message("[TRAY] All services stopped. Goodbye.")
    _log_file.flush()
    _log_file.close()
    
    # Exit the application
    os._exit(0)

def _open_browser(url: str):
    import webbrowser
    webbrowser.open(url)

def _open_dashboard(icon, item):
    _open_browser("http://localhost:5173/factory")

def _open_shopify_factory(icon, item):
    _open_browser("http://localhost:5173/shopify")

def _open_settings(icon, item):
    _open_browser("http://localhost:5173/settings")

def _open_dev_loop(icon, item):
    _open_browser("http://localhost:5173/dev-loop")

def _open_money_agent(icon, item):
    _open_browser("http://localhost:5173/money-agent")

def _open_models_hub(icon, item):
    _open_browser("http://localhost:5173/models")

def _open_evolution(icon, item):
    _open_browser("http://localhost:5173/evolution")

def _open_key_vault(icon, item):
    _open_browser("http://localhost:5173/settings/keys")

def _start_shopify_swarm(icon, item):
    """Start the Shopify theme generation swarm via API."""
    import urllib.request
    import json
    try:
        req = urllib.request.Request(
            "http://localhost:3001/api/shopify/start",
            data=json.dumps({}).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                icon.notify("Shopify Swarm Started", "OmniBot")
                log_message("[TRAY] Shopify Swarm started via API")
            else:
                icon.notify("Failed to start Shopify Swarm", "OmniBot")
    except Exception as e:
        icon.notify(f"Could not reach backend — is it running?", "OmniBot")
        log_message(f"[TRAY] Error starting Shopify Swarm: {e}")

def _show_status(icon, item):
    """Show backend + frontend health in a notification."""
    import urllib.request
    running_procs = sum(1 for p in _processes if p.poll() is None)

    backend_ok = False
    try:
        req = urllib.request.Request("http://localhost:3001/api/health", headers={"User-Agent": "OmniBot-Tray/1.0"})
        with urllib.request.urlopen(req, timeout=3) as r:
            backend_ok = r.status == 200
    except Exception:
        pass

    frontend_ok = False
    try:
        req = urllib.request.Request("http://localhost:5173", headers={"User-Agent": "OmniBot-Tray/1.0"})
        with urllib.request.urlopen(req, timeout=3) as r:
            frontend_ok = r.status in (200, 302)
    except Exception:
        pass

    lines = [
        f"Processes: {running_procs}/{len(_processes)} running",
        f"Backend (3001): {'✓ Online' if backend_ok else '✗ Offline'}",
        f"Frontend (5173): {'✓ Online' if frontend_ok else '✗ Offline'}",
    ]
    icon.notify("\n".join(lines), "OmniBot Status")
    log_message(f"[TRAY] Status check: backend={'ok' if backend_ok else 'down'}, frontend={'ok' if frontend_ok else 'down'}")

def _restart_backend(icon, item):
    """Terminate and relaunch only the backend process."""
    log_message("[TRAY] Restarting backend...")
    if _processes:
        try:
            backend_proc = _processes[0]
            if backend_proc.poll() is None:
                backend_proc.terminate()
                try:
                    backend_proc.wait(timeout=5)
                except Exception:
                    backend_proc.kill()
        except Exception as e:
            log_message(f"[TRAY] Error stopping backend: {e}")
        _processes[0] = launch_backend()
        icon.notify("Backend restarting — wait ~10s then refresh browser", "OmniBot")
        log_message("[TRAY] Backend restarted (new PID: %s)" % _processes[0].pid)
    else:
        icon.notify("No managed processes to restart", "OmniBot")

def _open_logs_folder(icon, item):
    """Open project logs folder in Windows Explorer."""
    import subprocess
    logs_dir = os.path.join(PROJECT_ROOT, "Project_Docs", "Logs")
    os.makedirs(logs_dir, exist_ok=True)
    subprocess.Popen(["explorer", logs_dir])
    log_message("[TRAY] Opened logs folder")

def _open_project_folder(icon, item):
    """Open project root in Windows Explorer."""
    import subprocess
    subprocess.Popen(["explorer", PROJECT_ROOT])

def start_tray_icon():
    """Start system tray icon in background thread."""
    global _tray_icon

    image = _create_tray_image()

    menu = pystray.Menu(
        pystray.MenuItem("OmniBot Factory", None, enabled=False),
        pystray.Menu.SEPARATOR,

        # ── Quick navigation ───────────────────────────────────────────
        pystray.MenuItem("📊 Factory Dashboard", _open_dashboard, default=True),
        pystray.MenuItem("🏪 Shopify Factory", _open_shopify_factory),
        pystray.MenuItem("💰 Money Agent", _open_money_agent),
        pystray.MenuItem("🔁 Dev Loop", _open_dev_loop),
        pystray.MenuItem("🧬 Evolution", _open_evolution),
        pystray.MenuItem("🤖 Models Hub", _open_models_hub),
        pystray.MenuItem("🔐 Key Vault", _open_key_vault),
        pystray.MenuItem("⚙️ Settings", _open_settings),
        pystray.Menu.SEPARATOR,

        # ── Actions ────────────────────────────────────────────────────
        pystray.MenuItem("▶️ Start Shopify Swarm", _start_shopify_swarm),
        pystray.MenuItem("🔄 Restart Backend", _restart_backend),
        pystray.Menu.SEPARATOR,

        # ── System ─────────────────────────────────────────────────────
        pystray.MenuItem("📋 Show Status", _show_status),
        pystray.MenuItem("📁 Open Logs Folder", _open_logs_folder),
        pystray.MenuItem("📂 Open Project Folder", _open_project_folder),
        pystray.Menu.SEPARATOR,

        pystray.MenuItem("Exit", _graceful_shutdown),
    )

    _tray_icon = pystray.Icon(
        name="OmniBot",
        icon=image,
        title="OmniBot Factory — Running",
        menu=menu
    )

    # Run tray in its own thread — NEVER block main thread
    tray_thread = threading.Thread(target=_tray_icon.run, daemon=False)
    tray_thread.start()
    log_message("[TRAY] System tray icon started")
    return tray_thread

# --- Main Entry ---
def main(skip_kill_cleanup=False):
    log_message("="*50)
    log_message("OmniBot Factory Starting (Silent Mode)")
    log_message("="*50)
    
    # 1. Kill any existing processes (skip if already done by launcher)
    kill_processes(skip_if_already_done=skip_kill_cleanup)
    
    # 2. Launch backend and frontend (silent, no console window)
    log_message("Launching Backend...")
    backend_proc = launch_backend()
    log_message(f"Backend PID: {backend_proc.pid}")
    
    log_message("Launching Frontend...")
    frontend_proc = launch_frontend()
    log_message(f"Frontend PID: {frontend_proc.pid}")
    
    _processes.extend([backend_proc, frontend_proc])
    
    # 3. Wait for services to be ready
    log_message("Waiting for services (max 60 seconds)...")
    backend_ready = wait_for_service("Backend", "http://localhost:3001/api/health", timeout=60)
    frontend_ready = wait_for_service("Frontend", "http://localhost:5173", timeout=60)
    
    # 4. Start system tray (user's only way to interact/exit)
    log_message("Starting system tray icon...")
    start_tray_icon()
    
    # 5. Open browser if both services ready
    if backend_ready and frontend_ready:
        log_message("All services ready!")
        import webbrowser
        webbrowser.open("http://localhost:5173/shopify")
        log_message("Shopify Factory dashboard opened")
    else:
        log_message("⚠️  Some services failed to start — check logs")
    
    # 6. Keep main thread alive (monitor processes)
    log_message("[MONITOR] Health monitor loop started")
    while True:
        try:
            time.sleep(30)
            
            # Check if processes are still alive, restart if died
            for i, proc in enumerate(_processes):
                if proc.poll() is not None:  # process died
                    log_message(f"[MONITOR] Process with PID {proc.pid} died — restarting...")
                    if i == 0:  # backend
                        _processes[0] = launch_backend()
                    elif i == 1:  # frontend
                        _processes[1] = launch_frontend()
        except Exception as e:
            log_message(f"[MONITOR] Exception in health monitor loop: {e}")
if __name__ == "__main__":
    # Check for --skip-kill flag (called from start_omnibot.bat which already cleaned up)
    skip_kill = "--skip-kill" in sys.argv
    main(skip_kill_cleanup=skip_kill)
