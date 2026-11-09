// Мод «DeepFaceLive»: сборка DeepFaceLive скачивается вручную (она лежит на Mega и Яндексе), здесь указываем папку и запускаем.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

class DflForm : Form
{
    public const string Page = "https://github.com/iperov/DeepFaceLive";
    string cfg; Label lblTitle, lblInfo; FancyButton b1, b2, b3, bClose;

    public static string Dir(string root) { return Path.Combine(root, "modules", "deepfacelive"); }
    public static string FindExe(string folder)
    {
        try
        {
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return "";
            foreach (string n in new string[] { "DeepFaceLive.bat", "DeepFaceLive.exe" }) { string p = Path.Combine(folder, n); if (File.Exists(p)) return p; }
            foreach (string sub in Directory.GetDirectories(folder))   // распаковали на уровень глубже
                foreach (string n in new string[] { "DeepFaceLive.bat", "DeepFaceLive.exe" }) { string p = Path.Combine(sub, n); if (File.Exists(p)) return p; }
        }
        catch { }
        return "";
    }
    public static string SavedFolder(string root)
    {
        try { string c = Path.Combine(Dir(root), "path.txt"); return File.Exists(c) ? File.ReadAllText(c).Trim('﻿', ' ', '\r', '\n') : ""; } catch { return ""; }
    }
    public static bool IsInstalled(string root) { return FindExe(SavedFolder(root)) != ""; }
    public static void Launch(string root)
    {
        string exe = FindExe(SavedFolder(root)); if (exe == "") return;
        ProcessStartInfo psi = new ProcessStartInfo(exe); psi.WorkingDirectory = Path.GetDirectoryName(exe); psi.UseShellExecute = true;
        Process.Start(psi);
    }

    public DflForm(string root)
    {
        cfg = Path.Combine(Dir(root), "path.txt");
        FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterParent; ShowInTaskbar = false;
        ClientSize = new Size(600, 330); BackColor = Color.FromArgb(10, 15, 15); DoubleBuffered = true;
        lblTitle = Mk("Мод «DeepFaceLive»", 20, 18, 520, 26, new Font("Segoe UI Semibold", 13f), Color.White);
        lblInfo = Mk("", 20, 56, 560, 200, new Font("Segoe UI", 9.5f), Ui.Dim);
        b1 = new FancyButton(); b1.Size = new Size(210, 38); b1.Location = new Point(20, 270); Controls.Add(b1);
        b2 = new FancyButton(); b2.Size = new Size(150, 38); b2.Location = new Point(240, 270); Controls.Add(b2);
        b3 = new FancyButton(); b3.Size = new Size(90, 38); b3.Location = new Point(400, 270); b3.Visible = false; Controls.Add(b3);
        bClose = new FancyButton(); bClose.Text = "Закрыть"; bClose.Size = new Size(90, 38); bClose.Location = new Point(490, 270);
        bClose.Click += delegate { Close(); }; Controls.Add(bClose);
        Refresh2(root);
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

    void PickFolder(string root)
    {
        using (FolderBrowserDialog d = new FolderBrowserDialog())
        {
            d.Description = "Папка, куда распакован DeepFaceLive (в ней лежит DeepFaceLive.bat)";
            if (d.ShowDialog(this) != DialogResult.OK) return;
            if (FindExe(d.SelectedPath) == "") { MessageBox.Show(this, "В этой папке нет DeepFaceLive.bat. Выбери папку, куда распаковала сборка.", "DeepFaceLive", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
            try { Directory.CreateDirectory(Dir(root)); File.WriteAllText(cfg, d.SelectedPath); } catch { }
            Refresh2(root);
        }
    }

    void Refresh2(string root)
    {
        bool ok = IsInstalled(root);
        b1.Click -= OnB1; b2.Click -= OnB2; b3.Click -= OnB3;
        if (!ok)
        {
            lblInfo.Text = "DeepFaceLive: отдельная программа для замены лица в реальном времени. Она работает на обученных моделях и даёт лучшее качество: рот, подмигивание и язык получаются как у настоящего видео.\n\n" +
                "1. Нажми «Страница загрузки» и скачай сборку для Windows (DirectX12 подходит любой видеокарте, NVIDIA быстрее только на NVIDIA). Ссылки на Mega и Яндекс лежат на странице проекта.\n" +
                "2. Распакуй архив в любую папку.\n3. Нажми «Указать папку» и выбери её.\n\nПроект закрыт автором, но сборки работают.";
            b1.Text = "Страница загрузки"; b2.Text = "Указать папку…"; b3.Visible = false;
        }
        else
        {
            lblInfo.Text = "DeepFaceLive найден:\n" + SavedFolder(root) + "\n\nЗапусти его, выбери модель лица (.dfm) и камеру. Свою модель можно обучить в DeepFaceLab, только на лице, которое твоё или на которое есть согласие. " +
                "Чтобы показать результат на стриме, в OBS добавь «Захват окна» с окном DeepFaceLive.\n\nГотовые модели кладутся в папку userdata\\dfm_models внутри DeepFaceLive.";
            b1.Text = "Запустить DeepFaceLive"; b2.Text = "Папка моделей"; b3.Text = "Сменить"; b3.Visible = true;
        }
        b1.Click += OnB1; b2.Click += OnB2; b3.Click += OnB3;
        Tag = root; Invalidate();
    }
    void OnB1(object s, EventArgs e)
    {
        string root = (string)Tag;
        if (!IsInstalled(root)) { try { Process.Start(Page); } catch { } return; }
        try { Launch(root); Close(); } catch (Exception ex) { MessageBox.Show(this, ex.Message, "DeepFaceLive"); }
    }
    void OnB2(object s, EventArgs e)
    {
        string root = (string)Tag;
        if (!IsInstalled(root)) { PickFolder(root); return; }
        try
        {
            string exe = FindExe(SavedFolder(root)); string m = Path.Combine(Path.GetDirectoryName(exe), "userdata", "dfm_models");
            Directory.CreateDirectory(m); Process.Start("explorer.exe", "\"" + m + "\"");
        }
        catch { }
    }
    void OnB3(object s, EventArgs e) { PickFolder((string)Tag); }
}
