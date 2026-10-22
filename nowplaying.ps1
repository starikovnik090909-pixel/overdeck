# nowplaying.ps1 — читает медиа-сессии Windows (System Media Transport Controls): браузеры, Spotify, плееры.
# Раз в секунду печатает по одной JSON-строке в stdout. Сессии: {t:'s', cur, sessions:[...]}; обложка при смене трека: {t:'c', key, b64}.
param([int]$ParentPid = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $null = $task.Wait(-1); $task.Result }
  $mgrT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $mgr = Await ($mgrT::RequestAsync()) $mgrT
} catch {
  [Console]::Out.WriteLine((@{ t = 'err'; msg = $_.Exception.Message } | ConvertTo-Json -Compress)); exit 2
}
$propsT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$streamT = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
$sent = @{}
while ($true) {
  if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
  try {
    $curS = $mgr.GetCurrentSession()
    $curId = if ($curS) { $curS.SourceAppUserModelId } else { '' }
    $list = @(); $errs = @()
    foreach ($s in $mgr.GetSessions()) {
      try {
        $id = $s.SourceAppUserModelId
        $props = Await ($s.TryGetMediaPropertiesAsync()) $propsT
        $tl = $s.GetTimelineProperties(); $pi = $s.GetPlaybackInfo()
        $status = [string]$pi.PlaybackStatus
        $rate = 1.0; if ($pi.PlaybackRate -ne $null) { $rate = [double]$pi.PlaybackRate }
        $dur = ($tl.EndTime - $tl.StartTime).TotalSeconds
        $pos = ($tl.Position - $tl.StartTime).TotalSeconds
        if ($status -eq 'Playing' -and $tl.LastUpdatedTime.Year -gt 2000) { $pos += ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalSeconds * $rate }
        if ($dur -lt 0) { $dur = 0 }; if ($pos -lt 0) { $pos = 0 }; if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
        $key = "$id|$($props.Title)|$($props.Artist)"
        if (-not $sent.ContainsKey($key) -and $props.Thumbnail -ne $null) {
          $sent[$key] = $true
          try {
            $st = Await ($props.Thumbnail.OpenReadAsync()) $streamT
            $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
            $ms = New-Object System.IO.MemoryStream; $net.CopyTo($ms)
            if ($ms.Length -gt 0 -and $ms.Length -lt 4MB) { [Console]::Out.WriteLine((@{ t = 'c'; key = $key; mime = [string]$st.ContentType; b64 = [Convert]::ToBase64String($ms.ToArray()) } | ConvertTo-Json -Compress)) }
            $net.Dispose()
          } catch { }
          if ($sent.Count -gt 200) { $sent = @{} }
        }
        $list += @{ id = $id; title = [string]$props.Title; artist = [string]$props.Artist; album = [string]$props.AlbumTitle; status = $status; pos = [math]::Round($pos, 1); dur = [math]::Round($dur, 1); rate = $rate; key = $key; current = ($id -eq $curId) }
      } catch { $errs += ([string]$_.Exception.Message).Substring(0, [math]::Min(120, ([string]$_.Exception.Message).Length)) }
    }
    [Console]::Out.WriteLine((@{ t = 's'; sessions = $list; errs = $errs } | ConvertTo-Json -Compress -Depth 4))
  } catch { }
  Start-Sleep -Milliseconds 1000
}
