# soundpadkeys.ps1 — глобальные горячие клавиши для саундпада (RegisterHotKey). Печатает по строке JSON:
#   {"t":"ok","n":3}  — зарегистрировано; {"t":"hit","i":0} — нажато сочетание №0; {"t":"fail","i":1} — сочетание занято другой программой.
# Закрывается сам, когда закрывается Overdeck (-ParentPid).
param([int]$ParentPid = 0, [string]$Config)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  $items = @(Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json)
  $spec = @($items | ForEach-Object { "$($_.mods):$($_.vk)" })
  Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class SpKeys : Form {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  int parent; string[] spec; int count; Timer tm;
  public SpKeys(int parentPid, string[] s) {
    parent = parentPid; spec = s;
    ShowInTaskbar = false; FormBorderStyle = FormBorderStyle.None; Opacity = 0;
    IntPtr h = Handle;
    for (int i = 0; i < spec.Length; i++) {
      string[] p = spec[i].Split(':');
      if (RegisterHotKey(h, i + 1, uint.Parse(p[0]), uint.Parse(p[1]))) count++;
      else Console.WriteLine("{\"t\":\"fail\",\"i\":" + i + "}");
    }
    Console.WriteLine("{\"t\":\"ok\",\"n\":" + count + "}");
    tm = new Timer(); tm.Interval = 3000;
    tm.Tick += delegate {
      if (parent <= 0) return;
      try { Process.GetProcessById(parent); } catch (Exception) { Application.Exit(); }
    };
    tm.Start();
  }
  protected override void SetVisibleCore(bool v) { base.SetVisibleCore(false); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312) Console.WriteLine("{\"t\":\"hit\",\"i\":" + (m.WParam.ToInt32() - 1) + "}");
    base.WndProc(ref m);
  }
  protected override void OnFormClosed(FormClosedEventArgs e) {
    for (int i = 0; i < spec.Length; i++) UnregisterHotKey(Handle, i + 1);
    base.OnFormClosed(e);
  }
}
"@
  [System.Windows.Forms.Application]::Run([SpKeys]::new($ParentPid, [string[]]$spec))
} catch {
  [Console]::Out.WriteLine((@{ t = 'err'; msg = $_.Exception.Message } | ConvertTo-Json -Compress)); exit 2
}
