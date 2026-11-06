# Рисует значки достижений (5 ступеней × 5 достижений): Ветеран, Завсегдатай, Меценат, Золотой лот, Убийца монстров.
# Рамка и цвета ступеней — как у «Дуэлянта» и «Коллекционера» (железо → бронза → серебро → золото → кристалл), внутри свой рисунок.
# Запуск: python3 tools/gen-achievement-icons.py → achievementIcons.json ({ключ: [{icon: 96×96, iconSmall: 48×48} × 5]})
import json, base64, io, math
from PIL import Image, ImageDraw

TIERS = [  # rim, dark, inner, card, accent
    ('#8E949B', '#3A3F46', '#1A1F26', '#D9DEE3', '#7D858D'),
    ('#C27B3F', '#6B3A17', '#2A170C', '#F3DDBF', '#E08A3C'),
    ('#C9D0D8', '#6C7684', '#14213A', '#EEF3F8', '#5FA8D8'),
    ('#E8B64A', '#8A5A00', '#3A0F1E', '#FFF1C9', '#E07A2F'),
    ('#4FC3F7', '#1B5C8A', '#1A1550', '#E3F6FF', '#B79CFF'),
]
GOLD, GOLD_D, RED, WOOD = '#F2C14E', '#8A5A00', '#E5484D', '#B07A3A'
S = 48; CX, CY, R = 24, 25, 19

def hexpoly(r): return [(CX + r*math.sin(math.radians(a)), CY - r*math.cos(math.radians(a))) for a in range(0, 360, 60)]
def rot(pts, cx, cy, ang):
    a = math.radians(ang); return [(cx + (x-cx)*math.cos(a) - (y-cy)*math.sin(a), cy + (x-cx)*math.sin(a) + (y-cy)*math.cos(a)) for x, y in pts]

def wings(d, color, dark, left):
    sgn = -1 if left else 1; base = CX + sgn*(R-1)
    for dy, ln in [(-8, 3), (-4, 4), (0, 4), (4, 3)]:
        y = CY + dy; x2 = base + sgn*ln
        d.polygon([(base, y), (x2, y-2), (x2+sgn, y+1), (base, y+3)], fill=color, outline=dark)

def frame(d, t):
    rim, dark, inner, cardc, acc = TIERS[t]
    if t >= 3: wings(d, rim, dark, True); wings(d, rim, dark, False)
    d.polygon(hexpoly(R), fill=dark); d.polygon(hexpoly(R-1.5), fill=rim); d.polygon(hexpoly(R-4), fill=inner)
    n = t + 1; x0 = CX - (n-1)*2.5
    for i in range(n): x = x0 + i*5; d.rectangle([x-1, CY+13, x+1, CY+14], fill=cardc)
    if t == 4: d.polygon([(CX-6, 5), (CX-6, 1), (CX-3, 3), (CX, 0), (CX+3, 3), (CX+6, 1), (CX+6, 5)], fill=GOLD, outline=GOLD_D)

def veteran(d, t):  # знаки отличия: три шеврона
    rim, dark, inner, cardc, acc = TIERS[t]
    for k, col in enumerate([cardc, acc, cardc]):
        y = 10 + 6*k
        d.polygon([(14, y+8), (24, y), (34, y+8), (34, y+12), (24, y+4), (14, y+12)], fill=col, outline=dark)

def regular(d, t):  # кружка с паром: «свой человек на стриме»
    rim, dark, inner, cardc, acc = TIERS[t]
    d.ellipse([27, 21, 36, 31], outline=cardc, width=3)
    d.rectangle([15, 19, 30, 34], fill=cardc, outline=dark)
    d.rectangle([16, 20, 29, 22], fill=acc)
    star = [(22.5, 24), (23.5, 26.5), (26, 26.5), (24, 28), (24.7, 30.7), (22.5, 29), (20.3, 30.7), (21, 28), (19, 26.5), (21.5, 26.5)]
    d.polygon(star, fill=acc)
    for x, y in [(19, 16), (20, 14), (19, 12), (24, 15), (25, 13), (24, 11), (28, 16), (29, 14)]: d.rectangle([x, y, x+1, y+1], fill=cardc)

def patron(d, t):  # сердце над стопкой монет
    rim, dark, inner, cardc, acc = TIERS[t]
    for i, y in enumerate([31, 27, 23]):
        d.ellipse([14, y-3, 34, y+3], fill=GOLD, outline=GOLD_D); d.rectangle([17, y, 31, y+1], fill='#D79A2B')
    d.ellipse([14, 20, 34, 26], fill=GOLD, outline=GOLD_D)
    d.ellipse([19, 21, 29, 25], outline=GOLD_D)
    d.ellipse([16, 8, 23, 15], fill=RED, outline='#7A1D22'); d.ellipse([25, 8, 32, 15], fill=RED, outline='#7A1D22')
    d.polygon([(16, 12), (32, 12), (24, 21)], fill=RED, outline='#7A1D22'); d.rectangle([17, 11, 31, 13], fill=RED)
    d.rectangle([19, 10, 20, 11], fill='#FFB3B8')

def golot(d, t):  # аукционный молоток над золотым слитком
    rim, dark, inner, cardc, acc = TIERS[t]
    d.polygon([(11, 36), (14, 31), (34, 31), (37, 36)], fill=GOLD, outline=GOLD_D); d.rectangle([14, 31, 34, 32], fill='#FFE08A')
    d.line([(21, 16), (31, 30)], fill='#5B3A12', width=5); d.line([(21, 16), (31, 30)], fill=WOOD, width=3)
    d.polygon(rot([(12, 11), (30, 11), (30, 21), (12, 21)], 21, 16, -37), fill=GOLD, outline=GOLD_D)
    d.polygon(rot([(13, 12), (29, 12), (29, 14), (13, 14)], 21, 16, -37), fill='#FFE08A')
    for x, y in [(11, 21), (9, 17), (12, 25)]: d.rectangle([x, y, x+1, y+1], fill=cardc)

def monster(d, t):  # рогатая морда монстра
    rim, dark, inner, cardc, acc = TIERS[t]
    d.polygon([(15, 20), (11, 9), (21, 16)], fill=acc, outline=dark); d.polygon([(33, 20), (37, 9), (27, 16)], fill=acc, outline=dark)
    d.polygon([(15, 18), (33, 18), (35, 27), (31, 34), (17, 34), (13, 27)], fill=cardc, outline=dark)
    d.polygon([(17, 22), (22, 24), (22, 27), (17, 26)], fill=RED); d.polygon([(31, 22), (26, 24), (26, 27), (31, 26)], fill=RED)
    d.rectangle([20, 29, 28, 31], fill=dark)
    for x in (20, 23, 26): d.polygon([(x, 29), (x+2, 29), (x+1, 33)], fill='#FFFFFF', outline=dark)

def png(im, size):
    if size != S: im = im.resize((size, size), Image.NEAREST)
    q = im.quantize(colors=40, method=Image.FASTOCTREE, dither=Image.NONE)
    b = io.BytesIO(); q.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

out = {}
for key, fn in [('veteran', veteran), ('regular', regular), ('patron', patron), ('golot', golot), ('monster', monster)]:
    row = []
    for t in range(5):
        im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); d.fontmode = '1'
        frame(d, t); fn(d, t)
        row.append({'icon': png(im, 96), 'iconSmall': png(im, 48)})
        assert len(row[-1]['icon']) < 8000 and len(row[-1]['iconSmall']) < 3000, (key, t)
    out[key] = row
json.dump(out, open('achievementIcons.json', 'w'))
