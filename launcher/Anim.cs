// Anim.cs — фирменное оформление лаунчера STARIKOV: шрифт, анимация запуска (разрезанная «O»), шапка, фон с волнами.
// Код под C# 5 / .NET Framework 4. Собирается вместе с Overdeck.cs (см. build-launcher.bat).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Контуры букв Starikov Sans Slit Medium (шапка и анимация запуска). Вшиты как данные: единицы шрифта (em = 1000), y вниз от базовой линии.
// Так не нужны ни установленный шрифт, ни его загрузка; «O» с разрезом вращается и масштабируется как обычная фигура.
static class Brand
{
    public static readonly Color Fg = Color.FromArgb(242, 245, 245);
    public static readonly Color Ac = Color.FromArgb(43, 196, 180);
    public static GraphicsPath PathO, PathWord;
    public static float RestUnits;            // ширина «verdeck» в единицах шрифта
    public const float OAdv = 646f, Gap = 118f; // продвижение «O» и зазор до остальных букв
    static bool inited;

    const string GlyphO =
        "M648 -422 L651 -404 L653 -388 L526 -388 L522 -410 L515 -433 L511 -444 L500 -465 L495 -475 L482 -494 L467 -512 "
        + "L451 -527 L442 -534 L424 -547 L405 -557 L385 -566 L375 -569 L354 -573 L333 -576 L312 -576 L291 -573 L271 -569 "
        + "L251 -562 L241 -557 L222 -547 L212 -541 L195 -527 L187 -520 L171 -503 L164 -494 L151 -475 L145 -465 L135 -444 "
        + "L131 -433 L124 -410 L120 -388 L-7 -388 L-6 -404 L-2 -422 L1 -439 L6 -457 L12 -474 L18 -491 L26 -507 L34 -523 L"
        + "43 -539 L52 -554 L63 -568 L74 -582 L86 -596 L98 -608 L112 -620 L125 -632 L140 -642 L155 -652 L170 -661 L186 -6"
        + "69 L202 -676 L219 -682 L235 -688 L253 -692 L270 -696 L287 -698 L305 -700 L324 -700 L340 -700 L358 -698 L376 -6"
        + "96 L393 -692 L410 -688 L427 -682 L444 -676 L460 -669 L476 -661 L491 -652 L506 -642 L520 -632 L534 -620 L547 -6"
        + "08 L560 -596 L571 -582 L583 -568 L593 -554 L603 -539 L612 -523 L620 -507 L627 -491 L634 -474 L639 -457 L644 -4"
        + "39 Z M-2 -278 L-6 -296 L-7 -312 L120 -312 L124 -290 L131 -267 L135 -256 L145 -235 L151 -225 L164 -206 L179 -18"
        + "8 L195 -173 L204 -166 L222 -153 L241 -143 L261 -134 L271 -131 L291 -127 L312 -124 L333 -124 L354 -127 L375 -13"
        + "1 L395 -138 L405 -143 L424 -153 L433 -159 L451 -173 L459 -180 L474 -197 L482 -206 L495 -225 L500 -235 L511 -25"
        + "6 L515 -267 L522 -290 L526 -312 L653 -312 L651 -296 L648 -278 L644 -261 L639 -243 L634 -226 L627 -209 L620 -19"
        + "3 L612 -177 L603 -161 L593 -146 L583 -132 L571 -118 L560 -104 L547 -92 L534 -80 L520 -68 L506 -58 L491 -48 L47"
        + "6 -39 L460 -31 L444 -24 L427 -18 L410 -12 L393 -8 L376 -4 L358 -2 L340 0 L322 0 L305 0 L287 -2 L270 -4 L253 -8"
        + " L235 -12 L219 -18 L202 -24 L186 -31 L170 -39 L155 -48 L140 -58 L125 -68 L112 -80 L98 -92 L86 -104 L74 -118 L6"
        + "3 -132 L52 -146 L43 -161 L34 -177 L26 -193 L18 -209 L12 -226 L6 -243 L1 -261 Z";
    const string GlyphWord =
        "M229 0 L-36 -508 L105 -508 L267 -197 L430 -508 L571 -508 L306 0 Z M1028 -192 L974 -192 L1028 -156 L1028 -73 L1"
        + "015 -62 L996 -48 L986 -42 L964 -31 L953 -26 L931 -17 L919 -14 L895 -8 L883 -5 L857 -2 L832 0 L818 0 L800 -1 L7"
        + "81 -2 L763 -5 L746 -9 L729 -13 L712 -19 L696 -26 L681 -34 L666 -42 L652 -52 L638 -62 L625 -73 L609 -90 L609 -4"
        + "18 L625 -435 L638 -446 L652 -456 L666 -465 L681 -474 L696 -482 L712 -488 L729 -494 L746 -499 L763 -503 L781 -5"
        + "05 L800 -507 L818 -508 L837 -507 L855 -505 L873 -503 L891 -499 L908 -494 L925 -488 L941 -482 L956 -474 L971 -4"
        + "65 L985 -456 L999 -446 L1011 -435 L1028 -418 Z M967 -192 L688 -192 L695 -181 L700 -175 L712 -162 L726 -151 L74"
        + "1 -142 L758 -134 L777 -128 L797 -124 L819 -123 L845 -124 L869 -128 L890 -134 L909 -141 L926 -151 L941 -162 L95"
        + "4 -175 L962 -184 Z M690 -319 L688 -315 L948 -315 L942 -326 L936 -333 L925 -345 L911 -356 L896 -366 L879 -374 L"
        + "860 -379 L840 -383 L818 -384 L797 -383 L777 -379 L758 -374 L741 -366 L726 -356 L712 -345 L700 -333 Z M1327 -29"
        + "4 L1326 -283 L1325 -271 L1324 -257 L1324 0 L1198 0 L1198 -508 L1324 -508 L1324 -479 L1335 -484 L1350 -490 L136"
        + "5 -495 L1381 -499 L1397 -502 L1412 -505 L1428 -506 L1460 -508 L1482 -507 L1502 -506 L1522 -503 L1535 -501 L155"
        + "4 -497 L1566 -493 L1590 -485 L1601 -479 L1617 -471 L1555 -364 L1539 -372 L1525 -377 L1507 -381 L1486 -384 L146"
        + "1 -384 L1439 -384 L1419 -381 L1401 -377 L1386 -371 L1372 -364 L1361 -356 L1351 -347 L1342 -335 L1335 -322 L133"
        + "0 -304 Z M2079 0 L1953 0 L1953 -40 L1929 -27 L1916 -21 L1903 -16 L1876 -8 L1848 -3 L1834 -1 L1806 0 L1778 -1 L"
        + "1750 -5 L1723 -12 L1697 -21 L1671 -33 L1659 -40 L1648 -47 L1636 -55 L1625 -64 L1615 -73 L1605 -83 L1596 -93 L1"
        + "587 -103 L1579 -114 L1571 -125 L1564 -137 L1558 -149 L1552 -162 L1547 -174 L1543 -187 L1540 -200 L1537 -213 L1"
        + "535 -227 L1534 -240 L1534 -254 L1534 -267 L1535 -281 L1537 -294 L1540 -307 L1543 -320 L1547 -333 L1552 -346 L1"
        + "558 -358 L1564 -370 L1571 -382 L1579 -393 L1587 -404 L1596 -415 L1605 -425 L1615 -435 L1625 -444 L1636 -452 L1"
        + "648 -460 L1659 -467 L1671 -474 L1697 -486 L1710 -491 L1737 -499 L1764 -504 L1778 -506 L1806 -508 L1834 -506 L1"
        + "848 -504 L1876 -499 L1903 -491 L1916 -486 L1929 -481 L1953 -468 L1953 -700 L2079 -700 Z M1951 -234 L1953 -247 "
        + "L1953 -260 L1951 -274 L1948 -287 L1943 -299 L1937 -312 L1930 -323 L1921 -335 L1911 -345 L1900 -354 L1888 -362 "
        + "L1874 -370 L1860 -375 L1845 -380 L1830 -383 L1822 -384 L1806 -384 L1798 -384 L1783 -383 L1767 -380 L1753 -375 "
        + "L1738 -370 L1725 -362 L1713 -354 L1707 -350 L1696 -340 L1687 -329 L1679 -318 L1672 -306 L1667 -293 L1663 -280 "
        + "L1661 -267 L1660 -254 L1661 -240 L1663 -227 L1667 -214 L1672 -202 L1679 -190 L1687 -178 L1691 -173 L1701 -163 "
        + "L1713 -153 L1725 -145 L1738 -138 L1753 -132 L1767 -128 L1783 -125 L1791 -124 L1806 -123 L1814 -123 L1830 -125 "
        + "L1845 -128 L1853 -130 L1867 -135 L1881 -141 L1894 -149 L1900 -153 L1911 -163 L1921 -173 L1930 -184 L1937 -196 "
        + "L1943 -208 L1948 -221 Z M2668 -192 L2614 -192 L2668 -156 L2668 -73 L2655 -62 L2636 -48 L2626 -42 L2604 -31 L25"
        + "93 -26 L2571 -17 L2559 -14 L2535 -8 L2523 -5 L2497 -2 L2472 0 L2458 0 L2440 -1 L2421 -2 L2403 -5 L2386 -9 L236"
        + "9 -13 L2352 -19 L2336 -26 L2321 -34 L2306 -42 L2292 -52 L2278 -62 L2265 -73 L2249 -90 L2249 -418 L2265 -435 L2"
        + "278 -446 L2292 -456 L2306 -465 L2321 -474 L2336 -482 L2352 -488 L2369 -494 L2386 -499 L2403 -503 L2421 -505 L2"
        + "440 -507 L2458 -508 L2477 -507 L2495 -505 L2513 -503 L2531 -499 L2548 -494 L2565 -488 L2581 -482 L2596 -474 L2"
        + "611 -465 L2625 -456 L2639 -446 L2651 -435 L2668 -418 Z M2607 -192 L2328 -192 L2335 -181 L2340 -175 L2352 -162 "
        + "L2366 -151 L2381 -142 L2398 -134 L2417 -128 L2437 -124 L2459 -123 L2485 -124 L2509 -128 L2530 -134 L2549 -141 "
        + "L2566 -151 L2581 -162 L2594 -175 L2602 -184 Z M2330 -319 L2328 -315 L2588 -315 L2582 -326 L2576 -333 L2565 -34"
        + "5 L2551 -356 L2536 -366 L2519 -374 L2500 -379 L2480 -383 L2458 -384 L2437 -383 L2417 -379 L2398 -374 L2381 -36"
        + "6 L2366 -356 L2352 -345 L2340 -333 Z M3272 -436 L3292 -417 L3202 -330 L3193 -340 L3184 -347 L3169 -358 L3158 -"
        + "363 L3147 -368 L3135 -373 L3123 -376 L3110 -379 L3096 -382 L3082 -383 L3061 -384 L3042 -384 L3032 -383 L3012 -"
        + "379 L2993 -374 L2976 -366 L2961 -356 L2954 -351 L2941 -339 L2935 -333 L2925 -319 L2917 -304 L2912 -288 L2910 -"
        + "280 L2907 -263 L2907 -245 L2908 -236 L2912 -219 L2917 -203 L2921 -196 L2930 -181 L2941 -168 L2947 -162 L2961 -"
        + "151 L2976 -142 L2984 -137 L3002 -131 L3022 -126 L3032 -124 L3054 -123 L3075 -124 L3089 -125 L3103 -127 L3117 -"
        + "130 L3129 -133 L3141 -137 L3153 -142 L3164 -147 L3174 -153 L3184 -160 L3193 -168 L3202 -177 L3292 -91 L3272 -7"
        + "2 L3254 -58 L3235 -45 L3225 -40 L3206 -30 L3196 -26 L3176 -18 L3145 -10 L3114 -4 L3084 -1 L3053 0 L3035 -1 L30"
        + "16 -2 L2998 -5 L2981 -9 L2964 -13 L2947 -19 L2931 -26 L2915 -34 L2901 -42 L2886 -52 L2873 -62 L2860 -73 L2848 "
        + "-85 L2837 -97 L2827 -111 L2818 -124 L2809 -139 L2802 -154 L2796 -170 L2790 -186 L2786 -202 L2783 -219 L2781 -2"
        + "36 L2781 -254 L2781 -271 L2783 -288 L2786 -305 L2790 -322 L2796 -338 L2802 -353 L2809 -369 L2818 -383 L2827 -3"
        + "97 L2837 -410 L2848 -423 L2860 -435 L2873 -446 L2886 -456 L2901 -465 L2915 -474 L2931 -482 L2947 -488 L2964 -4"
        + "94 L2981 -499 L2998 -503 L3016 -505 L3035 -507 L3053 -508 L3073 -507 L3104 -505 L3135 -500 L3166 -492 L3186 -4"
        + "86 L3206 -478 L3216 -473 L3235 -462 L3254 -450 Z M3469 -178 L3469 0 L3343 0 L3343 -700 L3469 -700 L3469 -340 L"
        + "3669 -508 L3863 -508 L3659 -337 L3910 0 L3754 0 L3563 -257 Z";
    public const float WordAdv = 3873;
    // зазоры между краями букв v-e, e-r, r-d, d-e, e-c, c-k (единицы шрифта), выставлены вручную; O-v = 75 задаётся через Gap
    static readonly float[] LetterGaps = new float[] { 72f, 130f, -5f, 114f, 83f, 88f };

    public static bool Init()
    {
        if (inited) return PathO != null;
        inited = true;
        try
        {
            PathO = Parse(GlyphO);
            PathWord = Spread(GlyphWord, LetterGaps, out RestUnits);
            return true;
        }
        catch (Exception ex)
        {
            PathO = null; PathWord = null;
            Launcher.WriteLog("Контуры шрифта STARIKOV не разобраны: " + ex.Message);
            return false;
        }
    }

    // «verdeck» с равномерной добавкой между буквами: контуры делятся на буквы (внутренние контуры — дырки — остаются в своей букве)
    static GraphicsPath Spread(string d, float[] gaps, out float total)
    {
        List<GraphicsPath> figs = new List<GraphicsPath>();
        foreach (string part in d.Split('M'))
        {
            if (part.Trim().Length == 0) continue;
            figs.Add(Parse("M" + part));
        }
        List<RectangleF> outer = new List<RectangleF>();
        List<List<GraphicsPath>> letters = new List<List<GraphicsPath>>();
        figs.Sort(delegate(GraphicsPath a, GraphicsPath b) { return a.GetBounds().Left.CompareTo(b.GetBounds().Left); });
        foreach (GraphicsPath f in figs)
        {
            RectangleF r = f.GetBounds(); int at = -1;
            for (int i = 0; i < outer.Count; i++) { RectangleF o = outer[i]; if (r.Left >= o.Left - 1 && r.Right <= o.Right + 1 && r.Top >= o.Top - 1 && r.Bottom <= o.Bottom + 1) { at = i; break; } }
            if (at < 0) { outer.Add(r); letters.Add(new List<GraphicsPath>()); at = letters.Count - 1; }
            letters[at].Add(f);
        }
        GraphicsPath res = new GraphicsPath(FillMode.Winding);
        float prevRight = 0f, lastShift = 0f;
        for (int i = 0; i < letters.Count; i++)
        {
            float shift = i == 0 ? 0f : prevRight + gaps[i - 1] - outer[i].Left;
            prevRight = outer[i].Right + shift; lastShift = shift;
            foreach (GraphicsPath f in letters[i])
            {
                using (Matrix m = new Matrix()) { m.Translate(shift, 0); f.Transform(m); }
                res.AddPath(f, false);
            }
        }
        total = WordAdv + lastShift;
        return res;
    }

    // мини-язык: M x y, L x y, Q cx cy x y, C x1 y1 x2 y2 x y, Z
    static GraphicsPath Parse(string d)
    {
        GraphicsPath p = new GraphicsPath(FillMode.Winding);
        string[] tk = d.Split(' ');
        float cx = 0, cy = 0, sx = 0, sy = 0;
        bool open = false;
        int i = 0;
        System.Globalization.CultureInfo ci = System.Globalization.CultureInfo.InvariantCulture;
        Func<string, float> num = delegate(string s) { return float.Parse(s, ci); };
        while (i < tk.Length)
        {
            string t = tk[i++];
            if (t.Length == 0) continue;
            char c = t[0];
            if (c == 'Z') { if (open) { p.CloseFigure(); open = false; } continue; }
            float a0 = num(t.Substring(1)), a1 = num(tk[i++]);
            if (c == 'M') { if (open) p.CloseFigure(); p.StartFigure(); cx = sx = a0; cy = sy = a1; open = true; }
            else if (c == 'L') { p.AddLine(cx, cy, a0, a1); cx = a0; cy = a1; }
            else if (c == 'Q')
            {
                float ex = num(tk[i++]), ey = num(tk[i++]);
                p.AddBezier(cx, cy, cx + 2f / 3f * (a0 - cx), cy + 2f / 3f * (a1 - cy), ex + 2f / 3f * (a0 - ex), ey + 2f / 3f * (a1 - ey), ex, ey);
                cx = ex; cy = ey;
            }
            else if (c == 'C')
            {
                float b0 = num(tk[i++]), b1 = num(tk[i++]), ex = num(tk[i++]), ey = num(tk[i++]);
                p.AddBezier(cx, cy, a0, a1, b0, b1, ex, ey); cx = ex; cy = ey;
            }
        }
        if (open) p.CloseFigure();
        return p;
    }

    // перемычки в разрезе «O» (держат кольцо целым, пока не пройдёт зелёная линия); координаты — единицы шрифта, y вниз от базовой линии
    public static GraphicsPath Bridge(bool right)
    {
        GraphicsPath p = new GraphicsPath();
        Func<float, float> X = delegate(float x) { return right ? 646f - x : x; };
        p.AddLine(X(-6.5f), -392f, X(120f), -392f);
        p.AddLine(X(120f), -392f, X(120f), -388f);
        p.AddBezier(X(120f), -388f, X(116.4f), -362.67f, X(116.4f), -337.33f, X(120f), -312f);
        p.AddLine(X(120f), -312f, X(120f), -308f);
        p.AddLine(X(120f), -308f, X(-6.5f), -308f);
        p.CloseFigure();
        return p;
    }

    // «Overdeck» с пером в точке (penX, baseY); em — размер шрифта в пикселях; alpha 0..255
    public static void DrawWordmark(Graphics g, float penX, float baseY, float em, int alpha)
    {
        if (PathO == null) return;
        float k = em / 1000f;
        GraphicsState st = g.Save();
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TranslateTransform(penX, baseY);
        g.ScaleTransform(k, k);
        using (SolidBrush b = new SolidBrush(Color.FromArgb(alpha, Fg)))
        {
            g.FillPath(b, PathO);
            g.TranslateTransform(OAdv + Gap, 0);
            g.FillPath(b, PathWord);
        }
        g.Restore(st);
    }
}

// Общий фон окна: почти чёрный с зеленоватым оттенком, мягкое свечение и едва заметные волны того же зелёного.
static class Backdrop
{
    public static void Paint(Graphics g, Rectangle r)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (LinearGradientBrush b = new LinearGradientBrush(r, Ui.Bg1, Ui.Bg2, 90f)) g.FillRectangle(b, r);
        using (GraphicsPath gp = new GraphicsPath())
        {
            gp.AddEllipse(new Rectangle(-260, -200, 760, 420));
            using (PathGradientBrush pg = new PathGradientBrush(gp))
            {
                pg.CenterColor = Color.FromArgb(Ui.GlowAlpha, Ui.Glow);
                pg.SurroundColors = new Color[] { Color.FromArgb(0, Ui.Glow) };
                g.FillPath(pg, gp);
            }
        }
        Wave(g, r, 300f, 14f, 700f, 0.0, 7);
        Wave(g, r, 335f, 12f, 520f, 1.7, 9);
        Wave(g, r, 372f, 10f, 400f, 3.1, 12);
    }

    static void Wave(Graphics g, Rectangle r, float baseY, float amp, float period, double phase, int alpha)
    {
        float sy = r.Height / 428f;
        int n = r.Width / 14 + 2;
        PointF[] pts = new PointF[n + 2];
        for (int i = 0; i < n; i++)
        {
            float x = i * 14f;
            pts[i] = new PointF(x, (baseY + amp * (float)Math.Sin(2 * Math.PI * x / period + phase)) * sy);
        }
        pts[n] = new PointF((n - 1) * 14f, r.Height);
        pts[n + 1] = new PointF(0, r.Height);
        using (SolidBrush b = new SolidBrush(Color.FromArgb(alpha, 43, 196, 180))) g.FillPolygon(b, pts);
    }
}

// Шапка: слово «Overdeck» шрифтом STARIKOV, подпись «BY STARIKOV» и линия под ней.
class BrandHeader : Control
{
    public const float HX = 24f, HBase = 52f, HF = 34f;  // положение и размер слова: общие с финалом анимации запуска
    int fade = 255;
    Timer tm;
    public BrandHeader()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true);
        BackColor = Color.Transparent; Size = new Size(700, 86);
    }
    public void FadeIn()
    {
        fade = 0; Invalidate();
        if (tm != null) tm.Stop();
        tm = new Timer(); tm.Interval = 20;
        tm.Tick += delegate { fade = Math.Min(255, fade + 24); Invalidate(); if (fade >= 255) tm.Stop(); };
        tm.Start();
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        if (Brand.PathO != null) Brand.DrawWordmark(g, HX + 7f * HF / 1000f, HBase, HF, 255);
        else TextRenderer.DrawText(g, "Overdeck", new Font("Segoe UI Semibold", 20f), new Point(20, 14), Brand.Fg);
        if (fade <= 0) return;
        // «BY STARIKOV» с разрядкой
        float x = HX;
        using (Font f = new Font("Consolas", 8.5f, FontStyle.Bold))
        using (SolidBrush sb = new SolidBrush(Color.FromArgb(fade, 140, 153, 152)))
        using (SolidBrush ab = new SolidBrush(Color.FromArgb(fade, 92, 235, 221)))
        {
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.FillRectangle(ab, x, 64f, 4f, 4f);
            x += 12f;
            string t = "BY STARIKOV";
            for (int i = 0; i < t.Length; i++)
            {
                string c = t.Substring(i, 1);
                g.DrawString(c, f, sb, x, 60f, StringFormat.GenericTypographic);
                x += g.MeasureString(c, f, 100, StringFormat.GenericTypographic).Width + 1.8f;
            }
        }
        Rectangle lr = new Rectangle(24, 82, 652, 1);
        using (LinearGradientBrush lb = new LinearGradientBrush(lr, Color.FromArgb(fade, 43, 196, 180), Color.FromArgb(fade, 34, 43, 43), LinearGradientMode.Horizontal))
        {
            ColorBlend cb = new ColorBlend(3);
            cb.Colors = new Color[] { Color.FromArgb(fade, 43, 196, 180), Color.FromArgb(fade, 34, 43, 43), Color.FromArgb(fade, 34, 43, 43) };
            cb.Positions = new float[] { 0f, 0.4f, 1f };
            lb.InterpolationColors = cb;
            g.FillRectangle(lb, lr);
        }
    }
}

// Покадровая отрисовка анимации запуска. t — секунды: 0…4,6 «O» режется зелёной линией, раскручивается, из неё выезжает слово;
// 4,6…5,4 слово уезжает в шапку (там, где потом лежит BrandHeader), под ним проявляется фон окна.
static class Intro
{
    public const double P2A = 4.6, P2B = 5.4;
    const float F = 210f, K = F / 1000f, W = 1280f, H = 720f, CX = 323f, CY = 350f, L = -7f, R = 653f;

    static Bitmap glow;
    static Bitmap GlowBmp()
    {
        if (glow != null) return glow;
        Bitmap b = new Bitmap(256, 256, PixelFormat.Format32bppPArgb);
        using (Graphics gg = Graphics.FromImage(b))
        using (GraphicsPath gp = new GraphicsPath())
        {
            gg.SmoothingMode = SmoothingMode.AntiAlias;
            gp.AddEllipse(0, 0, 255, 255);
            using (PathGradientBrush pg = new PathGradientBrush(gp))
            {
                pg.CenterColor = Color.FromArgb(255, 43, 196, 180);
                pg.SurroundColors = new Color[] { Color.FromArgb(0, 43, 196, 180) };
                gg.FillPath(pg, gp);
            }
        }
        glow = b;
        return glow;
    }
    static GraphicsPath bridgeL, bridgeR;

    static double Cl(double t, double a, double b) { return Math.Max(0.0, Math.Min(1.0, (t - a) / (b - a))); }
    static double Eio(double t) { return t < .5 ? 4 * t * t * t : 1 - Math.Pow(-2 * t + 2, 3) / 2; }
    static double Eo(double t) { return 1 - Math.Pow(1 - t, 3); }

    public static void Render(Graphics g, int cw, int ch, double t, Bitmap backdrop)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Black);
        double p2 = Eio(Cl(t, P2A, P2B));
        if (backdrop != null && p2 > 0.003)
        {
            ColorMatrix cm = new ColorMatrix(); cm.Matrix33 = (float)p2;
            using (ImageAttributes ia = new ImageAttributes())
            {
                ia.SetColorMatrix(cm);
                g.DrawImage(backdrop, new Rectangle(0, 0, cw, ch), 0, 0, backdrop.Width, backdrop.Height, GraphicsUnit.Pixel, ia);
            }
        }
        if (Brand.PathO == null) return;
        double t1 = Math.Min(t, P2A);
        float restS = Brand.RestUnits * K, oAdv = (Brand.OAdv + Brand.Gap) * K;
        float x0 = (W - (oAdv + restS)) / 2f, bas = H / 2f + 0.35f * F;
        float s0 = cw / W, ty0 = (ch - H * s0) / 2f;
        float aH = BrandHeader.HF / F;
        float tx1 = BrandHeader.HX - aH * (x0 + L * K), ty1 = BrandHeader.HBase - aH * bas;
        float a = s0 + (aH - s0) * (float)p2, tx = 0f + (tx1 - 0f) * (float)p2, ty = ty0 + (ty1 - ty0) * (float)p2;
        GraphicsState outer = g.Save();
        g.TranslateTransform(tx, ty);
        g.ScaleTransform(a, a);

        // свечение: готовая картинка (градиент считается один раз), на кадр меняется только прозрачность
        double op = Math.Max(Cl(t1, 0.5, 1.4) * (1 - Cl(t1, 2.4, 3.4)), Cl(t1, 3.4, 4.2) * .6) * (1 - p2);
        if (op > 0.01)
        {
            Bitmap gb = GlowBmp();
            ColorMatrix gm = new ColorMatrix(); gm.Matrix33 = (float)(.22 * op);
            using (ImageAttributes ia = new ImageAttributes())
            {
                ia.SetColorMatrix(gm);
                g.DrawImage(gb, new Rectangle((int)(W / 2f - 404f), (int)(H / 2f - 404f), 808, 808), 0, 0, gb.Width, gb.Height, GraphicsUnit.Pixel, ia);
            }
        }

        // линия через всю надпись (за буквами)
        double wl = Eio(Cl(t1, 3.5, 4.2));
        double wop = .9 * (1 - p2);
        if (wl > 0.002 && wop > 0.01)
        {
            RectangleF lr = new RectangleF(x0 - 60f, bas - CY * K - 2f, oAdv + restS + 120f, 4f);
            GraphicsState s = g.Save();
            g.SetClip(new RectangleF(lr.X, lr.Y - 2f, lr.Width * (float)wl, lr.Height + 4f));
            using (LinearGradientBrush lb = new LinearGradientBrush(lr, Color.Transparent, Color.Transparent, LinearGradientMode.Horizontal))
            {
                int al = (int)(wop * 255);
                ColorBlend cb = new ColorBlend(4);
                cb.Colors = new Color[] { Color.FromArgb(0, 43, 196, 180), Color.FromArgb(al, 43, 196, 180), Color.FromArgb(al, 43, 196, 180), Color.FromArgb(0, 43, 196, 180) };
                cb.Positions = new float[] { 0f, .12f, .88f, 1f };
                lb.InterpolationColors = cb;
                g.FillRectangle(lb, lr);
            }
            g.Restore(s);
        }

        // «O»
        double fly = Eio(Cl(t1, 2.6, 3.5));
        float S0 = 2.5f;
        float sc = S0 + (1f - S0) * (float)fly;
        float fcx = x0 + CX * K, fcy = bas - CY * K;
        float cx = W / 2f + (fcx - W / 2f) * (float)fly, cy = H / 2f + (fcy - H / 2f) * (float)fly;
        double rot = 720.0 * Eio(Cl(t1, 1.25, 2.55));
        double appear = Eo(Cl(t1, 0, 0.55));
        double cut = Eio(Cl(t1, 0.55, 1.25));
        float head = L + (float)cut * (R - L);
        float f = sc * (float)(0.9 + 0.1 * appear) * K;
        int oa = (int)(appear * 255);
        if (oa > 0)
        {
            GraphicsState so = g.Save();
            g.TranslateTransform(cx, cy);
            g.RotateTransform((float)rot);
            g.ScaleTransform(f, f);
            g.TranslateTransform(-CX, CY);
            using (SolidBrush wb = new SolidBrush(Color.FromArgb(oa, Brand.Fg))) g.FillPath(wb, Brand.PathO);
            // зелёная линия ровно по ширине «O»; за ней перемычки исчезают — кольцо раскрывается
            if (head - L > 0.5f && t1 < 4.0)
            {
                RectangleF lr = new RectangleF(L, -354f, head - L, 8f);
                using (SolidBrush gb = new SolidBrush(Color.FromArgb((int)(40 * appear), 43, 196, 180))) g.FillRectangle(gb, lr.X, lr.Y - 18f, lr.Width, lr.Height + 36f);
                using (SolidBrush gb = new SolidBrush(Color.FromArgb((int)(80 * appear), 43, 196, 180))) g.FillRectangle(gb, lr.X, lr.Y - 7f, lr.Width, lr.Height + 14f);
                using (SolidBrush gb = new SolidBrush(Brand.Ac)) g.FillRectangle(gb, lr);
            }
            g.SetClip(new RectangleF(head, -430f, R + 20f - head, 160f));
            if (bridgeL == null) { bridgeL = Brand.Bridge(false); bridgeR = Brand.Bridge(true); }
            using (SolidBrush wb = new SolidBrush(Color.FromArgb(oa, Brand.Fg))) { g.FillPath(wb, bridgeL); g.FillPath(wb, bridgeR); }
            g.Restore(so);
        }

        // слово выходит из «O»: видно только справа от её кромки
        double rv = Eo(Cl(t1, 2.85, 3.75));
        if (rv > 0.001)
        {
            float wl0 = x0 + oAdv, oEdge = cx + (R - CX) * K * sc;
            float leftCut = Math.Max(0f, oEdge - wl0), shown = (float)rv * (restS + 8f);
            float clipL = wl0 + Math.Min(leftCut, restS), clipR = wl0 + restS - Math.Max(0f, restS - shown);
            if (t1 >= 3.75) { clipL = wl0 - 4f; clipR = wl0 + restS + 20f; }
            if (clipR > clipL)
            {
                GraphicsState sw = g.Save();
                g.SetClip(new RectangleF(clipL, bas - F, clipR - clipL, F * 1.3f));
                g.TranslateTransform(wl0, bas);
                g.ScaleTransform(K, K);
                using (SolidBrush wb = new SolidBrush(Brand.Fg)) g.FillPath(wb, Brand.PathWord);
                g.Restore(sw);
            }
        }
        g.Restore(outer);
    }
}

// Накладывается на всё окно при первом показе, играет анимацию и сообщает о конце. Клик — пропустить.
class IntroOverlay : Control
{
    [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint ms);
    [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint ms);
    Stopwatch sw;
    Bitmap backdrop;
    System.Media.SoundPlayer sound;
    volatile bool done, running, pending;
    bool period;
    public event EventHandler Finished;
    public IntroOverlay()
    {
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.Opaque, true);
        Dock = DockStyle.Fill; BackColor = Color.Black; Cursor = Cursors.Default;
    }
    public void Begin()
    {
        try
        {
            backdrop = new Bitmap(Math.Max(1, Width), Math.Max(1, Height), PixelFormat.Format32bppPArgb);
            using (Graphics bg = Graphics.FromImage(backdrop)) Backdrop.Paint(bg, new Rectangle(0, 0, backdrop.Width, backdrop.Height));
        }
        catch { backdrop = null; }
        try { timeBeginPeriod(1); period = true; } catch { }
        // тихий звук запуска (вшит в exe): кручение «O» и мягкие тона; если не получилось — просто без звука
        try
        {
            System.IO.Stream ss = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream("intro.wav");
            if (ss != null) { sound = new System.Media.SoundPlayer(ss); sound.Play(); }
        }
        catch { sound = null; }
        sw = Stopwatch.StartNew();
        running = true;
        // кадры задаёт отдельный поток по часам Stopwatch (шаг 1 мс), а не WinForms Timer с его дрожанием ~15 мс;
        // следующий кадр просим, только когда предыдущий уже нарисован, — очередь сообщений не копится
        System.Threading.Thread th = new System.Threading.Thread(delegate()
        {
            double next = 0, step = 1000.0 / 60.0;
            while (running)
            {
                double now = sw.Elapsed.TotalMilliseconds;
                if (now >= next)
                {
                    next += step;
                    if (now - next > 100) next = now;
                    if (!pending)
                    {
                        pending = true;
                        try { BeginInvoke((MethodInvoker)Tick); } catch { running = false; }
                    }
                }
                else System.Threading.Thread.Sleep(1);
            }
        });
        th.IsBackground = true;
        th.Priority = System.Threading.ThreadPriority.AboveNormal;
        th.Start();
    }
    void Tick()
    {
        pending = false;
        if (done) return;
        if (Time() >= Intro.P2B) { Finish(); return; }
        Invalidate();
        Update();
    }
    double Time() { return sw == null ? 0.0 : sw.Elapsed.TotalSeconds; }
    void Finish()
    {
        if (done) return;
        done = true; running = false;
        if (period) { try { timeEndPeriod(1); } catch { } period = false; }
        EventHandler h = Finished;
        if (h != null) h(this, EventArgs.Empty);
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        // клик пропускает заставку — и звук тоже
        if (sw != null) { if (!done && sound != null) { try { sound.Stop(); } catch { } } Finish(); }
        base.OnMouseDown(e);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.CompositingQuality = CompositingQuality.HighSpeed;
        e.Graphics.PixelOffsetMode = PixelOffsetMode.HighSpeed;
        Intro.Render(e.Graphics, Width, Height, done ? Intro.P2B : Time(), backdrop);
    }
    protected override void Dispose(bool disposing)
    {
        running = false;
        if (period) { try { timeEndPeriod(1); } catch { } period = false; }
        if (disposing && backdrop != null) { backdrop.Dispose(); backdrop = null; }
        base.Dispose(disposing);
    }
}
