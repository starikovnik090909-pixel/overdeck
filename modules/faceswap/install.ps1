# Overdeck · мод «Замена лица»: ставит свой Python, библиотеки и модели в эту папку. В систему ничего не пишет.
# Состояние пишет в install_status.json (его читают админка и лаунчер), подробности — в install.log.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$mod = Split-Path -Parent $MyInvocation.MyCommand.Path
$rt = Join-Path $mod 'runtime'
$py = Join-Path $rt 'python.exe'
$statusFile = Join-Path $mod 'install_status.json'
$logFile = Join-Path $mod 'install.log'
$enc = New-Object System.Text.UTF8Encoding($false)
$script:t0 = Get-Date
$total = 4

function St($step, $msg, $pct, $detail = '', $done = $false, $err = '') {
  $o = [ordered]@{ step = $step; total = $total; msg = $msg; pct = [int]$pct; detail = $detail; done = $done; error = $err;
    pid = $PID; ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); started = ([DateTimeOffset]$script:t0).ToUnixTimeSeconds() }
  [IO.File]::WriteAllText($statusFile, ($o | ConvertTo-Json -Compress), $enc)
}
function LastLine() {
  if (-not (Test-Path $logFile)) { return '' }
  $l = Get-Content $logFile -Tail 3 -ErrorAction SilentlyContinue | Where-Object { $_ -and $_.Trim() } | Select-Object -Last 1
  if ($l) { $l = $l.Trim(); if ($l -like 'PCT:*') { $a = $l.Substring(4).Split('|'); return ('Скачано ' + $a[0] + '%: ' + $a[1]) }; return $l } else { return '' }
}
function Download($url, $dst) {
  for ($i = 1; $i -le 3; $i++) {
    try { Invoke-WebRequest $url -OutFile $dst -UseBasicParsing; return } catch { if ($i -eq 3) { throw } ; Start-Sleep 3 }
  }
}
# запускает процесс, пишет вывод в лог, пока ждёт — обновляет статус; возвращает код выхода
function RunLogged($exe, $argList, $step, $msg, $p0, $p1, $pctFn) {
  $p = Start-Process -FilePath $exe -ArgumentList $argList -NoNewWindow -PassThru -RedirectStandardOutput $logFile -RedirectStandardError ($logFile + '.err') -WorkingDirectory $mod
  while (-not $p.HasExited) {
    $pc = $p0
    if ($pctFn) { $pc = & $pctFn }
    St $step $msg $pc (LastLine)
    Start-Sleep -Milliseconds 1500
  }
  $p.WaitForExit()
  if (Test-Path ($logFile + '.err')) { Get-Content ($logFile + '.err') -ErrorAction SilentlyContinue | Add-Content $logFile }
  return $p.ExitCode
}

try {
  Set-Content $logFile '' -Encoding UTF8
  St 1 'Скачиваю Python 3.11 (~10 МБ)' 2
  if (-not (Test-Path $py)) {
    New-Item -ItemType Directory -Force $rt | Out-Null
    $zip = Join-Path $mod 'py.zip'
    Download 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' $zip
    Expand-Archive $zip -DestinationPath $rt -Force
    Remove-Item $zip
  }
  # включаем site-packages (без этого pip не видит пакеты)
  $pth = Get-ChildItem $rt -Filter 'python*._pth' | Select-Object -First 1
  if ($pth) { (Get-Content $pth.FullName) -replace '#import site', 'import site' | Set-Content $pth.FullName }
  # pip ставим, только если его ещё нет (повторный запуск после сбоя)
  $ErrorActionPreference = 'Continue'
  $null = & $py -m pip --version 2>&1
  $hasPip = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = 'Stop'
  if (-not $hasPip) {
    St 1 'Ставлю pip' 8
    $gp = Join-Path $rt 'get-pip.py'
    Download 'https://bootstrap.pypa.io/get-pip.py' $gp
    $c = RunLogged $py @(('"' + $gp + '"'), '--no-warn-script-location') 1 'Ставлю pip' 8 12 $null
    if ($c -ne 0) { throw 'не удалось поставить pip (см. install.log)' }
  }
  # библиотеки: 12% → 45%
  $pk = { $n = 0; if (Test-Path $logFile) { $n = @(Select-String -Path $logFile -Pattern '^(Collecting|Downloading|Installing collected)' -ErrorAction SilentlyContinue).Count }; [Math]::Min(45, 12 + $n * 2) }
  $c = RunLogged $py @('-m', 'pip', 'install', '--progress-bar', 'off', '--no-warn-script-location', '--upgrade', 'numpy', 'opencv-python', 'onnx', 'onnxruntime-directml', 'mediapipe==0.10.14') 2 'Ставлю библиотеки (несколько минут)' 12 45 $pk
  if ($c -ne 0) { throw 'pip не справился (см. install.log)' }
  St 3 'Проверяю библиотеки' 46
  $c = RunLogged $py @('-c', 'import numpy,cv2,onnx,onnxruntime,mediapipe;print(onnxruntime.get_available_providers())') 3 'Проверяю библиотеки' 46 48 $null
  if ($c -ne 0) { throw 'библиотеки не запускаются (см. install.log)' }
  # модели: 48% → 99%
  $pm = { $pc = 48; if (Test-Path $logFile) { $l = Get-Content $logFile -Tail 20 -ErrorAction SilentlyContinue | Where-Object { $_ -like 'PCT:*' } | Select-Object -Last 1; if ($l) { $a = $l.Substring(4).Split('|'); $v = [int]$a[0]; if ($a[1] -like '*распознавания*') { $pc = 78 + [int]($v * 0.21) } else { $pc = 48 + [int]($v * 0.30) } } }; $pc }
  $c = RunLogged $py @(('"' + (Join-Path $mod 'worker.py') + '"'), '--prefetch') 4 'Скачиваю модели нейросети (~830 МБ, один раз)' 48 99 $pm
  if ($c -ne 0) { throw 'не удалось скачать модели (см. install.log)' }
  St 4 'Готово' 100 '' $true
} catch {
  St 0 'Установка не удалась' 0 '' $false ($_.Exception.Message)
  exit 1
}
