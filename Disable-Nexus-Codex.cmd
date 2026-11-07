@echo off
cd /d "%~dp0"
node scripts\setup-nexus-codex.mjs --disable
pause
