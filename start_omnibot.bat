@echo off
setlocal enabledelayedexpansion

chcp 65001 >nul 2>&1

echo ====================================================
echo             OMNIBOT LAUNCHER v2.6
echo ====================================================
echo.

set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

set "ERROR_COUNT=0"
set "LOG_FILE=%BASE_DIR%Project_Docs\Logs\launcher_diagnostic.log"

if not exist "%BASE_DIR%Project_Docs\Logs\" mkdir "%BASE_DIR%Project_Docs\Logs\" 2>nul

echo === OmniBot Launcher Log [%date% %time%] === > "%LOG_FILE%"
echo [%date% %time%] Launcher v2.6 starting >> "%LOG_FILE%"

REM --- Step 1: Kill old processes ---
echo [1/6] Cleaning old processes...
echo [1/6] Cleaning old processes... >> "%LOG_FILE%"
powershell -NoProfile -WindowStyle Hidden -Command "try { Get-Process python,pythonw,node,uvicorn -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'launcher|omnibot|main.py|vite|tray_manager|run_tray' } | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Host 'cleaned' } catch {}" >> "%LOG_FILE%" 2>&1
timeout /t 1 /nobreak >nul 2>&1

REM --- Step 2: Find pythonw.exe full path ---
echo [2/6] Finding pythonw.exe...
echo [2/6] Finding pythonw.exe... >> "%LOG_FILE%"
set "PYTHONW="
for /f "tokens=*" %%i in ('where pythonw 2^>nul') do (
    if not defined PYTHONW set "PYTHONW=%%i"
)
if not defined PYTHONW (
    REM Fallback: try common locations
    if exist "%CONDA_PREFIX%\pythonw.exe" set "PYTHONW=%CONDA_PREFIX%\pythonw.exe"
    if not defined PYTHONW if exist "%LOCALAPPDATA%\miniconda3\pythonw.exe" set "PYTHONW=%LOCALAPPDATA%\miniconda3\pythonw.exe"
    if not defined PYTHONW if exist "%USERPROFILE%\miniconda3\pythonw.exe" set "PYTHONW=%USERPROFILE%\miniconda3\pythonw.exe"
)
if not defined PYTHONW (
    echo     [WARNING] pythonw.exe not found — falling back to python.exe
    echo [WARNING] pythonw.exe not found >> "%LOG_FILE%"
    set "PYTHONW=pythonw.exe"
) else (
    echo     [OK] pythonw.exe: %PYTHONW%
    echo [OK] pythonw.exe: %PYTHONW% >> "%LOG_FILE%"
)
echo.

REM --- Step 3: Launch tray icon (FIRST — visible immediately) ---
echo [3/6] Starting system tray icon...
echo [3/6] Starting system tray icon... >> "%LOG_FILE%"
echo [%date% %time%] Launching: "%PYTHONW%" "%BASE_DIR%run_tray.py" >> "%LOG_FILE%"
start "" "%PYTHONW%" "%BASE_DIR%run_tray.py"
echo     [OK] Tray icon launcher started
echo [OK] Tray icon launcher started >> "%LOG_FILE%"
timeout /t 2 /nobreak >nul 2>&1
echo.

REM --- Step 4: Check Docker ---
echo [4/6] Checking Docker services...
echo [4/6] Docker check... >> "%LOG_FILE%"
docker-compose ps mongo >nul 2>&1
if %errorlevel% equ 0 (
    echo     [OK] Docker is running
    echo [OK] Docker running >> "%LOG_FILE%"
) else (
    echo     [STARTING] Docker services...
    docker-compose up -d mongo chromadb >>"%LOG_FILE%" 2>&1
    timeout /t 5 /nobreak >nul 2>&1
    echo     [OK] Docker started
    echo [OK] Docker started >> "%LOG_FILE%"
)
echo.

REM --- Step 5: Find Python ---
echo [5/6] Finding Python...
echo [5/6] Python search... >> "%LOG_FILE%"
set "PYTHON="

if exist "%CONDA_PREFIX%\python.exe" set "PYTHON=%CONDA_PREFIX%\python.exe"
if not defined PYTHON if exist "%LOCALAPPDATA%\miniconda3\python.exe" set "PYTHON=%LOCALAPPDATA%\miniconda3\python.exe"
if not defined PYTHON if exist "%USERPROFILE%\miniconda3\python.exe" set "PYTHON=%USERPROFILE%\miniconda3\python.exe"
if not defined PYTHON if exist "%USERPROFILE%\Anaconda3\python.exe" set "PYTHON=%USERPROFILE%\Anaconda3\python.exe"
if not defined PYTHON if exist "%ProgramFiles%\Python311\python.exe" set "PYTHON=%ProgramFiles%\Python311\python.exe"
if not defined PYTHON if exist "%ProgramFiles(x86)%\Python311\python.exe" set "PYTHON=%ProgramFiles(x86)%\Python311\python.exe"
if not defined PYTHON set "PYTHON=python.exe"

if not exist "%PYTHON%" (
    echo.
    echo   ERROR: python.exe not found!
    echo.
    echo   Searched in:
    echo     - %CONDA_PREFIX%
    echo     - %LOCALAPPDATA%\miniconda3
    echo     - %USERPROFILE%\miniconda3
    echo     - %USERPROFILE%\Anaconda3
    echo     - %ProgramFiles%\Python311
    echo.
    echo   FIX: Install Miniconda3 from https://docs.conda.io
    echo.
    echo [%date% %time%] ERROR: python.exe not found >> "%LOG_FILE%"
    set /A ERROR_COUNT+=1
    goto :FAILED
)
echo     [OK] Python: %PYTHON%
echo [OK] Python: %PYTHON% >> "%LOG_FILE%"
echo.

REM --- Step 6: Launch OmniBot (background) ---
echo [6/6] Starting OmniBot services (background)...
echo [6/6] Starting launcher.py >> "%LOG_FILE%"
echo [%date% %time%] Launching: "%PYTHON%" "%BASE_DIR%launcher.py" --skip-kill >> "%LOG_FILE%"

REM Launch launcher.py in the background so the batch script continues
start "" /B "%PYTHON%" "%BASE_DIR%launcher.py" --skip-kill >> "%LOG_FILE%" 2>&1
timeout /t 3 /nobreak >nul 2>&1

echo     [OK] Launcher started in background
echo [OK] Launcher started in background >> "%LOG_FILE%"
echo.

REM --- Success (no health check — launcher runs async) ---
echo.
echo ====================================================
echo    ✓ OMNIBOT IS STARTING!
echo ====================================================
echo    Backend:   http://localhost:3001
echo    Frontend:  http://localhost:5173
echo    Dashboard: http://localhost:5173/shopify
echo    Logs:      Project_Docs/Logs/omnibot.log
echo ====================================================
echo [%date% %time%] OMNIBOT STARTING >> "%LOG_FILE%"
echo.
echo  System tray icon is active (right-click for menu).
echo  Close this window anytime - services continue running.
echo.
echo  === Press any key to close this window ===
pause
exit /b 0

:FAILED
echo.
echo ====================================================
echo   ✗ FAILED - %ERROR_COUNT% ERROR(S)
echo ====================================================
echo.
echo   LOG FILES:
echo     %LOG_FILE%
echo     Project_Docs/Logs/omnibot.log
echo     Project_Docs/Logs/tray_manager.log
echo     tray_error.log
echo.
echo   Check tray_error.log if the tray icon did not appear.
echo.
echo   POSSIBLE FIXES:
echo     1. Make sure Docker Desktop is running
echo     2. Right-click batch file ^> Run as Administrator
echo     3. Close apps using ports: 3001, 27017, 5173, 8000
echo     4. Install Python 3.11+ (check: python --version)
echo     5. Verify .env file exists in project root
echo     6. Check Docker: docker-compose ps
echo.
echo   === Press any key to exit ===
pause
exit /b 1