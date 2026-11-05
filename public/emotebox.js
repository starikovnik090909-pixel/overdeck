// public/emotebox.js — виджет «Топ эмодзи»: «живые реакции».
// Каждый эмодзи из чата всплывает вверх, как реакция в трансляции; серия одинаковых подряд
// превращается в крупный эмодзи с бейджем «×N». Слева сверху — общий счётчик реакций за стрим,
// внизу — три скруглённые плашки (золото, серебро, бронза) (золото / серебро / бронза) с числом использований.
//
// Данные: topEmotes [{id,name,count,imageUrl}] (для призовых мест и счётчика),
// newEmoteDrops [{id,name,imageUrl}] — новые эмодзи с прошлого снапшота (для всплывающих),
// emoteTotal — общее число эмодзи за стрим (если нет — сумма topEmotes).
// Это единственный виджет с непрерывной анимацией requestAnimationFrame; физики нет, всё
// рисуется на canvas и не влияет на раскладку панели (размер задаёт ResizeObserver).

(function () {
  const canvas = document.getElementById('emoteBoxCanvas');
  const ctx = canvas.getContext('2d');

  const MAX_FLOATERS = 110;
  const STREAK_GAP = 1.4;       // сек: пауза, после которой серия одинаковых обрывается
  // Приглушённые цвета медалей — только тонкое кольцо вокруг эмодзи, сама плашка берёт цвета и форму из темы/стиля.
  const MEDALS = ['rgba(232,192,99,0.9)', 'rgba(188,197,210,0.9)', 'rgba(205,138,92,0.9)'];
  const AMBIENT_MAX = 16;       // сколько «фоновых» эмодзи одновременно держим в воздухе, когда чат молчит

  const imageCache = new Map();
  let top = [];                 // topEmotes
  let total = 0, totalPulseAt = -9, nextAmbient = 0;
  let queue = [];               // [{at, drop}] — отложенный старт всплывающих (растягиваем пачку на ~секунду)
  const floaters = [];
  const shownCount = new Map(); // id -> плавно растущее число
  let streak = { id: null, n: 0, t: -99 };

  function getImage(url) {
    let img = imageCache.get(url);
    if (!img) { img = new Image(); img.src = url; imageCache.set(url, img); }
    return img;
  }
  const ready = (img) => img && img.complete && img.naturalWidth > 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = Math.max(1, Math.round(entry.contentRect.width));
      const h = Math.max(1, Math.round(entry.contentRect.height));
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
  });
  ro.observe(canvas.parentElement);

  /* ---------- Мозаика (вид по умолчанию) ---------- */
  const mosaic = document.createElement('div');
  mosaic.className = 'emo-mosaic';
  canvas.parentElement.insertBefore(mosaic, canvas.nextSibling);
  const tiles = new Map();      // id -> {el, img, n, last}
  let lookMosaic = true;
  const opts = () => (window.widgetSettings && window.widgetSettings.emotebox) || {};
  function applyLook() {
    const m = opts().look !== 'look-reactions';
    if (m === lookMosaic && mosaic.dataset.ready) return;
    lookMosaic = m; mosaic.dataset.ready = '1';
    mosaic.style.display = m ? '' : 'none';
    canvas.style.display = m ? 'none' : '';
    podsEl.style.display = m ? 'none' : '';
  }
  function squarify(items, x, y, w, h, out) {
    items = items.slice(); const sum = items.reduce((s, i) => s + i.v, 0) || 1;
    items.forEach((i) => { i.a = i.v / sum * w * h; });
    const worst = (row, side) => { const s = row.reduce((t, i) => t + i.a, 0), mx = Math.max(...row.map((i) => i.a)), mn = Math.min(...row.map((i) => i.a)); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
    while (items.length) {
      const side = Math.min(w, h), row = [items.shift()];
      while (items.length && worst(row.concat([items[0]]), side) <= worst(row, side)) row.push(items.shift());
      const s = row.reduce((t, i) => t + i.a, 0);
      if (w >= h) { const cw = s / h; let cy = y; row.forEach((i) => { const ch = i.a / cw; out.push({ e: i.e, x, y: cy, w: cw, h: ch }); cy += ch; }); x += cw; w -= cw; }
      else { const rh = s / w; let cx = x; row.forEach((i) => { const cwid = i.a / rh; out.push({ e: i.e, x: cx, y, w: cwid, h: rh }); cx += cwid; }); y += rh; h -= rh; }
    }
  }
  function drawMosaic() {
    const W = mosaic.clientWidth, H = mosaic.clientHeight;
    if (!W || !H) return;
    const o = opts(), maxN = clamp(Number(o.maxTiles) || 8, 4, 12), showShare = o.showShare !== false;
    const list = top.filter((e) => e.imageUrl && (e.count || 0) > 0).slice(0, maxN);
    const keep = new Set(list.map((e) => e.id));
    tiles.forEach((t, id) => { if (!keep.has(id)) { t.el.style.opacity = 0; const el = t.el; setTimeout(() => { if (!keep.has(id) && tiles.get(id) === t) { el.remove(); tiles.delete(id); } }, 600); } });
    if (!list.length) return;
    const tot = list.reduce((s, e) => s + (e.count || 0), 0) || 1, out = [];
    squarify(list.map((e) => ({ e, v: Math.pow(e.count || 1, 1.15) })), 0, 0, W, H, out);
    out.forEach((r) => {
      const e = r.e; let t = tiles.get(e.id);
      if (!t) {
        const el = document.createElement('div'); el.className = 'emo-tile'; el.style.opacity = 0;
        const img = document.createElement('img'); img.alt = ''; img.src = e.imageUrl;
        const n = document.createElement('span'); n.className = 'emo-n';
        el.append(img, n); mosaic.appendChild(el);
        t = { el, img, n, last: e.count }; tiles.set(e.id, t);
        el.style.left = (r.x + 2) + 'px'; el.style.top = (r.y + 2) + 'px'; el.style.width = '0px'; el.style.height = '0px';
        void el.offsetWidth;
      }
      if (t.img.getAttribute('src') !== e.imageUrl) t.img.src = e.imageUrl;
      const g = 2, share = (e.count || 0) / tot;
      t.el.style.opacity = 1;
      t.el.style.left = (r.x + g) + 'px'; t.el.style.top = (r.y + g) + 'px';
      t.el.style.width = Math.max(0, r.w - g * 2) + 'px'; t.el.style.height = Math.max(0, r.h - g * 2) + 'px';
      t.el.style.setProperty('--emo-a', (0.1 + share * 1.5).toFixed(2));
      const sz = Math.round(clamp(Math.min(r.w, r.h) * 0.55, 18, 112));
      t.img.style.width = t.img.style.height = sz + 'px';
      t.n.textContent = (e.count || 0).toLocaleString('ru-RU') + (showShare ? ' · ' + Math.round(share * 100) + '%' : '');
      if ((e.count || 0) !== t.last) { t.last = e.count || 0; t.el.classList.remove('emo-pulse'); void t.el.offsetWidth; t.el.classList.add('emo-pulse'); }
    });
  }
  if (window.ResizeObserver) new ResizeObserver(() => { if (lookMosaic) drawMosaic(); }).observe(mosaic);

  function render(data) {
    applyLook();
    top = (data.topEmotes || []).slice(0, 3 + 22);
    const sum = top.reduce((a, e) => a + (e.count || 0), 0);
    const nt = typeof data.emoteTotal === 'number' ? data.emoteTotal : sum;
    if (nt !== total) { if (nt > total) totalPulseAt = performance.now() / 1000; total = nt; }
    const now = performance.now() / 1000;
    (data.newEmoteDrops || []).slice(0, 60).forEach((d, i, arr) => {
      queue.push({ at: now + (i / Math.max(arr.length, 1)) * 0.9 + Math.random() * 0.1, drop: d });
    });
    if (queue.length > 200) queue = queue.slice(-200);
    if (lookMosaic) { queue = []; drawMosaic(); }
  }

  function spawn(drop, time, W, H, k, baseY, ambient) {
    if (floaters.length > MAX_FLOATERS) return;
    let big = false;
    if (!ambient) {
      if (streak.id === drop.id && time - streak.t < STREAK_GAP) streak.n++; else streak = { id: drop.id, n: 1, t: time };
      streak.t = time;
      big = streak.n >= 4 && streak.n % 4 === 0;
    }
    floaters.push({
      img: getImage(drop.imageUrl),
      x: Math.random() < 0.6 ? W * rnd(0.70, 0.95) : W * rnd(0.08, 0.70),
      y: baseY,
      vy: -rnd(85, 155) * k * (big ? 0.75 : 1),
      ph: Math.random() * 6.28,
      amp: rnd(14, 36) * k,
      sz: (big ? 70 : rnd(32, 54)) * k,
      age: 0, big, n: ambient ? 1 : streak.n,
      life: big ? 3.8 : rnd(3.2, 4.0),
    });
    if (!ambient) popPod(drop.id);
  }

  // ---- плашки призовых мест (DOM: цвета, шрифты и форма подхватываются из темы и стиля оформления) ----
  const podsEl = document.createElement('div');
  podsEl.className = 'emo-pods';
  canvas.parentElement.appendChild(podsEl);
  let pods = [];                 // [{id, el, img, num}]
  let podsKey = '', podsPad = '';
  let podsH = 44;

  function syncPods() {
    const key = top.slice(0, 3).map((e) => e.id + '|' + e.imageUrl).join(',');
    if (key === podsKey) return;
    podsKey = key;
    podsEl.textContent = '';
    pods = top.slice(0, 3).map((e, i) => {
      const el = document.createElement('div'); el.className = 'emo-pod';
      const ring = document.createElement('span'); ring.className = 'emo-pod-ring';
      ring.style.setProperty('--medal', MEDALS[i]);
      const img = document.createElement('img'); img.src = e.imageUrl; img.alt = '';
      ring.appendChild(img);
      const num = document.createElement('b'); num.className = 'emo-pod-num';
      el.append(ring, num); podsEl.appendChild(el);
      return { id: e.id, el, num };
    });
  }

  function popPod(id) {
    const p = pods.find((x) => x.id === id);
    if (p && p.el.animate) p.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }

  function updatePods() {
    syncPods();
    const cs = getComputedStyle(canvas.parentElement);
    const pad = `${cs.paddingLeft}|${cs.paddingRight}|${cs.paddingBottom}`;
    if (pad !== podsPad) { podsPad = pad; podsEl.style.left = cs.paddingLeft; podsEl.style.right = cs.paddingRight; podsEl.style.bottom = cs.paddingBottom; }
    top.slice(0, 3).forEach((e, i) => {
      const p = pods[i]; if (!p) return;
      const target = e.count || 0;
      let cur = shownCount.has(e.id) ? shownCount.get(e.id) : target;
      cur += (target - cur) * 0.12; if (Math.abs(target - cur) < 0.5) cur = target;
      shownCount.set(e.id, cur);
      p.num.textContent = Math.round(cur).toLocaleString('ru-RU');
    });
    podsH = podsEl.offsetHeight || 44;
  }

  let lastT = performance.now() / 1000;
  function tick() {
    requestAnimationFrame(tick);
    if (lookMosaic) return; // мозаика рисуется по событиям, постоянная анимация не нужна
    const dpr = devicePixelRatio;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    if (!W || !H) return;
    const time = performance.now() / 1000;
    const dt = Math.min(0.05, time - lastT); lastT = time;
    const k = clamp(Math.min(W / 542, H / 482), 0.55, 1.5);
    const ccs = getComputedStyle(canvas);
    const fontFam = ccs.fontFamily || 'sans-serif';
    const textCol = (pods[0] && getComputedStyle(pods[0].el).color) || ccs.color || '#fff'; // цвет текста стиля (у светлых стилей — тёмный)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    updatePods();
    const baseY = H - podsH - 22 * k;                 // отсюда стартуют всплывающие

    // подсветка-«струя» справа
    const jet = ctx.createLinearGradient(W, 0, W - W * 0.3, 0);
    jet.addColorStop(0, 'rgba(255,138,92,0.10)'); jet.addColorStop(1, 'rgba(255,138,92,0)');
    ctx.fillStyle = jet; ctx.fillRect(W * 0.7, 0, W * 0.3, H);

    // запуск отложенных
    queue = queue.filter((q) => { if (q.at <= time) { spawn(q.drop, time, W, H, k, baseY, false); return false; } return true; });

    // фоновые: когда в чате тихо, в воздух поднимаются уже встречавшиеся эмодзи, чтобы окно не пустовало
    if (top.length && time >= nextAmbient) {
      const want = clamp(Math.round(W * H / 20000), 6, AMBIENT_MAX);
      if (floaters.length < want && queue.length === 0) {
        let sum = 0; const w = top.map((e) => { const v = Math.pow(e.count || 1, 0.6); sum += v; return v; });
        let r = Math.random() * sum, idx = 0;
        while (idx < top.length - 1 && (r -= w[idx]) > 0) idx++;
        const e = top[idx];
        spawn({ id: e.id, imageUrl: e.imageUrl }, time, W, H, k, baseY, true);
      }
      nextAmbient = time + rnd(0.3, 0.7);
    }

    // всплывающие
    const fadeTop = 70 * k;
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt; f.y += f.vy * dt;
      const p = f.age / f.life;
      if (p >= 1 || f.y < -40) { floaters.splice(i, 1); continue; }
      const x = f.x + Math.sin(f.age * 2.4 + f.ph) * f.amp - (f.big ? f.age * 18 : f.age * 6);
      let a = p < 0.12 ? p / 0.12 : p > 0.7 ? (1 - p) / 0.3 : 1;
      if (f.y < fadeTop + 40 * k) a *= clamp((f.y - fadeTop * 0.4) / (fadeTop * 0.8), 0, 1); // не лезем на счётчик
      const sc = f.big ? (p < 0.15 ? 0.5 + p / 0.15 * 0.5 : 1 + Math.sin(f.age * 6) * 0.03) : 1;
      const sz = f.sz * sc;
      ctx.globalAlpha = a;
      if (f.big) {
        const rg = ctx.createRadialGradient(x, f.y, 2, x, f.y, sz * 0.75);
        rg.addColorStop(0, 'rgba(255,138,92,0.4)'); rg.addColorStop(1, 'rgba(255,138,92,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, f.y, sz * 0.75, 0, 7); ctx.fill();
      }
      if (ready(f.img)) ctx.drawImage(f.img, x - sz / 2, f.y - sz / 2, sz, sz);
      if (f.big) {
        const t = '×' + f.n;
        ctx.font = `800 ${Math.round(18 * k)}px ${fontFam}`;
        const tw = ctx.measureText(t).width + 16 * k, bh = 24 * k;
        ctx.fillStyle = '#ff6b4a'; ctx.beginPath(); ctx.roundRect(x - tw / 2, f.y + sz / 2 - 4, tw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t, x, f.y + sz / 2 - 4 + bh / 2 + 1);
      }
      ctx.globalAlpha = 1;
    }

    // счётчик слева сверху; при росте цифры на полсекунды «вспыхивает» (увеличивается и возвращается)
    const pt = time - totalPulseAt;
    let sc = 1;
    if (pt >= 0 && pt < 0.5) sc = 1 + 0.3 * (pt < 0.12 ? pt / 0.12 : 1 - (pt - 0.12) / 0.38);
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4;
    const kc = clamp(Math.min(W / 420, H / 240), 1, 1.8); // счётчик крупнее и не уменьшается вместе с блоком
    const numSize = Math.round(56 * kc);
    ctx.translate(6, 2 + numSize * 0.55); ctx.scale(sc, sc);
    ctx.fillStyle = textCol; ctx.font = `800 ${numSize}px ${fontFam}`;
    ctx.fillText(Math.round(total).toLocaleString('ru-RU'), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4;
    ctx.globalAlpha = 0.65; ctx.fillStyle = textCol; ctx.font = `600 ${Math.round(16 * kc)}px ${fontFam}`;
    ctx.fillText('реакций за стрим', 6, 2 + numSize * 1.12);
    ctx.restore();
  }
  requestAnimationFrame(tick);

  window.EmoteBoxModule = { render };
})();
