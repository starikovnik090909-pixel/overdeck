# Рисует 5 значков медали «Коллекционер» (шестигранник с веером карточек; число точек внизу = ступень).
# Запуск: python3 tools/gen-collector-icons.py  → collectorMedalIcons.json ([{icon: 96×96, iconSmall: 48×48}] — PNG в data:-ссылках)
import json, base64, io, math
from PIL import Image, ImageDraw

TIERS = [  # rim, dark, inner, card, accent
    ('#8E949B', '#3A3F46', '#1A1F26', '#D9DEE3', '#5B636B'),
    ('#C27B3F', '#6B3A17', '#2A170C', '#F3DDBF', '#B4601F'),
    ('#C9D0D8', '#6C7684', '#14213A', '#EEF3F8', '#5FA8D8'),
    ('#E8B64A', '#8A5A00', '#3A0F1E', '#FFF1C9', '#E07A2F'),
    ('#4FC3F7', '#1B5C8A', '#1A1550', '#E3F6FF', '#B79CFF'),
]
S = 48
CX, CY, R = 24, 25, 19

def hexpoly(r):
    return [(CX + r * math.sin(math.radians(a)), CY - r * math.cos(math.radians(a))) for a in range(0, 360, 60)]

def card(d, cx, cy, ang, w, h, fill, edge):
    pts = []
    for dx, dy in [(-w/2, -h/2), (w/2, -h/2), (w/2, h/2), (-w/2, h/2)]:
        a = math.radians(ang)
        pts.append((cx + dx*math.cos(a) - dy*math.sin(a), cy + dx*math.sin(a) + dy*math.cos(a)))
    d.polygon(pts, fill=edge)
    k = 0.72
    pts2 = []
    for dx, dy in [(-w/2*k, -h/2*k), (w/2*k, -h/2*k), (w/2*k, h/2*k), (-w/2*k, h/2*k)]:
        a = math.radians(ang)
        pts2.append((cx + dx*math.cos(a) - dy*math.sin(a), cy + dx*math.sin(a) + dy*math.cos(a)))
    d.polygon(pts2, fill=fill)

def star(d, cx, cy, r, fill):
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.45
        a = math.radians(-90 + i * 36)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill)

def wings(d, color, dark, left):
    sgn = -1 if left else 1
    base = CX + sgn * (R - 1)
    for i, (dy, ln) in enumerate([(-8, 3), (-4, 4), (0, 4), (4, 3)]):
        y = CY + dy
        x2 = base + sgn * ln
        d.polygon([(base, y), (x2, y - 2), (x2 + sgn, y + 1), (base, y + 3)], fill=color, outline=dark)

def draw(t):
    rim, dark, inner, cardc, acc = TIERS[t]
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    if t >= 3: wings(d, rim, dark, True); wings(d, rim, dark, False)
    d.polygon(hexpoly(R), fill=dark)
    d.polygon(hexpoly(R - 1.5), fill=rim)
    d.polygon(hexpoly(R - 4), fill=inner)
    # веер карточек
    card(d, CX - 6, CY - 1, -22, 11, 16, cardc, dark)
    card(d, CX + 6, CY - 1, 22, 11, 16, cardc, dark)
    card(d, CX, CY - 2, 0, 12, 17, cardc, dark)
    star(d, CX, CY - 2, 4.2, acc)
    # точки-ступень
    n = t + 1
    x0 = CX - (n - 1) * 2.5
    for i in range(n):
        x = x0 + i * 5
        d.rectangle([x - 1, CY + 12, x + 1, CY + 13], fill=cardc)
    if t == 4:  # корона
        d.polygon([(CX - 6, 5), (CX - 6, 1), (CX - 3, 3), (CX, 0), (CX + 3, 3), (CX + 6, 1), (CX + 6, 5)], fill='#E8B64A', outline='#8A5A00')
    return im

def png(im, size):
    if size != S: im = im.resize((size, size), Image.NEAREST)
    q = im.quantize(colors=32, method=Image.FASTOCTREE, dither=Image.NONE)
    b = io.BytesIO(); q.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

out = [{'icon': png(draw(t), 96), 'iconSmall': png(draw(t), 48)} for t in range(5)]
for i, o in enumerate(out): print(i, len(o['icon']), len(o['iconSmall']))
json.dump(out, open('collectorMedalIcons.json', 'w'))
