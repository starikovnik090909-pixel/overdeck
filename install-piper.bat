@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Install Piper (offline TTS engine) ===
if exist "piper\piper.exe" (
  echo Piper is already installed: piper\piper.exe
  pause
  exit /b 0
)
echo Downloading Piper, about 22 MB...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' -OutFile 'piper.zip'; Expand-Archive -Force piper.zip .; Remove-Item piper.zip"
if not exist "piper\piper.exe" goto :err
echo.
echo DONE. Restart the overlay server. Voices are downloaded in the admin panel: Voice tab - Voice catalog.
pause
exit /b 0
:err
echo.
echo INSTALL FAILED. Download piper_windows_amd64.zip manually from https://github.com/rhasspy/piper/releases and unpack it here so that piper\piper.exe exists.
pause
