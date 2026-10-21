#!/usr/bin/env python3
"""Собирает ещё 12 героев «вид сбоку» из четырёх бесплатных паков craftpix: ковбои, рейдеры, солдаты, городские парни (по 3 героя).

Запуск (нужен Pillow):  python3 tools/build-heroes-3.py <папка с распакованными паками>   (из корня проекта)
Ожидаемые папки внутри: Craftpix_Cowboy/Cowboy_N, Raider_N, Soldier_N, City_men_N (как в архивах craftpix).
Результат:              public/pixel-avatar/<id>/{walk.png, idle.png, [afk_*.png], manifest.json, LICENSE.txt, x_*.png}
Ходьба, стойка и афк — основа; прыжки, удары, выстрелы, перезарядка — «дополнительные» (manifest.extras). Смерть, урон и бег не берутся. Общая механика — tools/pixel_hero_build.py.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixel_hero_build import build_hero, strip, strip_extras

LIC = """Бесплатный пак craftpix.net — {title}
https://craftpix.net/file-licenses/

Условия (по заявлению craftpix и тексту их лицензии): личное и коммерческое использование без отчислений разрешено; перепродавать и раздавать сами
файлы как отдельные ассеты нельзя. Указывать автора не требуется.
Спрайты в этой папке собраны из листов пака скриптом tools/build-heroes-3.py (кадры отобраны, склеены в атласы и выровнены по земле, для движения
влево отражены; рисунок не менялся). НЕ выкладывайте проект с ними в открытый доступ.
"""
JUMP = ('Jump', 'jump', 'Прыжок', 'jump')
EXTRAS = {
    'cowboy': [JUMP, ('Shot', 'shot', 'Выстрел', 'attack'), ('Special', 'special', 'Особый приём', 'cast'), ('Fighting stance', 'stance', 'Боевая стойка', 'emote')],
    'raider': [JUMP, ('Attack_1', 'attack1', 'Удар', 'attack'), ('Attack', 'attack1', 'Удар', 'attack'), ('Attack_2', 'attack2', 'Удар 2', 'attack'), ('Attack_3', 'attack3', 'Удар 3', 'attack'),
               ('Shot', 'shot', 'Выстрел', 'attack'), ('Shot_1', 'shot', 'Выстрел', 'attack'), ('Shot_2', 'shot2', 'Выстрел 2', 'attack'), ('Recharge', 'recharge', 'Перезаряжает', 'emote')],
    'soldier': [('Attack', 'attack1', 'Удар', 'attack'), ('Attacck', 'attack1', 'Удар', 'attack'), ('Shot_1', 'shot', 'Выстрел', 'attack'), ('Shot_2', 'shot2', 'Выстрел 2', 'attack'),
                ('Grenade', 'grenade', 'Бросает гранату', 'attack'), ('Recharge', 'recharge', 'Перезаряжает', 'emote')],
    'city': [('Attack', 'attack1', 'Удар', 'attack')],
}
# (id, название, группа, ключ набора, путь к папке героя внутри распакованного пака, афк-клип 'Idle_2' или нет)
HEROES = [(f'cowboy{i}', f'Ковбой {i}', 'Ковбои', 'cowboy', f'Craftpix_Cowboy/Cowboy_{i}', False) for i in (1, 2, 3)] + \
         [(f'raider{i}', f'Рейдер {i}', 'Рейдеры', 'raider', f'Raider_{i}', i == 3) for i in (1, 2, 3)] + \
         [(f'soldier{i}', f'Солдат {i}', 'Солдаты', 'soldier', f'Soldier_{i}', False) for i in (1, 2, 3)] + \
         [(f'cityman{i}', f'Городской парень {i}', 'Городские парни', 'city', f'City_men_{i}', False) for i in (1, 2, 3)]

def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    root = sys.argv[1]; out = os.path.join('public', 'pixel-avatar')
    for hid, title, group, key, sub, afk in HEROES:
        d = os.path.join(root, *sub.split('/'))
        clips = actions = None
        if afk:   # у Рейдера 3 есть вторая стойка (жесты/осмотр) — афк-действие «Скучает»
            clips = {'idle2': strip(os.path.join(d, 'Idle_2.png'), 128)}
            actions = [{'name': 'idle2', 'title': 'Скучает', 'steps': [{'clip': 'idle2', 'loops': 2}]}]
        seen, extras = set(), []
        for e in strip_extras(d, EXTRAS[key], 128):
            if e['name'] in seen: continue
            seen.add(e['name']); extras.append(e)
        m = build_hero(os.path.join(out, hid), {'id': hid, 'title': title, 'group': group, 'source': 'craftpix.net ' + group.lower()},
                       {'walk': strip(os.path.join(d, 'Walk.png'), 128), 'idle': strip(os.path.join(d, 'Idle.png'), 128)},
                       afk_clips=clips, afk_actions=actions, scale=1.5, license_text=LIC.format(title=title), extras=extras)
        print(f"{hid:10} {title:22} ячейка {m['cell']['w']}×{m['cell']['h']} скорость {m['speed']:3} walk {m['walk']['columns']} idle {m['idle']['columns']}" + (f" доп: {[x['name'] for x in m['extras']]}" if 'extras' in m else ''))

if __name__ == '__main__':
    main()
