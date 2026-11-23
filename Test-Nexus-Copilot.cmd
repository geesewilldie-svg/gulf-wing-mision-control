@echo off
cd /d "%~dp0"
echo This sends one fixed public prompt to GitHub Copilot and may use plan credits.
echo Prompt: Reply with exactly NEXUS_COPILOT_OK and nothing else. Do not use tools.
echo No Nexus files or conversation are attached. No general delegation is enabled.
choice /C YN /N /M "Send this test now? (Y/N) "
if errorlevel 2 exit /b 0
node scripts\check-copilot-access.mjs --confirm-public-test
pause
