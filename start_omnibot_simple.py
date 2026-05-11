#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple OmniBot Launcher
- No complex logic
- Just start Docker services
- Keep window open
"""
import subprocess
import time
import os
import sys

# Fix encoding issues
import io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def run(cmd, shell=True, show_output=True):
    """Run command and optionally show output"""
    print(f"\n[Running] {cmd}\n")
    result = subprocess.run(cmd, shell=shell, capture_output=not show_output)
    return result.returncode == 0

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    print("\n" + "="*60)
    print("  OMNIBOT LAUNCHER - Python Version")
    print("="*60 + "\n")

    # Step 1: Kill old processes
    print("[1/3] Cleaning old processes...")
    run("taskkill /F /IM python.exe /FI \"COMMANDLINE eq *launcher.py*\" 2>nul", show_output=False)
    run("taskkill /F /IM node.exe 2>nul", show_output=False)
    time.sleep(1)

    # Step 2: Start services
    print("[2/3] Starting Docker services...")
    success = run("docker-compose up -d mongo chromadb backend frontend")

    if not success:
        print("\n❌ Docker failed!")
        print("\n   Make sure Docker Desktop is running:")
        print("   - Open Docker Desktop app")
        print("   - Wait for whale icon")
        print("   - Then run this script again")
        input("\n   Press Enter to exit...")
        sys.exit(1)

    print("\n   Waiting 10 seconds for services to start...")
    time.sleep(10)

    # Step 3: Show status
    print("\n[3/3] Checking services...")
    run("docker-compose ps")

    print("\n" + "="*60)
    print("  ✓ SERVICES STARTED")
    print("="*60)
    print("""
  🌐 Frontend:    http://localhost:5173
  ⚙️  Backend:     http://localhost:3001
  📚 API Docs:    http://localhost:3001/docs

  Services running in Docker (background)
  Keep this window open while using OmniBot

""")

    # Keep window open
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n\nShutting down... Goodbye!")
        sys.exit(0)

if __name__ == "__main__":
    main()
