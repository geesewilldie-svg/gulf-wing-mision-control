@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js and reopen this launcher.
  pause
  exit /b 1
)
node.exe scripts\start-nexus.mjs
if errorlevel 1 pause
endlocal
