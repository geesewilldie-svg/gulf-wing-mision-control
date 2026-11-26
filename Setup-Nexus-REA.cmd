@echo off
cd /d "%~dp0"
node scripts\setup-rea.mjs
set "NEXUS_REA_EXIT=%ERRORLEVEL%"
if not "%NEXUS_REA_EXIT%"=="0" pause
exit /b %NEXUS_REA_EXIT%
