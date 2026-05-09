@echo off
setlocal
echo ====================================================
echo                 OMNIBOT LAUNCH SEQUENCE
echo ====================================================

REM Set absolute base path from bat location
set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

echo [OmniBot] Killing existing server processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 :5173 :27017 :8000"') do (
    taskkill /F /PID %%a 2>nul
)
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM node.exe /T 2>nul
echo [OmniBot] All previous processes terminated.
timeout /t 2 /nobreak >nul
echo [OmniBot] Starting fresh session...

:: Kill any processes on OmniBot ports before starting fresh
echo [0/2] Clearing ports 3001, 5173, 5174, 5175...
powershell -NoProfile -Command "& { foreach ($port in 3001,5173,5174,5175) { $pids = (netstat -ano | Select-String \":$port\s\" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique); foreach ($p in $pids) { if ($p -match '^\d+$' -and $p -ne '0') { try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-Host \"Killed PID $p (port $port)\" } catch { Write-Host \"PID $p already gone\" } } } } }"
timeout /t 2 /nobreak >nul

:: Start Unified Python Backend (Port 3001) — absolute path via %BASE_DIR%
echo [1/2] Starting Unified Python Backend (FastAPI)...
start "OmniBot - Backend" cmd /k "cd /d %BASE_DIR%backend && if exist .venv\Scripts\activate (call .venv\Scripts\activate) else (echo Virtual env not found) && uvicorn main:app --reload --port 3001"

:: Start React Frontend — absolute path via %BASE_DIR%
echo [2/2] Starting Frontend Server...
start "OmniBot - Frontend" cmd /k "cd /d %BASE_DIR%frontend && npm run dev"

:: Wait for services to spin up
echo Waiting for services to initialize...
timeout /t 5 /nobreak >nul

:: Launch Default Browser to Frontend
echo Launching OmniBot UI in default browser...
start http://localhost:5173

echo ====================================================
echo        OMNIBOT SYSTEM IS ONLINE AND ACTIVE
echo ====================================================
exit
