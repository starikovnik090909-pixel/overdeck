# notify-host.ps1 — окно уведомлений Overdeck в углу рабочего стола Windows.
# Запускается сервером Overdeck (notify.js) и читает JSON-строки со стандартного ввода:
#   {"kind":"ok|err|warn|info","title":"...","text":"...","dur":3.5,"corner":"br","keep":false}
# Окна не берут фокус и не мешают играм и стриму. Закрывается, когда сервер закрывает ввод.
$ErrorActionPreference = 'Stop'
$src = @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace OverdeckToast
{
    class Native
    {
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref Point pptDst, ref Size psize, IntPtr hdcSrc, ref Point pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)] public static extern IntPtr GetDC(IntPtr hWnd);
        [DllImport("user32.dll", ExactSpelling = true)] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)] public static extern IntPtr CreateCompatibleDC(IntPtr hDC);
        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll", ExactSpelling = true)] public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);
        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)] public static extern bool DeleteObject(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct BLENDFUNCTION { public byte BlendOp; public byte BlendFlags; public byte SourceConstantAlpha; public byte AlphaFormat; }
        public const int ULW_ALPHA = 2;
    }

    class ToastForm : Form
    {
        public Action OnClick;
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x00080000;   // WS_EX_LAYERED
                cp.ExStyle |= 0x00000080;   // WS_EX_TOOLWINDOW
                cp.ExStyle |= 0x08000000;   // WS_EX_NOACTIVATE
                cp.ExStyle |= 0x00000008;   // WS_EX_TOPMOST
                return cp;
            }
        }
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0021) { m.Result = (IntPtr)3; return; } // WM_MOUSEACTIVATE -> MA_NOACTIVATE
            if (m.Msg == 0x0201) { if (OnClick != null) OnClick(); return; } // WM_LBUTTONDOWN
            base.WndProc(ref m);
        }
    }

    class Toast
    {
        public ToastForm Form;
        public IntPtr HBitmap;
        public int Width, Height;     // в пикселях, вместе с полем под тень
        public double Y, TargetY;
        public long Born;
        public double DurMs;           // 0 — висит, пока не закроют
        public long ClosingAt;         // 0 — не закрывается
        public bool Placed;
    }

    class HostContext : ApplicationContext
    {
        const int Gap = 8;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly ConcurrentQueue<string> inbox = new ConcurrentQueue<string>();
        readonly List<Toast> shown = new List<Toast>();
        readonly Queue<Dictionary<string, object>> waiting = new Queue<Dictionary<string, object>>();
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        volatile bool inputClosed = false;
        float scale = 1f;
        string corner = "br";
        readonly System.Diagnostics.Stopwatch clock = System.Diagnostics.Stopwatch.StartNew();

        public HostContext()
        {
            try { Native.SetProcessDPIAware(); } catch (Exception) { }
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { scale = g.DpiX / 96f; }
            Thread t = new Thread(ReadInput);
            t.IsBackground = true;
            t.Start();
            timer.Interval = 15;
            timer.Tick += Tick;
            timer.Start();
        }

        void ReadInput()
        {
            try
            {
                string line;
                while ((line = Console.In.ReadLine()) != null) { if (line.Length > 0) inbox.Enqueue(line); }
            }
            catch (Exception) { }
            inputClosed = true;
        }

        long Now() { return clock.ElapsedMilliseconds; }

        void Tick(object s, EventArgs e)
        {
            string line;
            while (inbox.TryDequeue(out line))
            {
                try
                {
                    Dictionary<string, object> d = json.DeserializeObject(line) as Dictionary<string, object>;
                    if (d != null) waiting.Enqueue(d);
                }
                catch (Exception) { }
            }
            long now = Now();
            while (waiting.Count > 0 && CountLive() < 3)
            {
                try { Spawn(waiting.Dequeue(), now); } catch (Exception) { }
            }
            for (int i = shown.Count - 1; i >= 0; i--)
            {
                Toast t = shown[i];
                long age = now - t.Born;
                if (t.ClosingAt == 0 && t.DurMs > 0 && age > t.DurMs) t.ClosingAt = now;
                if (t.ClosingAt != 0 && now - t.ClosingAt > 280) { Dispose(t); shown.RemoveAt(i); }
            }
            Layout();
            for (int i = 0; i < shown.Count; i++) Paint(shown[i], now);
            if (inputClosed && shown.Count == 0 && waiting.Count == 0) { timer.Stop(); ExitThread(); }
        }

        int CountLive() { int n = 0; foreach (Toast t in shown) if (t.ClosingAt == 0) n++; return n; }

        static string Str(Dictionary<string, object> d, string k)
        {
            object o; if (d.TryGetValue(k, out o) && o != null) return Convert.ToString(o);
            return "";
        }

        static Color KindColor(string kind)
        {
            switch (kind)
            {
                case "ok": return Color.FromArgb(43, 196, 180);
                case "err": return Color.FromArgb(255, 107, 107);
                case "warn": return Color.FromArgb(242, 184, 75);
                default: return Color.FromArgb(159, 178, 176);
            }
        }

        void Spawn(Dictionary<string, object> d, long now)
        {
            string kind = Str(d, "kind"), title = Str(d, "title"), text = Str(d, "text"), c = Str(d, "corner");
            if (c == "br" || c == "bl" || c == "tr" || c == "tl") corner = c;
            double dur = 4, parsed; if (double.TryParse(Str(d, "dur"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out parsed)) dur = parsed;
            bool keep = Str(d, "keep").ToLower() == "true";
            Toast t = new Toast();
            Render(t, kind, title, text, keep);
            t.Born = now;
            t.DurMs = (keep || dur <= 0) ? 0 : dur * 1000.0;
            ToastForm f = new ToastForm();
            f.FormBorderStyle = FormBorderStyle.None;
            f.ShowInTaskbar = false;
            f.StartPosition = FormStartPosition.Manual;
            f.Size = new Size(t.Width, t.Height);
            f.OnClick = delegate { if (t.ClosingAt == 0) t.ClosingAt = Now(); };
            t.Form = f;
            shown.Add(t);
            f.Show();
        }

        void Render(Toast t, string kind, string title, string text, bool keep)
        {
            float s = scale;
            bool details = text.Length > 0;
            float H = (details ? 60f : 46f) * s;
            float D = (details ? 36f : 28f) * s;          // диаметр значка
            float pad = (H - D) / 2f;                      // отступ значка от края: значок и левая дуга таблетки концентричны
            float M = 14f * s;                             // поле под тень
            Font fT = new Font("Segoe UI Semibold", 13f * s, FontStyle.Regular, GraphicsUnit.Pixel);
            Font fS = new Font("Segoe UI", 11.5f * s, FontStyle.Regular, GraphicsUnit.Pixel);
            float tw, sw = 0f;
            using (Bitmap probe = new Bitmap(1, 1))
            using (Graphics pg = Graphics.FromImage(probe))
            {
                tw = pg.MeasureString(title, fT, 2000, StringFormat.GenericTypographic).Width;
                if (details) sw = pg.MeasureString(text, fS, 2000, StringFormat.GenericTypographic).Width;
            }
            float textW = Math.Max(tw, sw);
            float right = keep ? (H / 2f + 6f * s) : (H / 2f);
            float W = pad + D + 12f * s + textW + right;
            float minW = 220f * s, maxW = 420f * s;
            W = Math.Max(minW, Math.Min(maxW, W));
            int bw = (int)Math.Ceiling(W + 2 * M), bh = (int)Math.Ceiling(H + 2 * M);
            Color col = KindColor(kind);
            Bitmap bmp = new Bitmap(bw, bh, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.Transparent);
                RectangleF r = new RectangleF(M, M, W, H);
                // мягкая тень
                for (int i = 6; i >= 1; i--)
                {
                    RectangleF sr = new RectangleF(r.X - i * s, r.Y - i * s + 3f * s, r.Width + 2 * i * s, r.Height + 2 * i * s);
                    using (GraphicsPath sp = Pill(sr))
                    using (SolidBrush sb = new SolidBrush(Color.FromArgb(9, 0, 0, 0))) g.FillPath(sb, sp);
                }
                using (GraphicsPath p = Pill(r))
                {
                    using (SolidBrush b = new SolidBrush(Color.FromArgb(248, 15, 21, 20))) g.FillPath(b, p);
                    using (Pen pen = new Pen(Color.FromArgb(255, 38, 51, 47), Math.Max(1f, s))) g.DrawPath(pen, p);
                }
                // значок
                float cx = r.X + pad + D / 2f, cy = r.Y + H / 2f;
                using (SolidBrush ib = new SolidBrush(Color.FromArgb(46, col))) g.FillEllipse(ib, cx - D / 2f, cy - D / 2f, D, D);
                DrawGlyph(g, kind, col, cx, cy, D / 26f);
                // текст: блок из одной или двух строк по центру по вертикали
                float tx = r.X + pad + D + 12f * s;
                float avail = r.Right - right - tx + (keep ? 0f : 0f);
                float lh1 = fT.GetHeight(g), lh2 = details ? fS.GetHeight(g) : 0f;
                float gap = details ? 1f * s : 0f;
                float top = cy - (lh1 + gap + lh2) / 2f;
                StringFormat sf = new StringFormat(StringFormat.GenericTypographic);
                sf.Trimming = StringTrimming.EllipsisCharacter;
                sf.FormatFlags |= StringFormatFlags.NoWrap;
                using (SolidBrush tb = new SolidBrush(Color.FromArgb(238, 243, 242))) g.DrawString(title, fT, tb, new RectangleF(tx, top, avail, lh1 + 2f), sf);
                if (details)
                    using (SolidBrush sb2 = new SolidBrush(Color.FromArgb(140, 154, 152))) g.DrawString(text, fS, sb2, new RectangleF(tx, top + lh1 + gap, avail, lh2 + 2f), sf);
                if (keep)
                {
                    float xx = r.Right - H / 2f + 2f * s, k = 4f * s;
                    using (Pen xp = new Pen(Color.FromArgb(140, 154, 152), 1.6f * s))
                    {
                        xp.StartCap = LineCap.Round; xp.EndCap = LineCap.Round;
                        g.DrawLine(xp, xx - k, cy - k, xx + k, cy + k);
                        g.DrawLine(xp, xx - k, cy + k, xx + k, cy - k);
                    }
                }
            }
            fT.Dispose(); fS.Dispose();
            t.HBitmap = bmp.GetHbitmap(Color.FromArgb(0));
            bmp.Dispose();
            t.Width = bw; t.Height = bh;
        }

        static GraphicsPath Pill(RectangleF r)
        {
            GraphicsPath p = new GraphicsPath();
            float d = r.Height;
            p.AddArc(r.X, r.Y, d, d, 90, 180);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 180);
            p.CloseFigure();
            return p;
        }

        static void DrawGlyph(Graphics g, string kind, Color col, float cx, float cy, float u)
        {
            using (Pen pen = new Pen(col, 2.3f * u))
            using (SolidBrush br = new SolidBrush(col))
            {
                pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round; pen.LineJoin = LineJoin.Round;
                if (kind == "ok")
                {
                    g.DrawLines(pen, new PointF[] { new PointF(cx - 5f * u, cy + 0.2f * u), new PointF(cx - 1.6f * u, cy + 3.6f * u), new PointF(cx + 5.4f * u, cy - 3.8f * u) });
                }
                else if (kind == "err")
                {
                    g.DrawLine(pen, cx - 4.4f * u, cy - 4.4f * u, cx + 4.4f * u, cy + 4.4f * u);
                    g.DrawLine(pen, cx - 4.4f * u, cy + 4.4f * u, cx + 4.4f * u, cy - 4.4f * u);
                }
                else if (kind == "warn")
                {
                    g.DrawLine(pen, cx, cy - 5.4f * u, cx, cy + 1.2f * u);
                    g.FillEllipse(br, cx - 1.4f * u, cy + 3.6f * u, 2.8f * u, 2.8f * u);
                }
                else
                {
                    g.FillEllipse(br, cx - 1.4f * u, cy - 6f * u, 2.8f * u, 2.8f * u);
                    g.DrawLine(pen, cx, cy - 1.8f * u, cx, cy + 5.4f * u);
                }
            }
        }

        void Layout()
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            bool bottom = corner[0] == 'b';
            float margin = 8f * scale, gapPx = Gap * scale - 2f * 14f * scale; // поля под тень уже дают воздух между плашками
            float y = bottom ? wa.Bottom - margin : wa.Top + margin;
            // порядок: старые ближе к краю, новые дальше от него? Новые появляются у самого края, старые уходят в сторону центра.
            for (int i = shown.Count - 1; i >= 0; i--)
            {
                Toast t = shown[i];
                if (bottom) { t.TargetY = y - t.Height; y = t.TargetY - gapPx; }
                else { t.TargetY = y; y = y + t.Height + gapPx; }
                if (!t.Placed) { t.Y = t.TargetY; t.Placed = true; }
                else t.Y += (t.TargetY - t.Y) * 0.22;
            }
        }

        void Paint(Toast t, long now)
        {
            if (t.Form == null || t.Form.IsDisposed) return;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            long age = now - t.Born;
            double a = Math.Min(1.0, age / 220.0);
            double slide = (1.0 - Ease(a)) * 28.0 * scale;
            if (t.ClosingAt != 0)
            {
                double c = Math.Min(1.0, (now - t.ClosingAt) / 260.0);
                a = Math.Min(a, 1.0 - c);
                slide = c * 20.0 * scale;
            }
            bool left = corner[1] == 'l';
            int x = left ? (int)(wa.Left + 6 * scale - slide) : (int)(wa.Right - t.Width + 6 * scale + slide);
            Point pos = new Point(x, (int)Math.Round(t.Y));
            Size size = new Size(t.Width, t.Height);
            Point src = new Point(0, 0);
            IntPtr screenDc = Native.GetDC(IntPtr.Zero);
            IntPtr memDc = Native.CreateCompatibleDC(screenDc);
            IntPtr old = Native.SelectObject(memDc, t.HBitmap);
            Native.BLENDFUNCTION bf = new Native.BLENDFUNCTION();
            bf.BlendOp = 0; bf.BlendFlags = 0; bf.SourceConstantAlpha = (byte)Math.Max(0, Math.Min(255, (int)(a * 255))); bf.AlphaFormat = 1;
            Native.UpdateLayeredWindow(t.Form.Handle, screenDc, ref pos, ref size, memDc, ref src, 0, ref bf, Native.ULW_ALPHA);
            Native.SelectObject(memDc, old);
            Native.DeleteDC(memDc);
            Native.ReleaseDC(IntPtr.Zero, screenDc);
        }

        static double Ease(double x) { double u = 1.0 - x; return 1.0 - u * u * u; }

        void Dispose(Toast t)
        {
            try { if (t.Form != null) { t.Form.OnClick = null; t.Form.Close(); t.Form.Dispose(); } } catch (Exception) { }
            if (t.HBitmap != IntPtr.Zero) { Native.DeleteObject(t.HBitmap); t.HBitmap = IntPtr.Zero; }
        }
    }

    public static class Host
    {
        public static void Run()
        {
            Application.EnableVisualStyles();
            Application.Run(new HostContext());
        }
    }
}
'@
Add-Type -TypeDefinition $src -ReferencedAssemblies 'System.Windows.Forms','System.Drawing','System.Web.Extensions' -Language CSharp
[OverdeckToast.Host]::Run()
