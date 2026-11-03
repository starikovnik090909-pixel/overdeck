#!/bin/sh
# Сборка лаунчера не на Windows (нужны mono-mcs и эталонные сборки .NET 4.5, чтобы не использовались методы, которых нет в Windows).
# Эталонные сборки: пакет NuGet Microsoft.NETFramework.ReferenceAssemblies.net45, распакованный в $REF.
set -e
REF="${REF:?укажи путь к build/.NETFramework/v4.5 из пакета Microsoft.NETFramework.ReferenceAssemblies.net45}"
cd "$(dirname "$0")/.."
mcs -nologo -noconfig -nostdlib -target:winexe -win32icon:launcher/icon.ico -resource:launcher/icon.ico,icon.ico -resource:launcher/logo.png,logo.png -out:Overdeck.exe \
  -r:$REF/mscorlib.dll -r:$REF/System.dll -r:$REF/System.Core.dll -r:$REF/System.Windows.Forms.dll -r:$REF/System.Drawing.dll -r:$REF/System.IO.Compression.dll -r:$REF/System.IO.Compression.FileSystem.dll launcher/Overdeck.cs
