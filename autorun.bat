@echo off
title FEDEVENT Auto-run

REM FEDEVENT Auto-run Script for Windows
REM This script will automatically start the server and restart it if it crashes

REM Navigate to the project directory
cd /d "%~dp0"

REM Create logs directory if it doesn't exist
if not exist "logs" mkdir logs

echo FEDEVENT Auto-run Script
echo ========================
echo Starting server with auto-restart capability...
echo Press Ctrl+C to stop

:loop
echo %date% %time%: Starting FEDEVENT server...
npm run dev
echo %date% %time%: Server stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop