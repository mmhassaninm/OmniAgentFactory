@echo off
setlocal
cls

echo ======================================================================
echo                NEXUS OS - NUCLEAR DEV STARTER v1.0
echo ======================================================================
echo.

:: Step 1: Process Extermination
echo [NexusOS] Commencing aggressive process cleanup...

:: Kill Electron & App instances
taskkill /f /im electron.exe /t >nul 2>&1
taskkill /f /im NexusOS.exe /t >nul 2>&1
taskkill /f /im NexusOS-Portable.exe /t >nul 2>&1

:: Kill Zombie Node processes (excluding Aegis Overlord)
wmic process where "name='node.exe' and not commandline like '%%aegis-overlord.js%%'" Call Terminate >nul 2>&1

:: Forcefully free up Vite Port (5173) - Only LISTENING, skip PID 0
echo [NexusOS] Hunting for processes on Port 5173...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5173 ^| findstr LISTENING') DO (
    if not "%%T"=="0" (
        echo [NexusOS] Terminating PID %%T occupying Port 5173...
        TaskKill.exe /F /PID %%T >nul 2>&1
    )
)

echo [NexusOS] Processes purged.

:: Step 2: Cache Annihilation
echo [NexusOS] Annihilating temporary caches...

:: Delete Vite Cache
if exist "node_modules\.vite" (
    echo [NexusOS] Wiping .vite cache...
    rmdir /s /q "node_modules\.vite" >nul 2>&1
)

:: Clear Renderer Dist (Dev artifacts)
if exist "src\renderer\dist" (
    echo [NexusOS] Clearing renderer dist...
    rmdir /s /q "src\renderer\dist" >nul 2>&1
)

echo [NexusOS] Caches cleared.

:: Step 3: Launch
echo.
echo ======================================================================
echo         🚀  NEXUS OS DEV MODE STARTING... (npm start)
echo ======================================================================
echo.

npm start

pause
