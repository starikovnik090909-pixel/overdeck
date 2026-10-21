// Overdeck.cs — лаунчер Overdeck by Starikov (заменяет start.bat и start-silent.vbs).
// Окно: версия, состояние сервера, «Открыть админку», «Открыть консоль», «Проверить обновления», запуск/остановка.
// Закрытие окна сворачивает в трей — сервер продолжает работать. Выход — из меню значка в трее («Выход» останавливает сервер).
// Код написан под C# 5 / .NET Framework 4 — собирается штатным csc.exe, который есть в Windows (см. build-launcher.bat).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        bool created;
        try { File.Delete(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Overdeck.exe.old")); } catch { }
        EventWaitHandle showEvt = new EventWaitHandle(false, EventResetMode.AutoReset, "Overdeck.By.Starikov.Show");
        using (Mutex m = new Mutex(true, "Overdeck.By.Starikov.Launcher", out created))
        {
            // после обновления новый экземпляр ждёт, пока старый закроется
            if (!created && Array.IndexOf(args, "--wait") >= 0)
            {
                try { created = m.WaitOne(20000); } catch (AbandonedMutexException) { created = true; }
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (!created)
            {
                // Уже запущен — просим первое окно показаться (оно может быть свёрнуто в трей).
                showEvt.Set();
                return;
            }
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e)
            {
                Launcher.WriteLog("Ошибка: " + e.Exception);
                MessageBox.Show("Ошибка лаунчера:\n" + e.Exception.Message + "\n\nПодробности — в файле launcher.log рядом с Overdeck.exe.", "Overdeck", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };
            Launcher form = new Launcher();
            Thread waiter = new Thread(delegate()
            {
                while (true) { showEvt.WaitOne(); try { form.BeginInvoke((MethodInvoker)delegate { form.ShowMain(); }); } catch { } }
            });
            waiter.IsBackground = true;
            waiter.Start();
            Application.Run(form);
        }
    }
}

class ConsoleForm : Form
{
    public RichTextBox Box;
    const int MaxChars = 200000;

    public ConsoleForm()
    {
        Text = "Overdeck — консоль сервера";
        Size = new Size(960, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(12, 12, 12);
        Box = new RichTextBox();
        Box.Dock = DockStyle.Fill;
        Box.ReadOnly = true;
        Box.BackColor = Color.FromArgb(12, 12, 12);
        Box.ForeColor = Color.FromArgb(204, 204, 204);
        Box.Font = new Font("Consolas", 10f);
        Box.BorderStyle = BorderStyle.None;
        Box.WordWrap = false;
        Box.ScrollBars = RichTextBoxScrollBars.Both;
        Controls.Add(Box);
        // «Закрыть» окно консоли только прячет его — история остаётся.
        FormClosing += delegate(object s, FormClosingEventArgs e) { if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
    }

    public void Append(string text, Color color)
    {
        if (Box.TextLength > MaxChars) { Box.Select(0, Box.TextLength / 2); Box.SelectedText = ""; }
        Box.SelectionStart = Box.TextLength;
        Box.SelectionLength = 0;
        Box.SelectionColor = color;
        Box.AppendText(text + "\n");
        Box.SelectionStart = Box.TextLength;
        Box.ScrollToCaret();
    }
}

class Launcher : Form
{
    static readonly Color Bg = Color.FromArgb(20, 15, 17);
    static readonly Color CardBg = Color.FromArgb(30, 24, 26);
    static readonly Color Accent = Color.FromArgb(209, 75, 84);
    static readonly Color Dim = Color.FromArgb(150, 138, 140);
    static readonly Color Txt = Color.FromArgb(240, 233, 234);
    static readonly Color Ok = Color.FromArgb(95, 224, 160);

    string root;
    int port;
    string version = "?";
    Process server;
    bool ownServer;
    bool quitting;
    string updateUrl = "";
    string updatePage = "";
    string downloadUrl = "";
    string pendingVersion = "";
    bool autoUpdate = true;
    bool updating;
    CheckBox chkAuto;

    ConsoleForm console;
    Label lblVersion, lblStatus, lblUpdate;
    Button btnAdmin, btnConsole, btnUpdate, btnToggle;
    NotifyIcon tray;
    System.Windows.Forms.Timer poll;
    bool autoOpened;

    static string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher.log");
    public static void WriteLog(string text)
    {
        try { File.AppendAllText(logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + "\r\n", Encoding.UTF8); } catch { }
    }

    public static string AdminUrl(int port) { return "http://localhost:" + port + "/admin"; }

    public static int ReadPort(string dir)
    {
        try
        {
            string s = File.ReadAllText(Path.Combine(dir, "config.json"), Encoding.UTF8);
            Match m = Regex.Match(s, "\"port\"\\s*:\\s*(\\d+)");
            if (m.Success) return int.Parse(m.Groups[1].Value);
        }
        catch { }
        return 3001;
    }

    static string ReadVersion(string dir)
    {
        try
        {
            string s = File.ReadAllText(Path.Combine(dir, "package.json"), Encoding.UTF8);
            Match m = Regex.Match(s, "\"version\"\\s*:\\s*\"([^\"]+)\"");
            if (m.Success) return m.Groups[1].Value;
        }
        catch { }
        return "?";
    }

    public Launcher()
    {
        root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        port = ReadPort(root);
        version = ReadVersion(root);
        LoadUpdateConfig();

        Text = "Overdeck by Starikov";
        ClientSize = new Size(460, 400);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Bg;
        ForeColor = Txt;
        Font = new Font("Segoe UI", 9.5f);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Label title = new Label();
        title.Text = "Overdeck";
        title.Font = new Font("Segoe UI Semibold", 22f);
        title.ForeColor = Txt;
        title.AutoSize = true;
        title.Location = new Point(22, 16);
        Controls.Add(title);

        Label by = new Label();
        by.Text = "BY STARIKOV";
        by.Font = new Font("Consolas", 8.5f, FontStyle.Bold);
        by.ForeColor = Dim;
        by.AutoSize = true;
        by.Location = new Point(165, 34);
        Controls.Add(by);

        lblVersion = new Label();
        lblVersion.Text = "Версия " + version;
        lblVersion.ForeColor = Dim;
        lblVersion.AutoSize = true;
        lblVersion.Location = new Point(25, 62);
        Controls.Add(lblVersion);

        Panel card = new Panel();
        card.BackColor = CardBg;
        card.Location = new Point(22, 92);
        card.Size = new Size(416, 52);
        Controls.Add(card);

        lblStatus = new Label();
        lblStatus.AutoSize = false;
        lblStatus.Size = new Size(390, 30);
        lblStatus.Location = new Point(14, 14);
        lblStatus.Font = new Font("Segoe UI Semibold", 10.5f);
        card.Controls.Add(lblStatus);

        btnAdmin = MakeButton("Открыть админку", 22, 160, true);
        btnAdmin.Click += delegate { OpenAdmin(); };
        btnConsole = MakeButton("Открыть консоль", 232, 160, false);
        btnConsole.Click += delegate { ShowConsole(); };
        btnUpdate = MakeButton("Проверить обновления", 22, 214, false);
        btnUpdate.Click += delegate
        {
            if (pendingVersion.Length > 0 && downloadUrl.Length > 0 && !updating) InstallUpdate(pendingVersion);
            else CheckUpdates(true);
        };
        btnToggle = MakeButton("Остановить сервер", 232, 214, false);
        btnToggle.Click += delegate { ToggleServer(); };

        chkAuto = new CheckBox();
        chkAuto.Text = "Обновлять автоматически";
        chkAuto.Checked = autoUpdate;
        chkAuto.AutoSize = true;
        chkAuto.ForeColor = Txt;
        chkAuto.Location = new Point(24, 266);
        chkAuto.CheckedChanged += delegate { autoUpdate = chkAuto.Checked; SaveUpdateConfig(); };
        Controls.Add(chkAuto);

        lblUpdate = new Label();
        lblUpdate.AutoSize = false;
        lblUpdate.Size = new Size(416, 62);
        lblUpdate.Location = new Point(22, 294);
        lblUpdate.ForeColor = Dim;
        lblUpdate.Text = "Обновления ещё не проверялись.";
        Controls.Add(lblUpdate);

        Label hint = new Label();
        hint.Text = "Закрытие окна сворачивает в трей — сервер продолжает работать.\nПолностью выйти: правый клик по значку в трее → «Выход».";
        hint.ForeColor = Dim;
        hint.Font = new Font("Segoe UI", 8.5f);
        hint.AutoSize = false;
        hint.Size = new Size(416, 34);
        hint.Location = new Point(22, 360);
        Controls.Add(hint);

        console = new ConsoleForm();
        try { console.Icon = Icon; } catch { }

        // значок в трее
        tray = new NotifyIcon();
        tray.Icon = Icon != null ? Icon : SystemIcons.Application;
        tray.Text = "Overdeck by Starikov";
        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("Открыть окно", null, delegate { ShowMain(); });
        menu.Items.Add("Открыть админку", null, delegate { OpenAdmin(); });
        menu.Items.Add("Открыть консоль", null, delegate { ShowConsole(); });
        menu.Items.Add("-");
        menu.Items.Add("Выход (остановит сервер)", null, delegate { Quit(); });
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += delegate { ShowMain(); };
        tray.Visible = true;

        poll = new System.Windows.Forms.Timer();
        poll.Interval = 1000;
        poll.Tick += delegate { RefreshStatus(); };
        poll.Start();

        Shown += delegate
        {
            WriteLog("Лаунчер запущен, папка: " + root + ", порт " + port);
            StartServerIfNeeded();
            ThreadPool.QueueUserWorkItem(delegate { Thread.Sleep(2500); BeginInvoke((MethodInvoker)delegate { CheckUpdates(false); }); });
        };
        FormClosing += delegate(object s, FormClosingEventArgs e)
        {
            if (!quitting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
        };
    }

    Button MakeButton(string text, int x, int y, bool primary)
    {
        Button b = new Button();
        b.Text = text;
        b.Location = new Point(x, y);
        b.Size = new Size(206, 42);
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = primary ? 0 : 1;
        b.FlatAppearance.BorderColor = Color.FromArgb(70, 58, 62);
        b.BackColor = primary ? Accent : CardBg;
        b.ForeColor = Txt;
        b.Font = new Font("Segoe UI Semibold", 10f);
        b.Cursor = Cursors.Hand;
        Controls.Add(b);
        return b;
    }

    // ---------- сервер ----------

    bool PortOpen()
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult r = c.BeginConnect("127.0.0.1", port, null, null);
                bool ok = r.AsyncWaitHandle.WaitOne(300);
                if (ok && c.Connected) { c.EndConnect(r); return true; }
            }
        }
        catch { }
        return false;
    }

    string FindNode()
    {
        string[] candidates = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs\\node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs\\node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs\\nodejs\\node.exe")
        };
        foreach (string c in candidates) if (File.Exists(c)) return c;
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string p in path.Split(new char[] { Path.PathSeparator }))
        {
            try { string f = Path.Combine(p.Trim().Trim('"'), "node.exe"); if (File.Exists(f)) return f; } catch { }
        }
        return null;
    }

    void Log(string text, Color color)
    {
        WriteLog(text);
        if (console.InvokeRequired) { console.BeginInvoke((MethodInvoker)delegate { console.Append(text, color); }); return; }
        console.Append(text, color);
    }

    static readonly Regex Ansi = new Regex("\u001b\\[[0-9;]*m");

    void OnLine(string line)
    {
        if (line == null) return;
        bool red = line.IndexOf('█') >= 0 || line.Contains("\u001b[1;31m");
        string clean = Ansi.Replace(line, "");
        Color c = red ? Color.FromArgb(241, 76, 76) : (clean.Contains("[Ошибка]") || clean.ToLower().Contains("error") ? Color.FromArgb(240, 140, 140) : Color.FromArgb(204, 204, 204));
        Log(clean, c);
    }

    void StartServerIfNeeded()
    {
        if (PortOpen())
        {
            Log("[Overdeck] Сервер уже запущен на порту " + port + " (запущен не из этого окна).", Color.FromArgb(150, 138, 140));
            RefreshStatus();
            AutoOpenAdmin();
            return;
        }
        StartServer();
    }

    void StartServer()
    {
        string node = FindNode();
        if (node == null)
        {
            DialogResult r = MessageBox.Show("Не найден Node.js — он нужен для работы оверлея.\n\nОткрыть страницу загрузки (nodejs.org, версия LTS)?\nПосле установки запусти Overdeck ещё раз.", "Overdeck", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (r == DialogResult.Yes) try { Process.Start("https://nodejs.org/"); } catch { }
            return;
        }
        if (!File.Exists(Path.Combine(root, "server.js")))
        {
            MessageBox.Show("Рядом с Overdeck.exe нет файла server.js.\nПоложи Overdeck.exe в корень папки twitch-overlay-v2.", "Overdeck", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                if (!Directory.Exists(Path.Combine(root, "node_modules")))
                {
                    Log("[Overdeck] Первый запуск: устанавливаю зависимости (npm install)…", Color.FromArgb(255, 184, 107));
                    ProcessStartInfo npm = Prepare("cmd.exe", "/c npm install");
                    using (Process p = Process.Start(npm))
                    {
                        p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { OnLine(e.Data); };
                        p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { OnLine(e.Data); };
                        p.BeginOutputReadLine(); p.BeginErrorReadLine();
                        p.WaitForExit();
                    }
                }
                ProcessStartInfo psi = Prepare(node, "server.js");
                server = new Process();
                server.StartInfo = psi;
                server.EnableRaisingEvents = true;
                server.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { OnLine(e.Data); };
                server.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { OnLine(e.Data); };
                server.Exited += delegate
                {
                    int code = -1;
                    try { code = server.ExitCode; } catch { }
                    Log("[Overdeck] Сервер остановлен.", Color.FromArgb(255, 184, 107));
                    // код 75 — сервер сам просит перезапуск (после применения файла авторизации)
                    if (code == 75 && !quitting)
                    {
                        Log("[Overdeck] Перезапускаю сервер…", Color.FromArgb(255, 184, 107));
                        Thread.Sleep(1200);
                        StartServer();
                    }
                };
                server.Start();
                ownServer = true;
                server.BeginOutputReadLine();
                server.BeginErrorReadLine();
            }
            catch (Exception ex) { Log("[Overdeck] Не удалось запустить сервер: " + ex.Message, Color.FromArgb(241, 76, 76)); }
        });
    }

    ProcessStartInfo Prepare(string file, string args)
    {
        ProcessStartInfo psi = new ProcessStartInfo(file, args);
        psi.WorkingDirectory = root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        psi.EnvironmentVariables["OVERDECK_LAUNCHER"] = "1";
        return psi;
    }

    void StopServer()
    {
        try
        {
            if (server != null && !server.HasExited)
            {
                Process k = Process.Start(new ProcessStartInfo("taskkill", "/PID " + server.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false });
                k.WaitForExit(4000);
            }
        }
        catch { }
        ownServer = false;
    }

    void ToggleServer()
    {
        if (server != null && ownServer && !server.HasExited) { StopServer(); }
        else if (PortOpen()) { MessageBox.Show("Сервер на порту " + port + " запущен не из этого окна — остановить его можно только там, где он запущен (или через Диспетчер задач).", "Overdeck"); }
        else { StartServer(); }
    }

    void RefreshStatus()
    {
        bool open = PortOpen();
        if (open)
        {
            lblStatus.Text = "●  Сервер работает — порт " + port;
            lblStatus.ForeColor = Ok;
            btnToggle.Text = "Остановить сервер";
            if (!autoOpened) AutoOpenAdmin();
        }
        else
        {
            bool starting = server != null && !server.HasExited;
            lblStatus.Text = starting ? "●  Сервер запускается…" : "●  Сервер остановлен";
            lblStatus.ForeColor = starting ? Color.FromArgb(255, 184, 107) : Dim;
            btnToggle.Text = "Запустить сервер";
        }
        btnAdmin.Enabled = open;
        tray.Text = "Overdeck — " + (open ? "работает" : "остановлен");
    }

    void AutoOpenAdmin()
    {
        if (autoOpened) return;
        autoOpened = true;
        OpenAdmin();
    }

    void OpenAdmin()
    {
        autoOpened = true;
        try { Process.Start(new ProcessStartInfo(AdminUrl(port)) { UseShellExecute = true }); } catch { }
    }

    void ShowConsole()
    {
        console.Show();
        console.WindowState = FormWindowState.Normal;
        console.Activate();
    }

    public void ShowMain()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    void Quit()
    {
        quitting = true;
        StopServer();
        tray.Visible = false;
        tray.Dispose();
        Application.Exit();
    }

    // ---------- обновления ----------
    // Источник задаётся в launcher.json: {"updateUrl": "..."}.
    // updateUrl — либо JSON вида {"version":"2.1.0","url":"https://…","notes":"…"},
    // либо API последнего релиза GitHub (https://api.github.com/repos/ВЛАДЕЛЕЦ/РЕПО/releases/latest).

    void LoadUpdateConfig()
    {
        try
        {
            string s = File.ReadAllText(Path.Combine(root, "launcher.json"), Encoding.UTF8);
            Match m = Regex.Match(s, "\"updateUrl\"\\s*:\\s*\"([^\"]*)\"");
            if (m.Success) updateUrl = m.Groups[1].Value.Trim();
            Match a = Regex.Match(s, "\"autoUpdate\"\\s*:\\s*(true|false)");
            if (a.Success) autoUpdate = a.Groups[1].Value == "true";
        }
        catch { }
    }

    void SaveUpdateConfig()
    {
        try
        {
            string json = "{\r\n  \"updateUrl\": \"" + updateUrl.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\r\n  \"autoUpdate\": " + (autoUpdate ? "true" : "false") + "\r\n}\r\n";
            File.WriteAllText(Path.Combine(root, "launcher.json"), json, new UTF8Encoding(false));
        }
        catch { }
    }

    static int[] ParseVer(string v)
    {
        List<int> parts = new List<int>();
        foreach (string p in Regex.Replace(v ?? "", "[^0-9.]", "").Split(new char[] { '.' }))
        {
            int n; if (int.TryParse(p, out n)) parts.Add(n);
        }
        while (parts.Count < 3) parts.Add(0);
        return parts.ToArray();
    }

    static bool Newer(string remote, string local)
    {
        int[] a = ParseVer(remote), b = ParseVer(local);
        for (int i = 0; i < 3; i++) { if (a[i] > b[i]) return true; if (a[i] < b[i]) return false; }
        return false;
    }

    static string JsonStr(string json, string key)
    {
        Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        return m.Success ? m.Groups[1].Value.Replace("\\/", "/").Replace("\\n", "\n") : "";
    }

    void CheckUpdates(bool manual)
    {
        if (updateUrl.Length == 0)
        {
            lblUpdate.ForeColor = Dim;
            lblUpdate.Text = "Источник обновлений не настроен. Впиши адрес в launcher.json (поле updateUrl) — подробности в ЛАУНЧЕР.md.";
            return;
        }
        lblUpdate.ForeColor = Dim;
        lblUpdate.Text = "Проверяю обновления…";
        btnUpdate.Enabled = false;
        ThreadPool.QueueUserWorkItem(delegate
        {
            string msg; Color col = Dim; string page = ""; string newVersion = ""; string newDownload = "";
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                using (WebClient wc = new WebClient())
                {
                    wc.Encoding = Encoding.UTF8;
                    wc.Headers["User-Agent"] = "Overdeck-Launcher";
                    string json = wc.DownloadString(updateUrl);
                    string remote = JsonStr(json, "version");
                    if (remote.Length == 0) remote = JsonStr(json, "tag_name");
                    // GitHub: html_url — страница релиза (поле "url" там — адрес API, его открывать нельзя). Свой JSON: "url".
                    page = JsonStr(json, "html_url");
                    if (page.Length == 0) page = JsonStr(json, "url");
                    string notes = JsonStr(json, "notes");
                    if (notes.Length == 0) notes = JsonStr(json, "body");
                    if (notes.Length > 300) notes = notes.Substring(0, 300) + "…";
                    if (remote.Length == 0) { msg = "Не удалось прочитать версию из ответа сервера обновлений."; col = Color.FromArgb(240, 140, 140); }
                    else if (Newer(remote, version))
                    {
                        string dl = JsonStr(json, "download");
                        if (dl.Length == 0)
                        {
                            // релиз GitHub: сначала приложенный к релизу .zip, иначе исходный архив тега
                            Match za = Regex.Match(json, "\"browser_download_url\"\\s*:\\s*\"([^\"]+\\.zip)\"");
                            dl = za.Success ? za.Groups[1].Value : JsonStr(json, "zipball_url");
                        }
                        newVersion = remote.TrimStart('v', 'V');
                        newDownload = dl;
                        msg = "Доступна новая версия " + newVersion + " (у тебя " + version + ")." + (dl.Length > 0 ? "" : " Нажми здесь, чтобы открыть страницу загрузки.") + (notes.Length > 0 ? "\n" + notes : "");
                        col = Color.FromArgb(255, 184, 107);
                    }
                    else { msg = "У тебя последняя версия (" + version + ")."; col = Ok; page = ""; }
                }
            }
            catch (Exception ex) { msg = "Не удалось проверить обновления: " + ex.Message; col = Color.FromArgb(240, 140, 140); }
            BeginInvoke((MethodInvoker)delegate
            {
                updatePage = page;
                pendingVersion = newVersion;
                downloadUrl = newDownload;
                btnUpdate.Text = (newVersion.Length > 0 && newDownload.Length > 0) ? "Обновить до " + newVersion : "Проверить обновления";
                lblUpdate.Text = msg;
                lblUpdate.ForeColor = col;
                lblUpdate.Cursor = page.Length > 0 ? Cursors.Hand : Cursors.Default;
                btnUpdate.Enabled = true;
                if (newVersion.Length > 0 && newDownload.Length > 0 && autoUpdate && !updating) InstallUpdate(newVersion);
            });
        });
    }


    // ---------- установка обновления ----------
    // Скачивает zip, распаковывает ПОВЕРХ папки проекта (личные данные в архиве отсутствуют, поэтому не затрагиваются),
    // сам Overdeck.exe подменяется переименованием, при смене package.json выполняется npm install, затем лаунчер перезапускается.

    void SetUpdateText(string text, Color col)
    {
        BeginInvoke((MethodInvoker)delegate { lblUpdate.Text = text; lblUpdate.ForeColor = col; });
    }

    void InstallUpdate(string newVer)
    {
        if (updating) return;
        updating = true;
        btnUpdate.Enabled = false;
        string url = downloadUrl;
        ThreadPool.QueueUserWorkItem(delegate
        {
            string tmpDir = Path.Combine(Path.GetTempPath(), "overdeck-update-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            try
            {
                Directory.CreateDirectory(tmpDir);
                string zipPath = Path.Combine(tmpDir, "update.zip");
                SetUpdateText("Скачиваю обновление " + newVer + "…", Color.FromArgb(255, 184, 107));
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                using (WebClient wc = new WebClient())
                {
                    wc.Headers["User-Agent"] = "Overdeck-Launcher";
                    wc.DownloadFile(url, zipPath);
                }
                SetUpdateText("Устанавливаю обновление " + newVer + "…", Color.FromArgb(255, 184, 107));
                Log("[Overdeck] Устанавливаю обновление " + newVer + "…", Color.FromArgb(255, 184, 107));
                StopServer();
                Thread.Sleep(800);

                byte[] oldPkg = null;
                string pkgPath = Path.Combine(root, "package.json");
                try { if (File.Exists(pkgPath)) oldPkg = File.ReadAllBytes(pkgPath); } catch { }

                int count = ExtractOver(zipPath);
                Log("[Overdeck] Обновлено файлов: " + count, Color.FromArgb(204, 204, 204));

                // npm install нужен только если изменился список зависимостей (а не просто номер версии)
                bool pkgChanged = true;
                try { byte[] np = File.ReadAllBytes(pkgPath); pkgChanged = oldPkg == null || Deps(oldPkg) != Deps(np); } catch { }
                if (pkgChanged)
                {
                    Log("[Overdeck] Зависимости изменились — выполняю npm install…", Color.FromArgb(255, 184, 107));
                    SetUpdateText("Обновляю зависимости (npm install)…", Color.FromArgb(255, 184, 107));
                    try
                    {
                        ProcessStartInfo npm = Prepare("cmd.exe", "/c npm install");
                        using (Process p = Process.Start(npm))
                        {
                            p.OutputDataReceived += delegate(object s2, DataReceivedEventArgs e2) { OnLine(e2.Data); };
                            p.ErrorDataReceived += delegate(object s2, DataReceivedEventArgs e2) { OnLine(e2.Data); };
                            p.BeginOutputReadLine(); p.BeginErrorReadLine();
                            p.WaitForExit();
                        }
                    }
                    catch (Exception nex) { Log("[Overdeck] npm install не выполнен: " + nex.Message, Color.FromArgb(241, 76, 76)); }
                }
                try { Directory.Delete(tmpDir, true); } catch { }
                Log("[Overdeck] Обновление установлено. Перезапускаюсь…", Color.FromArgb(95, 224, 160));
                BeginInvoke((MethodInvoker)delegate { Relaunch(newVer); });
            }
            catch (Exception ex)
            {
                Log("[Overdeck] Не удалось обновиться: " + ex.Message, Color.FromArgb(241, 76, 76));
                SetUpdateText("Не удалось установить обновление: " + ex.Message, Color.FromArgb(240, 140, 140));
                try { Directory.Delete(tmpDir, true); } catch { }
                BeginInvoke((MethodInvoker)delegate { updating = false; btnUpdate.Enabled = true; StartServerIfNeeded(); });
            }
        });
    }

    static string Deps(byte[] pkg)
    {
        Match m = Regex.Match(Encoding.UTF8.GetString(pkg), "\"dependencies\"\\s*:\\s*\\{[^}]*\\}");
        return m.Success ? Regex.Replace(m.Value, "\\s+", "") : "";
    }

    int ExtractOver(string zipPath)
    {
        int count = 0;
        string rootFull = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        using (ZipArchive zip = ZipFile.OpenRead(zipPath))
        {
            // если все файлы лежат в одной папке верхнего уровня (так устроены архивы GitHub и наш zip) — срезаем её
            string prefix = null; bool same = true;
            foreach (ZipArchiveEntry e in zip.Entries)
            {
                string n = e.FullName.Replace('\\', '/');
                int i = n.IndexOf('/');
                if (i < 0) { if (e.Length > 0) { same = false; break; } continue; }
                string top = n.Substring(0, i + 1);
                if (prefix == null) prefix = top; else if (prefix != top) { same = false; break; }
            }
            if (!same) prefix = null;
            foreach (ZipArchiveEntry e in zip.Entries)
            {
                string n = e.FullName.Replace('\\', '/');
                if (n.EndsWith("/")) continue;
                if (prefix != null && n.StartsWith(prefix)) n = n.Substring(prefix.Length);
                if (n.Length == 0) continue;
                string dest = Path.GetFullPath(Path.Combine(root, n.Replace('/', Path.DirectorySeparatorChar)));
                if (!dest.StartsWith(rootFull)) continue; // защита от путей вида ../
                if (n == "launcher.json" && File.Exists(dest)) continue; // личные настройки лаунчера не трогаем
                if (n.StartsWith(".git/") || n.StartsWith("node_modules/")) continue;
                if (n == "Overdeck.exe") dest = dest + ".new";
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                using (Stream src = e.Open())
                using (FileStream dst = new FileStream(dest, FileMode.Create, FileAccess.Write))
                {
                    byte[] buf = new byte[81920]; int r;
                    while ((r = src.Read(buf, 0, buf.Length)) > 0) dst.Write(buf, 0, r);
                }
                count++;
            }
        }
        return count;
    }

    void Relaunch(string newVer)
    {
        string exe = Application.ExecutablePath;
        string fresh = exe + ".new";
        try
        {
            if (File.Exists(fresh))
            {
                string old = exe + ".old";
                try { if (File.Exists(old)) File.Delete(old); } catch { }
                File.Move(exe, old);       // запущенный exe можно переименовать
                File.Move(fresh, exe);
            }
        }
        catch (Exception ex) { WriteLog("Подмена exe не удалась: " + ex.Message); }
        try { tray.ShowBalloonTip(4000, "Overdeck обновлён", "Версия " + newVer + " установлена.", ToolTipIcon.Info); } catch { }
        try { Process.Start(new ProcessStartInfo(exe, "--wait") { UseShellExecute = false, WorkingDirectory = root }); }
        catch (Exception ex) { WriteLog("Перезапуск не удался: " + ex.Message); }
        quitting = true;
        tray.Visible = false;
        Application.Exit();
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        lblUpdate.Click += delegate { if (updatePage.Length > 0) try { Process.Start(updatePage); } catch { } };
    }
}
