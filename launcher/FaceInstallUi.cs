// Окно установки мода «Замена лица»: запускает modules\faceswap\install.ps1 и показывает прогресс из install_status.json.
// То же состояние читает вкладка в админке, поэтому можно начать там и досмотреть здесь (и наоборот).
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Forms;

class FaceInstallForm : Form
{
    string dir, statusPath;
    Action openAdmin;
    Label lblTitle, lblStep, lblDetail;
    Panel bar; FancyButton btnMain, btnClose;
    Timer tm = new Timer();
    int pct, pid; bool running, done; string err = "";

    public FaceInstallForm(string root, Action openAdminTab)
    {
        dir = Path.Combine(root, "modules", "faceswap"); statusPath = Path.Combine(dir, "install_status.json"); openAdmin = openAdminTab;
        FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterParent; ShowInTaskbar = false;
        ClientSize = new Size(520, 250); BackColor = Color.FromArgb(10, 15, 15); DoubleBuffered = true;
        lblTitle = Mk("Мод «Замена лица»: установка", 20, 18, 480, 26, new Font("Segoe UI Semibold", 13f), Color.White);
        lblStep = Mk("", 20, 62, 480, 22, new Font("Segoe UI Semibold", 10f), Ui.Txt);
        bar = new Panel(); bar.Location = new Point(20, 94); bar.Size = new Size(480, 10); bar.BackColor = Color.Transparent;
        bar.Paint += PaintBar; Controls.Add(bar);
        lblDetail = Mk("", 20, 116, 480, 56, new Font("Segoe UI", 9f), Ui.Dim);
        btnMain = new FancyButton(); btnMain.Primary = true; btnMain.Size = new Size(190, 38); btnMain.Location = new Point(20, 190);
        btnMain.Click += delegate { OnMain(); }; Controls.Add(btnMain);
        btnClose = new FancyButton(); btnClose.Text = "Закрыть"; btnClose.Size = new Size(120, 38); btnClose.Location = new Point(380, 190);
        btnClose.Click += delegate { Close(); }; Controls.Add(btnClose);
        tm.Interval = 800; tm.Tick += delegate { Poll(); }; tm.Start();
        Load += delegate { Begin(); };
        FormClosed += delegate { tm.Stop(); };
    }

    Label Mk(string t, int x, int y, int w, int h, Font f, Color c)
    {
        Label l = new Label(); l.Text = t; l.Location = new Point(x, y); l.Size = new Size(w, h); l.Font = f; l.ForeColor = c; l.BackColor = Color.Transparent; Controls.Add(l); return l;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using (Pen p = new Pen(Color.FromArgb(70, 43, 196, 180))) e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
    }
    void PaintBar(object s, PaintEventArgs e)
    {
        Graphics g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        using (GraphicsPath back = Ui.Round(new Rectangle(0, 0, bar.Width - 1, bar.Height - 1), 5))
        using (SolidBrush b = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillPath(b, back);
        int w = (int)((bar.Width - 1) * Math.Max(0, Math.Min(100, pct)) / 100.0);
        if (w < 10) return;
        using (GraphicsPath fill = Ui.Round(new Rectangle(0, 0, w, bar.Height - 1), 5))
        using (LinearGradientBrush b = new LinearGradientBrush(new Rectangle(0, 0, bar.Width, bar.Height), Color.FromArgb(43, 196, 180), Color.FromArgb(120, 235, 220), 0f)) g.FillPath(b, fill);
    }

    static string JStr(string j, string key)
    {
        Match m = Regex.Match(j, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        if (!m.Success) return "";
        string s = m.Groups[1].Value;
        s = Regex.Replace(s, "\\\\u([0-9a-fA-F]{4})", delegate (Match x) { return ((char)Convert.ToInt32(x.Groups[1].Value, 16)).ToString(); });
        return s.Replace("\\n", "\n").Replace("\\\"", "\"").Replace("\\\\", "\\");
    }
    static int JNum(string j, string key) { Match m = Regex.Match(j, "\"" + key + "\"\\s*:\\s*(\\d+)"); return m.Success ? int.Parse(m.Groups[1].Value) : 0; }

    void Begin()
    {
        string j = ReadStatus();
        if (j != "" && IsRunning(j)) { Poll(); return; }
        if (j != "" && IsDone(j)) { Poll(); return; }
        StartInstall();
    }

    string ReadStatus()
    {
        try { return File.Exists(statusPath) ? File.ReadAllText(statusPath).Trim('﻿', ' ', '\r', '\n') : ""; } catch { return ""; }
    }
    public static bool IsDone(string j) { return Regex.IsMatch(j, "\"done\"\\s*:\\s*true"); }
    static bool IsRunning(string j)
    {
        if (IsDone(j) || JStr(j, "error") != "") return false;
        long now = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
        return JNum(j, "step") > 0 && now - JNum(j, "ts") < 120;
    }

    void StartInstall()
    {
        try { if (File.Exists(statusPath)) File.Delete(statusPath); } catch { }
        err = ""; done = false; pct = 0; running = true;
        lblStep.Text = "Запускаю установку…"; lblDetail.Text = ""; Sync();
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("powershell", "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(dir, "install.ps1") + "\"");
            psi.WorkingDirectory = dir; psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(psi);
        }
        catch (Exception ex) { err = ex.Message; running = false; }
        Sync();
    }

    void Poll()
    {
        string j = ReadStatus();
        if (j == "") { Sync(); return; }
        pct = JNum(j, "pct"); pid = JNum(j, "pid");
        done = IsDone(j); string e2 = JStr(j, "error");
        running = IsRunning(j);
        if (done) { lblStep.Text = "Готово. Мод установлен."; lblDetail.Text = "Открой вкладку «Замена лица» в админке: выбери фото лица и включи замену."; pct = 100; }
        else if (e2 != "") { err = e2; lblStep.Text = "Установка не удалась"; lblDetail.Text = e2 + "\nПодробности: modules\\faceswap\\install.log. Проверь интернет и повтори."; }
        else if (running)
        {
            lblStep.Text = "Шаг " + JNum(j, "step") + " из " + JNum(j, "total") + ": " + JStr(j, "msg");
            int el = (int)((DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds - JNum(j, "started"));
            string d = JStr(j, "detail");
            lblDetail.Text = pct + "%  ·  прошло " + (el / 60) + ":" + (el % 60).ToString("00") + (d != "" ? "\n" + d : "") + "\nОкно можно закрыть, установка продолжится.";
        }
        Sync();
    }

    void Sync()
    {
        bar.Invalidate();
        if (done) { btnMain.Text = "Открыть в админке"; btnMain.Enabled = true; }
        else if (running) { btnMain.Text = "Отменить установку"; btnMain.Enabled = true; }
        else { btnMain.Text = err != "" ? "Повторить" : "Установить"; btnMain.Enabled = true; }
        btnMain.Invalidate();
    }

    void OnMain()
    {
        if (done) { try { openAdmin(); } catch { } Close(); return; }
        if (running)
        {
            if (pid > 0) try { Process.Start(new ProcessStartInfo("taskkill", "/PID " + pid + " /T /F") { CreateNoWindow = true, UseShellExecute = false }); } catch { }
            running = false; err = "Установка отменена"; lblStep.Text = "Установка отменена"; lblDetail.Text = ""; pct = 0; Sync();
            try { File.WriteAllText(statusPath, "{\"step\":0,\"total\":4,\"msg\":\"\",\"pct\":0,\"detail\":\"\",\"done\":false,\"error\":\"Установка отменена\",\"pid\":0,\"ts\":0,\"started\":0}"); } catch { }
            return;
        }
        StartInstall();
    }
}
