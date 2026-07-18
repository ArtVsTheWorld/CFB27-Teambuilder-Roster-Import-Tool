@echo off
setlocal
cd /d "%~dp0"
title Teambuilder Roster Import Tool by Ace

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 20 or newer, then run this launcher again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing required files for the first run...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

call npm.cmd start
if errorlevel 1 (
  echo.
  echo The tool stopped because of an error shown above.
  pause
  exit /b 1
)

endlocal
