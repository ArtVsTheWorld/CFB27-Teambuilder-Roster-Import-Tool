@echo off
setlocal
cd /d "%~dp0"
title Teambuilder Roster Import Tool by Ace

if not exist "runtime\node.exe" (
  echo The bundled Node.js runtime is missing.
  echo Please download or copy the complete tool folder again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo The tool's required dependency folder is missing.
  echo Please download or copy the complete tool folder again.
  echo.
  pause
  exit /b 1
)

"runtime\node.exe" "src\index.js"
if errorlevel 1 (
  echo.
  echo The tool stopped because of an error shown above.
  pause
  exit /b 1
)

endlocal
