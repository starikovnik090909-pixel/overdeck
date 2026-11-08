# Overdeck · мод «Замена лица»: ставит свой Python и библиотеки в папку runtime рядом. Ничего не трогает в системе.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$mod = Split-Path -Parent $MyInvocation.MyCommand.Path
$rt = Join-Path $mod 'runtime'
$py = Join-Path $rt 'python.exe'
if (-not (Test-Path $py)) {
  Write-Output 'Скачиваю Python 3.11 (встроенный, ~10 МБ)…'
  New-Item -ItemType Directory -Force $rt | Out-Null
  $zip = Join-Path $mod 'py.zip'
  Invoke-WebRequest 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile $zip
  Expand-Archive $zip -DestinationPath $rt -Force
  Remove-Item $zip
  # включаем site-packages
  $pth = Get-ChildItem $rt -Filter 'python*._pth' | Select-Object -First 1
  (Get-Content $pth.FullName) -replace '#import site', 'import site' | Set-Content $pth.FullName
  Write-Output 'Ставлю pip…'
  Invoke-WebRequest 'https://bootstrap.pypa.io/get-pip.py' -OutFile (Join-Path $rt 'get-pip.py')
  & $py (Join-Path $rt 'get-pip.py') --no-warn-script-location
}
Write-Output 'Ставлю библиотеки (несколько минут, один раз)…'
& $py -m pip install --no-warn-script-location --upgrade numpy opencv-python onnx onnxruntime-directml mediapipe==0.10.14
if ($LASTEXITCODE -ne 0) { throw 'pip не справился' }
Write-Output 'Проверяю…'
& $py -c "import numpy,cv2,onnx,onnxruntime,mediapipe;print('ok',onnxruntime.get_available_providers())"
if ($LASTEXITCODE -ne 0) { throw 'библиотеки не запускаются' }
Write-Output 'Готово. Модели (~830 МБ) скачаются при первом запуске.'
