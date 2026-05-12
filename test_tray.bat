@echo off
echo ====================================================
echo    OmniBot Tray Icon Test — Standalone
echo ====================================================
echo.

REM Kill any existing tray/pythonw processes
echo Killing any existing tray instance...
taskkill /f /im pythonw.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo Launching tray icon via pythonw (no console)...
echo.

REM Launch tray using pythonw (silent, no console window)
start "" pythonw "%~dp0run_tray.py"

echo Done. Look at your system tray (bottom-right corner).
echo.
echo If nothing appears after 5 seconds, check:
echo   tray_error.log  — in project root
echo   Project_Docs\Logs\tray_manager.log  — internal tray log
echo   Project_Docs\Logs\tray_manager_crash.log  — if it crashed
echo.
echo Press any key to exit (tray icon will keep running)...
pause >nul