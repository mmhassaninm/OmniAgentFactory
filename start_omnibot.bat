@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo             OMNIBOT LAUNCHER
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
powershell -NoProfile -Command "& { foreach ($port in 3001,5173,5174) { $pids = (netstat -ano | Select-String ":$port\s" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique); foreach ($p in $pids) { if ($p -match '^\d+$' -and $p -ne '0') { try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {} } } } }"
timeout /t 3 /nobreak >nul

if exist "%BASE_DIR%docker-compose.yml" (
    echo [2/4] Starting MongoDB + ChromaDB...
    docker-compose up -d mongo chromadb >nul 2>&1
)

echo [3/4] Starting Launcher...
start "OmniBot Launcher" cmd /k "cd /d %BASE_DIR% && python launcher.py"

echo [4/4] Waiting for Backend Health Check...
:healthcheck
curl -s -f http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto healthcheck
)

echo.
echo ====================================================
echo        OMNIBOT IS ONLINE

echo ====================================================
exit
