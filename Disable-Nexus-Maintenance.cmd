@echo off
cd /d "%~dp0"
node scripts\install-nexus-maintenance.mjs --disable
pause
