// ModsUi.cs — страница «Моды» внутри лаунчера: квадратные плитки, вкладки «Установленные / Библиотека»,
// панель настроек мода поверх страницы. Код под C# 5 (штатный csc.exe Windows).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

static class Ez
{
    public static double Cl(double v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    public static double Out(double t) { t = Cl(t); return 1 - Math.Pow(1 - t, 3); }
    public static double InOut(double t) { t = Cl(t); return t < .5 ? 4 * t * t * t : 1 - Math.Pow(-2 * t + 2, 3) / 2; }
}

// квадратная плитка мода
class ModTile : Control
{
    public string Title = "", Sub = "", Badge = "";
    public bool Soon, Installed;
    public int Kind;           // значок: 0 микрофон, 1 волна, 2 щит, 3 облачко
    public double Reveal = 1;  // 0..1 — появление плитки
    bool hover;
    public ModTile()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        BackColor = Color.Transparent; Size = new Size(150, 150); Cursor = Cursors.Hand;
    }
    protected override void OnMouseEnter(EventArgs e) { if (!Soon) { hover = true; Invalidate(); } base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        double a = Ez.Cl(Reveal);
        if (a <= 0.01) return;
        float dy = (float)((1 - a) * 14) - (hover ? 3f : 0f);
        g.TranslateTransform(0, dy);
        Rectangle r = new Rectangle(2, 8, Width - 5, Height - 14);
        using (GraphicsPath p = Ui.Round(r, 14))
        {
            if (hover) using (SolidBrush gl = new SolidBrush(Color.FromArgb((int)(34 * a), Ui.Coral))) g.FillPath(gl, p);
            if (!Soon) using (LinearGradientBrush b = new LinearGradientBrush(r, Color.FromArgb((int)(CardTopA() * a), Ui.CardTop), Color.FromArgb((int)(CardTopA() * a), Ui.CardBot), 90f)) g.FillPath(b, p);
            using (Pen pen = new Pen(Color.FromArgb((int)(255 * a), hover ? Ui.Coral : Ui.Line), 1f))
            {
                if (Soon) pen.DashStyle = DashStyle.Dash;
                g.DrawPath(pen, p);
            }
        }
        Color ic = Soon ? Color.FromArgb(70, 84, 84) : Ui.Peach;
        Rectangle box = new Rectangle(Width / 2 - 26, r.Y + 22, 52, 52);
        using (GraphicsPath bp = Ui.Round(box, 14))
        {
            if (!Soon) using (SolidBrush fb = new SolidBrush(Color.FromArgb((int)(46 * a), Ui.Coral))) g.FillPath(fb, bp);
            using (Pen bpn = new Pen(Color.FromArgb((int)((Soon ? 255 : 110) * a), Soon ? Ui.Line : Ui.Coral), 1f)) g.DrawPath(bpn, bp);
        }
        DrawIcon(g, new PointF(box.X + 26f, box.Y + 26f), Color.FromArgb((int)(255 * a), ic));
        Color tc = Soon ? Ui.Dim : Color.White;
        using (SolidBrush tb = new SolidBrush(Color.FromArgb((int)(255 * a), tc)))
        using (SolidBrush sb = new SolidBrush(Color.FromArgb((int)(255 * a), Ui.Dim)))
        using (Font f1 = new Font("Segoe UI Semibold", 10f))
        using (Font f2 = new Font("Segoe UI", 8.5f))
        {
            StringFormat sf = new StringFormat(); sf.Alignment = StringAlignment.Center;
            g.DrawString(Title, f1, tb, new RectangleF(0, r.Y + 84, Width, 22), sf);
            if (Sub.Length > 0) g.DrawString(Sub, f2, sb, new RectangleF(0, r.Y + 106, Width, 18), sf);
        }
        if (Installed && !Soon) using (SolidBrush d = new SolidBrush(Color.FromArgb((int)(255 * a), Ui.Ok))) g.FillEllipse(d, r.Right - 18, r.Y + 10, 8, 8);
        if (Badge.Length > 0)
        {
            using (Font fb = new Font("Segoe UI", 7.5f))
            {
                Size ts = TextRenderer.MeasureText(Badge, fb);
                Rectangle br = new Rectangle(r.Right - ts.Width - 18, r.Y + 8, ts.Width + 8, 16);
                using (GraphicsPath pp = Ui.Round(br, 8))
                using (Pen pn = new Pen(Color.FromArgb((int)(255 * a), Soon ? Ui.Line : Ui.Coral), 1f)) g.DrawPath(pn, pp);
                using (SolidBrush bb = new SolidBrush(Color.FromArgb((int)(255 * a), Soon ? Ui.Dim : Ui.Peach)))
                {
                    StringFormat sf2 = new StringFormat(); sf2.Alignment = StringAlignment.Center; sf2.LineAlignment = StringAlignment.Center;
                    g.DrawString(Badge, fb, bb, br, sf2);
                }
            }
        }
    }
    static int CardTopA() { return 235; }
    void DrawIcon(Graphics g, PointF c, Color col)
    {
        using (Pen p = new Pen(col, 1.9f))
        {
            p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; p.LineJoin = LineJoin.Round;
            if (Kind == 0)
            {
                using (GraphicsPath mic = Ui.Round(new Rectangle((int)c.X - 5, (int)c.Y - 13, 10, 17), 5)) g.DrawPath(p, mic);
                g.DrawArc(p, c.X - 10, c.Y - 9, 20, 20, 15, 150);
                g.DrawLine(p, c.X, c.Y + 11, c.X, c.Y + 15);
            }
            else if (Kind == 1)
            {
                g.DrawLines(p, new PointF[] { new PointF(c.X - 14, c.Y), new PointF(c.X - 8, c.Y), new PointF(c.X - 4, c.Y - 9), new PointF(c.X + 2, c.Y + 9), new PointF(c.X + 6, c.Y - 3), new PointF(c.X + 9, c.Y), new PointF(c.X + 14, c.Y) });
            }
            else if (Kind == 4)
            {
                g.DrawEllipse(p, c.X - 15, c.Y - 11, 17, 17); g.DrawEllipse(p, c.X - 2, c.Y - 5, 17, 17);
            }
            else if (Kind == 2)
            {
                g.DrawLines(p, new PointF[] { new PointF(c.X, c.Y - 13), new PointF(c.X - 11, c.Y - 8), new PointF(c.X - 11, c.Y + 1), new PointF(c.X, c.Y + 13), new PointF(c.X + 11, c.Y + 1), new PointF(c.X + 11, c.Y - 8), new PointF(c.X, c.Y - 13) });
            }
            else
            {
                g.DrawLines(p, new PointF[] { new PointF(c.X - 12, c.Y - 10), new PointF(c.X + 12, c.Y - 10), new PointF(c.X + 12, c.Y + 6), new PointF(c.X - 4, c.Y + 6), new PointF(c.X - 12, c.Y + 13), new PointF(c.X - 12, c.Y - 10) });
            }
        }
    }
}

// переключатель «Установленные / Библиотека» с плавающей плашкой
class SegTabs : Control
{
    public string[] Items = new string[] { "Установленные", "Библиотека" };
    public int Index;
    public event EventHandler Changed;
    double pill;                 // позиция плашки в долях индекса
    int target;
    Timer tm = new Timer();
    public SegTabs()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        BackColor = Color.Transparent; Size = new Size(262, 34); Cursor = Cursors.Hand;
        tm.Interval = 15;
        tm.Tick += delegate
        {
            double d = target - pill;
            if (Math.Abs(d) < 0.01) { pill = target; tm.Stop(); } else pill += d * 0.32;
            Invalidate();
        };
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        int i = Math.Max(0, Math.Min(Items.Length - 1, e.X * Items.Length / Math.Max(1, Width)));
        if (i == Index) return;
        Index = i; target = i; tm.Start();
        if (Changed != null) Changed(this, EventArgs.Empty);
        base.OnMouseDown(e);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = Ui.Round(r, Height / 2))
        {
            using (SolidBrush b = new SolidBrush(Color.FromArgb(160, 8, 11, 11))) g.FillPath(b, p);
            using (Pen pen = new Pen(Ui.Line, 1f)) g.DrawPath(pen, p);
        }
        int w = (Width - 6) / Items.Length;
        Rectangle pr = new Rectangle(3 + (int)Math.Round(pill * w), 3, w, Height - 7);
        using (GraphicsPath pp = Ui.Round(pr, pr.Height / 2))
        using (LinearGradientBrush pb = new LinearGradientBrush(pr, Ui.Coral, Ui.Coral2, 90f)) g.FillPath(pb, pp);
        using (Font f = new Font("Segoe UI Semibold", 9f))
            for (int i = 0; i < Items.Length; i++)
            {
                Rectangle tr = new Rectangle(3 + i * w, 3, w, Height - 7);
                double near = 1 - Math.Min(1, Math.Abs(pill - i));
                Color c = Color.FromArgb((int)(Ui.Dim.R + (4 - Ui.Dim.R) * near), (int)(Ui.Dim.G + (17 - Ui.Dim.G) * near), (int)(Ui.Dim.B + (15 - Ui.Dim.B) * near));
                TextRenderer.DrawText(g, Items[i], f, tr, c, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }
    }
}

// затемнённый слой с панелью настроек мода
class ModSheet : Panel
{
    public Panel Inner;
    public Label LblName, LblSub;
    public CloseX BtnClose;
    Timer tm = new Timer();
    Stopwatch sw = new Stopwatch();
    bool opening;
    const int Top0 = 8;
    public ModSheet()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer, true);
        BackColor = Color.FromArgb(150, 0, 0, 0); Visible = false;
        Inner = new Panel(); Inner.BackColor = Color.FromArgb(9, 12, 12); Inner.Size = new Size(520, 410); Inner.Location = new Point(90, Top0 + 40);
        Inner.Paint += delegate(object s, PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (Pen pen = new Pen(Ui.Line, 1f)) e.Graphics.DrawRectangle(pen, 0, 0, Inner.Width - 1, Inner.Height - 1);
            using (Pen sep = new Pen(Color.FromArgb(40, 255, 255, 255), 1f)) e.Graphics.DrawLine(sep, 22, 60, Inner.Width - 22, 60);
            // значок мода в шапке панели
            Rectangle b = new Rectangle(22, 10, 40, 40);
            using (GraphicsPath p = Ui.Round(b, 11))
            {
                using (SolidBrush fb = new SolidBrush(Color.FromArgb(40, Ui.Coral))) e.Graphics.FillPath(fb, p);
                using (Pen bp = new Pen(Color.FromArgb(110, Ui.Coral), 1f)) e.Graphics.DrawPath(bp, p);
            }
            using (Pen ip = new Pen(Ui.Peach, 1.8f))
            {
                ip.StartCap = LineCap.Round; ip.EndCap = LineCap.Round;
                using (GraphicsPath mic = Ui.Round(new Rectangle(37, 17, 10, 16), 5)) e.Graphics.DrawPath(ip, mic);
                e.Graphics.DrawArc(ip, 32f, 22f, 20f, 18f, 15, 150);
                e.Graphics.DrawLine(ip, 42, 40, 42, 43);
            }
        };
        Controls.Add(Inner);
        LblName = new Label(); LblName.Font = new Font("Segoe UI Semibold", 12f); LblName.ForeColor = Color.White; LblName.BackColor = Color.Transparent; LblName.AutoSize = true; LblName.Location = new Point(72, 9); Inner.Controls.Add(LblName);
        LblSub = new Label(); LblSub.Font = new Font("Segoe UI", 8.5f); LblSub.ForeColor = Ui.Dim; LblSub.BackColor = Color.Transparent; LblSub.AutoSize = true; LblSub.Location = new Point(73, 32); Inner.Controls.Add(LblSub);
        BtnClose = new CloseX(); BtnClose.Location = new Point(Inner.Width - 22 - 28, 16);
        BtnClose.Click += delegate { Close(); };
        Inner.Controls.Add(BtnClose);
        Click += delegate { Close(); };
        tm.Interval = 15;
        tm.Tick += delegate
        {
            double t = Ez.Out(sw.ElapsedMilliseconds / 300.0);
            Inner.Top = opening ? Top0 + (int)(40 * (1 - t)) : Top0 + (int)(40 * t);
            if (sw.ElapsedMilliseconds >= 300) { tm.Stop(); if (!opening) Visible = false; }
        };
    }
    public void Open() { Visible = true; BringToFront(); opening = true; sw.Reset(); sw.Start(); Inner.Top = Top0 + 40; tm.Start(); }
    public void Close() { if (!Visible || !opening) return; opening = false; sw.Reset(); sw.Start(); tm.Start(); }
    public bool IsOpen { get { return Visible && opening; } }
}

class ModInfo { public string Name, Sub; public bool Soon, Real; public int Kind; public Func<bool> Inst; public Action Open; }

// сама страница
class ModsPage : Panel
{
    public ModSheet Sheet;
    SegTabs seg; Label lblSect, lblHint;
    List<ModTile> tiles = new List<ModTile>();
    Func<bool> isInstalled; Action openMod;
    Timer tm = new Timer(); Stopwatch sw = new Stopwatch();
    List<ModInfo> mods = new List<ModInfo>();

    public ModsPage(Action goBack, Func<bool> installed, Action open)
    {
        isInstalled = installed; openMod = open;
        SetStyle(ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; DoubleBuffered = true;
        Size = new Size(700, 428);
        mods.Add(new ModInfo { Name = "Овервойс", Sub = "Нейроголос", Real = true, Kind = 0 });

        FancyButton back = new FancyButton(); back.Text = "‹  Назад"; back.Size = new Size(100, 34); back.Location = new Point(24, 22);
        back.Font = new Font("Segoe UI Semibold", 9.5f); back.Click += delegate { Sheet.Close(); goBack(); };
        Controls.Add(back);
        Label t = new Label(); t.Text = "Моды"; t.Font = new Font("Segoe UI Semibold", 17f); t.ForeColor = Color.White; t.BackColor = Color.Transparent; t.AutoSize = true; t.Location = new Point(138, 20);
        Controls.Add(t);
        seg = new SegTabs(); seg.Location = new Point(700 - 24 - seg.Width, 22); seg.Changed += delegate { Rebuild(); };
        Controls.Add(seg);
        lblSect = new Label(); lblSect.Font = new Font("Segoe UI Semibold", 8f); lblSect.ForeColor = Ui.Dim; lblSect.BackColor = Color.Transparent; lblSect.AutoSize = true; lblSect.Location = new Point(26, 82);
        Controls.Add(lblSect);
        lblHint = new Label(); lblHint.Font = new Font("Segoe UI", 9f); lblHint.ForeColor = Ui.Dim; lblHint.BackColor = Color.Transparent; lblHint.AutoSize = false;
        lblHint.TextAlign = ContentAlignment.MiddleCenter; lblHint.Size = new Size(700, 24); lblHint.Location = new Point(0, 290);
        Controls.Add(lblHint);

        Sheet = new ModSheet(); Sheet.Location = new Point(0, 0); Sheet.Size = Size;
        Controls.Add(Sheet); Sheet.BringToFront();

        tm.Interval = 15;
        tm.Tick += delegate
        {
            double ms = sw.ElapsedMilliseconds; bool done = true;
            for (int i = 0; i < tiles.Count; i++)
            {
                double p = (ms - 80 - i * 70) / 420.0;
                tiles[i].Reveal = Ez.Out(p); tiles[i].Invalidate();
                if (p < 1) done = false;
            }
            if (done) tm.Stop();
        };
    }

    static bool SafeInst(Func<bool> f) { try { return f(); } catch { return false; } }

    // вызывается при открытии страницы и при смене вкладки
    public void AddMod(ModInfo m) { mods.Insert(1, m); }

    public void Rebuild()
    {
        foreach (ModTile x in tiles) { Controls.Remove(x); x.Dispose(); }
        tiles.Clear();
        bool inst = false; try { inst = isInstalled(); } catch { }
        bool lib = seg.Index == 1;
        List<ModInfo> show = new List<ModInfo>();
        foreach (ModInfo m in mods) { bool mi = m.Inst != null ? SafeInst(m.Inst) : (m.Real && inst); if (lib || mi) show.Add(m); }
        lblSect.Text = (lib ? "ДОСТУПНО" : "УСТАНОВЛЕНО") + "  ·  " + show.Count;
        lblHint.Visible = !lib && show.Count == 0;
        lblHint.Text = "Здесь появятся твои моды. Новые — во вкладке «Библиотека».";
        int i = 0;
        foreach (ModInfo m in show)
        {
            ModTile tile = new ModTile();
            bool mInst = m.Inst != null ? SafeInst(m.Inst) : (m.Real && inst);
            tile.Title = m.Name; tile.Soon = m.Soon; tile.Kind = m.Kind; tile.Installed = m.Real && mInst;
            tile.Sub = m.Soon ? "" : (m.Real && mInst && !lib ? "установлен" : m.Sub);
            tile.Badge = m.Soon ? "Скоро" : (lib && mInst ? "Установлен" : "");
            tile.Location = new Point(26 + (i % 4) * 166, 108 + (i / 4) * 166);
            tile.Reveal = 0;
            if (!m.Soon) { ModInfo mm = m; tile.Click += delegate { if (mm.Open != null) mm.Open(); else openMod(); }; }
            Controls.Add(tile); tiles.Add(tile);
            i++;
        }
        Sheet.BringToFront();
        sw.Reset(); sw.Start(); tm.Start();
    }
}

// кадр листания: две готовые картинки страниц, сдвинутые по горизонтали
class SlideOverlay : Control
{
    public int Off;
    Bitmap a, b;
    public SlideOverlay(Bitmap main, Bitmap mods)
    {
        a = main; b = mods;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.DrawImageUnscaled(a, Off, 0);
        e.Graphics.DrawImageUnscaled(b, Off + 700, 0);
    }
}

// маленькая круглая кнопка «×»
class CloseX : Control
{
    bool hover;
    public CloseX()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        BackColor = Color.Transparent; Size = new Size(28, 28); Cursor = Cursors.Hand;
    }
    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (SolidBrush b = new SolidBrush(Color.FromArgb(hover ? 46 : 14, Ui.Coral))) g.FillEllipse(b, r);
        using (Pen p = new Pen(Color.FromArgb(hover ? 255 : 110, Ui.Coral), 1f)) g.DrawEllipse(p, r);
        using (Pen x = new Pen(hover ? Ui.Peach : Ui.Dim, 1.6f))
        {
            x.StartCap = LineCap.Round; x.EndCap = LineCap.Round;
            g.DrawLine(x, 9, 9, 18, 18); g.DrawLine(x, 18, 9, 9, 18);
        }
    }
}
