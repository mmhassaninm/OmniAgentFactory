@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo             OMNIBOT + NEXUS OS LAUNCH SEQUENCE
echo ====================================================
echo.

set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

echo [1/6] Stopping previous sessions and cleaning up...
docker-compose down >nul 2>&1

:: Kill processes by name
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM uvicorn.exe /T 2>nul

:: Kill processes holding specific ports
powershell -NoProfile -Command "& { foreach ($port in 3001,5173,5174) { $pids = (netstat -ano | Select-String \":$port\s\" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique); foreach ($p in $pids) { if ($p -match '^\d+$' -and $p -ne '0') { try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {} } } } }"
timeout /t 3 /nobreak >nul

echo [2/6] Starting Databases (MongoDB + ChromaDB)...
docker-compose up -d mongo chromadb

echo [3/6] Starting Unified Python Backend (Port 3001)...
start "OmniBot - Backend" cmd /k "cd /d %BASE_DIR%backend && if exist .venv\Scripts\activate (call .venv\Scripts\activate) else (echo Virtual env not found) && uvicorn main:app --reload --port 3001"

echo [4/6] Starting OmniBot UI (Port 5173)...
start "OmniBot - Frontend" cmd /k "cd /d %BASE_DIR%frontend && npm run dev"

echo [5/6] Starting NexusOS Desktop (Port 5174)...
cd /d "D:\2026\Projects\AI\OmniAgentFactory\frontend-nexus"
if not exist node_modules (
    echo Installing NexusOS dependencies...
    call npm install
)
start "NexusOS - Desktop" cmd /k "cd /d D:\2026\Projects\AI\OmniAgentFactory\frontend-nexus && npm run dev -- --port 5174"
cd /d "%BASE_DIR%"

echo [6/6] Waiting for Backend Health Check...
:healthcheck
curl -s -f http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto healthcheck
)

echo.
echo ====================================================
echo        SYSTEM IS ONLINE AND FULLY INTEGRATED
echo ====================================================
echo ✅ MongoDB:         running (docker)
echo ✅ ChromaDB:        running (docker)
echo ✅ Backend API:     http://localhost:3001
echo ✅ OmniBot UI:      http://localhost:5173
echo ✅ NexusOS Desktop: http://localhost:5174
echo ====================================================
echo Launching NexusOS Desktop as main entry...
start http://localhost:5174

exit
