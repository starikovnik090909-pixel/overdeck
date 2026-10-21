@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Установка Silero - голоса Айдар, Евгений, Ксения, Бая ===
set PY=
py -3 --version >nul 2>&1 && set PY=py -3
if "%PY%"=="" python --version >nul 2>&1 && set PY=python
if "%PY%"=="" (
  echo Рабочий Python не найден - ставлю через winget...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo Python установлен. ЗАКРОЙ это окно и запусти install-silero.bat ещё раз.
  pause
  exit /b 0
)
echo Python: %PY%
%PY% -m venv .silero-venv || goto :err
echo Ставлю torch (CPU), это 1-2 ГБ - подожди...
.silero-venv\Scripts\python.exe -m pip install --upgrade pip
.silero-venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu || goto :err
echo Скачиваю модель голосов, 40 МБ, и проверяю...
.silero-venv\Scripts\python.exe -c "import sys,runpy;sys.path.insert(0,'silero');import worker;worker.ensure_model();print('OK')" || goto :err
echo.
echo ГОТОВО. Перезапусти сервер оверлея и выбери голос Silero в админке.
pause
exit /b 0
:err
echo.
echo ОШИБКА установки. Сделай скриншот этого окна и пришли в чат.
pause
exit /b 1
