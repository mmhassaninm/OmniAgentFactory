@echo off
setlocal
echo ========================================================
echo nexusOS [WEB] - DEEP CLEAN INITIALIZATION
echo ========================================================
echo.

:: 1. Process Cleanup (Error Suppressed, Excludes Aegis Overlord)
echo [*] Terminating lingering processes...
wmic process where "name='node.exe' and not commandline like '%%aegis-overlord.js%%'" Call Terminate >nul 2>&1
taskkill /F /IM electron.exe /T >nul 2>&1

:: 2. Port Liberation
echo [*] Liberating Development Ports (5173, 3001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %%a >nul 2>&1

:: 3. Cache Wipe
echo [*] Wiping Vite Cache...
cd /d "D:\NexusOS-main"
if exist "apps\nexus-desktop\node_modules\.vite" (
    rmdir /s /q "apps\nexus-desktop\node_modules\.vite"
)

:: 4. Start Server
echo [*] Environment Cleaned. Starting Web Server...
set NEXUS_BRIDGE=true
echo.

:: Start Vite Server
start "NexusOS Web" cmd /c "npx pnpm --filter @nexus/desktop run dev"

:: Wait for Vite Server to spin up
timeout /t 5 > nul

:: Open Browser
start http://localhost:5173
