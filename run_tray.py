"""
run_tray.py — Dedicated launcher for the OmniBot system tray.

Wraps all output to a log file so NO errors are silently swallowed.
Use with: pythonw run_tray.py  (no console window)
"""

import os
import sys
import traceback

# Hide subprocess console windows on Windows (0x08000000)
_CREATE_NO_WINDOW = 0x08000000

log = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tray_error.log")

try:
    # Auto-install if missing
    import importlib
    import subprocess

    for pkg, imp in [("pystray", "pystray"), ("Pillow", "PIL")]:
        try:
            importlib.import_module(imp)
        except ImportError:
            print(f"[run_tray] Installing {pkg}...")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", pkg],
                check=True,
                creationflags=_CREATE_NO_WINDOW,
            )
            print(f"[run_tray] Installed {pkg} successfully")

    from tray_manager import main
    main()

except Exception:
    with open(log, "w") as f:
        f.write(traceback.format_exc())
    sys.exit(1)