@echo off
title FEDEVENT Server

REM FEDEVENT Startup Script for Windows

REM Navigate to the project directory
cd /d "%~dp0"

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js to run this application.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo npm is not installed. Please install npm to run this application.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Start the server
echo Starting FEDEVENT server...
npm start

pause