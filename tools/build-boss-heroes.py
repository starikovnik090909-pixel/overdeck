#!/usr/bin/env python3
"""Собирает внешности БОССОВ для «ЧатАватаров»: оборотни (craftpix), палач-кукла, монстры из набора spritesheets.

Запуск (нужен Pillow):  python3 tools/build-boss-heroes.py <папка с распакованными паками: wolf/, exec/, sheets/>
Результат:              public/pixel-avatar/<id>/{walk.png, idle.png, x_*.png, manifest.json, LICENSE.txt}; в manifest стоят boss:true (чаттерам не выдаётся) и, у летающих, flying:true.
Общая механика — tools/pixel_hero_build.py. Ходьбы у многих монстров нет: босс ходит «стойкой» (walk = idle).
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from pixel_hero_build import build_hero, strip, strip_extras, bbox

CRAFTPIX = """Бесплатный пак craftpix.net — {title}
https://craftpix.net/file-licenses/

Условия (по заявлению craftpix и тексту их лицензии): личное и коммерческое использование без отчислений разрешено; перепродавать и раздавать сами
файлы как отдельные ассеты нельзя. Указывать автора не требуется.
Спрайты собраны скриптом tools/build-boss-heroes.py (рисунок не менялся). НЕ выкладывайте проект с ними в открытый доступ.
"""
UNKNOWN = """{pack} — {title}

ВНИМАНИЕ: в архиве нет файла лицензии. Условия использования НЕ подтверждены. Прежде чем показывать босса на стриме, проверьте лицензию там, откуда скачан пак;
если использовать нельзя — удалите папку этого героя из public/pixel-avatar/ (босс пропадёт из списка внешностей сам).
Спрайты собраны скриптом tools/build-boss-heroes.py (рисунок не менялся).
"""

def grid(path, fw, fh, rows=None):
    """Непустые кадры листа по порядку (слева направо, сверху вниз); rows — только эти строки."""
    im = Image.open(path).convert('RGBA'); out = []
    for r in range(im.height // fh):
        if rows is not None and r not in rows: continue
        for c in range(im.width // fw):
            f = im.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
            if bbox(f): out.append(f)
    return out

def ex(name, title, kind, frames, fps=None):
    d = {'name': name, 'title': title, 'kind': kind, 'frames': frames}
    if fps: d['fps'] = fps
    return d

def finish(out, flying):
    p = os.path.join(out, 'manifest.json'); m = json.load(open(p, encoding='utf-8'))
    m['boss'] = True
    if flying: m['flying'] = True
    json.dump(m, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('ok', m['name'], m['cell'], 'x%s' % m['scale'])

def main():
    root = sys.argv[1]; res = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'pixel-avatar')
    def pth(*a): return os.path.join(root, *a)
    def to(i): return os.path.join(res, i)
    # --- оборотни: полосы 128px, как в остальных паках craftpix
    for hid, title, folder, walk in (('werewolf-red', 'Красный оборотень', 'Red_Werewolf', 'Walk'), ('werewolf-white', 'Белый оборотень', 'White_Werewolf', 'Walk'), ('werewolf-black', 'Чёрный оборотень', 'Black_Werewolf', 'walk')):
        d = pth('wolf', folder)
        spec = [('Attack_1', 'attack1', 'Удар когтями', 'attack'), ('Attack_2', 'attack2', 'Удар 2', 'attack'), ('Attack_3', 'attack3', 'Удар 3', 'attack'), ('Run+Attack', 'rush', 'Бросок', 'attack')]
        build_hero(to(hid), {'id': hid, 'title': title, 'group': 'Боссы', 'source': 'craftpix werewolf'}, {'walk': strip(os.path.join(d, walk + '.png'), 128, 128), 'idle': strip(os.path.join(d, 'Idle.png'), 128, 128)},
                   scale=2, speed=70, license_text=CRAFTPIX.format(title=title), extras=strip_extras(d, spec, 128, 128))
        finish(to(hid), False)
    # --- палач-кукла: парит, кадры 100×100
    e = pth('exec', 'Undead executioner puppet', 'png'); eg = lambda n, rows=None: grid(os.path.join(e, n + '.png'), 100, 100, rows)
    idle = eg('idle')
    build_hero(to('executioner'), {'id': 'executioner', 'title': 'Палач-кукла', 'group': 'Боссы', 'source': 'Undead executioner puppet'}, {'walk': idle, 'idle': idle}, scale=2.5, speed=40, ground='shared',
               license_text=UNKNOWN.format(pack='Undead executioner puppet', title='Палач-кукла'),
               extras=[ex('attack', 'Удар косой', 'attack', eg('attacking')), ex('skill', 'Рывок тьмы', 'cast', eg('skill1'))])
    finish(to('executioner'), True)
    # --- монстры из spritesheets (размер кадра — в имени файла)
    S = pth('sheets', 'spritesheets')
    def sg(name, fw, fh, rows=None): return grid(os.path.join(S, f'{name}-{fw}x{fh}.png'), fw, fh, rows)
    jobs = [
        # id, название, файл, кадр, анимация стойки (rows), доп., масштаб, летает
        ('andromalius', 'Андромалий', 'andromalius', (57, 88), [0, 1], [('cast', 'Щупальца', 'cast', [2])], 2.5, False),
        ('mage-archmage', 'Архимаг', 'mage-2', (122, 110), None, [], 2, True),
        ('mage-seer', 'Маг-провидец', 'mage-1', (85, 94), None, [], 2, True),
        ('mage-warlock', 'Чернокнижник', 'mage-3', (87, 110), None, [], 2, True),
        ('gnu', 'Рогатый страж', 'gnu', (120, 100), [0, 1], [], 2.2, False),
        ('shadow', 'Тень из бездны', 'shadow', (80, 70), [4], [('rise', 'Поднимается', 'cast', [1, 2, 3])], 3, False),
    ]
    for hid, title, fn, (fw, fh), rows, extra, scale, fly in jobs:
        idle = sg(fn, fw, fh, rows)
        ex_list = [ex(n, t, k, sg(fn, fw, fh, r)) for n, t, k, r in extra]
        if hid == 'gnu': ex_list = [ex('fall', 'Падает', 'emote', sg(fn, fw, fh, [2, 3]))]
        build_hero(to(hid), {'id': hid, 'title': title, 'group': 'Боссы', 'source': 'spritesheets'}, {'walk': idle, 'idle': idle}, scale=scale, speed=40, ground='shared',
                   license_text=UNKNOWN.format(pack='spritesheets (набор монстров)', title=title), extras=ex_list)
        finish(to(hid), fly)

if __name__ == '__main__': main()
