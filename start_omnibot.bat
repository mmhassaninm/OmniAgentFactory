@echo off
setlocal enabledelayedexpansion

chcp 65001 >nul 2>&1

echo ====================================================
echo             OMNIBOT LAUNCHER v2.4
echo ====================================================
echo.

set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

set "ERROR_COUNT=0"
set "LOG_FILE=%BASE_DIR%Project_Docs\Logs\launcher_diagnostic.log"

if not exist "%BASE_DIR%Project_Docs\Logs\" mkdir "%BASE_DIR%Project_Docs\Logs\" 2>nul

echo === OmniBot Launcher Log [%date% %time%] === > "%LOG_FILE%"
echo [%date% %time%] Launcher v2.4 starting >> "%LOG_FILE%"

REM --- Step 1: Kill old processes ---
echo [1/5] Cleaning old processes...
echo [1/5] Cleaning old processes... >> "%LOG_FILE%"
powershell -NoProfile -WindowStyle Hidden -Command "try { Get-Process python,pythonw,node,uvicorn -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'launcher|omnibot|main.py|vite' } | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Host 'cleaned' } catch {}" >> "%LOG_FILE%" 2>&1
timeout /t 1 /nobreak >nul 2>&1

REM --- Step 2: Check Docker ---
echo [2/5] Checking Docker services...
echo [2/5] Docker check... >> "%LOG_FILE%"
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

REM --- Step 3: Find Python ---
echo [3/5] Finding Python...
echo [3/5] Python search... >> "%LOG_FILE%"
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

REM --- Step 4: Launch OmniBot ---
echo [4/5] Starting OmniBot services...
echo [4/5] Starting launcher.py >> "%LOG_FILE%"
echo [%date% %time%] Launching: "%PYTHON%" "%BASE_DIR%launcher.py" --skip-kill >> "%LOG_FILE%"

"%PYTHON%" "%BASE_DIR%launcher.py" --skip-kill >> "%LOG_FILE%" 2>&1
set "LAUNCH_EXIT=%errorlevel%"

if %LAUNCH_EXIT% neq 0 (
    echo     [ERROR] Launcher exited with code %LAUNCH_EXIT%
    echo [%date% %time%] ERROR: Launcher exit code %LAUNCH_EXIT% >> "%LOG_FILE%"
    echo.
    echo   === LAST 20 LINES OF LOG ===
    powershell -NoProfile -Command "Get-Content '%LOG_FILE%' -Tail 20"
    echo   === END OF LOG ===
    echo.
    set /A ERROR_COUNT+=1
    goto :FAILED
)
echo     [OK] Launcher started successfully
echo [OK] Launcher started >> "%LOG_FILE%"
echo.

REM --- Step 5: Health check (30s max) ---
echo [5/5] Waiting for backend...
echo [5/5] Health check... >> "%LOG_FILE%"

setlocal enabledelayedexpansion
set "HC_RESULT=0"
set "HC_TIMEOUT=30"
set "HC_ELAPSED=0"

:HC_LOOP
if !HC_ELAPSED! geq %HC_TIMEOUT% (
    set "HC_RESULT=1"
    goto :HC_END
)

powershell -NoProfile -Command "try { [Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; \$req = [Net.HttpWebRequest]::Create('http://localhost:3001/api/health'); \$req.Timeout = 2000; \$res = \$req.GetResponse(); if (\$res.StatusCode -eq 200) { Write-Host 'OK'; exit 0 } } catch { exit 1 }" >nul 2>&1

if %errorlevel% equ 0 (
    echo     [OK] Backend is ready!
    echo [%date% %time%] OK: Backend ready >> "%LOG_FILE%"
    goto :HC_END
) else (
    echo -n "."
    timeout /t 2 /nobreak >nul 2>&1
    set /A HC_ELAPSED+=2
    goto :HC_LOOP
)

:HC_END
if "%HC_RESULT%"=="1" (
    set /A ERROR_COUNT+=1
    echo.
    echo   [ERROR] Backend failed to start within 30 seconds
    echo   [%date% %time%] ERROR: Backend timeout 30s >> "%LOG_FILE%"
    echo.
    echo   === CHECKING BACKEND LOGS ===
    docker-compose logs backend 2>&1 | tail -30
    echo.
    goto :FAILED
)

REM --- Success ---
echo.
echo ====================================================
echo    ✓ OMNIBOT IS ONLINE!
echo ====================================================
echo    Backend:   http://localhost:3001
echo    Frontend:  http://localhost:5173
echo    Dashboard: http://localhost:5173/shopify
echo    Logs:      Project_Docs/Logs/omnibot.log
echo ====================================================
echo [%date% %time%] OMNIBOT ONLINE >> "%LOG_FILE%"
echo.
echo  Services running in background (system tray icon active).
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
echo     backend_out.log / backend_err.log
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
