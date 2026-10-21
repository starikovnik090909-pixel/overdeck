"""Общая часть сборщиков героев для страницы «ЧатАватары» (public/pixel-avatar.html) — для героев «вид сбоку»:
кадры лежат одной полосой (или в .aseprite, или собираются из слоёв), персонаж идёт ВПРАВО, а влево его отражаем.

Что делает build_hero():
  • строит два направления — east (кадры как есть) и west (те же кадры, отражённые по центру кадра); вертикальных направлений у героев «вид сбоку» нет,
    страница выбирает ближайшее горизонтальное;
  • выравнивает «землю»: низ рисунка в каждой анимации приводится к одной линии (у стойки и ходьбы автор нередко рисует ноги на разной высоте);
    режим ground='shared' — для паков, где автор уже держит одну линию земли на всех анимациях (так сидение не «проваливается»);
  • режет ячейку по размеру персонажа (объединение всех кадров с запасом) — атласы не раздуваются пустым местом;
  • пишет атласы (walk.png, idle.png, afk_<клип>.png, x_<имя>.png — доп. анимации: строка = направление, столбец = кадр), manifest.json и LICENSE.txt;
  • manifest.scale — во сколько раз показывать героя на экране (у маленьких кадров 64–80px рисунок мелкий; кратный масштаб держит пиксели чёткими).
Скорость ходьбы: по умолчанию ≈ 0,55 роста героя на экране в секунду (у героев из пака gegx по замеру шага получилось 0,45–0,7); для героев «вид сбоку»
замер по опорной ноге ненадёжен (длинные юбки, духи без ног), поэтому правило проще и предсказуемее. Любому герою можно задать скорость вручную (speed=…),
а на странице её всегда можно поправить параметром ?speed=.
"""
import json, os, statistics
from PIL import Image, ImageOps

DIRS = ['east', 'west']
MARGIN = 3

def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v else 0).getbbox()

def strip(path, fw, fh=None, count=None):
    """Кадры из горизонтальной полосы одинаковых кадров."""
    im = Image.open(path).convert('RGBA'); fh = fh or im.height
    n = count or im.width // fw
    return [im.crop((i * fw, 0, (i + 1) * fw, fh)) for i in range(n)]

def sheet_row(path, fw, fh, row, count):
    """Кадры из одной строки листа с сеткой fw×fh."""
    im = Image.open(path).convert('RGBA')
    return [im.crop((i * fw, row * fh, (i + 1) * fw, (row + 1) * fh)) for i in range(count)]

def strip_extras(folder, spec, fw, fh=None):
    """Доп. анимации из полос-файлов папки героя: spec — [(файл без .png, имя, название, kind)]; нет файла — пропускаем (в паках набор файлов у героев чуть разный)."""
    out = []
    for fn, name, title, kind in spec:
        path = os.path.join(folder, fn + '.png')
        if not os.path.exists(path): continue
        im = Image.open(path)
        if im.height != (fh or fw) or im.width % fw: print(f'  пропущен лист {os.path.basename(folder)}/{fn}.png: размер {im.size} не по сетке {fw}×{fh or fw}'); continue
        out.append({'name': name, 'title': title, 'kind': kind, 'frames': strip(path, fw, fh)})
    return out

def build_hero(out_dir, meta, anims, afk_clips=None, afk_actions=None, ground='per-anim', speed=None, fps=12, scale=1, license_text='', root_pack='', faces='right', extras=None):
    """faces — куда смотрят/идут ИСХОДНЫЕ кадры: 'right' (как у большинства) или 'left' (так нарисованы, например, бег горожан из конструктора Gandalf): строка east (идёт вправо) тогда
    собирается из зеркальных кадров, а west — из исходных; иначе герой шёл бы «спиной вперёд».
    anims: {'walk': [кадры вправо], 'idle': [...]}; afk_clips: {ключ: [кадры]}; afk_actions: [{'name','title','steps':[{'clip', 'loops'|'seconds', 'reverse'}]}].
    extras — дополнительные анимации героя (прыжок, удар, приветствие, заклинание…): [{'name','title','kind','frames':[кадры], 'fps'?, 'loops'?}]. kind — jump | attack | emote | cast: по нему
    страница выбирает действие (настройки поведения, команды чата). Каждая анимация лежит в своём атласе x_<name>.png со СВОЕЙ ячейкой (cell/pivot в manifest.extras): большой замах меча не раздувает
    атласы ходьбы и стойки и не поднимает подпись ника; «земля» берётся та же, что у ходьбы, поэтому прыжок отрывается от неё, а удар стоит на ней."""
    os.makedirs(out_dir, exist_ok=True)
    afk_clips = afk_clips or {}
    groups = {'walk': anims['walk'], 'idle': anims['idle']}
    for k, fr in afk_clips.items(): groups['afk_' + k] = fr
    # линия земли: медиана низа рисунка по кадрам группы (per-anim) или одна на всех по ходьбе (shared)
    gnd = {k: round(statistics.median(bbox(f)[3] for f in fr)) for k, fr in groups.items()}
    if ground == 'shared': gnd = {k: gnd['walk'] for k in groups}
    sizes = {f.size for fr in groups.values() for f in fr}
    if len(sizes) != 1: raise SystemExit(f'{meta["id"]}: кадры разного размера {sizes}')
    W, H = sizes.pop()
    left = right = up = down = 0
    for k, fr in groups.items():
        for f in fr:
            x0, y0, x1, y1 = bbox(f)
            left = max(left, W / 2 - x0, x1 - W / 2); right = left            # зеркало: по горизонтали симметрично относительно центра кадра
            up = max(up, gnd[k] - y0); down = max(down, y1 - gnd[k])
    half = int(left + MARGIN + 0.999)
    cell_w = half * 2
    cell_h = int(up + down + MARGIN * 2 + 0.999); cell_h += cell_h % 2
    pivot = (cell_w // 2, int(up + MARGIN + 0.999))
    top_min = cell_h

    def atlas(key, frames):
        nonlocal top_min
        img = Image.new('RGBA', (len(frames) * cell_w, len(DIRS) * cell_h), (0, 0, 0, 0))
        ox = round(pivot[0] - W / 2); oy = pivot[1] - gnd[key]
        for row, d in enumerate(DIRS):
            for col, fr in enumerate(frames):
                src = fr if (d == 'east') == (faces == 'right') else ImageOps.mirror(fr)   # faces='left': east — зеркало исходника, west — исходник
                cell = Image.new('RGBA', (cell_w, cell_h), (0, 0, 0, 0)); cell.paste(src, (ox, oy))
                img.paste(cell, (col * cell_w, row * cell_h)); top_min = min(top_min, bbox(cell)[1])
        return img

    manifest = {'name': meta['id'], 'title': meta['title'], 'group': meta.get('group', ''), 'fps': fps, 'scale': scale, 'cell': {'w': cell_w, 'h': cell_h},
                'pivot': {'x': pivot[0], 'y': pivot[1]}, 'headTop': 0, 'speed': 0, 'directions': DIRS, 'faces': faces, 'source': meta.get('source', root_pack)}
    for a in ('walk', 'idle'):
        atlas(a, anims[a]).save(os.path.join(out_dir, a + '.png'), optimize=True)
        manifest[a] = {'file': a + '.png', 'frames': {d: len(anims[a]) for d in DIRS}, 'columns': len(anims[a])}
    for k, fr in afk_clips.items():
        atlas('afk_' + k, fr).save(os.path.join(out_dir, f'afk_{k}.png'), optimize=True)
    if afk_actions:
        manifest['afk'] = []
        for act in afk_actions:
            steps = []
            for s in act['steps']:
                st = {'file': f'afk_{s["clip"]}.png', 'frames': {d: len(afk_clips[s['clip']]) for d in DIRS}, 'columns': len(afk_clips[s['clip']])}
                for opt in ('loops', 'seconds', 'reverse'):
                    if opt in s: st[opt] = s[opt]
                steps.append(st)
            manifest['afk'].append({'name': act['name'], 'title': act.get('title', act['name']), 'clips': steps})
    manifest['headTop'] = top_min
    if extras:
        manifest['extras'] = []
        for ex in extras:
            fr = ex['frames']
            if {f.size for f in fr} != {(W, H)}: raise SystemExit(f'{meta["id"]}: кадры «{ex["name"]}» другого размера, чем у ходьбы')
            lf = up_ = dn = 0
            for f in fr:
                x0, y0, x1, y1 = bbox(f)
                lf = max(lf, W / 2 - x0, x1 - W / 2); up_ = max(up_, gnd['walk'] - y0); dn = max(dn, y1 - gnd['walk'])
            hw = int(lf + MARGIN + 0.999); cw = hw * 2
            ch = int(up_ + dn + MARGIN * 2 + 0.999); ch += ch % 2
            pv = (cw // 2, int(up_ + MARGIN + 0.999))
            img = Image.new('RGBA', (len(fr) * cw, len(DIRS) * ch), (0, 0, 0, 0))
            ox = round(pv[0] - W / 2); oy = pv[1] - gnd['walk']
            for row, d in enumerate(DIRS):
                for col, f in enumerate(fr):
                    src = f if (d == 'east') == (faces == 'right') else ImageOps.mirror(f)
                    cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0)); cell.paste(src, (ox, oy)); img.paste(cell, (col * cw, row * ch))
            fn = f'x_{ex["name"]}.png'
            img.save(os.path.join(out_dir, fn), optimize=True)
            e = {'name': ex['name'], 'title': ex.get('title', ex['name']), 'kind': ex.get('kind', 'emote'), 'file': fn, 'frames': {d: len(fr) for d in DIRS}, 'columns': len(fr),
                 'cell': {'w': cw, 'h': ch}, 'pivot': {'x': pv[0], 'y': pv[1]}}
            for opt in ('fps', 'loops'):
                if opt in ex: e[opt] = ex[opt]
            manifest['extras'].append(e)
    char_h = (pivot[1] - top_min) * scale                       # рост героя на экране, px
    manifest['speed'] = int(speed) if speed else int(round(0.55 * char_h / 5.0) * 5)
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_dir, 'LICENSE.txt'), 'w', encoding='utf-8') as f:
        f.write(license_text)
    return manifest
