"""Минимальный читатель файлов .aseprite (родной формат редактора Aseprite) на чистом Python + Pillow — без самого Aseprite.
Умеет то, что нужно для вытаскивания кадров анимации: размер, кадры, длительности, теги (имя анимации + диапазон кадров), слои (с видимостью и
режимом наложения «Normal»), ячейки (cel) типов raw/compressed/linked, палитры для индексных рисунков. Не умеет: тайловые слои, режимы наложения кроме
Normal (такие слои пропускаются с предупреждением), эффекты. Спецификация формата: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
"""
import struct, zlib
from PIL import Image

def _read_string(b, o):
    n = struct.unpack_from('<H', b, o)[0]
    return b[o + 2:o + 2 + n].decode('utf-8', 'replace'), o + 2 + n

class Ase:
    def __init__(self, path):
        b = open(path, 'rb').read()
        size, magic, nframes, w, h, depth, flags, speed = struct.unpack_from('<IHHHHHIH', b, 0)
        if magic != 0xA5E0: raise ValueError('не .aseprite: ' + path)
        self.w, self.h, self.depth, self.nframes = w, h, depth, nframes
        self.transparent_index = b[28]
        self.palette = {}
        self.layers = []      # {name, visible, blend, type, opacity, child_level}
        self.tags = []        # {name, from, to, direction}
        self.durations = []
        self.cels = []        # по кадрам: список (layer_index, x, y, opacity, image RGBA)
        self.warnings = []
        off = 128
        linked = {}
        for fi in range(nframes):
            fsize, fmagic, old_chunks, dur, _r, new_chunks = struct.unpack_from('<IHHHHI', b, off)
            if fmagic != 0xF1FA: raise ValueError('битый кадр')
            nchunks = new_chunks if new_chunks else old_chunks
            self.durations.append(dur or speed)
            frame_cels = []
            co = off + 16
            for _ in range(nchunks):
                csize, ctype = struct.unpack_from('<IH', b, co)
                data = b[co + 6:co + csize]
                if ctype == 0x2004:      # слой
                    lflags, ltype, level, _dw, _dh, blend, opacity = struct.unpack_from('<HHHHHHB', data, 0)
                    name, _ = _read_string(data, 16)
                    self.layers.append({'name': name, 'visible': bool(lflags & 1), 'type': ltype, 'level': level, 'blend': blend, 'opacity': opacity})
                elif ctype == 0x2005:    # ячейка
                    li, x, y, op, ctyp = struct.unpack_from('<HhhBH', data, 0)
                    if ctyp in (0, 2):
                        cw, ch = struct.unpack_from('<HH', data, 16)
                        raw = data[20:] if ctyp == 0 else zlib.decompress(data[20:])
                        img = self._to_rgba(raw, cw, ch)
                        linked[(fi, li)] = (x, y, op, img); frame_cels.append((li, x, y, op, img))
                    elif ctyp == 1:
                        (src,) = struct.unpack_from('<H', data, 16)
                        if (src, li) in linked:
                            sx, sy, sop, simg = linked[(src, li)]; linked[(fi, li)] = (x, y, op, simg); frame_cels.append((li, x, y, op, simg))
                    else:
                        self.warnings.append(f'тип ячейки {ctyp} не поддерживается (слой {li}, кадр {fi})')
                elif ctype == 0x2018:    # теги
                    (n,) = struct.unpack_from('<H', data, 0); o = 10
                    for _t in range(n):
                        f0, f1, d, rep = struct.unpack_from('<HHBH', data, o); o += 6 + 8 + 3 + 1
                        name, o = _read_string(data, o)
                        self.tags.append({'name': name, 'from': f0, 'to': f1, 'direction': d})
                elif ctype == 0x2019:    # палитра
                    n, first, last = struct.unpack_from('<III', data, 0); o = 20
                    for i in range(first, last + 1):
                        fl, r, g, bb, a = struct.unpack_from('<HBBBB', data, o); o += 6
                        if fl & 1: _n, o = _read_string(data, o)
                        self.palette[i] = (r, g, bb, a)
                co += csize
            self.cels.append(frame_cels)
            off += fsize

    def _to_rgba(self, raw, w, h):
        if self.depth == 32: return Image.frombytes('RGBA', (w, h), raw)
        if self.depth == 16:
            img = Image.new('RGBA', (w, h)); px = img.load()
            for i in range(w * h): v, a = raw[i * 2], raw[i * 2 + 1]; px[i % w, i // w] = (v, v, v, a)
            return img
        img = Image.new('RGBA', (w, h)); px = img.load()   # 8 бит, индексный
        for i in range(w * h):
            idx = raw[i]; px[i % w, i // w] = (0, 0, 0, 0) if idx == self.transparent_index else self.palette.get(idx, (0, 0, 0, 255))
        return img

    def frame_image(self, index, only_visible=True, skip_layers=()):
        """Кадр целиком: ячейки видимых слоёв (режим Normal) снизу вверх на холсте файла."""
        out = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for li, x, y, op, img in sorted(self.cels[index], key=lambda c: c[0]):
            L = self.layers[li]
            if (only_visible and not L['visible']) or L['name'] in skip_layers: continue
            if L['blend'] != 0: self.warnings.append(f'слой «{L["name"]}»: режим наложения {L["blend"]} (не Normal) — наложен как Normal')
            a = img
            total = (op / 255.0) * (L['opacity'] / 255.0)
            if total < 0.999: a = img.copy(); a.putalpha(a.getchannel('A').point(lambda v: int(v * total)))
            out.alpha_composite(a, (x, y)) if (x >= 0 and y >= 0) else out.paste(a, (x, y), a)
        return out
