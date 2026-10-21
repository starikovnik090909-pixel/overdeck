@echo off
setlocal

cd /d "%~dp0"

set PORT=3001
set URL=http://localhost:%PORT%/admin

REM NOTE: this file is ASCII-only on purpose. Russian text in a .bat is printed by cmd in the wrong code page (mojibake).
REM The banner and all Russian messages are printed by the server itself (Node.js prints them correctly).

if not exist "node_modules" (
  echo node_modules not found - running npm install...
  echo.
  call npm install
  echo.
)

REM Open the admin panel in the browser after 3 seconds, without waiting for npm start in this window
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%URL%'"

REM "call" - otherwise npm.cmd would end this bat file together with itself
:run
call npm start
REM exit code 75 = the server asks for a restart (after importing an auth file)
if %errorlevel%==75 goto run

echo.
echo Server stopped (or failed to start). See the messages above for the reason.
pause
