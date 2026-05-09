import sys
import os
from pathlib import Path

# --- Silent Redirection for pythonw.exe ---
PROJECT_ROOT = str(Path(__file__).parent.resolve())
LOG_DIR = Path(PROJECT_ROOT) / "Project_Docs" / "Logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

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

def launch_process(cmd: list, cwd: str, out_log: str, err_log: str, shell: bool = False):
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

def kill_processes():
    """Ruthlessly terminates all project-related processes."""
    log_message("Initiating ruthless process termination...")
    
    # Names of processes to target
    target_names = ["node.exe", "python.exe", "pythonw.exe", "cmd.exe", "powershell.exe"]
    current_pid = os.getpid()
    
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if proc.info['pid'] == current_pid:
                continue
                
            name = proc.info['name'].lower()
            cmdline = proc.info['cmdline']
            
            if name in target_names:
                # Check if the process is related to OmniBot
                cmd_str = " ".join(cmdline) if cmdline else ""
                if "OmniBot" in cmd_str or "main:app" in cmd_str or "src/server.js" in cmd_str or "vite" in cmd_str or "launcher.py" in cmd_str:
                    log_message(f"Killing process {proc.info['pid']} ({name})")
                    proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    
    # Also clean up ports specifically if they are still bound
    for port in [TARGET_PORT_BACKEND, TARGET_PORT_FRONTEND]:
        for conn in psutil.net_connections():
            if conn.laddr.port == port:
                try:
                    p = psutil.Process(conn.pid)
                    log_message(f"Killing process {conn.pid} bound to port {port}")
                    p.kill()
                except Exception:
                    pass
    
    # Unload LM Studio models to free VRAM before exit
    try:
        manage_lm_studio(action="shutdown")
    except Exception:
        pass
    
    log_message("Cleanup complete. 100% clean state achieved.")

def wait_for_service(name: str, url: str, timeout: int = 60) -> bool:
    """Wait until a service is actually responding, not just launched."""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200 or response.status == 302:
                    log_message(f"{name} is ready [OK]")
                    return True
        except Exception:
            log_message(f"Waiting for {name}... ({int(time.time() - start)}s)")
            time.sleep(2)
    log_message(f"ERROR: {name} failed to start within {timeout}s")
    return False

def launch_backend():
    backend_dir = os.path.join(PROJECT_ROOT, "backend")
    venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(venv_python):
        venv_python = "python" # Fallback to system python
    
    log_message("Starting Unified Python FastAPI Backend...")
    cmd = [venv_python, "-m", "uvicorn", "main:app", "--port", "3001", "--host", "127.0.0.1"]
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

def _open_dashboard(icon, item):
    """Open browser to dashboard."""
    import webbrowser
    webbrowser.open("http://localhost:5173/factory")

def _show_status(icon, item):
    """Show current status in a notification."""
    running = sum(1 for p in _processes if p.poll() is None)
    icon.notify(
        f"OmniBot Factory\n{running}/{len(_processes)} services running",
        "Status"
    )

def start_tray_icon():
    """Start system tray icon in background thread."""
    global _tray_icon
    
    image = _create_tray_image()
    
    menu = pystray.Menu(
        pystray.MenuItem("OmniBot Factory", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open Dashboard", _open_dashboard, default=True),
        pystray.MenuItem("Show Status", _show_status),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Exit", _graceful_shutdown),
    )
    
    _tray_icon = pystray.Icon(
        name="OmniBot",
        icon=image,
        title="OmniBot Factory",
        menu=menu
    )
    
    # Run tray in its own thread — NEVER block main thread
    tray_thread = threading.Thread(target=_tray_icon.run, daemon=False)
    tray_thread.start()
    log_message("[TRAY] System tray icon started")
    return tray_thread

# --- Main Entry ---
def main():
    log_message("="*50)
    log_message("OmniBot Factory Starting (Silent Mode)")
    log_message("="*50)
    
    # 1. Kill any existing processes on ports 3001 and 5173
    kill_processes()
    
    # 2. Launch backend and frontend (silent, no console window)
    backend_proc = launch_backend()
    frontend_proc = launch_frontend()
    _processes.extend([backend_proc, frontend_proc])
    
    # 3. Wait for services to be ready
    backend_ready = wait_for_service("Backend", "http://localhost:3001/api/health", timeout=60)
    frontend_ready = wait_for_service("Frontend", "http://localhost:5173", timeout=60)
    
    # 4. Start system tray (user's only way to interact/exit)
    start_tray_icon()
    
    # 5. Open browser if both services ready
    if backend_ready and frontend_ready:
        # Manage LM Studio VRAM
        try:
            manage_lm_studio(action="startup")
        except Exception:
            pass
        import webbrowser
        webbrowser.open("http://localhost:5173/factory")
        log_message("All services ready — Dashboard opened")
    else:
        log_message("Some services failed to start — check logs")
    
    # 6. Keep main thread alive (monitor processes)
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
    main()
