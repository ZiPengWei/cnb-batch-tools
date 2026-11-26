@echo off
rem Wait for the app process to exit, then replace and restart.
timeout /t 2 /nobreak >nul
move /y "%~dp0CNB-Tools-update.exe" "%~dp0CNB-Tools.exe"
start "" "%~dp0CNB-Tools.exe"
del "%~f0"
