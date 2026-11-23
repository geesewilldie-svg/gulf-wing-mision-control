@echo off
cd /d "%~dp0"
node scripts\setup-copilot-profile.mjs --login
pause
