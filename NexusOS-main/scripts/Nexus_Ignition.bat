@echo off
title NexusOS Core Engine
echo [NEXUS] Igniting the Core...

echo [NEXUS] Starting Backend Services...
start /min cmd /c "cd /d %~dp0.. && pnpm run start:backend"

echo [NEXUS] Starting Frontend UI...
start /min cmd /c "cd /d %~dp0.. && pnpm run start:desktop"

echo [NEXUS] Waiting for Vite Frontend Server to initialize...
:WAITLOOP
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 1 -UseBasicParsing; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto WAITLOOP
)

echo [NEXUS] Core Engine Ready! Launching Interface...
start http://localhost:5173
