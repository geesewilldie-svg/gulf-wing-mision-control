@echo off
cd /d "%~dp0"
node scripts\setup-nexus-gemini.mjs --disable
pause
