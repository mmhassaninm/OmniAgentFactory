@echo off
setlocal
color 0B
title NexusOS Tunneled Backend

echo ===================================================
echo   Starting NexusOS Cloud Backend (Local Node.js)
echo ===================================================
cd /d "%~dp0\..\backend_cloud"

:: Ensure dependencies are installed (optional but good for safety)
if not exist "node_modules" (
    echo Installing dependencies...
    cmd /c "npm install"
)

:: Start the Node.js server in the background
echo Starting Express Server on port 3000...
start "NexusOS Node Server" cmd /c "npm run start"

:: Give the server a moment to spin up before starting the tunnel
timeout /t 5 /nobreak > nul

echo ===================================================
echo   Initiating Cloudflare Tunnel
echo ===================================================
echo Make sure cloudflared is installed globally!
echo Exposing http://localhost:3000 to the world...

cloudflared tunnel --url http://localhost:3000

:: If cloudflared crashes or is closed
echo Cloudflare Tunnel closed.
pause
