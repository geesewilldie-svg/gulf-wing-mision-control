@echo off
cd /d "%~dp0"
node scripts\update-nexus.mjs
set "NEXUS_UPDATE_EXIT=%ERRORLEVEL%"
if not "%NEXUS_UPDATE_EXIT%"=="0" pause
exit /b %NEXUS_UPDATE_EXIT%
