@echo off
setlocal
cd /d "%~dp0.."
if not exist ".venv-voice\Scripts\python.exe" (
  echo Voice environment missing. Follow scripts\voice\README.md first.
  pause
  exit /b 1
)
set "NEXUS_WHISPER_MODEL="
if exist ".gulf-wing\models\whisper-tiny.en\model.bin" set "NEXUS_WHISPER_MODEL=%CD%\.gulf-wing\models\whisper-tiny.en"
set "NEXUS_PIPER_MODEL=%CD%\.gulf-wing\models\piper\en_GB-alba-medium.onnx"
set "PATH=%CD%\.venv-voice\Scripts;%PATH%"
set "NEXUS_KOKORO_PYTHON="
if exist ".venv-kokoro\Scripts\python.exe" if exist ".gulf-wing\models\kokoro\kokoro-v1.0.onnx" if exist ".gulf-wing\models\kokoro\voices-v1.0.bin" set "NEXUS_KOKORO_PYTHON=%CD%\.venv-kokoro\Scripts\python.exe"
set "NEXUS_KOKORO_MODEL=%CD%\.gulf-wing\models\kokoro\kokoro-v1.0.onnx"
set "NEXUS_KOKORO_VOICES=%CD%\.gulf-wing\models\kokoro\voices-v1.0.bin"
echo Starting Nexus voice. Isabella uses the auditioned British voice at speed 0.95.
echo Initial model loading can take time. Leave this window open. Ctrl+C stops it.
".venv-voice\Scripts\python.exe" scripts\voice\worker.py
if errorlevel 1 pause
endlocal
