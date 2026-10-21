' start-silent.vbs — тихий запуск twitch-overlay-v2 без окна консоли.
'
' Сервер запускается в фоне (npm start), окно консоли не показывается.
' Панель управления открывается в браузере автоматически через несколько секунд.
' Сервер продолжает работать в фоне, пока не будет остановлен через
' Диспетчер задач (найди процесс node.exe и заверши его).

Dim PORT, adminUrl
PORT = "3001"
adminUrl = "http://localhost:" & PORT & "/admin"

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 0 = полностью скрытое окно, False = не ждать завершения (сервер работает в фоне)
shell.Run "cmd /c cd /d """ & scriptDir & """ && npm start", 0, False

' Даём серверу несколько секунд подняться, затем открываем панель управления
' в браузере по умолчанию.
WScript.Sleep 4000
shell.Run adminUrl, 1, False
