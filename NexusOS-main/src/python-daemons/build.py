# PyInstaller Build Script for NexusOS Python Core
# Ensure this is executed from the /src/python-daemons/ directory

import PyInstaller.__main__
import os
import shutil

# Paths
WORK_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_SCRIPT = os.path.join(WORK_DIR, 'kernel', 'main.py')
DIST_DIR = os.path.join(WORK_DIR, 'dist')
BUILD_DIR = os.path.join(WORK_DIR, 'build')

# Clean old builds
if os.path.exists(DIST_DIR):
    shutil.rmtree(DIST_DIR)
if os.path.exists(BUILD_DIR):
    shutil.rmtree(BUILD_DIR)

print("[NexusOS] Compiling Python Core Daemon via PyInstaller...")

PyInstaller.__main__.run([
    MAIN_SCRIPT,
    '--name=main',            # Output executable name (main.exe)
    '--onefile',              # Bundle everything into a single executable
    '--noconsole',            # Suppress the terminal window on Windows (runs silently as a daemon)
    '--clean',                # Clean cache before build
    '--distpath=' + DIST_DIR, # Destination for the exe
    '--workpath=' + BUILD_DIR,# Temp build files
    '--hidden-import=vault.cryptography', # Explicitly include dynamically loaded modules
    '--hidden-import=chat.chatStreamer'
])

print("[NexusOS] Compilation Complete. Executable located at: " + os.path.join(DIST_DIR, 'main.exe'))
