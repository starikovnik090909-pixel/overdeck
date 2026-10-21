#!/usr/bin/env python3
"""Собирает пак героя (по одному PNG на кадр, папки walk_<направление>/, idle_<направление>/) в два атласа + manifest.json
для страницы public/pixel-avatar.html.

Запуск (нужен Pillow):  python3 tools/build-pixel-pack.py <папка-с-паком> <имя> [fps] [название] [группа]
Пример:                 python3 tools/build-pixel-pack.py ~/Downloads/archer-hero-128 archer 12 Лучник "Фэнтези (gegx)"
(название — как герой подписан на карточке в админке, группа — заголовок над карточками; без них берутся имя папки и «Герои»)
Результат:              public/pixel-avatar/<имя>/{walk.png, idle.png, manifest.json}

Что делает, кроме склейки:
  • Холсты разных направлений у пака разные (176 и 180 px), а «земля» (низ ног) лежит на разной высоте. Если рисовать кадры «как есть»,
    при повороте героя он подпрыгивал бы на несколько пикселей. Поэтому все кадры переносятся в ОДНУ общую ячейку: центр холста —
    в центр ячейки (так заявлено в README пака — «якорь снизу по центру»), а линия земли каждого направления — на одну общую высоту.
    Внутри одного направления кадры двигаются только все вместе, поэтому ходьба остаётся в точности такой, как нарисовал автор.
  • Ячейка делается ровно по размеру персонажа (объединение всех кадров + поля), чтобы атласы не раздувались пустым местом.
Порядок направлений в атласе — как в паке: по часовой стрелке от «south» (лицом к зрителю).
"""
import glob, json, os, statistics, sys
from PIL import Image

DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
MARGIN = 3

def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v else 0).getbbox()

def estimate_speed(walk_east_west, fps):
    """Оценка скорости ходьбы без «скольжения ног», px/с при масштабе 1: насколько за кадр сдвигается опорная (стоящая на земле) нога.
    Одна оценка шумная (нога то на земле, то в воздухе, кластеры путаются), поэтому берётся среднее по обеим сторонам (east, west) и по трём
    окнам «сколько нижних строк рисунка считать ногой» (2, 3, 5). Результат округляется до 5. Это ОЦЕНКА: итог можно поправить параметром ?speed=."""
    vals = []
    for frames in walk_east_west:
        for rows in (2, 3, 5):
            prev, shifts = None, []
            for im in frames:
                a = im.getchannel('A'); px = a.load(); W = a.size[0]; b = bbox(im); bottom = b[3] - 1
                xs = sorted(x for y in range(bottom - rows + 1, bottom + 1) for x in range(W) if px[x, y] > 0)
                cl = [[xs[0]]]
                for x in xs[1:]:
                    (cl[-1].append(x) if x - cl[-1][-1] <= 3 else cl.append([x]))
                cur = [sum(c) / len(c) for c in cl]
                if prev: shifts.append(min(((abs(p - q), q - p) for p in prev for q in cur), key=lambda t: t[0])[1])
                prev = cur
            m = [abs(v) for v in shifts if 1.0 < abs(v) < 14]
            if m: vals.append(statistics.median(m) * fps)
    return int(round(statistics.mean(vals) / 5.0) * 5) if vals else 80


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    src, name = sys.argv[1], sys.argv[2]
    fps = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    title = sys.argv[4] if len(sys.argv) > 4 else name.capitalize()
    group = sys.argv[5] if len(sys.argv) > 5 else 'Герои'
    anims = {}
    for anim in ('walk', 'idle'):
        anims[anim] = {}
        for d in DIRS:
            files = sorted(glob.glob(os.path.join(src, f'{anim}_{d}', '*.png')))
            if not files: sys.exit(f'нет кадров: {anim}_{d}')
            anims[anim][d] = [Image.open(f).convert('RGBA') for f in files]

    # Линия земли — медиана низа персонажа по кадрам КАЖДОЙ анимации каждого направления отдельно: подъём ноги на шаге не сдвигает «землю»,
    # а то, что автор нарисовал стойку и ходьбу одного направления на разной высоте (у «north» разница 4px), выравнивается — иначе при
    # остановке герой подпрыгивал бы.
    ground = {}
    canvas = {}
    for d in DIRS:
        frames = anims['walk'][d] + anims['idle'][d]
        for anim in ('walk', 'idle'):
            ground[(anim, d)] = round(statistics.median(bbox(f)[3] for f in anims[anim][d]))
        sizes = {f.size for f in frames}
        if len(sizes) != 1: sys.exit(f'у направления {d} кадры разного размера: {sizes}')
        canvas[d] = frames[0].size

    # размеры ячейки: насколько персонаж выступает от опорной точки (центр холста, линия земли) во все стороны
    left = right = up = down = 0
    for d in DIRS:
        W, H = canvas[d]
        for anim in ('walk', 'idle'):
            for fr in anims[anim][d]:
                x0, y0, x1, y1 = bbox(fr)
                left = max(left, W / 2 - x0); right = max(right, x1 - W / 2)
                up = max(up, ground[(anim, d)] - y0); down = max(down, y1 - ground[(anim, d)])
    half = int(max(left, right) + MARGIN + 0.999)
    cell_w = half * 2
    cell_h = int(up + down + MARGIN * 2 + 0.999); cell_h += cell_h % 2
    pivot_x, pivot_y = cell_w // 2, int(up + MARGIN + 0.999)   # опора: центр ячейки по x, линия земли по y

    manifest = {'name': name, 'title': title, 'group': group, 'fps': fps, 'scale': 1, 'cell': {'w': cell_w, 'h': cell_h}, 'pivot': {'x': pivot_x, 'y': pivot_y},
                'headTop': 0, 'speed': estimate_speed([anims['walk']['east'], anims['walk']['west']], fps), 'directions': DIRS, 'source': os.path.basename(os.path.normpath(src)), 'walk': {}, 'idle': {}}
    top_min = cell_h
    for anim in ('walk', 'idle'):
        counts = [len(anims[anim][d]) for d in DIRS]
        cols = max(counts)
        atlas = Image.new('RGBA', (cols * cell_w, len(DIRS) * cell_h), (0, 0, 0, 0))
        for row, d in enumerate(DIRS):
            W, H = canvas[d]
            ox = round(pivot_x - W / 2)           # центр холста -> центр ячейки
            oy = pivot_y - ground[(anim, d)]       # линия земли -> общая линия земли
            for col, fr in enumerate(anims[anim][d]):
                cell = Image.new('RGBA', (cell_w, cell_h), (0, 0, 0, 0))
                cell.paste(fr, (ox, oy))                 # ячейка пустая и прозрачная — paste переносит пиксели как есть (в т.ч. полупрозрачные)
                atlas.paste(cell, (col * cell_w, row * cell_h))
                top_min = min(top_min, bbox(cell)[1])
        out_dir = os.path.join('public', 'pixel-avatar', name)
        os.makedirs(out_dir, exist_ok=True)
        atlas.save(os.path.join(out_dir, f'{anim}.png'), optimize=True)
        manifest[anim] = {'file': f'{anim}.png', 'frames': dict(zip(DIRS, counts)), 'columns': cols}
    manifest['headTop'] = top_min       # верхняя точка персонажа в ячейке — над ней рисуется пузырь с сообщением
    with open(os.path.join('public', 'pixel-avatar', name, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f'готово: ячейка {cell_w}×{cell_h}, опора ({pivot_x},{pivot_y}), верх головы y={top_min}, скорость ≈ {manifest["speed"]} px/с, '
          f'walk {manifest["walk"]["columns"]}×8 кадров, idle {manifest["idle"]["columns"]}×8')

if __name__ == '__main__':
    main()
