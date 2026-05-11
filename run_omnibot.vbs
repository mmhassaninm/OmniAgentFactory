REM VBScript to run batch file and keep window open
Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd.exe /k D:\2026\Projects\AI\NexusOS\start_omnibot_simple.bat", 1, False
