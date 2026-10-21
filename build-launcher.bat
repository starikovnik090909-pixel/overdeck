@echo off
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo csc.exe not found. .NET Framework 4 is built into Windows 10/11 - check %WINDIR%\Microsoft.NET
  pause
  exit /b 1
)
"%CSC%" /nologo /target:winexe /win32icon:launcher\icon.ico /resource:launcher\icon.ico,icon.ico /resource:launcher\logo.png,logo.png /out:Overdeck.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll launcher\Overdeck.cs
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)
echo DONE: Overdeck.exe rebuilt.
pause
