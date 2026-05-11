@echo off
setlocal enabledelayedexpansion

REM ====================================================================
REM  OMNIBOT LAUNCHER - SIMPLIFIED VERSION
REM  This version is bulletproof - no complex PowerShell scripts
REM ====================================================================

cd /d "%~dp0"

cls
echo.
echo ====================================================================
echo   OMNIBOT LAUNCHER v2.5 (Simplified)
echo ====================================================================
echo.

REM Step 1: Kill old processes
echo [1/4] Cleaning old processes...
taskkill /F /IM python.exe /FI "COMMANDLINE eq *launcher.py*" 2>nul
taskkill /F /IM pythonw.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul

REM Step 2: Start Docker services
echo [2/4] Starting Docker services...
docker-compose up -d mongo chromadb backend frontend
echo     Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Step 3: Check if services started
echo [3/4] Checking service health...
docker-compose ps
echo.

REM Step 4: Show URLs
echo [4/4] Setup complete!
echo.
echo ====================================================================
echo   ✓ SERVICES STARTING
echo ====================================================================
echo.
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:3001
echo   API Docs:  http://localhost:3001/docs
echo.
echo   Logs:      Project_Docs/Logs/
echo.
echo   === KEEP THIS WINDOW OPEN ===
echo   Services run in Docker (background).
echo   Close this window when you're done.
echo.

REM Keep window open forever
:KEEP_OPEN
timeout /t 300 /nobreak >nul
goto KEEP_OPEN

pause
