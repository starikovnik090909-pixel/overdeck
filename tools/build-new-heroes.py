#!/usr/bin/env python3
"""Собирает героев «вид сбоку» из шести паков (листы-полосы craftpix, листы Gandalf, послойный конструктор Gandalf, .aseprite демониц).

Запуск (нужен Pillow):  python3 tools/build-new-heroes.py <папка, где распакованы паки>
Результат:              public/pixel-avatar/<id>/{walk.png, idle.png, [afk_*.png], manifest.json, LICENSE.txt}
Список героев и их настройки (масштаб, названия, группы) — в HEROES ниже; общая механика — tools/pixel_hero_build.py.
Ходьба, стойка и афк-действия — основа; прыжки, удары, жесты и заклинания записываются в «дополнительные» (manifest.extras, атласы x_*.png). Смерть, урон и бег не берутся.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from pixel_hero_build import build_hero, strip, sheet_row, strip_extras
from aseprite_reader import Ase

CRAFTPIX_LICENSE = """Бесплатный пак craftpix.net — {title}
https://craftpix.net/file-licenses/

Условия (по заявлению craftpix и тексту их лицензии): личное и коммерческое использование без отчислений разрешено; перепродавать и раздавать сами
файлы как отдельные ассеты нельзя. Указывать автора не требуется.
Спрайты в этой папке собраны из листов пака скриптом tools/build-new-heroes.py (кадры отобраны, склеены в атласы и выровнены по земле, для движения
влево отражены; рисунок не менялся). НЕ выкладывайте проект с ними в открытый доступ.
"""
GANDALF_LICENSE = """GandalfHardcore — {title}  (https://gandalfhardcore.itch.io/)

Лицензия автора (из README пака):
  Permitted uses for the assets include incorporating them into commercial and non-commercial video games and projects, modifying them as needed,
  and displaying work featuring the assets on designated websites. Restrictions include not reselling, repackaging (selling the edited pixel art),
  or redistributing the assets, using them for AI training, incorporating them in game tools, NFT projects, or printed materials.
Спрайты в этой папке собраны скриптом tools/build-new-heroes.py (кадры отобраны, выровнены по земле, для движения влево отражены{extra}).
НЕ выкладывайте проект с ними в открытый доступ; это личный стрим-оверлей, а не игровой инструмент.
"""
DEMON_LICENSE = """ASSET_DEMON_GIRLS — {title}

ВНИМАНИЕ: в архиве не было ни файла лицензии, ни указания автора и источника. Условия использования НЕИЗВЕСТНЫ. Прежде чем показывать этих героев
на стриме, проверьте лицензию там, откуда скачан пак, и при необходимости уберите папки demon1 и demon2 из public/pixel-avatar/.
Спрайты собраны из файлов .aseprite скриптом tools/build-new-heroes.py (кадры отобраны, выровнены по земле, для движения влево отражены).
"""
CP = {'girls': 'craftpix-net-242415-free-schoolgirls-anime-character-pixel-sprite-pack', 'warriors': 'craftpix-net-453698-free-shinobi-sprites-pixel-art', 'ghosts': 'craftpix-net-872297-free-ghost-pixel-art-sprite-sheets'}
GH_ARCHER = 'GandalfHardcore_Archer/GandalfHardcore Archer/'
GH_CHARS = 'GandalfHardcore_Character_Asset_Pack/GandalfHardcore Character Asset Pack/'
DEMON = 'ASSET_DEMON_GIRLS/'

# Дополнительные анимации по пакам: (файл, имя, название, kind); kind: jump | attack | emote | cast. Нет файла у героя — пропускается.
EXTRAS_CP = {
    'girls': [('Attack', 'attack', 'Взмах', 'attack'), ('Book', 'book', 'Читает книгу', 'emote'), ('Dialogue', 'talk', 'Болтает', 'emote'), ('Protection', 'protect', 'Защита', 'emote')],
    'warriors': [('Jump', 'jump', 'Прыжок', 'jump'), ('Attack_1', 'attack1', 'Удар', 'attack'), ('Attack_2', 'attack2', 'Удар 2', 'attack'), ('Shield', 'shield', 'Щит', 'emote')],
    'ghosts': [('Jump', 'jump', 'Прыжок', 'jump'), ('Attack_1', 'attack1', 'Удар', 'attack'), ('Attack_2', 'attack2', 'Удар 2', 'attack'), ('Scream', 'scream', 'Крик', 'cast')],
}
# Горожане (лист конструктора, кадры 80×64): строка 3 — прыжок, 4 — прыжок с поднятой рукой, 5 — жест рукой (6 кадров). Строки с мечом не берём — меч отдельный слой, его в «одетых» героях нет.
CITIZEN_EXTRAS = [(3, 4, 'jump', 'Прыжок', 'jump'), (4, 4, 'cheer', 'Ликует', 'emote'), (5, 6, 'wave', 'Машет рукой', 'emote')]
# Лучник-тамплиер (кадры 64×64): строка 1 — стрельба из лука (11 кадров), строка 3 — вспышка (5 кадров).
# (id, название, пак, папка героя, масштаб, скорость вручную или None)
CRAFTPIX = [
    ('girl1', 'Школьница 1', 'Школьницы', 'girls', 'Girl_1', 1.5, None), ('girl2', 'Школьница 2', 'Школьницы', 'girls', 'Girl_2', 1.5, None), ('girl3', 'Школьница 3', 'Школьницы', 'girls', 'Girl_3', 1.5, None),
    ('fighter', 'Боец', 'Воины', 'warriors', 'Fighter', 1.5, None), ('samurai', 'Самурай', 'Воины', 'warriors', 'Samurai', 1.5, None), ('shinobi', 'Синоби', 'Воины', 'warriors', 'Shinobi', 1.5, None),
    ('gotoku', 'Готоку', 'Духи', 'ghosts', 'Gotoku', 1.5, None), ('onre', 'Онрё', 'Духи', 'ghosts', 'Onre', 1.5, 45), ('yurei', 'Юрэй', 'Духи', 'ghosts', 'Yurei', 1.5, 45),  # духи плывут медленнее людей
]
TEMPLAR_COLORS = [('', 'белый'), ('black', 'чёрный'), ('blue', 'синий'), ('brown', 'коричневый'), ('green', 'зелёный'), ('purple', 'фиолетовый'), ('red', 'красный'), ('yellow', 'жёлтый')]
# (id, название, кожа, одежда снизу→вверх, волосы): всегда ОДЕТЫЕ комбинации — «голые» базы кожи и слои белья не используются
CITIZENS = [
    ('citizen-f1', 'Горожанка 1', 'Character skin colors/Female Skin1.png', ['Female Clothing/Skirt.png', 'Female Clothing/Corset.png', 'Female Clothing/Boots.png'], 'Female Hair/Female Hair1.png'),
    ('citizen-f2', 'Горожанка 2', 'Character skin colors/Female Skin3.png', ['Female Clothing/Skirt.png', 'Female Clothing/Socks.png', 'Female Clothing/Blue Corset v2.png'], 'Female Hair/Female Hair3.png'),
    ('citizen-f3', 'Горожанка 3', 'Character skin colors/Female Skin2.png', ['Female Clothing/Skirt.png', 'Female Clothing/Green Socks.png', 'Female Clothing/Green Corset.png'], 'Female Hair/Female Hair2.png'),
    ('citizen-f4', 'Горожанка 4', 'Character skin colors/Female Skin5.png', ['Female Clothing/Skirt.png', 'Female Clothing/Boots.png', 'Female Clothing/Purple Corset v2.png'], 'Female Hair/Female Hair5.png'),
    ('citizen-m1', 'Горожанин 1', 'Character skin colors/Male Skin1.png', ['Male Clothing/Pants.png', 'Male Clothing/Shirt.png', 'Male Clothing/Boots.png'], 'Male Hair/Male Hair2.png'),
    ('citizen-m2', 'Горожанин 2', 'Character skin colors/Male Skin4.png', ['Male Clothing/Blue Pants.png', 'Male Clothing/Green Shirt v2.png', 'Male Clothing/Shoes.png'], 'Male Hair/Male Hair5.png'),
    ('citizen-m3', 'Горожанин 3', 'Character skin colors/Male Skin2.png', ['Male Clothing/Green Pants.png', 'Male Clothing/orange Shirt v2.png', 'Male Clothing/Boots.png'], 'Male Hair/Male Hair1.png'),
    ('citizen-m4', 'Горожанин 4', 'Character skin colors/Male Skin5.png', ['Male Clothing/Purple Pants.png', 'Male Clothing/Blue Shirt v2.png', 'Male Clothing/Shoes.png'], 'Male Hair/Male Hair4.png'),
]

def compose(root, skin, clothes, hair):
    base = Image.open(root + skin).convert('RGBA')
    for p in clothes + [hair]: base.alpha_composite(Image.open(root + p).convert('RGBA'))   # порядок: кожа → одежда снизу вверх → волосы поверх
    return base

def ase_frames(path, skip_layers=()):
    a = Ase(path)
    return [a.frame_image(i, skip_layers=skip_layers) for i in range(a.nframes)]

def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    packs = sys.argv[1]; out = os.path.join('public', 'pixel-avatar'); report = []
    def P(*parts): return os.path.join(packs, *parts)
    def done(m, group):
        char_h = round((m['pivot']['y'] - m['headTop']) * m['scale'])
        report.append(f"{m['name']:14} {m['title']:28} ячейка {m['cell']['w']}×{m['cell']['h']} ×{m['scale']}  рост на экране {char_h:3}px  скорость {m['speed']:3}  кадры walk {m['walk']['columns']} idle {m['idle']['columns']}" + (f"  афк: {[a['name'] for a in m['afk']]}" if 'afk' in m else '') + (f"  доп: {[e['name'] for e in m['extras']]}" if 'extras' in m else ''))

    for hid, title, group, pk, folder, scale, spd in CRAFTPIX:
        d = P(CP[pk], folder)
        m = build_hero(os.path.join(out, hid), {'id': hid, 'title': title, 'group': group, 'source': CP[pk]},
                       {'walk': strip(os.path.join(d, 'Walk.png'), 128), 'idle': strip(os.path.join(d, 'Idle.png'), 128)},
                       scale=scale, speed=spd, license_text=CRAFTPIX_LICENSE.format(title=title), extras=strip_extras(d, EXTRAS_CP[pk], 128))
        done(m, group)

    for suffix, color in TEMPLAR_COLORS:
        hid = 'templar' + (('-' + suffix) if suffix else ''); title = f'Лучник-тамплиер ({color})'
        sheet = P(GH_ARCHER, 'GandalfHardcore Archer' + ((' ' + suffix) if suffix else '') + ' sheet.png')
        m = build_hero(os.path.join(out, hid), {'id': hid, 'title': title, 'group': 'Тамплиеры', 'source': 'GandalfHardcore Archer'},
                       {'idle': sheet_row(sheet, 64, 64, 0, 5), 'walk': sheet_row(sheet, 64, 64, 2, 8)}, scale=3,
                       extras=[{'name': 'shoot', 'title': 'Стреляет из лука', 'kind': 'attack', 'frames': sheet_row(sheet, 64, 64, 1, 11)}],
                       license_text=GANDALF_LICENSE.format(title=title, extra=''))
        done(m, 'Тамплиеры')

    for hid, title, skin, clothes, hair in CITIZENS:
        sheet = compose(P(GH_CHARS), skin, clothes, hair)
        tmp = os.path.join(packs, '_composed_' + hid + '.png'); sheet.save(tmp)
        m = build_hero(os.path.join(out, hid), {'id': hid, 'title': title, 'group': 'Горожане', 'source': 'GandalfHardcore Character Asset Pack'},
                       # Строки листа конструктора: 0 — стойка, 1 — «ходьба» (лицом к зрителю почти на месте), 2 — бег вполоборота (корпус к зрителю, ноги шагают ВЛЕВО).
                       # Для движения по экрану нужна строка 2; бег чуть замедлен (10 кадр/с), скорость задана вручную, а направление — faces='left' (см. ниже).
                       {'idle': sheet_row(tmp, 80, 64, 0, 5), 'walk': sheet_row(tmp, 80, 64, 2, 8)}, scale=3, fps=10, speed=110, faces='left',
                       extras=[{'name': n, 'title': t, 'kind': k, 'frames': sheet_row(tmp, 80, 64, r, c)} for r, c, n, t, k in CITIZEN_EXTRAS],   # бег в этом листе нарисован ВЛЕВО (задняя нога отведена вправо) — иначе шли бы спиной вперёд
                       license_text=GANDALF_LICENSE.format(title=title, extra=', слои кожи/одежды/волос сложены в готового персонажа'))
        os.remove(tmp)
        done(m, 'Горожане')

    for n, title in ((1, 'Демоница (фаза 1)'), (2, 'Демоница (фаза 2)')):
        idle_name = 'IDLE/FASE 1 IDLE SIMPLY' if n == 1 else 'IDLE/FASE 2 IDLE'
        clips = {'sit': ase_frames(P(DEMON, f'SITTING/FASE {n} SITTING.aseprite')), 'sitidle': ase_frames(P(DEMON, f'SITTING IDLE/FASE {n} SITTING IDLE.aseprite'))}
        actions = [{'name': 'sit', 'title': 'Садится и сидит', 'steps': [{'clip': 'sit'}, {'clip': 'sitidle', 'seconds': 6}, {'clip': 'sit', 'reverse': True}]}]  # встаёт теми же кадрами в обратном порядке
        m = build_hero(os.path.join(out, f'demon{n}'), {'id': f'demon{n}', 'title': title, 'group': 'Демоницы', 'source': 'ASSET_DEMON_GIRLS'},
                       {'idle': ase_frames(P(DEMON, idle_name + '.aseprite')), 'walk': ase_frames(P(DEMON, f'WALK/FASE {n} WALK.aseprite'))},
                       afk_clips=clips, afk_actions=actions, ground='shared', scale=1.5, license_text=DEMON_LICENSE.format(title=title),
                       extras=[{'name': 'jump', 'title': 'Прыжок', 'kind': 'jump', 'frames': ase_frames(P(DEMON, f'JUMP/FASE {n} JUMP.aseprite'))},
                               {'name': 'attack', 'title': 'Удар', 'kind': 'attack', 'frames': ase_frames(P(DEMON, f'ATTACK/FASE {n} ATTACK 1.aseprite'))}])
        done(m, 'Демоницы')
    print('\n'.join(report))

if __name__ == '__main__':
    main()
