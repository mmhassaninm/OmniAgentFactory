@echo off
setlocal
title NexusOS Secure Build Pipeline
cls

echo Starting NexusOS Orchestrator...
python "%~dp0build_launcher.py"

echo Terminating build console...
exit
