"""
Run this ONCE to create the OmniBot desktop shortcut.
Uses pywin32 (win32com) to create a proper .lnk file.
No VBScript — pure Python.
"""
import sys
import os
from pathlib import Path

def create_shortcut():
    try:
        import win32com.client
    except ImportError:
        print("Installing pywin32...")
        os.system(f"{sys.executable} -m pip install pywin32")
        import win32com.client
    
    # Find pythonw.exe (silent Python — no console window)
    pythonw = Path(sys.executable).parent / "pythonw.exe"
    if not pythonw.exists():
        # Try conda/miniconda paths
        pythonw = Path(sys.executable).with_name("pythonw.exe")
    
    project_root = Path(__file__).parent.parent
    launcher = project_root / "launcher.py"
    
    # Find icon
    icon_candidates = [
        project_root / "assets" / "icon.ico",
        project_root / "frontend" / "public" / "favicon.ico",
    ]
    icon_path = next((str(p) for p in icon_candidates if p.exists()), str(pythonw))
    
    # Desktop path
    desktop = Path.home() / "Desktop"
    shortcut_path = desktop / "OmniBot Factory.lnk"
    
    # Create shortcut
    shell = win32com.client.Dispatch("WScript.Shell")
    shortcut = shell.CreateShortCut(str(shortcut_path))
    shortcut.Targetpath = str(pythonw)
    shortcut.Arguments = f'"{launcher}"'
    shortcut.WorkingDirectory = str(project_root)
    shortcut.IconLocation = icon_path
    shortcut.Description = "OmniBot Agent Factory"
    shortcut.WindowStyle = 7  # 7 = Minimized (no window flash)
    shortcut.save()
    
    print(f"[OK] Shortcut created: {shortcut_path}")
    print(f"[OK] Target: {pythonw} \"{launcher}\"")
    print(f"[OK] Icon: {icon_path}")
    print()
    print("Double-click 'OmniBot Factory' on your desktop to start.")
    print("No black windows will appear. Use System Tray to exit.")

if __name__ == "__main__":
    create_shortcut()
