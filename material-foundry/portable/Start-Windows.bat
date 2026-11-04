@echo off
rem Starts Material Foundry / Understand Code. Keep the window open while you use it.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable\start-windows.ps1" %*
if errorlevel 1 pause
