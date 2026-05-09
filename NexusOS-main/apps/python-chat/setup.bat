@echo off
echo [NexusOS] Setting up Python Environment for apps/python-chat
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    pause
    exit /b 1
)

if not exist ".venv" (
    echo [NexusOS] Creating virtual environment .venv
    python -m venv .venv
) else (
    echo [NexusOS] Virtual environment already exists.
)

echo [NexusOS] Activating virtual environment and installing dependencies
call .venv\Scripts\activate.bat

python -m pip install --upgrade pip

if exist "requirements.txt" (
    echo [NexusOS] Installing packages from requirements.txt
    pip install -r requirements.txt
) else (
    echo [WARNING] requirements.txt not found! Skipping pip install.
)

echo [NexusOS] Setup complete!
pause