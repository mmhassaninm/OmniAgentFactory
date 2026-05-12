@echo off
chcp 65001 >nul 2>&1
title OmniBot Restart
echo [OmniBot] Restarting project...
python restart_omnibot.py %*
pause