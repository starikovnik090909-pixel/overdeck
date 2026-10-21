#!/usr/bin/env python3
"""Генератор фонов сцены расширения Twitch (extension/scenes/*.png): фэнтези-декорации в духе D&D — «Лобби гильдии», «Таверна», «Храм», «Городской рынок».

Каждый фон — бесшовная по горизонтали пиксельная полоса 640×104 (в расширении показывается высотой ~30 % экрана с укрупнением без сглаживания).
Верх НЕ ровный: коньки крыш, башни, шпили, флаги, дымоходы, вывески торчат над линией стены, выше них фон прозрачный — как вырезанный PNG.
Нижние ~40 % — пол/мостовая, по ней ходят герои. Объекты рисуются с «обёрткой» по X, поэтому края стыкуются; всё детерминировано (фиксированный seed).
Запуск: python3 tools/gen_scene_backgrounds.py [папка_вывода]. Нужен Pillow."""
import os, sys, random, math
from PIL import Image, ImageDraw

W, H = 640, 104
FLOOR = 66            # верхняя линия пола (герои ходят ниже)

def C(s, a=255): s = s.lstrip('#'); return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)
def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)

class Cv:
    def __init__(self, seed):
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); self.p = self.im.load(); self.r = random.Random(seed)
    def px(self, x, y, c):
        if 0 <= y < H and c[3] > 0: self.p[x % W, y] = c if c[3] == 255 else self._blend(self.p[x % W, y], c)
    def _blend(self, d, s):
        a = s[3] / 255.0; da = d[3] / 255.0; oa = a + da * (1 - a)
        if oa == 0: return (0, 0, 0, 0)
        return tuple(int((s[i] * a + d[i] * da * (1 - a)) / oa) for i in range(3)) + (int(oa * 255),)
    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1): self.px(x, y, c)
    def poly(self, pts, c):
        ys = [p[1] for p in pts]; n = len(pts)
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for i in range(n):
                (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % n]
                if ya == yb: continue
                if (ya <= y + .5 < yb) or (yb <= y + .5 < ya): xs.append(xa + (y + .5 - ya) * (xb - xa) / (yb - ya))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.floor(xs[i] + .5)), int(math.floor(xs[i + 1] + .5))): self.px(x, y, c)
    def ell(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1: self.px(x, y, c)
    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1): self.px(round(x0 + (x1 - x0) * i / max(1, n)), round(y0 + (y1 - y0) * i / max(1, n)), c)
    def tex(self, x0, y0, x1, y1, pal, wts=None, streak=0):
        """Шумная заливка тонами палитры (дерево: streak>0 — горизонтальные полосы)."""
        for y in range(int(y0), int(y1) + 1):
            base = self.r.random()
            for x in range(int(x0), int(x1) + 1):
                v = (base * streak + self.r.random() * (1 - streak)) if streak else self.r.random()
                if wts:
                    acc = 0
                    for c, w in zip(pal, wts):
                        acc += w
                        if v <= acc: break
                else: c = pal[min(len(pal) - 1, int(v * len(pal)))]
                self.px(x, y, c)
    def bricks(self, x0, y0, x1, y1, bw, bh, pal, mortar):
        for j, y in enumerate(range(int(y0), int(y1) + 1, bh)):
            off = (bw // 2) if j % 2 else 0
            for x in range(int(x0) - off, int(x1) + 1, bw):
                col = self.r.choice(pal)
                for yy in range(y, min(int(y1), y + bh - 1) + 1):
                    for xx in range(x, x + bw - 1):
                        if x0 <= xx <= x1: self.px(xx, yy, col)
                for xx in range(x, x + bw):
                    if x0 <= xx <= x1 and y + bh - 1 <= y1: self.px(xx, y + bh - 1, mortar)
                if x0 <= x + bw - 1 <= x1:
                    for yy in range(y, min(int(y1), y + bh - 1) + 1): self.px(x + bw - 1, yy, mortar)
    def glow(self, cx, cy, r, c, a=70):
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                d = math.hypot(x - cx, y - cy)
                if d <= r: self.px(x, y, (c[0], c[1], c[2], int(a * (1 - d / r) ** 1.5)))
    def outline(self, col=None):
        """Тёмный контур по внешнему краю силуэта (как у вырезанного спрайта)."""
        src = self.im.copy(); sp = src.load(); out = []
        for y in range(H):
            for x in range(W):
                if sp[x, y][3] < 200:
                    n = [sp[(x + dx) % W, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= y + dy < H]
                    if any(q[3] >= 200 for q in n): out.append((x, y))
        for x, y in out: self.p[x, y] = col or (28, 22, 30, 255)
    def wrap(self, fn, span=0):
        for dx in (-W, 0, W): fn(dx)

# ---------- общие предметы ----------
def barrel(c, x, y, h=11, w=9):
    wood = (C('#a8703a'), C('#8a5628'), C('#6b4020')); hoop = C('#3b3a44')
    c.rect(x - w // 2, y - h, x + w // 2, y, wood[1])
    c.rect(x - w // 2, y - h + 1, x - w // 2 + 1, y - 1, wood[0]); c.rect(x + w // 2 - 1, y - h + 1, x + w // 2, y - 1, wood[2])
    c.px(x - w // 2, y - h, (0, 0, 0, 0)); c.px(x + w // 2, y - h, (0, 0, 0, 0))
    for yy in (y - h + 2, y - 3): c.rect(x - w // 2, yy, x + w // 2, yy, hoop)
    c.rect(x - w // 2, y - h, x + w // 2, y - h, wood[0])
def crate(c, x, y, s=9, col=None):
    w = col or (C('#b98443'), C('#946832'), C('#6e4a26'))
    c.rect(x, y - s, x + s, y, w[1]); c.rect(x, y - s, x + s, y - s, w[0]); c.rect(x, y, x + s, y, w[2])
    c.line(x, y - s, x + s, y, w[2]); c.line(x, y, x + s, y - s, w[2]); c.rect(x, y - s, x, y, w[0]); c.rect(x + s, y - s, x + s, y, w[2])
def torch(c, x, y, h=9, flame=True):
    c.rect(x, y - h, x, y, C('#5a3a22')); c.rect(x - 1, y - h - 1, x + 1, y - h, C('#3b3a44'))
    if flame:
        c.glow(x, y - h - 4, 11, C('#ffb347'), 90)
        c.poly([(x, y - h - 8), (x + 2, y - h - 3), (x + 1, y - h - 1), (x - 1, y - h - 1), (x - 2, y - h - 3)], C('#ff9b2f')); c.poly([(x, y - h - 6), (x + 1, y - h - 3), (x, y - h - 1), (x - 1, y - h - 3)], C('#ffe27a'))
def lantern(c, x, y, glow=True):
    c.rect(x, y - 4, x, y - 1, C('#2c2a33'))
    c.rect(x - 2, y, x + 2, y + 5, C('#2c2a33')); c.rect(x - 1, y + 1, x + 1, y + 4, C('#ffd878')); c.px(x, y + 2, C('#fff6c9'))
    if glow: c.glow(x, y + 3, 13, C('#ffc45c'), 85)
def window(c, x0, y0, x1, y1, glow=C('#ffcf6a'), frame=C('#3b2a22'), mull=True, arch=False):
    c.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, frame)
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        for x in range(x0, x1 + 1): c.px(x, y, mix(C('#fff0a8'), glow, t * .8 + (abs(x - (x0 + x1) / 2) / max(1, (x1 - x0) / 2)) * .3))
    if mull: c.rect((x0 + x1) // 2, y0, (x0 + x1) // 2, y1, frame); c.rect(x0, (y0 + y1) // 2, x1, (y0 + y1) // 2, frame)
    if arch: c.poly([(x0 - 1, y0 - 1), ((x0 + x1) / 2, y0 - 5), (x1 + 1, y0 - 1)], frame)
def d20(c, x, y, col=C('#e8d28a'), ink=C('#3a2a14')):
    c.poly([(x, y - 6), (x + 5, y - 3), (x + 5, y + 3), (x, y + 6), (x - 5, y + 3), (x - 5, y - 3)], col)
    c.poly([(x, y - 3), (x + 3, y + 2), (x - 3, y + 2)], ink); c.px(x, y, col)
def dragon_skull(c, x, y, s=1):
    b = C('#e6dcc0'); sh = C('#b9ab8b'); dk = C('#3a3224')
    c.poly([(x - 9, y), (x - 6, y - 5), (x + 2, y - 6), (x + 9, y - 3), (x + 13, y - 1), (x + 12, y + 2), (x + 3, y + 3), (x - 6, y + 4)], b)
    c.poly([(x - 8, y - 4), (x - 11, y - 9), (x - 6, y - 5)], b); c.poly([(x - 3, y - 6), (x - 4, y - 11), (x + 1, y - 6)], b)
    c.rect(x - 2, y - 2, x + 1, y + 1, dk); c.rect(x + 4, y + 1, x + 11, y + 2, sh)
    for tx in (5, 7, 9, 11): c.px(x + tx, y + 3, b)
def banner(c, x, y, w, h, col, trim=C('#e8c15a'), emblem=True):
    c.rect(x - 1, y - 2, x + w, y - 1, C('#5a3a22'))
    c.poly([(x, y), (x + w - 1, y), (x + w - 1, y + h), (x + w // 2 - 1, y + h - 4), (x, y + h)], col)
    c.rect(x, y, x + w - 1, y, trim); c.rect(x, y, x, y + h, mix(col, (0, 0, 0), .3)); c.rect(x + w - 1, y, x + w - 1, y + h - 1, mix(col, (0, 0, 0), .3))
    if emblem: d20(c, x + w // 2, y + h // 2 - 1, trim, col)
def flame(c, x, y, s=1.0):
    c.glow(x, y - 2, 12, C('#ffb347'), 80)
    c.poly([(x, y - 9 * s), (x + 3, y - 3 * s), (x + 2, y), (x - 2, y), (x - 3, y - 3 * s)], C('#ff8a2a')); c.poly([(x, y - 6 * s), (x + 1.5, y - 2 * s), (x, y), (x - 1.5, y - 2 * s)], C('#ffe27a'))

# ---------- ТАВЕРНА ----------
def tavern():
    c = Cv(101); r = c.r
    shingle = [C('#8a3f3a'), C('#a24d43'), C('#6d2f31')]
    x = 0; i = 0
    while x < W:
        bw = r.choice([132, 150, 168, 120]) if x + 170 < W else W - x
        x0, x1 = x, x + bw - 1; wt = r.randint(30, 38); pk = r.randint(6, 16)
        # стена: штукатурка + фахверк
        c.tex(x0, wt, x1, FLOOR, [C('#e9d9b4'), C('#dcc89c'), C('#cdb88a')], [.5, .35, .15])
        c.rect(x0, wt, x1, wt + 1, C('#3d2a1f')); c.rect(x0, FLOOR - 6, x1, FLOOR, C('#6f6a73')); c.bricks(x0, FLOOR - 6, x1, FLOOR, 7, 3, [C('#7b7580'), C('#6a6572'), C('#8a8490')], C('#4b4752'))
        for bx in range(x0 + 4, x1, 27):
            c.rect(bx, wt, bx + 2, FLOOR - 6, C('#4b2f20')); c.rect(bx, wt, bx, FLOOR - 6, C('#6a4630'))
            c.line(bx + 3, wt + 12, bx + 14, wt + 2, C('#4b2f20')); c.line(bx + 3, FLOOR - 12, bx + 14, FLOOR - 22, C('#4b2f20'))
        c.rect(x0, FLOOR - 24, x1, FLOOR - 22, C('#4b2f20'))
        # крыша-щипец: ряды черепицы, коньковый брус торчит выше стены
        c.poly([(x0 - 5, wt + 1), ((x0 + x1) / 2, pk), (x1 + 5, wt + 1)], shingle[1])
        for yy in range(pk, wt + 1, 3):
            span = (yy - pk) / max(1, (wt + 1 - pk)); hw = (bw / 2 + 5) * span
            for xx in range(int((x0 + x1) / 2 - hw), int((x0 + x1) / 2 + hw), 4):
                c.rect(xx, yy, xx + 3, yy + 1, shingle[(xx // 4 + yy // 3) % 3]); c.px(xx + 3, yy + 1, C('#4a2226'))
        c.line(x0 - 5, wt + 1, (x0 + x1) / 2, pk, C('#3d2a1f')); c.line(x1 + 5, wt + 1, (x0 + x1) / 2, pk, C('#3d2a1f'))
        c.rect((x0 + x1) // 2, pk - 5, (x0 + x1) // 2, pk, C('#3d2a1f')); c.px((x0 + x1) // 2, pk - 6, C('#e8c15a'))           # флюгер-острие
        # слуховое окно в крыше
        cx = (x0 + x1) // 2
        if bw > 125: window(c, cx - 4, pk + 9, cx + 4, pk + 17, mull=True, arch=True)
        # дымоход с дымом
        if r.random() < .6:
            hx = x0 + r.randint(12, bw - 16); c.rect(hx, wt - 16, hx + 7, wt + 2, C('#7b6a62')); c.rect(hx - 1, wt - 17, hx + 8, wt - 15, C('#5a4c47')); c.bricks(hx, wt - 14, hx + 7, wt + 2, 4, 3, [C('#8a7870'), C('#6f5f58')], C('#4a3e3a'))
            for k in range(4): c.ell(hx + 4 + k * 2, wt - 22 - k * 5, 3 + k * .8, 2.2 + k * .5, (200, 200, 208, 150 - k * 28))
        # окна, дверь
        wx = x0 + 14
        for k in range(2):
            wxx = wx + k * (bw - 52); window(c, wxx, wt + 9, wxx + 11, wt + 22); c.rect(wxx - 2, wt + 23, wxx + 13, wt + 25, C('#4b2f20'))
            c.rect(wxx - 4, wt + 9, wxx - 2, wt + 22, C('#2f5a4a')); c.rect(wxx + 13, wt + 9, wxx + 15, wt + 22, C('#2f5a4a'))             # ставни
            c.px(wxx + 2, wt + 26, C('#e0584f')); c.px(wxx + 6, wt + 26, C('#ffd34d')); c.rect(wxx, wt + 27, wxx + 8, wt + 27, C('#2f6e3c'))   # цветочный ящик
        dx = cx - 8
        c.rect(dx - 1, FLOOR - 28, dx + 16, FLOOR - 6, C('#2d1d16')); c.poly([(dx - 1, FLOOR - 28), (dx + 7.5, FLOOR - 36), (dx + 16, FLOOR - 28)], C('#2d1d16'))
        c.tex(dx, FLOOR - 28, dx + 15, FLOOR - 6, [C('#7a4a2a'), C('#6a3f24'), C('#59341e')], streak=0.9); c.poly([(dx, FLOOR - 28), (dx + 7.5, FLOOR - 35), (dx + 15, FLOOR - 28)], C('#6a3f24'))
        c.rect(dx + 7, FLOOR - 35, dx + 7, FLOOR - 6, C('#2d1d16')); c.rect(dx + 2, FLOOR - 18, dx + 5, FLOOR - 17, C('#2c2a33')); c.rect(dx + 10, FLOOR - 18, dx + 13, FLOOR - 17, C('#2c2a33')); c.px(dx + 6, FLOOR - 15, C('#e8c15a')); c.px(dx + 9, FLOOR - 15, C('#e8c15a'))
        c.rect(dx - 3, FLOOR - 6, dx + 18, FLOOR - 5, C('#8a8490'))
        # вывеска-кружка на кронштейне
        sx = x0 + bw - 22 if i % 2 == 0 else x0 + 12
        c.rect(sx - 8, wt + 28 - 10, sx + 1, wt + 28 - 9, C('#2c2a33')); c.line(sx - 6, wt + 18, sx - 1, wt + 24, C('#2c2a33'))
        c.rect(sx - 6, wt + 20, sx + 8, wt + 32, C('#5b3a22')); c.rect(sx - 5, wt + 21, sx + 7, wt + 31, C('#c79458')); c.rect(sx - 2, wt + 23, sx + 3, wt + 29, C('#f2f0e8')); c.rect(sx + 4, wt + 24, sx + 5, wt + 27, C('#f2f0e8')); c.rect(sx - 2, wt + 23, sx + 3, wt + 24, C('#ffcf5a'))
        # DnD-штрихи: череп дракона над одной дверью, баннер на другой
        if i % 3 == 0: dragon_skull(c, cx, wt + 4)
        elif i % 3 == 1: banner(c, x0 + 6, wt + 6, 9, 20, C('#7a2a3a'))
        else: banner(c, x1 - 14, wt + 6, 9, 20, C('#2a4a7a'))
        # фонарь у двери
        lantern(c, dx + 21, FLOOR - 34)
        x += bw + r.choice([0, 0, 6]); i += 1
    # пол: деревянные доски
    c.tex(0, FLOOR + 1, W - 1, H - 1, [C('#8a5a34'), C('#7a4d2c'), C('#6a4226'), C('#5a381f')], [.3, .35, .25, .1], streak=0.7)
    for yy in range(FLOOR + 1, H, 6): c.rect(0, yy, W - 1, yy, C('#4a2e19'))
    c.rect(0, FLOOR, W - 1, FLOOR, C('#b88650'))
    for xx in range(5, W, 37): c.rect(xx, FLOOR + 1, xx, H - 1, C('#4a2e19'))
    # предметы по полу: бочки, ящики, мешки
    for xx in range(18, W, 96):
        k = r.random()
        if k < .4: barrel(c, xx, FLOOR + 6); barrel(c, xx + 9, FLOOR + 7, 10, 8)
        elif k < .7: crate(c, xx, FLOOR + 7); crate(c, xx + 3, FLOOR - 2, 8)
        else: c.ell(xx, FLOOR + 3, 6, 5, C('#c9b27a')); c.rect(xx - 2, FLOOR - 2, xx + 2, FLOOR - 1, C('#a58b57'))
    c.outline(); return c.im

# ---------- ХРАМ ----------
def temple():
    c = Cv(202); r = c.r
    st = [C('#d8d6e6'), C('#bdbbd2'), C('#9d9bb8'), C('#7f7da0')]; gold = C('#e8c15a'); gold_d = C('#b58f2e')
    # задняя стена (тёмная) с витражами и рунами
    c.tex(0, 28, W - 1, FLOOR, [C('#3f3d63'), C('#37355a'), C('#2f2d4e')], [.4, .4, .2])
    for xx in range(0, W, 8): c.rect(xx, 28, xx, FLOOR, C('#2b2947'))
    # шпили, башни и купол: торчат над линией антаблемента
    def spire(cx, top, w, h):
        c.rect(cx - w, top + h, cx + w, 28, st[1]); c.bricks(cx - w, top + h, cx + w, 28, 6, 3, [st[0], st[1], st[2]], st[3])
        c.poly([(cx - w - 2, top + h), (cx, top), (cx + w + 2, top + h)], C('#4d4a86')); c.poly([(cx, top + 2), (cx + w + 2, top + h), (cx, top + h)], C('#3b3870')); c.rect(cx, top - 6, cx, top, gold); c.px(cx, top - 7, gold)
        c.rect(cx - 1, top + h + 4, cx + 1, top + h + 12, C('#ffe9a0')); c.px(cx, top + h + 3, C('#ffe9a0'))
    for cx, top, w, h in ((70, 6, 8, 18), (250, 12, 7, 14), (430, 3, 9, 20), (590, 10, 7, 15)): spire(cx, top, w, h)
    # центральный купол
    c.rect(314, 20, 366, 28, st[1]); c.bricks(314, 20, 366, 28, 6, 3, [st[0], st[1], st[2]], st[3])
    for y in range(2, 21):
        for x in range(314, 367):
            dx = (x - 340) / 26.0; dy = (y - 20) / 20.0
            if dx * dx + dy * dy <= 1: c.px(x, y, gold_d if dx * dx + dy * dy > .8 else (C('#f4d97e') if (x < 336 and y < 14) else gold))
    for xx in range(320, 361, 8): c.line(340, 1, xx, 20, gold_d)
    c.rect(339, -4, 341, 2, gold); c.px(340, -5, C('#ffffff')); c.rect(310, 20, 370, 21, st[0])
    for xx in range(320, 361, 10): c.rect(xx, 23, xx + 4, 27, C('#3f3d63'))
    # фронтоны на колоннах
    for ped in (120, 520):
        c.poly([(ped - 46, 28), (ped, 8), (ped + 46, 28)], st[1]); c.poly([(ped - 40, 28), (ped, 12), (ped + 40, 28)], st[0]); c.poly([(ped - 30, 28), (ped, 17), (ped + 30, 28)], C('#3f3d63'))
        c.ell(ped, 22, 7, 7, gold); c.ell(ped, 22, 5, 5, C('#5b3a9a')); d20(c, ped, 22, C('#ffe9a0'), C('#5b3a9a'))
        c.line(ped - 46, 28, ped, 8, st[3]); c.line(ped + 46, 28, ped, 8, st[3])
    # статуи на антаблементе
    def statue(cx, kind):
        c.rect(cx - 5, 21, cx + 5, 27, st[2]); c.rect(cx - 5, 21, cx + 5, 21, st[0])
        c.rect(cx - 2, 8, cx + 2, 21, st[1]); c.ell(cx, 6, 3, 3, st[0]); c.rect(cx - 4, 10, cx - 3, 18, st[2]); c.rect(cx + 3, 10, cx + 4, 18, st[2])
        if kind == 0: c.rect(cx + 6, 0, cx + 6, 20, st[0]); c.rect(cx + 4, 8, cx + 8, 8, st[0]); c.poly([(cx - 5, 6), (cx - 6, 0), (cx - 2, 4)], st[1])    # меч и шлем
        else: c.rect(cx + 6, 2, cx + 6, 21, C('#b58f2e')); c.ell(cx + 6, 2, 2, 2, C('#7aa7ff')); c.poly([(cx - 4, 4), (cx, -2), (cx + 4, 4)], st[1])         # посох и колпак мага
    for k, cx in enumerate((20, 190, 290, 392, 470, 600)): statue(cx, k % 2)
    # антаблемент
    c.rect(0, 25, W - 1, 31, st[1]); c.rect(0, 25, W - 1, 26, st[0]); c.rect(0, 31, W - 1, 31, st[3])
    for xx in range(0, W, 6): c.rect(xx, 28, xx + 2, 29, st[2])
    # витражи и руны в глубине
    for cx in (50, 160, 270, 400, 500, 610):
        c.rect(cx - 7, 34, cx + 7, 60, C('#2b2947')); c.poly([(cx - 7, 34), (cx, 24), (cx + 7, 34)], C('#2b2947'))
        cols = [C('#7aa7ff'), C('#c58bff'), C('#ffd34d'), C('#ff7a8a')]
        for yy in range(30, 60):
            for xx in range(cx - 6, cx + 7):
                if yy < 34 and abs(xx - cx) > (34 - yy) + 2 - (0): continue
                c.px(xx, yy, mix(cols[((xx - cx + 6) // 4 + yy // 6) % 4], C('#ffffff'), .12 if (xx + yy) % 5 else .35))
        c.rect(cx, 26, cx, 60, C('#2b2947')); c.rect(cx - 7, 46, cx + 7, 46, C('#2b2947')); c.glow(cx, 46, 18, C('#b79bff'), 48)
    # колонны
    for cx in range(30, W, 80):
        c.rect(cx - 5, 31, cx + 5, 33, st[0]); c.rect(cx - 6, 33, cx + 6, 35, st[1])
        for xx in range(cx - 4, cx + 5):
            col = st[0] if xx < cx - 1 else (st[1] if xx < cx + 2 else st[2]); c.rect(xx, 36, xx, FLOOR - 4, col)
        for xx in (cx - 2, cx + 1): c.rect(xx, 38, xx, FLOOR - 6, st[2])
        c.rect(cx - 6, FLOOR - 4, cx + 6, FLOOR - 2, st[1]); c.rect(cx - 7, FLOOR - 2, cx + 7, FLOOR, st[2]); c.rect(cx - 7, FLOOR - 2, cx + 7, FLOOR - 2, st[0])
    # напольные жаровни и золотые светильники
    for cx in range(70, W, 160):
        c.rect(cx - 1, FLOOR - 8, cx + 1, FLOOR + 5, gold_d); c.rect(cx - 5, FLOOR - 10, cx + 5, FLOOR - 8, gold); c.rect(cx - 6, FLOOR - 11, cx + 6, FLOOR - 10, gold_d); flame(c, cx, FLOOR - 11, 1.2)
    # пол: мраморные плиты, красная ковровая дорожка
    for y in range(FLOOR + 1, H):
        for x in range(W):
            tile = ((x // 16) + ((y - FLOOR) // 8)) % 2
            c.p[x, y] = (C('#cfcde0') if tile else C('#b4b2cb')) if (x % 16 and (y - FLOOR) % 8) else C('#8e8ca8')
    c.rect(0, FLOOR, W - 1, FLOOR, C('#f0eefa'))
    for y in range(FLOOR + 9, H - 6):
        for x in range(W):
            if (x // 4 + y // 3) % 2 == 0: c.p[x, y] = C('#8a2a3a')
            else: c.p[x, y] = C('#74222f')
    for y in (FLOOR + 9, H - 7): c.rect(0, y, W - 1, y, gold)
    for xx in range(10, W, 40): d20(c, xx, FLOOR + 21, gold, C('#74222f'))
    c.outline(C('#262244')); return c.im

# ---------- ГОРОДСКОЙ РЫНОК ----------
def market():
    c = Cv(303); r = c.r
    # дома заднего плана, крыши и башня торчат выше палаток
    x = 0
    while x < W:
        bw = r.randint(52, 84); top = r.randint(8, 26)
        wall = r.choice([C('#cdb48a'), C('#d8c09a'), C('#b99e78'), C('#c4a58a')])
        c.rect(x, top + 12, x + bw - 1, FLOOR, wall)
        for yy in range(top + 12, FLOOR, 4): c.rect(x, yy, x + bw - 1, yy, mix(wall, (0, 0, 0), .08))
        roof = r.choice([C('#a8473f'), C('#6d6f9a'), C('#4f8a6d')]); rd = mix(roof, (0, 0, 0), .3)
        c.poly([(x - 4, top + 13), (x + bw / 2 + r.randint(-6, 6), top - 4), (x + bw + 3, top + 13)], roof)
        for yy in range(top, top + 13, 3):
            for xx in range(x - 3, x + bw + 3, 4): 
                if c.im.getpixel((xx % W, yy))[3] and c.im.getpixel((xx % W, yy)) == roof: c.px(xx, yy + 2, rd)
        c.line(x - 4, top + 13, x + bw / 2, top - 4, mix(roof, (0, 0, 0), .5))
        if r.random() < .5: c.rect(x + bw - 14, top - 6, x + bw - 8, top + 8, C('#7b6a62')); c.rect(x + bw - 15, top - 7, x + bw - 7, top - 6, C('#5a4c47'))
        for wx in range(x + 8, x + bw - 14, 22): window(c, wx, top + 18, wx + 6, top + 28, glow=C('#ffcf6a') if r.random() < .6 else C('#a8c8ff'))
        x += bw
    # башня с часами и флагом
    tx = 300; c.rect(tx - 12, 4, tx + 12, FLOOR, C('#bfae98')); c.bricks(tx - 12, 4, tx + 12, FLOOR, 7, 3, [C('#c9b8a2'), C('#b09f8a'), C('#bfae98')], C('#8a7a68'))
    c.poly([(tx - 15, 6), (tx, -4), (tx + 15, 6)], C('#8a3a3a')); c.ell(tx, 20, 7, 7, C('#f2ead8')); c.ell(tx, 20, 5, 5, C('#e0d6bd')); c.line(tx, 20, tx, 15, C('#3a2a1a')); c.line(tx, 20, tx + 3, 22, C('#3a2a1a'))
    c.rect(tx, -12, tx, -2, C('#3a2a1a')) if False else None
    c.poly([(tx + 1, 2), (tx + 11, 4), (tx + 1, 7)], C('#d6484f'))
    # палатки: полосатые тенты с острыми верхами; товары на прилавках
    xs = [10, 132, 250, 372, 494]
    styles = [(C('#d6484f'), C('#f4efe2')), (C('#3f6bd0'), C('#f2c94c')), (C('#3f9a63'), C('#f4efe2')), (C('#8a4bd0'), C('#f2c94c')), (C('#d6844f'), C('#f4efe2'))]
    for k, sx in enumerate(xs):
        a, b = styles[k]; w = 112; mid = sx + w // 2; ty = 34
        c.rect(sx + 3, ty + 6, sx + 5, FLOOR - 2, C('#5a3a22')); c.rect(sx + w - 6, ty + 6, sx + w - 4, FLOOR - 2, C('#5a3a22'))
        c.poly([(sx - 2, ty + 12), (mid, ty - 10), (sx + w + 2, ty + 12)], a)
        for xx in range(sx - 2, sx + w + 2):
            if ((xx - sx) // 8) % 2 == 0: 
                for yy in range(ty - 10, ty + 13):
                    if c.im.getpixel((xx % W, yy)) == a: c.px(xx, yy, b)
        for xx in range(sx - 2, sx + w + 2, 8):                                   # фестончатая бахрома
            c.poly([(xx, ty + 11), (xx + 8, ty + 11), (xx + 4, ty + 16)], a if ((xx - sx) // 8) % 2 == 0 else b)
        c.line(sx - 2, ty + 12, mid, ty - 10, C('#2a1f2a')); c.line(sx + w + 2, ty + 12, mid, ty - 10, C('#2a1f2a'))
        c.rect(mid, ty - 16, mid, ty - 10, C('#2a1f2a')); c.poly([(mid + 1, ty - 16), (mid + 9, ty - 14), (mid + 1, ty - 11)], b)   # вымпел
        # прилавок
        c.rect(sx + 6, FLOOR - 16, sx + w - 8, FLOOR - 2, C('#8a5a34')); c.rect(sx + 6, FLOOR - 16, sx + w - 8, FLOOR - 15, C('#b88650')); c.rect(sx + 6, FLOOR - 2, sx + w - 8, FLOOR - 2, C('#4a2e19'))
        # товары: зелья / оружие / фрукты / свитки / сыры
        if k % 5 == 0:
            for j, xx in enumerate(range(sx + 12, sx + w - 14, 9)):
                col = [C('#e0485a'), C('#4a8fe0'), C('#6ad06a'), C('#c070e0')][j % 4]; c.rect(xx, FLOOR - 24, xx + 4, FLOOR - 17, col); c.rect(xx + 1, FLOOR - 27, xx + 3, FLOOR - 24, C('#c9c4d0')); c.px(xx + 1, FLOOR - 22, C('#ffffff'))
        elif k % 5 == 1:
            for j, xx in enumerate(range(sx + 14, sx + w - 14, 12)): c.rect(xx, FLOOR - 36, xx, FLOOR - 17, C('#d6d6e6')); c.rect(xx - 2, FLOOR - 24, xx + 2, FLOOR - 24, C('#b58f2e')); c.px(xx, FLOOR - 37, C('#ffffff'))
            c.ell(sx + w - 22, FLOOR - 22, 7, 7, C('#7a8aa8')); c.ell(sx + w - 22, FLOOR - 22, 3, 3, C('#e8c15a'))
        elif k % 5 == 2:
            for j, xx in enumerate(range(sx + 12, sx + w - 14, 8)): c.ell(xx + 3, FLOOR - 19, 3.5, 3.2, [C('#d6484f'), C('#f2c94c'), C('#7acb52')][j % 3]); c.ell(xx + 6, FLOOR - 24, 3.5, 3.2, [C('#f2c94c'), C('#7acb52'), C('#d6484f')][j % 3])
        elif k % 5 == 3:
            for j, xx in enumerate(range(sx + 12, sx + w - 14, 14)): c.rect(xx, FLOOR - 28, xx + 6, FLOOR - 17, C('#f0e6c8')); c.rect(xx, FLOOR - 28, xx + 6, FLOOR - 27, C('#c0a878')); c.rect(xx + 1, FLOOR - 24, xx + 5, FLOOR - 24, C('#7a5a3a')); c.px(xx + 3, FLOOR - 20, C('#d6484f'))
        else:
            for j, xx in enumerate(range(sx + 12, sx + w - 14, 12)): c.poly([(xx, FLOOR - 17), (xx + 9, FLOOR - 17), (xx + 4, FLOOR - 25)], C('#f2c94c')); c.px(xx + 4, FLOOR - 21, C('#c9972a'))
        lantern(c, sx + 18, ty + 15); lantern(c, sx + w - 22, ty + 15)
        # вывеска на тенте
        c.rect(mid - 9, ty + 17, mid + 9, ty + 22, C('#5a3a22')); c.rect(mid - 8, ty + 18, mid + 8, ty + 21, C('#e8d28a'))
    # гирлянда флажков между палатками
    for fx in range(0, W, 16):
        yy = 20 + int(5 * math.sin(fx / 16 * math.pi / 2)); col = [C('#d6484f'), C('#f2c94c'), C('#3f9a63'), C('#3f6bd0')][(fx // 16) % 4]
        c.px(fx, yy, C('#3a2a1a')); c.poly([(fx + 1, yy + 1), (fx + 7, yy + 1), (fx + 4, yy + 7)], col)
    # мостовая
    for y in range(FLOOR + 1, H):
        for x in range(W): c.p[x, y] = C('#7f7a8a')
    c.bricks(0, FLOOR + 1, W - 1, H - 1, 9, 5, [C('#8f8a9a'), C('#7a7586'), C('#9a95a5'), C('#6f6a7a')], C('#575263'))
    c.rect(0, FLOOR, W - 1, FLOOR, C('#a5a0b2'))
    for xx in range(24, W, 120):
        barrel(c, xx, FLOOR + 8) if (xx // 120) % 2 else crate(c, xx, FLOOR + 8, 9)
    c.outline(C('#2a1f2a')); return c.im

# ---------- ЛОББИ ГИЛЬДИИ ----------
def lobby():
    c = Cv(404); r = c.r
    st = [C('#a9a6b4'), C('#8f8c9c'), C('#76738a'), C('#5d5a72')]
    c.bricks(0, 34, W - 1, FLOOR, 10, 5, [st[0], st[1], st[2]], st[3])
    # зубцы стены и башни с конусными крышами и вымпелами
    for x in range(0, W, 14): c.rect(x, 26, x + 8, 34, st[1]); c.rect(x, 26, x + 8, 26, st[0]); c.rect(x + 8, 26, x + 8, 34, st[2])
    c.rect(0, 33, W - 1, 35, st[3])
    for cx, top in ((60, 4), (200, 10), (330, 0), (470, 8), (600, 12)):
        wd = 17 if cx == 330 else 13
        c.rect(cx - wd, top + 18, cx + wd, 34, st[1]); c.bricks(cx - wd, top + 18, cx + wd, 34, 8, 4, [st[0], st[1], st[2]], st[3])
        for x in range(cx - wd - 2, cx + wd + 2, 7): c.rect(x, top + 14, x + 4, top + 18, st[1])
        c.poly([(cx - wd - 3, top + 14), (cx, top - 8 if cx != 330 else top - 4), (cx + wd + 3, top + 14)], C('#7a2a3a')); c.poly([(cx, top - 6), (cx + wd + 3, top + 14), (cx, top + 14)], C('#5e2030'))
        c.line(cx - wd - 3, top + 14, cx, top - 8, C('#35202a')); c.rect(cx, top - 16, cx, top - 6, C('#35202a')); c.poly([(cx + 1, top - 16), (cx + 11, top - 13), (cx + 1, top - 10)], C('#e8c15a'))
        window(c, cx - 2, top + 21, cx + 2, top + 30, mull=False, arch=True)
    # центральные ворота-арка и решётка
    gx = 330
    c.poly([(gx - 22, FLOOR), (gx - 22, 44), (gx - 14, 34), (gx + 14, 34), (gx + 22, 44), (gx + 22, FLOOR)], st[3]); c.poly([(gx - 18, FLOOR), (gx - 18, 46), (gx - 11, 38), (gx + 11, 38), (gx + 18, 46), (gx + 18, FLOOR)], C('#24202f'))
    for yy in range(41, FLOOR, 3): c.rect(gx - 17, yy, gx + 17, yy, C('#3a3647')) if yy % 6 == 0 else None
    for xx in range(gx - 16, gx + 17, 5): c.rect(xx, 40, xx + 1, FLOOR, C('#4a465a'))
    for yy in (46, 54, 62): c.rect(gx - 17, yy, gx + 17, yy, C('#4a465a'))
    dragon_skull(c, gx, 30)
    # знамёна, факелы, доска заданий, стойки с оружием
    for bx, col in ((110, C('#7a2a3a')), (150, C('#2a4a7a')), (280, C('#2a4a7a')), (380, C('#7a2a3a')), (520, C('#2f5a4a')), (560, C('#7a2a3a'))): banner(c, bx, 38, 12, 24, col)
    for tx in (20, 250, 410, 625): torch(c, tx, FLOOR - 14, 9)
    # доска объявлений
    bx = 470; c.rect(bx, 40, bx + 38, 62, C('#4a2e19')); c.rect(bx + 1, 41, bx + 37, 61, C('#a8703a'))
    for j, (px_, py_, col) in enumerate(((3, 3, C('#f0e6c8')), (14, 5, C('#e6dcb8')), (26, 3, C('#f0e6c8')), (6, 28 - 11, C('#e6dcb8')), (20, 11, C('#f0e6c8')), (30, 12, C('#e6dcb8')))):
        c.rect(bx + px_, 41 + py_, bx + px_ + 8, 41 + py_ + 8, col); c.px(bx + px_ + 4, 41 + py_, C('#d6484f')); c.rect(bx + px_ + 1, 41 + py_ + 3, bx + px_ + 7, 41 + py_ + 3, C('#7a5a3a')); c.rect(bx + px_ + 1, 41 + py_ + 5, bx + px_ + 5, 41 + py_ + 5, C('#7a5a3a'))
    c.rect(bx + 6, 62, bx + 8, FLOOR - 2, C('#4a2e19')); c.rect(bx + 30, 62, bx + 32, FLOOR - 2, C('#4a2e19'))
    # стойка с оружием
    wx = 70; c.rect(wx, FLOOR - 16, wx + 26, FLOOR - 14, C('#5a3a22')); c.rect(wx, FLOOR - 4, wx + 26, FLOOR - 2, C('#5a3a22')); 
    for k, xx in enumerate(range(wx + 3, wx + 25, 5)):
        c.rect(xx, FLOOR - 34, xx, FLOOR - 3, C('#c9c8d6')) if k % 2 == 0 else (c.rect(xx, FLOOR - 28, xx, FLOOR - 3, C('#8a5a34')), c.poly([(xx - 1, FLOOR - 28), (xx, FLOOR - 34), (xx + 1, FLOOR - 28)], C('#d6d6e6')))
    # пол: каменные плиты и красная дорожка
    c.bricks(0, FLOOR + 1, W - 1, H - 1, 12, 6, [C('#7d788c'), C('#6b667c'), C('#8a8599')], C('#4a465a')); c.rect(0, FLOOR, W - 1, FLOOR, C('#a29db4'))
    for y in range(FLOOR + 8, H - 6):
        for x in range(W): c.p[x, y] = C('#8a2a3a') if (x // 3 + y // 3) % 2 == 0 else C('#74222f')
    for y in (FLOOR + 8, H - 7): c.rect(0, y, W - 1, y, C('#e8c15a'))
    for xx in range(8, W, 32): d20(c, xx, FLOOR + 19, C('#e8c15a'), C('#74222f'))
    # костёр-очаг и сундуки по краям
    for xx in (180, 520):
        c.rect(xx - 8, FLOOR - 2, xx + 8, FLOOR + 2, C('#3b3a44')); flame(c, xx, FLOOR - 2, 1.4)
    c.outline(C('#1f1a24')); return c.im

SCENES = [('lobby', 'Лобби гильдии', lobby), ('tavern', 'Таверна', tavern), ('temple', 'Храм', temple), ('market', 'Городской рынок', market)]

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'extension', 'scenes')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith('.png'): os.remove(os.path.join(out, f))
    for sid, title, fn in SCENES:
        im = fn(); im.save(os.path.join(out, sid + '.png'), optimize=True); print(sid, title, im.size)
