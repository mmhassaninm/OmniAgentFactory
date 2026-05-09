@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo             OMNIBOT SILENT LAUNCHER
echo ====================================================
echo.

set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

if "%1"=="--public" (
    echo [OmniBot] Starting with Cloudflare tunnel...
    start "OmniBot Tunnel" cmd /c "cloudflared tunnel --url http://localhost:3001"
)

echo [1/4] Stopping previous sessions and cleaning up...
docker-compose down >nul 2>&1

taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM uvicorn.exe /T 2>nul
powershell -NoProfile -Command "& { foreach ($port in 3001,5173) { $pids = (netstat -ano | Select-String ":$port\s" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique); foreach ($p in $pids) { if ($p -match '^\d+$' -and $p -ne '0') { try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {} } } } }"
ping 127.0.0.1 -n 4 >nul

if exist "%BASE_DIR%docker-compose.yml" (
    echo [2/4] Starting MongoDB + ChromaDB...
    docker-compose up -d mongo chromadb >nul 2>&1
)

echo [3/4] Starting Launcher Silently (using pythonw.exe)...

SET PYTHONW=%CONDA_PREFIX%\pythonw.exe

IF NOT EXIST "%PYTHONW%" (
    SET PYTHONW=%LOCALAPPDATA%\miniconda3\pythonw.exe
)
IF NOT EXIST "%PYTHONW%" (
    SET PYTHONW=%USERPROFILE%\miniconda3\pythonw.exe  
)
IF NOT EXIST "%PYTHONW%" (
    REM Fallback to pythonw if pythonw not found in default conda paths
    SET PYTHONW=pythonw.exe
)

START "" "%PYTHONW%" "%BASE_DIR%launcher.py"

echo [4/4] Waiting for Backend Health Check...
:healthcheck
curl -s -f http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 (
    ping 127.0.0.1 -n 3 >nul
    goto healthcheck
)

echo.
echo ====================================================
echo    OMNIBOT IS ONLINE - SYSTEM TRAY ICON IS READY
echo ====================================================
ping 127.0.0.1 -n 4 >nul
exit
