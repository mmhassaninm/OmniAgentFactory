import os
import sys
import subprocess
import time
import signal
import psutil
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as item
import winshell
from win32com.client import Dispatch

# --- Configuration ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(PROJECT_ROOT, "Project_Docs", "Logs", "omnibot.log")
SHORTCUT_NAME = "NexusOS Control Center"
SHORTCUT_PATH = os.path.join(os.environ["USERPROFILE"], "Desktop", f"{SHORTCUT_NAME}.lnk")
ICON_PATH = os.path.join(PROJECT_ROOT, "launcher_icon.png")

# Process Targets
TARGET_PORT_PYTHON = 8000
TARGET_PORT_BACKEND = 3001
TARGET_PORT_FRONTEND = 5173

# --- Utility Functions ---

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
        except:
            req = urllib.request.Request(f"{base_url}/v1/models", method="GET")
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    models = data.get("data", [])
            except: pass

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
                except: pass
        
        if action == "startup":
            embed_model = "text-embedding-bge-m3"
            log_message(f"Waking up Embedding: {embed_model}...")
            p = json.dumps({"model": embed_model, "input": "."}).encode('utf-8')
            r = urllib.request.Request(f"{base_url}/v1/embeddings", data=p, headers={'Content-Type': 'application/json'}, method="POST")
            try:
                with urllib.request.urlopen(r, timeout=10) as res: pass
            except: pass
                
    except Exception as e:
        log_message(f"Critical error during LM Studio Memory Management: {e}")


def create_default_icon():
    """Generates a simple default icon if none exists."""
    width = 64
    height = 64
    color1 = (45, 45, 45)  # Dark Gray
    color2 = (0, 255, 127) # Spring Green (OmniBot primary)
    
    image = Image.new('RGB', (width, height), color1)
    dc = ImageDraw.Draw(image)
    dc.ellipse([10, 10, width-10, height-10], fill=color2)
    image.save(ICON_PATH)
    return image

def get_icon():
    if os.path.exists(ICON_PATH):
        return Image.open(ICON_PATH)
    return create_default_icon()

def log_message(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted_msg = f"[{timestamp}] {message}\n"
    print(formatted_msg.strip())
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(formatted_msg)

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
                if "OmniBot" in cmd_str or "main:app" in cmd_str or "src/server.js" in cmd_str or "vite" in cmd_str:
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
                except:
                    pass
    
    # Unload LM Studio models to free VRAM before exit
    manage_lm_studio(action="shutdown")
    
    log_message("Cleanup complete. 100% clean state achieved.")

def launch_services():
    """Launch all OmniBot services in high-stealth mode."""
    log_message("Launching OmniBot services...")
    
    # 1. FastApi Backend
    backend_dir = os.path.join(PROJECT_ROOT, "backend")
    venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(venv_python):
        venv_python = "python" # Fallback to system python if venv not found
        
    log_message("Starting Unified Python FastAPI Backend...")
    subprocess.Popen(
        [venv_python, "main.py"],
        cwd=backend_dir,
        creationflags=subprocess.CREATE_NO_WINDOW
    )

    # 2. Frontend
    log_message("Starting Frontend Server...")
    subprocess.Popen(
        ["cmd", "/c", "npm run dev"],
        cwd=os.path.join(PROJECT_ROOT, "frontend"),
        creationflags=subprocess.CREATE_NO_WINDOW
    )

    log_message("Services launched. Waiting for initialization...")
    time.sleep(5)
    
    # Manage LM Studio VRAM
    manage_lm_studio(action="startup")
    
    # Auto-launch browser
    log_message("Opening UI...")
    subprocess.Popen(["cmd", "/c", f"start http://localhost:{TARGET_PORT_FRONTEND}"], shell=True)

def create_shortcut():
    """Creates a desktop shortcut for the launcher."""
    if not os.path.exists(SHORTCUT_PATH):
        # Remove old shortcut if it exists
        old_shortcut = os.path.join(os.environ["USERPROFILE"], "Desktop", "OmniBot.lnk")
        if os.path.exists(old_shortcut):
            try: os.remove(old_shortcut)
            except: pass

        log_message(f"Creating Desktop Shortcut: {SHORTCUT_NAME}...")
        try:
            shell = Dispatch('WScript.Shell')
            shortcut = shell.CreateShortCut(SHORTCUT_PATH)
            shortcut.Targetpath = sys.executable.replace("python.exe", "pythonw.exe")
            shortcut.Arguments = f'"{os.path.abspath(__file__)}"'
            shortcut.WorkingDirectory = PROJECT_ROOT
            shortcut.IconLocation = ICON_PATH if os.path.exists(ICON_PATH) else sys.executable
            shortcut.save()
            log_message("Shortcut created successfully.")
        except Exception as e:
            log_message(f"Failed to create shortcut: {e}")

# --- Menu Actions ---

def on_show_log(icon, item):
    log_message("Opening log file...")
    subprocess.Popen(["notepad.exe", LOG_FILE])

def on_restart(icon, item):
    log_message("--- RESTART TRIGGERED ---")
    kill_processes()
    launch_services()

def on_exit(icon, item):
    log_message("--- EXIT TRIGGERED ---")
    kill_processes()
    icon.stop()
    sys.exit(0)

# --- Main Entry ---

def main():
    log_message("OmniBot Launcher Starting...")
    
    # Run cleanup first
    kill_processes()
    
    # Ensure shortcut exists
    create_shortcut()
    
    # Start services
    launch_services()
    
    # Create System Tray Icon
    menu = (
        item('Show Log', on_show_log),
        item('Restart', on_restart),
        item('Exit', on_exit),
    )
    
    icon = pystray.Icon("OmniBot", get_icon(), "OmniBot Control Center", menu)
    
    log_message("Launcher is active in System Tray.")
    icon.run()

if __name__ == "__main__":
    main()
