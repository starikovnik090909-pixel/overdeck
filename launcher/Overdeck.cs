// Overdeck.cs — лаунчер Overdeck by Starikov (заменяет start.bat и start-silent.vbs).
// Окно: версия, состояние сервера, «Открыть админку», «Открыть консоль», «Проверить обновления», запуск/остановка.
// Закрытие окна сворачивает в трей — сервер продолжает работать. Выход — из меню значка в трее («Выход» останавливает сервер).
// Код написан под C# 5 / .NET Framework 4 — собирается штатным csc.exe, который есть в Windows (см. build-launcher.bat).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
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
    public static bool JustUpdated;
    [STAThread]
    static void Main(string[] args)
    {
        bool created;
        JustUpdated = Array.IndexOf(args, "--wait") >= 0;
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


// ----- оформление «Overdeck»: бордовый фон, коралловый акцент, стеклянные карточки -----
static class Ui
{
    // палитра: 0 — бордо (как было), 1 — графит с мягким красным, 2 — нейтральный графит
    public static Color Bg1, Bg2, Glow, CardTop, CardBot, Line, GhostLine, Coral, Coral2, Peach, Pink, Txt, Dim, Ok, Warn, Err;
    public static int GlowAlpha;
    static Ui()
    {
        Txt = Color.FromArgb(240, 233, 234); Ok = Color.FromArgb(95, 224, 160); Warn = Color.FromArgb(255, 184, 107); Err = Color.FromArgb(240, 140, 140);
        int pal = 1;
        try { string v = Environment.GetEnvironmentVariable("OVERDECK_PALETTE"); if (!string.IsNullOrEmpty(v)) pal = int.Parse(v); } catch { }
        if (pal == 0)
        {
            Bg1 = Color.FromArgb(23, 10, 13); Bg2 = Color.FromArgb(12, 5, 7); Glow = Color.FromArgb(58, 18, 27); GlowAlpha = 120;
            CardTop = Color.FromArgb(150, 56, 20, 30); CardBot = Color.FromArgb(150, 36, 12, 18); Line = Color.FromArgb(70, 255, 100, 110); GhostLine = Color.FromArgb(255, 100, 110);
            Coral = Color.FromArgb(255, 90, 100); Coral2 = Color.FromArgb(214, 47, 69); Peach = Color.FromArgb(255, 154, 106); Pink = Color.FromArgb(240, 160, 166); Dim = Color.FromArgb(185, 143, 149);
        }
        else if (pal == 1)
        {
            // графит как в админке (#18181B / #1F1F23), красный — только акцент
            Bg1 = Color.FromArgb(27, 25, 27); Bg2 = Color.FromArgb(14, 14, 16); Glow = Color.FromArgb(74, 28, 34); GlowAlpha = 70;
            CardTop = Color.FromArgb(235, 36, 34, 37); CardBot = Color.FromArgb(235, 29, 28, 31); Line = Color.FromArgb(34, 255, 255, 255); GhostLine = Color.FromArgb(255, 255, 255);
            Coral = Color.FromArgb(209, 78, 86); Coral2 = Color.FromArgb(160, 52, 58); Peach = Color.FromArgb(226, 112, 108); Pink = Color.FromArgb(214, 150, 154); Dim = Color.FromArgb(160, 156, 158);
        }
        else
        {
            Bg1 = Color.FromArgb(24, 24, 27); Bg2 = Color.FromArgb(14, 14, 16); Glow = Color.FromArgb(24, 24, 27); GlowAlpha = 0;
            CardTop = Color.FromArgb(255, 33, 33, 37); CardBot = Color.FromArgb(255, 31, 31, 35); Line = Color.FromArgb(28, 255, 255, 255); GhostLine = Color.FromArgb(255, 255, 255);
            Coral = Color.FromArgb(193, 76, 80); Coral2 = Color.FromArgb(150, 56, 58); Peach = Color.FromArgb(193, 76, 80); Pink = Color.FromArgb(190, 160, 162); Dim = Color.FromArgb(150, 150, 154);
        }
    }

    public static GraphicsPath Round(Rectangle r, int rad)
    {
        GraphicsPath p = new GraphicsPath();
        int d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}

class Card : Panel
{
    public Card() { DoubleBuffered = true; BackColor = Color.Transparent; SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.ResizeRedraw, true); }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = Ui.Round(r, 14))
        {
            using (LinearGradientBrush b = new LinearGradientBrush(r, Ui.CardTop, Ui.CardBot, 90f)) e.Graphics.FillPath(b, p);
            using (Pen pen = new Pen(Ui.Line, 1f)) e.Graphics.DrawPath(pen, p);
        }
    }
}

class FancyButton : Button
{
    public bool Primary;
    bool hover, down;
    public FancyButton()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent;
        FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0; Cursor = Cursors.Hand;
        SetStyle(ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Font = new Font("Segoe UI Semibold", 10f);
    }
    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        base.OnPaintBackground(e);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        int alpha = Enabled ? 255 : 110;
        using (GraphicsPath p = Ui.Round(r, 11))
        {
            if (Primary)
            {
                Color c1 = Color.FromArgb(alpha, hover ? Ui.Coral : Ui.Coral2);
                using (LinearGradientBrush b = new LinearGradientBrush(r, c1, Color.FromArgb(alpha, down ? Ui.Coral2 : Ui.Coral), LinearGradientMode.Horizontal))
                {
                    ColorBlend cb = new ColorBlend(3);
                    cb.Colors = new Color[] { c1, Color.FromArgb(alpha, Ui.Coral), Color.FromArgb(alpha, Ui.Peach) };
                    cb.Positions = new float[] { 0f, 0.6f, 1f };
                    b.InterpolationColors = cb;
                    g.FillPath(b, p);
                }
            }
            else
            {
                using (SolidBrush b = new SolidBrush(Color.FromArgb(hover ? 30 : 14, 255, 255, 255))) g.FillPath(b, p);
                using (Pen pen = new Pen(Color.FromArgb(hover ? 110 : 55, Ui.GhostLine), 1f)) g.DrawPath(pen, p);
            }
        }
        TextRenderer.DrawText(g, Text, Font, ClientRectangle, Color.FromArgb(alpha, Primary ? Color.White : Ui.Txt), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }
}

class Toggle : CheckBox
{
    public Toggle() { SetStyle(ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; Cursor = Cursors.Hand; AutoSize = false; Height = 24; }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        base.OnPaintBackground(e);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle tr = new Rectangle(0, 3, 38, 18);
        using (GraphicsPath p = Ui.Round(tr, 9))
        using (SolidBrush b = new SolidBrush(Checked ? Ui.Coral : Color.FromArgb(90, 58, 64))) g.FillPath(b, p);
        int kx = Checked ? tr.Right - 16 : tr.X + 2;
        using (SolidBrush b = new SolidBrush(Color.White)) g.FillEllipse(b, kx, tr.Y + 2, 14, 14);
        TextRenderer.DrawText(g, Text, Font, new Rectangle(46, 0, Width - 46, Height), Ui.Dim, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }
}

class ProgressLine : Control
{
    int val;
    public int Value { get { return val; } set { val = Math.Max(0, Math.Min(100, value)); Invalidate(); } }
    public ProgressLine() { DoubleBuffered = true; Height = 6; SetStyle(ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = Ui.Round(r, 3)) using (SolidBrush b = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillPath(b, p);
        int w = (int)((Width - 1) * (val / 100.0));
        if (w > 6)
        {
            Rectangle f = new Rectangle(0, 0, w, Height - 1);
            using (GraphicsPath p = Ui.Round(f, 3)) using (LinearGradientBrush b = new LinearGradientBrush(f, Ui.Coral2, Ui.Peach, LinearGradientMode.Horizontal)) g.FillPath(b, p);
        }
    }
}

class Dot : Control
{
    Color c = Color.Gray;
    public Color DotColor { get { return c; } set { c = value; Invalidate(); } }
    public Dot() { Size = new Size(14, 14); DoubleBuffered = true; SetStyle(ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (SolidBrush glow = new SolidBrush(Color.FromArgb(55, c))) e.Graphics.FillEllipse(glow, 0, 0, 13, 13);
        using (SolidBrush b = new SolidBrush(c)) e.Graphics.FillEllipse(b, 3, 3, 7, 7);
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
    Toggle chkAuto;

    ConsoleForm console;
    Label lblVersion, lblStatus, lblUpdate, lblUpdTitle, lblNode, lblAdminUrl;
    FancyButton btnAdmin, btnConsole, btnUpdate, btnToggle;
    Dot dotUpd, dotServer;
    ProgressLine progUpd;
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
        ClientSize = new Size(460, 566);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Ui.Bg1;
        ForeColor = Ui.Txt;
        Font = new Font("Segoe UI", 9.5f);
        DoubleBuffered = true;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        // --- шапка ---
        PictureBox logo = new PictureBox();
        logo.Size = new Size(56, 56);
        logo.Location = new Point(22, 18);
        logo.SizeMode = PictureBoxSizeMode.Zoom;
        logo.BackColor = Color.Transparent;
        try
        {
            using (Stream rs = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                logo.Image = new Bitmap(rs);
        }
        catch { try { logo.Image = Icon.ToBitmap(); } catch { } }
        Controls.Add(logo);

        Label by = new Label();
        by.Text = "BY STARIKOV";
        by.Font = new Font("Consolas", 8.5f, FontStyle.Bold);
        by.ForeColor = Ui.Pink;
        by.BackColor = Color.Transparent;
        by.AutoSize = true;
        by.Location = new Point(88, 20);
        Controls.Add(by);

        Label title = new Label();
        title.Text = "Overdeck";
        title.Font = new Font("Segoe UI Semibold", 23f);
        title.ForeColor = Color.White;
        title.BackColor = Color.Transparent;
        title.AutoSize = true;
        title.Location = new Point(84, 32);
        Controls.Add(title);

        Card verPill = new Card();
        verPill.Size = new Size(96, 28);
        verPill.Location = new Point(342, 34);
        lblVersion = new Label();
        lblVersion.Text = "v" + version;
        lblVersion.Font = new Font("Consolas", 9.5f, FontStyle.Bold);
        lblVersion.ForeColor = Ui.Dim;
        lblVersion.BackColor = Color.Transparent;
        lblVersion.AutoSize = false;
        lblVersion.TextAlign = ContentAlignment.MiddleCenter;
        lblVersion.Dock = DockStyle.Fill;
        verPill.Controls.Add(lblVersion);
        Controls.Add(verPill);

        // --- карточка обновлений ---
        Card cUpd = new Card();
        cUpd.Location = new Point(22, 96);
        cUpd.Size = new Size(416, 92);
        Controls.Add(cUpd);
        dotUpd = new Dot(); dotUpd.Location = new Point(16, 16); dotUpd.DotColor = Ui.Dim; cUpd.Controls.Add(dotUpd);
        lblUpdTitle = new Label();
        lblUpdTitle.Text = "Обновления";
        lblUpdTitle.Font = new Font("Segoe UI Semibold", 10.5f);
        lblUpdTitle.ForeColor = Color.White;
        lblUpdTitle.BackColor = Color.Transparent;
        lblUpdTitle.AutoSize = true;
        lblUpdTitle.Location = new Point(36, 13);
        cUpd.Controls.Add(lblUpdTitle);
        lblUpdate = new Label();
        lblUpdate.AutoSize = false;
        lblUpdate.Size = new Size(384, 38);
        lblUpdate.Location = new Point(18, 38);
        lblUpdate.ForeColor = Ui.Dim;
        lblUpdate.BackColor = Color.Transparent;
        lblUpdate.Font = new Font("Segoe UI", 9f);
        lblUpdate.Text = "Обновления ещё не проверялись.";
        cUpd.Controls.Add(lblUpdate);
        progUpd = new ProgressLine();
        progUpd.Location = new Point(18, 78);
        progUpd.Size = new Size(380, 6);
        progUpd.Visible = false;
        cUpd.Controls.Add(progUpd);

        // --- карточка состояния ---
        Card cSt = new Card();
        cSt.Location = new Point(22, 200);
        cSt.Size = new Size(416, 116);
        Controls.Add(cSt);
        dotServer = new Dot(); dotServer.Location = new Point(16, 14); cSt.Controls.Add(dotServer);
        cSt.Controls.Add(RowName("Сервер", 11));
        lblStatus = RowValue(11); cSt.Controls.Add(lblStatus);
        Dot dn = new Dot(); dn.Location = new Point(16, 48); dn.DotColor = Ui.Ok; cSt.Controls.Add(dn);
        cSt.Controls.Add(RowName("Node.js", 45));
        lblNode = RowValue(45); lblNode.Text = "…"; cSt.Controls.Add(lblNode);
        Dot da = new Dot(); da.Location = new Point(16, 82); da.DotColor = Ui.Pink; cSt.Controls.Add(da);
        cSt.Controls.Add(RowName("Админка", 79));
        lblAdminUrl = RowValue(79); lblAdminUrl.Text = "localhost:" + port + "/admin"; cSt.Controls.Add(lblAdminUrl);

        // --- кнопки ---
        btnAdmin = MakeButton("Открыть админку  ›", 22, 330, 416, 52, true);
        btnAdmin.Font = new Font("Segoe UI Semibold", 12.5f);
        btnAdmin.Click += delegate { OpenAdmin(); };
        btnConsole = MakeButton("Консоль сервера", 22, 392, 204, 42, false);
        btnConsole.Click += delegate { ShowConsole(); };
        btnUpdate = MakeButton("Проверить обновления", 234, 392, 204, 42, false);
        btnUpdate.Click += delegate
        {
            if (pendingVersion.Length > 0 && downloadUrl.Length > 0 && !updating) InstallUpdate(pendingVersion);
            else CheckUpdates(true);
        };
        btnToggle = MakeButton("Остановить сервер", 22, 442, 416, 40, false);
        btnToggle.Click += delegate { ToggleServer(); };

        chkAuto = new Toggle();
        chkAuto.Text = "Обновлять автоматически";
        chkAuto.Checked = autoUpdate;
        chkAuto.Location = new Point(24, 498);
        chkAuto.Size = new Size(280, 24);
        chkAuto.CheckedChanged += delegate { autoUpdate = chkAuto.Checked; SaveUpdateConfig(); };
        Controls.Add(chkAuto);

        Label hint = new Label();
        hint.Text = "Закрытие окна сворачивает в трей — сервер продолжает работать.\nПолностью выйти: значок в трее → «Выход».";
        hint.ForeColor = Color.FromArgb(150, 120, 126);
        hint.BackColor = Color.Transparent;
        hint.Font = new Font("Segoe UI", 8.5f);
        hint.AutoSize = false;
        hint.Size = new Size(416, 34);
        hint.Location = new Point(24, 526);
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
            ThreadPool.QueueUserWorkItem(delegate
            {
                string nv = "не найден";
                Color nc = Ui.Err;
                try
                {
                    string nodeExe = FindNode();
                    if (nodeExe != null)
                    {
                        ProcessStartInfo ni = new ProcessStartInfo(nodeExe, "-v");
                        ni.UseShellExecute = false; ni.CreateNoWindow = true; ni.RedirectStandardOutput = true;
                        using (Process np = Process.Start(ni)) { nv = np.StandardOutput.ReadToEnd().Trim(); np.WaitForExit(3000); }
                        nc = Ui.Dim;
                    }
                }
                catch { }
                BeginInvoke((MethodInvoker)delegate { lblNode.Text = nv; lblNode.ForeColor = nc; });
            });
            StartServerIfNeeded();
            ThreadPool.QueueUserWorkItem(delegate { Thread.Sleep(2500); BeginInvoke((MethodInvoker)delegate { CheckUpdates(false); }); });
            CheckWhatsNew();
        };
        FormClosing += delegate(object s, FormClosingEventArgs e)
        {
            if (!quitting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
        };
    }

    FancyButton MakeButton(string text, int x, int y, int w, int h, bool primary)
    {
        FancyButton b = new FancyButton();
        b.Text = text;
        b.Primary = primary;
        b.Location = new Point(x, y);
        b.Size = new Size(w, h);
        Controls.Add(b);
        return b;
    }

    static Label RowName(string text, int y)
    {
        Label l = new Label();
        l.Text = text; l.AutoSize = true; l.Location = new Point(38, y + 2);
        l.ForeColor = Ui.Txt; l.BackColor = Color.Transparent; l.Font = new Font("Segoe UI Semibold", 10f);
        return l;
    }

    static Label RowValue(int y)
    {
        Label l = new Label();
        l.AutoSize = false; l.Size = new Size(260, 22); l.Location = new Point(140, y + 2);
        l.TextAlign = ContentAlignment.MiddleRight; l.ForeColor = Ui.Dim; l.BackColor = Color.Transparent;
        l.Font = new Font("Consolas", 9.5f, FontStyle.Bold);
        return l;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (LinearGradientBrush b = new LinearGradientBrush(ClientRectangle, Ui.Bg1, Ui.Bg2, 90f)) g.FillRectangle(b, ClientRectangle);
        using (GraphicsPath gp = new GraphicsPath())
        {
            Rectangle gr = new Rectangle(-260, -200, 760, 420);
            gp.AddEllipse(gr);
            using (PathGradientBrush pg = new PathGradientBrush(gp))
            {
                pg.CenterColor = Color.FromArgb(Ui.GlowAlpha, Ui.Glow);
                pg.SurroundColors = new Color[] { Color.FromArgb(0, Ui.Glow) };
                g.FillPath(pg, gp);
            }
        }
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

    const string NodeVer = "22.11.0";
    string PortableDir() { return Path.Combine(root, "node-runtime"); }

    string FindNode()
    {
        try { string pn = Path.Combine(PortableDir(), "node.exe"); if (File.Exists(pn)) return pn; } catch { }
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
            DialogResult r = MessageBox.Show("Не найден Node.js — он нужен для работы оверлея.\n\nСкачать и поставить автоматически? (~30 МБ, кладётся в папку node-runtime рядом с Overdeck, права администратора не нужны)\n\nНет — открыть страницу nodejs.org.", "Overdeck", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (r == DialogResult.Yes) InstallNode();
            else if (r == DialogResult.No) try { Process.Start("https://nodejs.org/"); } catch { }
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

    void InstallNode()
    {
        Log("[Overdeck] Node.js не найден — скачиваю портативную версию " + NodeVer + "…", Color.FromArgb(255, 184, 107));
        SetUpdateText("Скачиваю Node.js " + NodeVer + "…", Color.FromArgb(255, 184, 107));
        ThreadPool.QueueUserWorkItem(delegate
        {
            string zip = Path.Combine(Path.GetTempPath(), "overdeck-node-" + NodeVer + ".zip");
            string tmp = Path.Combine(Path.GetTempPath(), "overdeck-node-x");
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                using (WebClient wc = new WebClient())
                {
                    wc.Headers["User-Agent"] = "Overdeck-Launcher";
                    wc.DownloadFile("https://nodejs.org/dist/v" + NodeVer + "/node-v" + NodeVer + "-win-x64.zip", zip);
                }
                Log("[Overdeck] Распаковываю Node.js…", Color.FromArgb(255, 184, 107));
                if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
                ZipFile.ExtractToDirectory(zip, tmp);
                string[] dirs = Directory.GetDirectories(tmp);
                string src = dirs.Length == 1 ? dirs[0] : tmp;
                if (Directory.Exists(PortableDir())) Directory.Delete(PortableDir(), true);
                Directory.Move(src, PortableDir());
                try { Directory.Delete(tmp, true); File.Delete(zip); } catch { }
                if (!File.Exists(Path.Combine(PortableDir(), "node.exe"))) throw new Exception("в архиве нет node.exe");
                Log("[Overdeck] Node.js установлен.", Ui.Ok);
                SetUpdateText("Node.js установлен", Ui.Ok);
                BeginInvoke((MethodInvoker)delegate { lblNode.Text = "v" + NodeVer; lblNode.ForeColor = Ui.Dim; StartServer(); });
            }
            catch (Exception ex)
            {
                Log("[Overdeck] Не удалось установить Node.js: " + ex.Message, Color.FromArgb(241, 76, 76));
                SetUpdateText("Node.js не установлен", Ui.Err);
                BeginInvoke((MethodInvoker)delegate { MessageBox.Show("Не удалось скачать Node.js: " + ex.Message + "\n\nУстанови его вручную с nodejs.org (LTS) и запусти Overdeck снова.", "Overdeck", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }
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
        try
        {
            string nd = Path.GetDirectoryName(FindNode() ?? "");
            if (!string.IsNullOrEmpty(nd)) psi.EnvironmentVariables["PATH"] = nd + Path.PathSeparator + (psi.EnvironmentVariables["PATH"] ?? "");
        }
        catch { }
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
            lblStatus.Text = "работает · порт " + port;
            lblStatus.ForeColor = Ui.Ok;
            dotServer.DotColor = Ui.Ok;
            btnToggle.Text = "Остановить сервер";
            if (!autoOpened) AutoOpenAdmin();
        }
        else
        {
            bool starting = server != null && !server.HasExited;
            lblStatus.Text = starting ? "запускается…" : "остановлен";
            lblStatus.ForeColor = starting ? Ui.Warn : Ui.Dim;
            dotServer.DotColor = starting ? Ui.Warn : Color.FromArgb(122, 90, 96);
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


    // ---------- «Что нового» после обновления ----------
    // Версия, для которой окно уже показывали, хранится в launcher.state. Если после запуска версия в package.json другая
    // (или лаунчер только что перезапустился после установки обновления) — берём описание релиза этой версии и показываем окно.

    static string Unescape(string v)
    {
        if (v == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < v.Length; i++)
        {
            char c = v[i];
            if (c != '\\' || i + 1 >= v.Length) { sb.Append(c); continue; }
            char n = v[++i];
            if (n == 'n') sb.Append('\n');
            else if (n == 'r') { }
            else if (n == 't') sb.Append(' ');
            else if (n == 'u' && i + 4 < v.Length) { int cp; if (int.TryParse(v.Substring(i + 1, 4), System.Globalization.NumberStyles.HexNumber, null, out cp)) { sb.Append((char)cp); i += 4; } }
            else sb.Append(n);
        }
        return sb.ToString();
    }

    static string RawJsonStr(string json, string key)
    {
        Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        return m.Success ? Unescape(m.Groups[1].Value) : "";
    }

    static string CleanNotes(string md)
    {
        List<string> lines = new List<string>();
        foreach (string raw in md.Split('\n'))
        {
            string l = raw.TrimEnd();
            l = Regex.Replace(l, "^#+\\s*", "");
            l = Regex.Replace(l, "^\\s*[-*]\\s+", "•  ");
            l = l.Replace("**", "").Replace("`", "");
            lines.Add(l);
        }
        return string.Join("\r\n", lines.ToArray()).Trim();
    }

    void CheckWhatsNew()
    {
        string statePath = Path.Combine(root, "launcher.state");
        string last = "";
        try { if (File.Exists(statePath)) last = File.ReadAllText(statePath, Encoding.UTF8).Trim(); } catch { }
        string cur = version;
        if (cur.Length == 0 || cur == "?") return;
        if (last == cur) return;
        if (last.Length == 0 && !Program.JustUpdated)
        {
            try { File.WriteAllText(statePath, cur, new UTF8Encoding(false)); } catch { }
            return;
        }
        if (updateUrl.IndexOf("/releases/latest") < 0) { try { File.WriteAllText(statePath, cur, new UTF8Encoding(false)); } catch { } return; }
        ThreadPool.QueueUserWorkItem(delegate
        {
            string title = "", notes = "";
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                foreach (string tag in new string[] { cur, "v" + cur })
                {
                    try
                    {
                        using (WebClient wc = new WebClient())
                        {
                            wc.Encoding = Encoding.UTF8;
                            wc.Headers["User-Agent"] = "Overdeck-Launcher";
                            string json = wc.DownloadString(updateUrl.Replace("/releases/latest", "/releases/tags/" + tag));
                            notes = RawJsonStr(json, "body");
                            title = RawJsonStr(json, "name");
                            break;
                        }
                    }
                    catch { }
                }
            }
            catch { }
            if (notes.Trim().Length == 0 && title.Length == 0) return; // не удалось получить описание — попробуем при следующем запуске
            BeginInvoke((MethodInvoker)delegate { ShowWhatsNew(cur, title, CleanNotes(notes)); });
            try { File.WriteAllText(statePath, cur, new UTF8Encoding(false)); } catch { }
        });
    }

    void ShowWhatsNew(string ver, string title, string notes)
    {
        try
        {
            Form f = new Form();
            f.Text = "Overdeck — что нового";
            f.StartPosition = FormStartPosition.CenterScreen;
            f.ClientSize = new Size(560, 440);
            f.FormBorderStyle = FormBorderStyle.FixedDialog; f.MaximizeBox = false; f.MinimizeBox = false;
            f.BackColor = Ui.Bg2; f.ForeColor = Ui.Txt; f.TopMost = true;
            try { f.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            Label h = new Label(); h.Text = "Overdeck обновлён до " + ver; h.Font = new Font("Segoe UI Semibold", 15f); h.ForeColor = Ui.Txt; h.SetBounds(20, 16, 520, 32); f.Controls.Add(h);
            Label sub = new Label(); sub.Text = title; sub.Font = new Font("Segoe UI", 10f); sub.ForeColor = Ui.Dim; sub.SetBounds(22, 50, 516, 22); f.Controls.Add(sub);
            TextBox tb = new TextBox(); tb.Multiline = true; tb.ReadOnly = true; tb.ScrollBars = ScrollBars.Vertical; tb.BorderStyle = BorderStyle.None;
            tb.BackColor = Color.FromArgb(30, 29, 32); tb.ForeColor = Ui.Txt; tb.Font = new Font("Segoe UI", 10.5f);
            tb.Text = notes.Length > 0 ? notes : "Описание этой версии на странице релиза не заполнено.";
            tb.SetBounds(20, 82, 520, 288); tb.Select(0, 0); f.Controls.Add(tb);
            Button ok = new Button(); ok.Text = "Понятно"; ok.FlatStyle = FlatStyle.Flat; ok.FlatAppearance.BorderSize = 0;
            ok.BackColor = Ui.Coral; ok.ForeColor = Color.White; ok.Font = new Font("Segoe UI Semibold", 10f);
            ok.SetBounds(420, 384, 120, 36); ok.Click += delegate { f.Close(); }; f.Controls.Add(ok); f.AcceptButton = ok;
            f.ShowDialog();
        }
        catch (Exception ex) { WriteLog("Окно «Что нового» не показано: " + ex.Message); }
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
        // те же цифры: 3.0.0 новее, чем 3.0.0-beta
        return (local ?? "").IndexOf('-') >= 0 && (remote ?? "").IndexOf('-') < 0;
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
                dotUpd.DotColor = col;
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
                    ManualResetEvent done = new ManualResetEvent(false);
                    Exception derr = null;
                    BeginInvoke((MethodInvoker)delegate { progUpd.Value = 0; progUpd.Visible = true; });
                    wc.DownloadProgressChanged += delegate(object s3, DownloadProgressChangedEventArgs e3) { int pv = e3.ProgressPercentage; BeginInvoke((MethodInvoker)delegate { progUpd.Value = pv; }); };
                    wc.DownloadFileCompleted += delegate(object s3, System.ComponentModel.AsyncCompletedEventArgs e3) { derr = e3.Error; done.Set(); };
                    wc.DownloadFileAsync(new Uri(url), zipPath);
                    done.WaitOne();
                    if (derr != null) throw derr;
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
                BeginInvoke((MethodInvoker)delegate { updating = false; progUpd.Visible = false; btnUpdate.Enabled = true; StartServerIfNeeded(); });
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
