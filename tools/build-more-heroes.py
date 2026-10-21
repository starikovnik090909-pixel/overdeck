#!/usr/bin/env python3
"""Собирает ещё 23 героя «вид сбоку»: сатиры, зомби, горгоны, маги, гангстеры, латники (craftpix), Evil Wizard 2 и 3 (CC0), Necromancer (CreativeKind) и ворон.

Запуск (нужен Pillow):  python3 tools/build-more-heroes.py <папка, где распакованы паки>
Результат:              public/pixel-avatar/<id>/{walk.png, idle.png, [afk_*.png], manifest.json, LICENSE.txt}
Ходьба, стойка и афк-действия — основа; прыжки, удары и заклинания идут в «дополнительные» (manifest.extras, атласы x_*.png); смерть, урон и бег не берутся. Общая механика — tools/pixel_hero_build.py.
Что где лежит и как называется — в списках ниже; нюансы паков описаны в комментариях рядом с героями.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from pixel_hero_build import build_hero, strip, sheet_row, strip_extras

CRAFTPIX = """Бесплатный пак craftpix.net — {title}
https://craftpix.net/file-licenses/

Условия (по заявлению craftpix и тексту их лицензии): личное и коммерческое использование без отчислений разрешено; перепродавать и раздавать сами
файлы как отдельные ассеты нельзя. Указывать автора не требуется.
Спрайты в этой папке собраны из листов пака скриптом tools/build-more-heroes.py (кадры отобраны, склеены в атласы и выровнены по земле, для движения
влево отражены; рисунок не менялся). НЕ выкладывайте проект с ними в открытый доступ.
"""
CC0 = """{pack} — {title}
Лицензия автора (из License.txt пака): Creative Commons Zero (CC0). Можно использовать в коммерческих и некоммерческих проектах.
Спрайты в этой папке собраны скриптом tools/build-more-heroes.py (кадры отобраны, выровнены по земле, для движения влево отражены; рисунок не менялся).
"""
UNKNOWN = """{pack} — {title}

ВНИМАНИЕ: {why}. Условия использования НЕ подтверждены. Прежде чем показывать героя на стриме, проверьте лицензию там, откуда скачан пак; если использовать
нельзя — удалите папку этого героя из public/pixel-avatar/ (карточка в админке пропадёт сама).
Спрайты собраны скриптом tools/build-more-heroes.py (кадры отобраны, выровнены по земле, для движения влево отражены; рисунок не менялся).
"""
P = {
    'satyr': 'Free-Satyr-Sprite-Sheet-Pixel-Art-Pack', 'zombie': 'Free-Urban-Zombie-Sprite-Sheet-Pixel-Art-Pack', 'gorgon': 'free-gorgon-pixel-art-character-sprite-sheets',
    'mage': 'free-wizard-sprite-sheets-pixel-art', 'gang': 'gangster-pixel-character-sprite-sheets-pack', 'knight': 'knight-character-sprites-pixel-art/Spritesheet 128',
}
# (id, название, группа, папка героя в паке, масштаб, скорость вручную или None, афк: (имя клипа, число проходов) или None)
CRAFT = [
    ('satyr1', 'Сатир 1', 'Сатиры', 'satyr/Satyr_1', 1.5, None, None), ('satyr2', 'Сатир 2', 'Сатиры', 'satyr/Satyr_2', 1.5, None, None), ('satyr3', 'Сатир 3', 'Сатиры', 'satyr/Satyr_3', 1.5, None, None),
    ('zombie1', 'Зомби 1', 'Зомби', 'zombie/Zombie_1', 1.5, 45, None), ('zombie2', 'Зомби 2', 'Зомби', 'zombie/Zombie_2', 1.5, 45, None),
    ('zombie3', 'Зомби 3', 'Зомби', 'zombie/Zombie_3', 1.5, 45, None), ('zombie4', 'Зомби 4', 'Зомби', 'zombie/Zombie_4', 1.5, 45, None),   # зомби бредут медленнее людей
    ('gorgon1', 'Горгона 1', 'Горгоны', 'gorgon/Gorgon_1', 1.5, 55, ('idle2', 3)), ('gorgon2', 'Горгона 2', 'Горгоны', 'gorgon/Gorgon_2', 1.5, 55, ('idle2', 3)),
    ('gorgon3', 'Горгона 3', 'Горгоны', 'gorgon/Gorgon_3', 1.5, 55, ('idle2', 3)),                                                        # Idle_2 — покачивание, берём как афк
    ('wanderer', 'Странствующий маг', 'Маги', 'mage/Wanderer Magican', 1.5, None, None), ('lightning', 'Маг молний', 'Маги', 'mage/Lightning Mage', 1.5, None, None),
    ('firemage', 'Огненный маг', 'Маги', 'mage/Fire vizard', 1.5, None, None),
    ('gang1', 'Гангстер 1', 'Гангстеры', 'gang/Gangsters_1', 1.5, None, ('idle2', 2)), ('gang2', 'Гангстер 2', 'Гангстеры', 'gang/Gangsters_2', 1.5, None, ('idle2', 2)),
    ('gang3', 'Гангстер 3', 'Гангстеры', 'gang/Gangsters_3', 1.5, None, ('idle2', 2)),                                                     # Idle_2 — жесты (поправляет одежду и т. п.), афк
    ('knight1', 'Латник 1', 'Латники', 'knight/Knight_1', 1.5, None, None), ('knight2', 'Латник 2', 'Латники', 'knight/Knight_2', 1.5, None, None), ('knight3', 'Латник 3', 'Латники', 'knight/Knight_3', 1.5, None, None),
]

JUMP = ('Jump', 'jump', 'Прыжок', 'jump')
# Дополнительные анимации по группам героев: (файл, имя, название, kind); нет файла — пропускается.
EXTRAS = {
    'satyr': [('Attack', 'attack', 'Удар', 'attack'), ('Charge', 'charge', 'Рывок', 'attack')],
    'zombie': [('Attack', 'attack', 'Удар', 'attack')],
    'gorgon': [('Attack_1', 'attack1', 'Удар', 'attack'), ('Special', 'special', 'Особый приём', 'cast')],
    'wanderer': [JUMP, ('Attack_1', 'attack1', 'Удар', 'attack'), ('Charge_1', 'charge', 'Заклинание', 'cast')],
    'lightning': [JUMP, ('Attack_1', 'attack1', 'Удар', 'attack'), ('Charge', 'charge', 'Заклинание', 'cast')],
    'firemage': [JUMP, ('Attack_1', 'attack1', 'Удар', 'attack'), ('Charge', 'charge', 'Заклинание', 'cast')],
    'gang': [JUMP, ('Attack_1', 'attack1', 'Удар', 'attack'), ('Shot', 'shot', 'Выстрел', 'attack'), ('Recharge', 'recharge', 'Перезаряжает', 'emote')],
    'knight': [JUMP, ('Attack 1', 'attack1', 'Удар', 'attack'), ('Attack 2', 'attack2', 'Удар 2', 'attack'), ('Defend', 'defend', 'Защита', 'emote')],
}

def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    root = sys.argv[1]; out = os.path.join('public', 'pixel-avatar'); report = []
    def pth(*a): return os.path.join(root, *a)
    def done(m):
        char_h = round((m['pivot']['y'] - m['headTop']) * m['scale'])
        report.append(f"{m['name']:14} {m['title']:22} ячейка {m['cell']['w']}×{m['cell']['h']} ×{m['scale']}  рост {char_h:3}px  скорость {m['speed']:3}  walk {m['walk']['columns']} idle {m['idle']['columns']} fps {m['fps']}" + (f"  афк: {[a['name'] for a in m['afk']]}" if 'afk' in m else '') + (f"  доп: {[e['name'] for e in m['extras']]}" if 'extras' in m else ''))

    for hid, title, group, folder, scale, spd, afk in CRAFT:
        key, sub = folder.split('/', 1); d = pth(P[key], sub)
        clips, actions = None, None
        if afk:
            clips = {afk[0]: strip(os.path.join(d, 'Idle_2.png'), 128)}
            actions = [{'name': afk[0], 'title': 'Скучает', 'steps': [{'clip': afk[0], 'loops': afk[1]}]}]
        m = build_hero(os.path.join(out, hid), {'id': hid, 'title': title, 'group': group, 'source': P[key]},
                       {'walk': strip(os.path.join(d, 'Walk.png'), 128), 'idle': strip(os.path.join(d, 'Idle.png'), 128)},
                       afk_clips=clips, afk_actions=actions, scale=scale, speed=spd, license_text=CRAFTPIX.format(title=title),
                       extras=strip_extras(d, EXTRAS.get(hid.rstrip('0123456789'), []), 128))
        done(m)

    # Evil Wizard 2 (CC0): кадры 250×250. Ходьбы в паке нет — «Run» это парящий рывок в горизонтальной позе, другой локомоции у героя нет.
    w2 = pth('EVil_Wizard_2', 'EVil Wizard 2', 'Sprites')
    m = build_hero(os.path.join(out, 'evilwizard2'), {'id': 'evilwizard2', 'title': 'Злой маг 2', 'group': 'Тёмные маги', 'source': 'Evil Wizard 2 Asset Pack'},
                   {'walk': strip(os.path.join(w2, 'Run.png'), 250), 'idle': strip(os.path.join(w2, 'Idle.png'), 250)}, scale=1,
                   extras=strip_extras(w2, [('Jump', 'jump', 'Прыжок', 'jump'), ('Attack1', 'attack1', 'Удар', 'attack'), ('Attack2', 'attack2', 'Удар 2', 'attack')], 250),
                   license_text=CC0.format(pack='Evil Wizard 2 Asset Pack', title='Злой маг 2')); done(m)
    # Evil Wizard 3 (CC0): кадры 140×140, мелкий герой (53px) — масштаб ×2.
    w3 = pth('Evil_Wizard_3', 'Evil Wizard 3', 'Sprites')
    m = build_hero(os.path.join(out, 'evilwizard3'), {'id': 'evilwizard3', 'title': 'Злой маг 3', 'group': 'Тёмные маги', 'source': 'Evil Wizard 3 Asset Pack'},
                   {'walk': strip(os.path.join(w3, 'Walk.png'), 140), 'idle': strip(os.path.join(w3, 'Idle.png'), 140)}, scale=2,
                   extras=strip_extras(w3, [('Jump', 'jump', 'Прыжок', 'jump'), ('Attack', 'attack', 'Удар', 'attack')], 140),
                   license_text=CC0.format(pack='Evil Wizard 3 Asset Pack', title='Злой маг 3')); done(m)
    # Necromancer (CreativeKind): один лист 2720×896, кадры 160×128; строка 0 — стойка (8 кадров), строка 1 — ход (8 кадров); остальные строки (атаки, урон, смерть) не берутся.
    nec = pth('Necromancer_creativekind-Sheet.png')
    m = build_hero(os.path.join(out, 'necromancer'), {'id': 'necromancer', 'title': 'Некромант', 'group': 'Тёмные маги', 'source': 'CreativeKind — Necromancer (Free)'},
                   {'idle': sheet_row(nec, 160, 128, 0, 8), 'walk': sheet_row(nec, 160, 128, 1, 8)}, scale=2,
                   extras=[{'name': 'staff', 'title': 'Взмах посохом', 'kind': 'attack', 'frames': sheet_row(nec, 160, 128, 2, 13)}, {'name': 'cast', 'title': 'Заклинание', 'kind': 'cast', 'frames': sheet_row(nec, 160, 128, 4, 17)}],
                   license_text=UNKNOWN.format(pack='Necromancer (Free) — CreativeKind, https://creativekind.itch.io/necromancer-free', title='Некромант', why='в файле нет лицензии, а на странице автора раздел «License» мне не показали')); done(m)
    # Ворон (Crow Animations, .rar): PNG-полосы 64×64 — стойка 4 кадра, ходьба 4 кадра; мелкий (30px) — масштаб ×4, анимация медленнее (8 кадр/с, кадров мало).
    cr = pth('Crow')
    m = build_hero(os.path.join(out, 'crow'), {'id': 'crow', 'title': 'Ворон (чумной доктор)', 'group': 'Тёмные маги', 'source': 'Crow Animations'},
                   {'walk': strip(os.path.join(cr, 'crow_walk.png'), 64), 'idle': strip(os.path.join(cr, 'crow_idle.png'), 64)}, scale=4, fps=8,
                   extras=strip_extras(cr, [('crow_jump', 'jump', 'Прыжок', 'jump'), ('crow_attack', 'attack', 'Клюёт', 'attack')], 64),
                   license_text=UNKNOWN.format(pack='Crow Animations (.rar)', title='Ворон', why='в архиве нет ни лицензии, ни автора')); done(m)
    print('\n'.join(report))

if __name__ == '__main__':
    main()
