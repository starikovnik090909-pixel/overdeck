// public/photo-crop.js — кадрирование фото в рамке: общий код оверлея (team-panel.js) и админки.
// crop = { x, y, zoom }: x, y — какая точка снимка (0…1) стоит в центре рамки; zoom ≥ 1 — приближение
// (1 = снимок ровно заполняет рамку, как object-fit: cover). Рамка — элемент с position: relative и overflow: hidden.
(function (g) {
  const DEF = { x: 0.5, y: 0.5, zoom: 1 };
  const MAX_ZOOM = 4;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function norm(c) {
    const n = (v, fb) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fb);
    return { x: clamp(n(c && c.x, DEF.x), 0, 1), y: clamp(n(c && c.y, DEF.y), 0, 1), zoom: clamp(n(c && c.zoom, 1), 1, MAX_ZOOM) };
  }

  /** Размер снимка на экране и его смещение в рамке; снимок всегда закрывает рамку целиком (пустых полос не бывает). */
  function layout(fw, fh, nw, nh, crop) {
    const c = norm(crop);
    const s = Math.max(fw / nw, fh / nh) * c.zoom;
    const dw = nw * s, dh = nh * s;
    return { dw, dh, left: clamp(fw / 2 - c.x * dw, fw - dw, 0), top: clamp(fh / 2 - c.y * dh, fh - dh, 0) };
  }

  /** Приводит центр к допустимому для этого приближения (нельзя «уехать» за край снимка). */
  function fit(fw, fh, nw, nh, crop) {
    const c = norm(crop), L = layout(fw, fh, nw, nh, c);
    return { x: Math.round(((fw / 2 - L.left) / L.dw) * 10000) / 10000, y: Math.round(((fh / 2 - L.top) / L.dh) * 10000) / 10000, zoom: Math.round(c.zoom * 100) / 100 };
  }

  /** Ставит <img> в рамку по crop (в процентах от рамки — не ломается, если рамку потом растянуть). */
  function apply(frame, img, crop) {
    const go = () => {
      const fw = frame.clientWidth, fh = frame.clientHeight;
      if (!fw || !fh || !img.naturalWidth) return;
      const L = layout(fw, fh, img.naturalWidth, img.naturalHeight, crop);
      img.style.cssText = `position:absolute;max-width:none;max-height:none;object-fit:fill;width:${L.dw / fw * 100}%;height:${L.dh / fh * 100}%;left:${L.left / fw * 100}%;top:${L.top / fh * 100}%;`;
    };
    if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
  }

  g.PhotoCrop = { DEFAULT: DEF, MAX_ZOOM, norm, layout, fit, apply };
})(window);
