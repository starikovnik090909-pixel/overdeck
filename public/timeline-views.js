// public/timeline-views.js — альтернативные виды таймлайна (настройка виджета «Вид таймлайна»).
// Классический вид рисует сам timeline.js; здесь — Волна, Хроника, Пульс, Эквалайзер, Созвездие, Река.
// Все виды рисуются на том же canvas и берут оформление у стиля сцены (body[data-ostyle]): цвета (акцент, подписки, рейды,
// баллы), форму и подсветку маркеров событий (через env.marker), шрифт (--font-main) и цвет текста.
// Окно времени = «Сколько минут кружок виден» (activityLifetimeMin): события появляются справа и уплывают влево.
// Функция вида: (env) => void. env собирает timeline.js (см. buildEnv там).
(function () {
  const V = (window.TimelineViews = {});
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hexA = (hex, a) => {
    const c = (hex || '#000000').replace('#', '');
    const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
  };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const BIG = (m) => m.type === 'donation' || m.type === 'raid' || m.type === 'giftsub';

  // подготовка: геометрия и цвета вида
  function prep(env) {
    const { ctx, W, H, dpr } = env;
    const u = clamp(H / dpr / 230, 0.6, 1.4);
    const P = (n) => n * dpr * u;
    const xN = W - P(18);
    const x0 = P(14);
    const xFor = (ts) => x0 + (ts - (env.refTime - env.winMs)) / env.winMs * (xN - x0);
    const pal = [env.accent, env.c2, env.c3, env.c4];
    const catCol = (i) => pal[i % pal.length];
    const text = env.s.textColor;
    const font = (w, px) => `${w} ${Math.round(px)}px ${env.fontFamily}`;
    const pill = (txt, x, y, bg, fg, px) => {
      ctx.save(); ctx.font = font(700, px); const w = ctx.measureText(txt).width + px * 1.1, h = px * 1.7;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, env.sharp ? 2 : h / 2) : ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = bg; ctx.fill(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 0.5 * dpr); ctx.restore();
    };
    const glow = env.glow;
    return { ctx, W, H, dpr, u, P, xN, x0, xFor, pal, catCol, text, font, pill, glow };
  }
  const label = (m) => (m.type === 'donation' ? m.amountLabel : m.type === 'raid' ? 'Рейд · ' + (m.username || '') : m.type === 'giftsub' ? (m.username || '') + ' дарит' : m.username || '');
  // видимые отрезки категорий в окне: [{i, a, b, name}]
  function chapters(env) {
    const out = []; const h = env.cats.slice().sort((a, b) => a.startedAt - b.startedAt);
    const lo = env.refTime - env.winMs;
    h.forEach((c, i) => { const a = c.startedAt, b = h[i + 1] ? h[i + 1].startedAt : env.refTime; if (b <= lo || a >= env.refTime) return; out.push({ i, a: Math.max(a, lo), b: Math.min(b, env.refTime), name: c.name || '', full: b - a }); });
    return out;
  }
  function chapterBand(env, k, y, h, style) {
    const { ctx, xFor, P, font, catCol, text } = k;
    chapters(env).forEach((c) => {
      const xa = xFor(c.a), xb = xFor(c.b), col = catCol(c.i);
      if (style === 'chip') { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(xa + 1, y, xb - xa - 2, h, env.sharp ? 2 : h * 0.35) : ctx.rect(xa + 1, y, xb - xa - 2, h); ctx.fillStyle = hexA(col, 0.22); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(xa + 1, y + h - P(3), xb - xa - 2, P(3)); }
      else { ctx.fillStyle = hexA(text, 0.07); ctx.fillRect(xa + 1, y, xb - xa - 2, h); ctx.fillStyle = col; ctx.fillRect(xa + 1, y, P(3), h); }
      ctx.fillStyle = text; ctx.font = font(700, P(11)); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (xb - xa > P(70)) ctx.fillText(env.fit(c.name + ' · ' + Math.max(1, Math.round(c.full / 60000)) + ' мин', xb - xa - P(14)), xa + P(style === 'chip' ? 9 : 10), y + h / 2 - (style === 'chip' ? P(1) : 0));
    });
    ctx.textBaseline = 'alphabetic';
  }
  function grid(env, k, top, bot, step) {
    const { ctx, xFor, P, font, text } = k;
    ctx.strokeStyle = hexA(text, 0.1); ctx.fillStyle = hexA(text, 0.45); ctx.lineWidth = 1; ctx.font = font(500, P(10)); ctx.textAlign = 'left';
    const lo = env.refTime - env.winMs;
    for (let t = Math.ceil(lo / step) * step; t <= env.refTime; t += step) {
      const x = xFor(t); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
      ctx.fillText(env.clock(t - env.streamStart), x + P(4), top - P(5));
    }
  }
  const msgDots = (env, k, yAt, r, a) => env.events.filter((m) => m.type === 'message').forEach((m) => {
    const x = k.xFor(m.ts); if (x < k.x0 || x > k.xN) return; k.ctx.globalAlpha = a * m.alpha; k.ctx.fillStyle = k.text; k.ctx.beginPath(); k.ctx.arc(x, yAt(m), r, 0, 7); k.ctx.fill(); k.ctx.globalAlpha = 1;
  });
  const bigLabel = (env, k, m, x, y) => {
    const age = env.refTime - m.ts; if (!(BIG(m) || m.type === 'sub') || age > 30000) return;
    const a = clamp((30000 - age) / 8000, 0, 1) * m.alpha; if (m.type === 'donation') return; // у доната подпись — сама плашка
    k.ctx.globalAlpha = a; k.pill(label(m), x, y, hexA(env.colorOf(m.type), 0.3), k.text, k.P(10.5)); k.ctx.globalAlpha = 1;
  };

  // ---------- Волна ----------
  V.wave = function (env) {
    const k = prep(env), { ctx, W, H, P, xFor, xN, x0, text } = k;
    const top = P(40), base = H - P(40);
    const yv = (ts) => base - env.valAt(ts) * (base - top);
    grid(env, k, top - P(6), base + P(4), env.winMs / 5);
    const N = 120, pts = []; for (let i = 0; i <= N; i++) { const t = env.refTime - env.winMs + env.winMs * i / N; pts.push([xFor(t), yv(t)]); }
    const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
    const g = ctx.createLinearGradient(0, top, 0, base); g.addColorStop(0, hexA(env.accent, 0.5)); g.addColorStop(1, hexA(env.accent, 0));
    path(); ctx.lineTo(xN, base); ctx.lineTo(x0, base); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    const lg = ctx.createLinearGradient(x0, 0, xN, 0); lg.addColorStop(0, hexA(env.accent, 0.35)); lg.addColorStop(1, env.c2);
    path(); ctx.shadowColor = env.c2; ctx.shadowBlur = P(10) * k.glow; ctx.strokeStyle = lg; ctx.lineWidth = P(2.4); ctx.lineJoin = env.sharp ? 'miter' : 'round'; ctx.stroke(); ctx.shadowBlur = 0;
    // пик окна
    let pi = 0; pts.forEach((p, i) => { if (p[1] < pts[pi][1]) pi = i; });
    ctx.fillStyle = text; ctx.beginPath(); ctx.arc(pts[pi][0], pts[pi][1], P(3.2), 0, 7); ctx.fill(); k.pill('пик', pts[pi][0] + P(24), pts[pi][1] - P(10), hexA(text, 0.14), text, P(10));
    msgDots(env, k, (m) => yv(m.ts), P(1.8), 0.55);
    env.events.filter((m) => m.type !== 'message').forEach((m) => {
      const x = xFor(m.ts); if (x < x0) return; const y = yv(m.ts), sy = y - P(BIG(m) ? 46 : 28);
      ctx.strokeStyle = hexA(env.colorOf(m.type), 0.5 * m.alpha); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, sy); ctx.stroke();
      env.drawEvent(m, x, sy, BIG(m) ? P(12) : P(9), m.alpha); bigLabel(env, k, m, x, sy - P(24));
    });
    const gx = ctx.createLinearGradient(0, top - P(10), 0, base + P(4)); gx.addColorStop(0, hexA(env.c2, 0)); gx.addColorStop(.5, hexA(env.c2, .85)); gx.addColorStop(1, hexA(env.c2, 0)); ctx.fillStyle = gx; ctx.fillRect(xN - 1, top - P(10), 2, base - top + P(14));
    ctx.fillStyle = env.c2; ctx.beginPath(); ctx.arc(xN, yv(env.refTime), P(4.5), 0, 7); ctx.fill();
    chapterBand(env, k, H - P(30), P(22), 'chip');
  };

  // ---------- Хроника ----------
  V.chronicle = function (env) {
    const k = prep(env), { ctx, W, H, P, xFor, xN, x0, text } = k;
    const ay = H * 0.46;
    ctx.strokeStyle = hexA(text, 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, ay); ctx.lineTo(W - P(10), ay); ctx.stroke();
    ctx.fillStyle = hexA(text, 0.5); ctx.font = k.font(500, P(10));
    const step = env.winMs / 10, lo = env.refTime - env.winMs;
    for (let t = Math.ceil(lo / step) * step, i = 0; t <= env.refTime; t += step, i++) { const x = xFor(t), mj = i % 2 === 0; ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x, ay + P(mj ? 9 : 5)); ctx.stroke(); if (mj) ctx.fillText(env.clock(t - env.streamStart), x - P(14), ay + P(22)); }
    const hy = ay + P(30), hh = P(14), N = 90;
    for (let i = 0; i < N; i++) { const t = lo + env.winMs * (i + .5) / N, v = env.valAt(t); ctx.fillStyle = hexA(env.accent, 0.1 + v * 0.85); ctx.fillRect(xFor(t - env.winMs / N / 2), hy, (xN - x0) / N + 0.6, hh); }
    ctx.fillStyle = hexA(text, 0.5); ctx.font = k.font(500, P(9)); ctx.fillText('АКТИВНОСТЬ', x0, hy + hh + P(12));
    chapterBand(env, k, hy + hh + P(20), P(22), 'block');
    // метки: соседние одного типа сливаются в ×N
    const ev = env.events.filter((m) => m.type !== 'message').sort((a, b) => a.ts - b.ts), groups = [];
    ev.forEach((m) => { const x = xFor(m.ts), g = groups[groups.length - 1]; if (g && x - g.x < P(16) && g.m.type === m.type && !BIG(m)) { g.n++; g.x = x; } else groups.push({ m, x, n: 1 }); });
    groups.forEach((g) => { if (g.x < x0) return; ctx.strokeStyle = hexA(env.colorOf(g.m.type), g.m.alpha); ctx.lineWidth = P(1.6); ctx.beginPath(); ctx.moveTo(g.x, ay - P(26)); ctx.lineTo(g.x, ay); ctx.stroke(); env.drawEvent(g.m, g.x, ay - P(32), P(7), g.m.alpha);
      if (g.n > 1) { ctx.fillStyle = text; ctx.font = k.font(700, P(9)); ctx.textAlign = 'center'; ctx.fillText('×' + g.n, g.x, ay - P(48)); ctx.textAlign = 'left'; } else bigLabel(env, k, g.m, g.x, ay - P(52)); });
    ctx.fillStyle = env.c2; ctx.fillRect(xN - 1, P(16), 2, hy + hh - P(6)); ctx.beginPath(); ctx.moveTo(xN - P(6), P(12)); ctx.lineTo(xN + P(6), P(12)); ctx.lineTo(xN, P(20)); ctx.fill();
  };

  // ---------- Пульс ----------
  V.pulse = function (env) {
    const k = prep(env), { ctx, W, H, P, xFor, xN, x0, text } = k, mid = H * 0.5, N = 260;
    ctx.strokeStyle = hexA(text, 0.07); ctx.lineWidth = 1; for (let i = 1; i < 5; i++) { const y = mid - P(70) + i * P(28); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(W - P(10), y); ctx.stroke(); }
    const amp = H * 0.3, pulse = (t) => env.valAt(t) * amp * (0.55 + (Math.sin(t / 900) * 0.5 + Math.sin(t / 330) * 0.3) * 0.4) * (Math.floor(t / 3000) % 2 ? -1 : 1);
    const lg = ctx.createLinearGradient(x0, 0, xN, 0); lg.addColorStop(0, hexA(env.accent, 0)); lg.addColorStop(.5, env.accent); lg.addColorStop(1, env.c2);
    ctx.beginPath(); for (let i = 0; i <= N; i++) { const t = env.refTime - env.winMs + env.winMs * i / N, x = xFor(t), y = mid - pulse(t); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.lineJoin = env.sharp ? 'miter' : 'round'; ctx.shadowColor = env.accent; ctx.shadowBlur = P(12) * k.glow; ctx.strokeStyle = lg; ctx.lineWidth = P(2.4); ctx.stroke(); ctx.shadowBlur = 0;
    env.events.filter((m) => m.type !== 'message').forEach((m) => { const x = xFor(m.ts); if (x < x0) return; const y = mid - pulse(m.ts), age = env.refTime - m.ts, kk = clamp(age / 14000, 0, 1);
      if (kk < 1) { ctx.strokeStyle = hexA(env.colorOf(m.type), (1 - kk) * m.alpha); ctx.lineWidth = P(2); ctx.beginPath(); ctx.arc(x, y, P(8) + kk * P(34), 0, 7); ctx.stroke(); }
      env.drawEvent(m, x, y, P(BIG(m) ? 9 : 6.5), m.alpha); if (age < 30000 && BIG(m) && m.type !== 'donation') bigLabel(env, k, m, x, y - P(26)); });
    ctx.fillStyle = env.c2; ctx.shadowColor = env.c2; ctx.shadowBlur = P(14) * k.glow; ctx.beginPath(); ctx.arc(xN, mid - pulse(env.refTime), P(5.5), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = hexA(text, 0.6); ctx.font = k.font(600, P(10)); ctx.fillText('СЕЙЧАС', x0, H - P(26)); ctx.fillStyle = text; ctx.font = k.font(800, P(15)); ctx.fillText(env.fit(env.catName || '—', W * 0.5), x0, H - P(8));
  };


  // ---------- Столбики (по умолчанию) ----------
  // Весь стрим целиком: сообщения чата по 5 минут (шкала — по максимуму стрима, поэтому и тихий чат даёт заметные столбики),
  // пунктир «в среднем», полоса глав (категории), дорожка событий значками и три цифры справа. Данные — env.summary с сервера.
  const EV_ICON = { follow: '+', sub: '★', giftsub: '♥', raid: '⇢', donation: '₽', channelpoints: '◎' };
  V.bars = function (env) {
    const k = prep(env), { ctx, W, H, dpr, text } = k, sm = env.summary;
    const u = Math.max(0.75, Math.min(1.5, H / dpr / 300)), P = (n) => n * dpr * u;
    const lab = (w, px) => `${w} ${Math.round(px)}px Inter, ${env.fontFamily}`;
    const acc = env.accent;
    if (!sm) return;
    const nb = sm.buckets.length, now = env.refTime;
    const sideW = W / dpr > 640 ? P(150) : 0;
    const x0 = P(6), xR = W - sideW - (sideW ? P(22) : P(6));
    const yTop = P(48), axisH = P(16), laneH = P(26), chapH = P(22);
    const yAxis = H - P(4), yLane = yAxis - axisH - laneH, yChap = yLane - P(6) - chapH, yBase = yChap - P(8);
    const slots = Math.max(nb, 12), slotW = (xR - x0) / slots, gap = Math.min(P(4), slotW * 0.22), bw = slotW - gap;
    const tFor = (ts) => x0 + (ts - sm.start) / sm.bucketMs * slotW;
    const done = sm.buckets.slice(0, -1), cur = sm.buckets[nb - 1] || 0;
    const peak = Math.max(...sm.buckets, 0), ceil = Math.max(10, peak), hMax = yBase - yTop;
    const pkI = peak > 0 ? sm.buckets.indexOf(peak) : -1;
    const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))); else ctx.rect(x, y, w, h); };

    // начало стрима — подсказка вместо пустого поля
    if (sm.messages === 0 && nb <= 2) {
      ctx.fillStyle = text; ctx.font = k.font(600, P(17)); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText('Стрим только начался', x0 + P(70), (yTop + yBase) / 2 - P(10));
      ctx.fillStyle = hexA(text, 0.55); ctx.font = lab(500, P(12.5));
      ctx.fillText(env.fit('Столбики появляются каждые 5 минут — по сообщениям в чате', xR - x0 - P(80)), x0 + P(70), (yTop + yBase) / 2 + P(14));
      [0.3, 0.55, 0.8].forEach((f, i) => { ctx.fillStyle = i === 2 ? acc : hexA(text, 0.26); rr(x0 + i * P(16), (yTop + yBase) / 2 + P(20) - f * P(44), P(12), f * P(44), P(3)); ctx.fill(); });
    } else {
      // столбики
      for (let i = 0; i < nb; i++) {
        const v = sm.buckets[i], x = x0 + i * slotW + gap / 2;
        if (!v) { ctx.fillStyle = hexA(text, 0.07); rr(x, yBase - P(3), bw, P(3), P(1.5)); ctx.fill(); continue; }
        const h = Math.max(P(4), v / ceil * hMax);
        ctx.fillStyle = i === pkI ? acc : (i === nb - 1 ? hexA(acc, 0.5) : hexA(text, 0.26));
        rr(x, yBase - h, bw, h, P(4)); ctx.fill();
      }
      // в среднем
      const filled = done.filter((v) => v > 0);
      if (filled.length >= 3) {
        const avg = filled.reduce((a, b) => a + b, 0) / filled.length, y = yBase - avg / ceil * hMax;
        ctx.save(); ctx.setLineDash([P(3), P(4)]); ctx.strokeStyle = hexA(text, 0.24); ctx.lineWidth = Math.max(1, dpr); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xR, y); ctx.stroke(); ctx.restore();
        ctx.fillStyle = hexA(text, 0.4); ctx.font = lab(500, P(10.5)); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('в среднем ' + Math.round(avg), xR, y - P(3));
      }
      // подпись пика
      if (pkI >= 0 && peak >= 2) {
        const x = x0 + pkI * slotW + slotW / 2, y = yBase - Math.max(P(4), peak / ceil * hMax) - P(8);
        const t1 = 'пик', t2 = ' ' + peak + ' сообщ. · ' + env.clock(sm.start + pkI * sm.bucketMs - env.streamStart);
        ctx.font = lab(600, P(11.5)); const w1 = ctx.measureText(t1).width; ctx.font = lab(500, P(11.5)); const w2 = ctx.measureText(t2).width;
        const w = w1 + w2 + P(16), hh = P(22), bx = Math.max(x0, Math.min(xR - w, x - w / 2)), by = Math.max(yTop - P(30), y - hh);
        ctx.fillStyle = 'rgba(28,29,33,.94)'; rr(bx, by, w, hh, P(7)); ctx.fill(); ctx.strokeStyle = hexA(text, 0.14); ctx.lineWidth = Math.max(1, dpr); ctx.stroke();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = acc; ctx.font = lab(600, P(11.5)); ctx.fillText(t1, bx + P(8), by + hh / 2);
        ctx.fillStyle = text; ctx.font = lab(500, P(11.5)); ctx.fillText(t2, bx + P(8) + w1, by + hh / 2);
      }
    }

    // главы (категории): тонкая полоса — обложка, «название · N мин», сверху линия цвета категории; в момент смены — пунктир через столбики
    const cats = env.cats.slice().sort((a, b) => a.startedAt - b.startedAt);
    const endX = x0 + nb * slotW;
    let any = false;
    cats.forEach((c, i) => {
      const a = Math.max(tFor(c.startedAt), x0), endTs = i + 1 < cats.length ? cats[i + 1].startedAt : now;
      const b = Math.min(i + 1 < cats.length ? tFor(cats[i + 1].startedAt) : endX, endX);
      if (b - a < P(4)) return; any = true;
      const col = [env.accent, env.c2, env.c4, '#A970FF'][i % 4], w = b - a - P(3);
      if (i > 0 && a > x0 + P(2)) { ctx.save(); ctx.setLineDash([P(2), P(4)]); ctx.strokeStyle = hexA(text, 0.22); ctx.lineWidth = Math.max(1, dpr); ctx.beginPath(); ctx.moveTo(a, yTop); ctx.lineTo(a, yChap); ctx.stroke(); ctx.restore(); }
      ctx.save(); rr(a + P(1), yChap, w, chapH, P(5)); ctx.clip();
      ctx.fillStyle = hexA(text, 0.06); ctx.fillRect(a, yChap, w + P(2), chapH);
      ctx.fillStyle = col; ctx.fillRect(a, yChap, w + P(2), Math.max(1.5 * dpr, P(1.5)));
      let tx = a + P(8);
      const img = c.art && env.img ? env.img(c.art) : null;
      if (img && img.complete && img.naturalWidth && w > P(40)) { const ih = chapH - P(6), iw = ih * 0.75; ctx.drawImage(img, a + P(4), yChap + P(3.5), iw, ih); tx = a + P(4) + iw + P(6); }
      ctx.restore();
      const room = a + w - tx - P(6);
      if (room > P(24)) {
        const mins = Math.max(1, Math.round((endTs - c.startedAt) / 60000)), dur = ' · ' + (mins >= 60 ? Math.floor(mins / 60) + ' ч ' + (mins % 60 ? (mins % 60) + ' мин' : '') : mins + ' мин').trim();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const ty = yChap + chapH / 2 + P(0.5);
        ctx.font = lab(600, P(11)); const nm = env.fit(c.name || '', room - P(4)); ctx.fillStyle = text; ctx.fillText(nm, tx, ty);
        const nw = ctx.measureText(nm).width; ctx.font = lab(500, P(11));
        if (nm === (c.name || '') && ctx.measureText(dur).width < room - nw) { ctx.fillStyle = hexA(text, 0.5); ctx.fillText(dur, tx + nw, ty); }
      }
    });
    if (!any) { ctx.fillStyle = hexA(text, 0.04); rr(x0, yChap, Math.max(P(20), endX - x0), chapH, P(5)); ctx.fill(); }
    if (endX < xR - P(6)) { ctx.save(); ctx.setLineDash([P(3), P(3)]); ctx.strokeStyle = hexA(text, 0.12); rr(endX + P(2), yChap, xR - endX - P(2), chapH, P(5)); ctx.stroke(); ctx.restore(); }

    // дорожка событий: одна иконка на корзину (самое «крупное» событие)
    const rank = { donation: 6, raid: 5, giftsub: 4, sub: 3, follow: 2, channelpoints: 1 }, per = {};
    (sm.keys || []).forEach((e) => { const b = Math.floor((e.ts - sm.start) / sm.bucketMs); if (b < 0) return; if (!per[b] || rank[e.type] > rank[per[b].type]) per[b] = e; });
    const s2 = Math.min(P(22), slotW * 0.95);
    Object.keys(per).forEach((b) => {
      const e = per[b], x = x0 + (+b + 0.5) * slotW, col = env.colorOf(e.type === 'follow' ? 'sub' : e.type);
      ctx.fillStyle = hexA(acc, 0.16); rr(x - s2 / 2, yLane + (laneH - s2) / 2, s2, s2, P(6)); ctx.fill();
      ctx.fillStyle = acc; ctx.font = lab(700, s2 * 0.55); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(EV_ICON[e.type] || '•', x, yLane + laneH / 2 + P(0.5));
      void col;
    });

    // ось времени
    ctx.fillStyle = hexA(text, 0.4); ctx.font = lab(500, P(10.5)); ctx.textBaseline = 'alphabetic';
    const totalMs = slots * sm.bucketMs, stepMs = [15, 30, 60, 120][[15, 30, 60, 120].findIndex((m) => totalMs / (m * 60000) <= 8)] * 60000 || 240 * 60000;
    for (let t = 0; t <= totalMs + 1; t += stepMs) {
      const x = x0 + t / sm.bucketMs * slotW; ctx.textAlign = t === 0 ? 'left' : (x > xR - P(30) ? 'right' : 'center');
      ctx.fillText(env.clock(sm.start + t - env.streamStart), Math.min(x, xR), yAxis);
    }

    // цифры справа
    if (sideW) {
      const sx = W - sideW;
      ctx.fillStyle = hexA(text, 0.08); ctx.fillRect(sx - P(12), yTop, Math.max(1, dpr), yAxis - yTop);
      const items = [[sm.messages, 'сообщений'], [sm.chatters, 'чатеров'], [sm.events || '—', 'событий']];
      const step = (yAxis - yTop) / 3;
      items.forEach(([v, l], i) => {
        const y = yTop + step * i + step / 2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = text; ctx.font = k.font(700, P(22));
        ctx.fillText(typeof v === 'number' ? v.toLocaleString('ru-RU') : v, sx + P(6), y);
        ctx.fillStyle = hexA(text, 0.55); ctx.font = lab(500, P(11.5)); ctx.fillText(l, sx + P(6), y + P(17));
      });
    }
    void now;
  };

  // ---------- Эквалайзер ----------
  V.equalizer = function (env) {
    const k = prep(env), { ctx, W, H, P, xFor, xN, x0, text } = k, base = H - P(34), top = P(44), steps = 60, stepMs = env.winMs / steps;
    ctx.strokeStyle = hexA(text, 0.08); ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = base - i * (base - top) / 3; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xN + P(10), y); ctx.stroke(); }
    const first = Math.ceil((env.refTime - env.winMs) / stepMs) * stepMs, bw = Math.max(2, (xN - x0) / steps * 0.62), caps = {};
    env.events.forEach((m) => { if (m.type === 'message') return; const b = Math.floor(m.ts / stepMs) * stepMs; if (!caps[b] || BIG(m)) caps[b] = m; });
    const gh = P(6);
    for (let t = first; t <= env.refTime; t += stepMs) {
      const x = xFor(t), grow = clamp((env.refTime - t) / stepMs + 0.15, 0, 1), bh = (base - top) * env.valAt(t + stepMs / 2) * grow, segs = Math.max(1, Math.floor(bh / gh));
      for (let i = 0; i < segs; i++) { const f = i / Math.max(1, segs - 1); ctx.fillStyle = hexA(f > 0.75 ? env.c2 : env.accent, 0.4 + 0.6 * f); if (env.sharp) ctx.fillRect(x, base - (i + 1) * gh + 1, bw, gh - P(2)); else { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, base - (i + 1) * gh + 1, bw, gh - P(2), bw / 3) : ctx.rect(x, base - (i + 1) * gh + 1, bw, gh - P(2)); ctx.fill(); } }
      const m = caps[Math.floor(t / stepMs) * stepMs]; if (m && x >= x0) { const age = env.refTime - m.ts, bounce = Math.max(0, Math.sin(age / 90)) * Math.exp(-age / 3500) * P(10); env.drawEvent(m, x + bw / 2, base - segs * gh - P(10) - bounce, P(BIG(m) ? 9 : 6.5), m.alpha); bigLabel(env, k, m, x + bw / 2, base - segs * gh - P(36) - bounce); }
    }
    ctx.fillStyle = env.accent; ctx.fillRect(xN + P(5), top - P(10), 2, base - top + P(14));
    ctx.fillStyle = hexA(text, 0.45); ctx.font = k.font(500, P(10)); const st = env.winMs / 5; for (let t = Math.ceil((env.refTime - env.winMs) / st) * st; t <= env.refTime; t += st) ctx.fillText(env.clock(t - env.streamStart), xFor(t), H - P(18));
    ctx.fillStyle = hexA(text, 0.7); ctx.font = k.font(700, P(11)); ctx.fillText(env.fit((env.catName || '').toUpperCase(), W * 0.5), x0, H - P(4));
  };

  // ---------- Созвездие ----------
  V.constellation = function (env) {
    const k = prep(env), { ctx, W, H, P, xFor, xN, x0, text } = k, top = P(44), bot = H - P(40), t = performance.now() / 1000;
    chapters(env).forEach((c) => { const xa = xFor(c.a), xb = xFor(c.b), cx = (xa + xb) / 2, r = Math.max(P(60), (xb - xa) * 0.6), g = ctx.createRadialGradient(cx, H * 0.55, P(8), cx, H * 0.55, r); g.addColorStop(0, hexA(k.catCol(c.i), 0.26)); g.addColorStop(1, hexA(k.catCol(c.i), 0)); ctx.fillStyle = g; ctx.fillRect(xa, 0, xb - xa, H); });
    for (let i = 0; i < 60; i++) { const sx = (((hash(i) * W * 1.2 - t * 3 * (0.3 + hash(i + 9))) % (W * 1.2)) + W * 1.2) % (W * 1.2) - W * 0.1, sy = top - P(20) + hash(i + 3) * (bot - top + P(30)); ctx.fillStyle = hexA(text, 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.4 + i))); ctx.fillRect(sx, sy, P(1.4), P(1.4)); }
    const ev = env.events.filter((m) => m.type !== 'message').sort((a, b) => a.ts - b.ts), pos = (m) => ({ x: xFor(m.ts), y: top + hash(m.ts % 100000) * (bot - top) });
    ctx.strokeStyle = hexA(text, 0.22); ctx.lineWidth = 1; ctx.beginPath(); ev.forEach((m, i) => { const p = pos(m); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke();
    env.events.filter((m) => m.type === 'message').forEach((m) => { const x = xFor(m.ts); if (x < x0) return; ctx.fillStyle = hexA(text, 0.4 * m.alpha); ctx.fillRect(x, top + hash(m.ts % 99991 + 7) * (bot - top), P(1.6), P(1.6)); });
    ev.forEach((m) => { const p = pos(m); if (p.x < x0) return; const r = P(BIG(m) ? 11 : 8) * (1 + 0.1 * Math.sin(t * 2 + m.ts)), col = env.colorOf(m.type), g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4); g.addColorStop(0, hexA(col, 0.5 * m.alpha)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.fillRect(p.x - r * 3.4, p.y - r * 3.4, r * 6.8, r * 6.8); env.drawEvent(m, p.x, p.y, r, m.alpha); bigLabel(env, k, m, p.x, p.y - r - P(14)); });
    const mid = (top + bot) / 2; ctx.fillStyle = env.c2; ctx.shadowColor = env.c2; ctx.shadowBlur = P(12) * k.glow; ctx.beginPath(); ctx.arc(xN, mid, P(5), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    chapters(env).forEach((c) => { const xa = xFor(c.a), xb = xFor(c.b); if (xb - xa > P(90)) { ctx.fillStyle = k.catCol(c.i); ctx.font = k.font(700, P(11)); ctx.fillText(env.fit(c.name, xb - xa - P(14)), xa + P(8), H - P(12)); } });
  };

  // ---------- Река ----------
  V.river = function (env) {
    const k = prep(env), { ctx, W, H, P, xFor, xN, x0, text } = k, mid = H * 0.5, N = 150, wid = (t) => P(9) + env.valAt(t) * H * 0.2, sw = (t) => Math.sin(t / 4000) * P(5) + Math.sin(t / 1800) * P(2);
    const top = [], bot = []; for (let i = 0; i <= N; i++) { const t = env.refTime - env.winMs + env.winMs * i / N, x = xFor(t); top.push([x, mid + sw(t) - wid(t)]); bot.push([x, mid + sw(t) + wid(t)]); }
    const lg = ctx.createLinearGradient(x0, 0, xN, 0), ch = chapters(env); if (!ch.length) { lg.addColorStop(0, env.accent); lg.addColorStop(1, env.accent); } else ch.forEach((c) => { lg.addColorStop(clamp((xFor(c.a) - x0) / (xN - x0), 0, 1), k.catCol(c.i)); lg.addColorStop(clamp((xFor(c.b) - x0) / (xN - x0), 0, 1), k.catCol(c.i)); });
    ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]); ctx.closePath();
    ctx.globalAlpha = 0.32; ctx.fillStyle = lg; ctx.fill(); ctx.globalAlpha = 1;
    const tt = performance.now() / 1000; ctx.save(); ctx.clip();
    for (let q = -3; q <= 3; q++) { ctx.beginPath(); for (let i = 0; i <= N; i++) { const t = env.refTime - env.winMs + env.winMs * i / N, x = xFor(t), y = mid + sw(t) + q * wid(t) / 3.4 + Math.sin(t / 2300 + q * 1.7 - tt * 0.9) * P(4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.strokeStyle = hexA(text, 0.16); ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = P(2); ctx.strokeStyle = lg; [top, bot].forEach((e) => { ctx.beginPath(); e.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
    env.events.forEach((m) => { const x = xFor(m.ts); if (x < x0) return; const y = mid + sw(m.ts) + Math.sin(tt * 1.6 + m.ts) * Math.min(P(10), wid(m.ts) * 0.4), age = env.refTime - m.ts;
      if (m.type === 'message') { ctx.fillStyle = hexA(text, 0.5 * m.alpha); ctx.beginPath(); ctx.arc(x, y, P(2.2), 0, 7); ctx.fill(); return; }
      if (BIG(m) && age < 15000) { const kk = age / 15000; ctx.strokeStyle = hexA(env.colorOf(m.type), (1 - kk) * m.alpha); ctx.lineWidth = P(2); ctx.beginPath(); ctx.arc(x, y, P(10) + kk * P(40), 0, 7); ctx.stroke(); }
      env.drawEvent(m, x, y, P(BIG(m) ? 11 : 8), m.alpha); bigLabel(env, k, m, x, y - wid(m.ts) - P(16)); });
    ctx.fillStyle = text; ctx.beginPath(); ctx.arc(xN, mid, P(6), 0, 7); ctx.fill(); ctx.strokeStyle = hexA(text, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(xN, mid, P(12) + P(3) * Math.sin(tt * 3), 0, 7); ctx.stroke();
    ch.forEach((c) => { const xa = xFor(c.a), xb = xFor(c.b); ctx.fillStyle = k.catCol(c.i); ctx.font = k.font(700, P(11)); ctx.textAlign = 'left'; if (xb - xa > P(80)) ctx.fillText(env.fit(c.name + ' · ' + Math.max(1, Math.round(c.full / 60000)) + ' мин', xb - xa - P(12)), xa + P(8), H - P(12)); });
  };
})();
