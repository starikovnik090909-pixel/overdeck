// public/donation-looks.js — виды алерта доната: аркада, терминал, лут, взлом эфира, золотой дождь, салют, кино, уведомление.
// Подключается из donationalert.js: window.DonationLooks.run(item, helpers). Каждая сцена рисуется в 480x270 и увеличивается до 1920x1080
// (холсты — в полном разрешении), «уведомление» — малый алерт (≈30% экрана) в углу/по центру (card.lookPos).
(function () {
  const R = Math.random;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FONTS = ['Rubik', 'Bebas Neue', 'Oswald', 'IBM Plex Mono', 'Press Start 2P'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAMES = ['arcade', 'terminal', 'loot', 'hijack', 'goldrain', 'fireworks', 'cinema', 'notif'];

  let layer = null;
  function getLayer() {
    if (layer) return layer;
    layer = document.createElement('div'); layer.className = 'dl-layer'; layer.id = 'dlLayer';
    document.body.appendChild(layer);
    return layer;
  }

  /** Холст в полном разрешении сцены: CSS-размер 480x270, внутри 1920x1080, рисуем в координатах 480x270. */
  function canvasCtx(st, k) {
    const c = st.querySelector('canvas.cv'); c.width = 480 * k; c.height = 270 * k;
    const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); return x;
  }
  function loop(tok, fn) {
    const t0 = performance.now(); let last = t0;
    (function f(t) { if (tok.dead) return; fn((t - t0) / 1000, Math.min(0.033, (t - last) / 1000)); last = t; requestAnimationFrame(f); })(t0);
  }
  /** Уменьшает кегль, пока текст не влезет по ширине. */
  function fit(el, maxW, min) {
    if (!el) return;
    let fs = parseFloat(getComputedStyle(el).fontSize) || 16; const lo = min || 8;
    while (el.scrollWidth > maxW && fs > lo) { fs -= 1; el.style.fontSize = fs + 'px'; }
  }
  const money = (d) => String(d.amountText || '');
  const curOf = (d) => String(d.amountText || '').replace(/[\d\s., ]/g, '').trim() || '₽';
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  /** Счётчик 0 → amount за sec секунд; fn получает текст. */
  function countUp(tok, d, sec, delay, fn) {
    const t0 = performance.now() + delay * 1000, A = Number(d.amount) || 0;
    (function f(t) { if (tok.dead) return; const k = clamp((t - t0) / (sec * 1000), 0, 1), e = 1 - Math.pow(1 - k, 3); if (t >= t0) fn(Math.round(A * e).toLocaleString('ru-RU')); if (k < 1) requestAnimationFrame(f); else fn(A.toLocaleString('ru-RU')); })(performance.now());
  }
  const TIER_COL = [
    { n: 'ОБЫЧНЫЙ ДРОП', rc: '#c9d1db', rgb: '201,209,219', rd: '#59606b', rl: '#eef2f7', bg: '#2a2d33' },
    { n: 'РЕДКИЙ ДРОП', rc: '#4aa8ff', rgb: '74,168,255', rd: '#144f99', rl: '#a8d6ff', bg: '#10294a' },
    { n: 'ЭПИЧЕСКИЙ ДРОП', rc: '#b26bff', rgb: '178,107,255', rd: '#4a1a99', rl: '#d9b8ff', bg: '#2a1050' },
    { n: 'ЛЕГЕНДАРНЫЙ ДРОП', rc: '#ffb627', rgb: '255,170,30', rd: '#b36400', rl: '#ffd36b', bg: '#4a2a00' },
  ];

  const LOOKS = {
    /* ---------- аркадный автомат ---------- */
    arcade: {
      min: 6, audioAt: 1.4,
      html: () => `<div class="wrp"><div class="ab c t1">INSERT COIN</div><div class="ab c t2">NEW HIGH SCORE!</div><div class="ab slot"></div><div class="ab coin"></div>
        <div class="ab c r r1" data-f="nick"></div><div class="ab c r r2" data-f="score">+0</div><div class="ab c r r3" data-f="msg"></div></div>`,
      fill: (st, d) => {
        st.querySelector('[data-f=nick]').textContent = trunc(d.nick.toUpperCase(), 18);
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? 'MSG: ' + trunc(d.msg.toUpperCase(), 80) : '';
        m.style.whiteSpace = 'normal'; m.style.padding = '0 24px'; m.style.lineHeight = '1.5'; m.style.top = '222px';
      },
      start: (st, d, tok) => {
        const el = st.querySelector('[data-f=score]');
        countUp(tok, d, 1.3, 1.5, (s) => { el.textContent = '+' + s + ' ' + curOf(d); fit(el, 440, 12); });
      },
    },
    /* ---------- терминал ---------- */
    terminal: {
      min: 6.5, audioAt: 2.2,
      html: (d) => {
        const l1 = '$ receive --from ' + trunc(d.nick, 20), l3 = 'amount = ' + String(d.amount) + ' ' + curOf(d);
        return `<div class="wrp"><div class="ab win"><div class="ab bar">STARIKOV://DONATE</div>
        <div class="ln" style="--n:${l1.length};--t:.9s;--dl:.3s">${esc(l1)}</div>
        <div class="ln" style="--n:23;--t:.9s;--dl:1.4s">decrypting packet... OK</div>
        <div class="ln" style="--n:${l3.length};--t:.7s;--dl:2.5s"><span class="hi">${esc(l3)}</span></div>
        <div class="tm" style="margin-top:8px;white-space:normal;word-break:break-word"></div></div></div>`;
      },
      start: (st, d, tok) => {
        const tm = st.querySelector('.tm'); const txt = d.msg ? '> ' + trunc(d.msg, 140) : '';
        const t0 = performance.now() + 3500; tm.textContent = '';
        (function f(t) { if (tok.dead) return; const n = Math.floor(clamp((t - t0) / 1000, 0, 99) * 30); tm.textContent = txt.slice(0, n) + (n < txt.length || (t % 800) < 400 ? '▌' : ''); requestAnimationFrame(f); })(performance.now());
      },
    },
    /* ---------- лут ---------- */
    loot: {
      min: 6, audioAt: 1.8,
      html: (d, c) => {
        const T = TIER_COL[clamp(c.tier || 0, 0, 3)];
        return `<div class="wrp" style="--rc:${T.rc};--rgb:${T.rgb};--rd:${T.rd};--rl:${T.rl};--rbg:${T.bg}"><div class="ab beam"></div>
        <div class="ab lc"><div class="rar">${T.n}</div><div class="gem"></div><div class="it" data-f="amt"></div><div class="fr" data-f="nick"></div><div class="ms" data-f="msg"></div></div><div id="dlsp"></div></div>`;
      },
      fill: (st, d, c) => {
        const T = TIER_COL[clamp(c.tier || 0, 0, 3)]; st.style.background = `radial-gradient(ellipse at 50% 100%,${T.bg},#0a0604 70%)`;
        st.querySelector('[data-f=amt]').textContent = money(d); fit(st.querySelector('[data-f=amt]'), 190, 22);
        st.querySelector('[data-f=nick]').textContent = 'от ' + d.nick; fit(st.querySelector('[data-f=nick]'), 190, 9);
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? '«' + trunc(d.msg, 70) + '»' : '';
        let fs = 12.5; while (m.scrollHeight > 52 && fs > 7) { fs -= 0.5; m.style.fontSize = fs + 'px'; }
      },
      start: (st) => {
        const b = st.querySelector('#dlsp'); for (let i = 0; i < 16; i++) { const e = document.createElement('i'); e.className = 'ab sp'; e.style.left = (120 + R() * 240) + 'px'; e.style.top = (120 + R() * 130) + 'px'; e.style.setProperty('--dl', (0.6 + R() * 2.2) + 's'); b.appendChild(e); }
      },
    },
    /* ---------- взлом эфира ---------- */
    hijack: {
      min: 6, audioAt: 1.7,
      html: () => `<canvas class="cv nz" width="160" height="90"></canvas><div class="wrp"><div class="ab cap"><i></i>REC · ПЕРЕХВАТ</div>
        <div class="ab c warn gl" data-t="ПЕРЕХВАТ ЭФИРА">ПЕРЕХВАТ ЭФИРА</div><div class="ab c nk gl" data-f="nick"></div><div class="ab c am gl" data-f="amt"></div>
        <div class="ab c ms" data-f="msg"></div><div class="ab trk"></div></div>`,
      fill: (st, d) => {
        const nk = st.querySelector('[data-f=nick]'), am = st.querySelector('[data-f=amt]');
        nk.textContent = d.nick.toUpperCase(); nk.dataset.t = d.nick.toUpperCase(); am.textContent = money(d); am.dataset.t = money(d);
        nk.style.left = nk.style.right = am.style.left = am.style.right = '0';
        fit(nk, 440, 18); fit(am, 440, 30);
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? '> ' + trunc(d.msg, 70) : ''; m.style.padding = '0 20px'; fit(m, 440, 9);
      },
      start: (st, d, tok) => {
        const c = st.querySelector('canvas'), x = c.getContext('2d'), img = x.createImageData(160, 90);
        loop(tok, (t) => {
          const k = t < 1.55 ? 0.55 : (t < 1.7 ? 0.3 : (Math.floor(t * 10) % 22 === 0 ? 0.25 : 0.06));
          for (let i = 0; i < img.data.length; i += 4) { const v = R() < k ? R() * 255 : 0; img.data[i] = v; img.data[i + 1] = v * (t < 1.55 ? 0.5 : 0.95); img.data[i + 2] = v * (t < 1.55 ? 0.5 : 1); img.data[i + 3] = v ? 255 : 0; }
          x.putImageData(img, 0, 0);
        });
      },
    },
    /* ---------- золотой дождь ---------- */
    goldrain: {
      min: 7, audioAt: 1.2,
      html: () => `<canvas class="cv" width="1920" height="1080"></canvas><div class="wrp"><div class="ab c nk" data-f="nick"></div><div class="ab c ms" data-f="msg"></div></div>`,
      fill: (st, d) => {
        st.querySelector('[data-f=nick]').textContent = d.nick; fit(st.querySelector('[data-f=nick]'), 440, 9);
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? trunc(d.msg, 90) : ''; m.style.padding = '0 24px'; fit(m, 440, 8);
      },
      start: (st, d, tok) => {
        const x = canvasCtx(st, 4), W = 480, H = 270, floor = H - 8, blocks = [], coins = [], g = 1500;
        const spr = new Image(); spr.src = 'alert-assets/coin.png';
        const label = money(d).replace(/\s+/g, ''), chars = label.split('').slice(0, 8);
        const bw = clamp(Math.floor(400 / chars.length), 30, 62), bh = Math.round(bw * 1.35), fs = Math.round(bw * 1.2);
        const x0 = 240 - (chars.length * (bw + 6)) / 2 + bw / 2;
        chars.forEach((ch, i) => blocks.push({ x: x0 + i * (bw + 6) + (R() * 8 - 4), y: -60 - i * 60, w: bw, h: bh, vy: 0, a: (R() - 0.5) * 0.8, landed: false, t: ch, at: 0.2 + i * 0.3 }));
        const lastAt = 0.2 + chars.length * 0.3; let spawn = 0;
        loop(tok, (t, dt) => {
          x.clearRect(0, 0, W, H);
          for (let s = 0; s < 2; s++) {
            const h = dt / 2;
            for (const b of blocks) { if (t < b.at || b.landed) continue; b.vy += g * h; b.y += b.vy * h; if (b.y + b.h / 2 >= floor) { b.y = floor - b.h / 2; if (b.vy > 220) b.vy *= -0.22; else { b.vy = 0; b.landed = true; } } }
            if (t > lastAt + 0.3 && t < lastAt + 2.5 && coins.length < 90) { spawn += h; while (spawn > 0.028) { spawn -= 0.028; coins.push({ x: 30 + R() * 420, y: -14, vx: (R() - 0.5) * 60, vy: 0, r: 9 + R() * 2, rot: R() * 6.28, ph: R() * 6.28, air: true }); } }
            for (const c of coins) {
              c.vy += g * h; c.x += c.vx * h; c.y += c.vy * h;
              if (c.y + c.r > floor) { c.y = floor - c.r; c.vy *= -0.3; c.vx *= 0.9; c.air = false; }
              if (c.x < c.r) { c.x = c.r; c.vx *= -0.4; } if (c.x > W - c.r) { c.x = W - c.r; c.vx *= -0.4; }
              for (const b of blocks) { if (!b.landed) continue; const nx = Math.max(b.x - b.w / 2, Math.min(c.x, b.x + b.w / 2)), ny = Math.max(b.y - b.h / 2, Math.min(c.y, b.y + b.h / 2)); let dx = c.x - nx, dy = c.y - ny; const dd = Math.hypot(dx, dy);
                if (dd < c.r && dd > 0) { dx /= dd; dy /= dd; c.x += dx * (c.r - dd); c.y += dy * (c.r - dd); const vn = c.vx * dx + c.vy * dy; if (vn < 0) { c.vx -= 1.35 * vn * dx; c.vy -= 1.35 * vn * dy; } c.vx *= 0.96; c.air = false; } }
            }
            for (let i = 0; i < coins.length; i++) for (let j = i + 1; j < coins.length; j++) { const a = coins[i], b = coins[j]; let dx = b.x - a.x, dy = b.y - a.y; const dd = Math.hypot(dx, dy), m = a.r + b.r;
              if (dd < m && dd > 0.001) { dx /= dd; dy /= dd; const p = (m - dd) / 2; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; const vr = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy; if (vr < 0) { const j2 = vr * 0.65; a.vx += j2 * dx; a.vy += j2 * dy; b.vx -= j2 * dx; b.vy -= j2 * dy; } a.vx *= 0.995; b.vx *= 0.995; a.air = false; b.air = false; } }
          }
          for (const b of blocks) {
            if (t < b.at) continue; x.save(); x.translate(b.x, b.y); b.a *= b.landed ? 0.85 : 1; x.rotate(b.a);
            const gr = x.createLinearGradient(0, -b.h / 2, 0, b.h / 2); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(0.45, '#eeb021'); gr.addColorStop(1, '#8c5a05');
            x.fillStyle = gr; x.beginPath(); x.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 9); x.fill(); x.strokeStyle = '#5a3a00'; x.lineWidth = 2; x.stroke();
            x.strokeStyle = 'rgba(255,250,200,.7)'; x.lineWidth = 1.2; x.beginPath(); x.roundRect(-b.w / 2 + 4, -b.h / 2 + 4, b.w - 8, b.h - 8, 6); x.stroke();
            x.fillStyle = 'rgba(255,255,255,.28)'; x.beginPath(); x.roundRect(-b.w / 2 + 5, -b.h / 2 + 5, b.w - 10, 16, 5); x.fill();
            x.fillStyle = '#4a2f00'; x.font = `400 ${fs}px 'Bebas Neue',sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(b.t, 0, 6); x.restore();
          }
          if (spr.complete && spr.naturalWidth) for (const c of coins) { c.rot += c.vx * dt * 0.03; if (c.air) c.ph += dt * 11; x.save(); x.translate(c.x, c.y); x.rotate(c.rot); x.scale(c.air ? Math.max(0.18, Math.abs(Math.cos(c.ph))) : 1, 1); x.drawImage(spr, -c.r, -c.r, c.r * 2, c.r * 2); x.restore(); }
        });
      },
    },
    /* ---------- салют-цифры ---------- */
    fireworks: {
      min: 7, audioAt: 2.4,
      html: () => `<canvas class="cv" width="1920" height="1080"></canvas><div class="wrp"><div class="ab c nk" data-f="nick"></div><div class="ab c ms" data-f="msg"></div></div>`,
      fill: (st, d) => {
        st.querySelector('[data-f=nick]').textContent = d.nick; fit(st.querySelector('[data-f=nick]'), 440, 9);
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? trunc(d.msg, 90) : ''; m.style.padding = '0 24px'; fit(m, 440, 8);
      },
      start: (st, d, tok) => {
        const x = canvasCtx(st, 4), W = 480, H = 270, P = [], tg = [];
        const off = document.createElement('canvas'); off.width = W; off.height = H; const o = off.getContext('2d');
        const build = () => {
          let fs = 120; o.font = `400 ${fs}px 'Bebas Neue',sans-serif`; const label = money(d); while (o.measureText(label).width > 420 && fs > 30) { fs -= 4; o.font = `400 ${fs}px 'Bebas Neue',sans-serif`; }
          o.clearRect(0, 0, W, H); o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(label, 240, 104);
          const px = o.getImageData(0, 0, W, H).data; tg.length = 0; for (let y = 0; y < H; y += 2) for (let xx = 0; xx < W; xx += 2) if (px[(y * W + xx) * 4 + 3] > 128) tg.push([xx, y]);
        };
        try { (document.fonts && document.fonts.load("120px 'Bebas Neue'") || Promise.resolve()).then(build).catch(build); } catch (_) {} build();
        const bursts = [[130, 70, '#ffd36b', 0.9], [360, 60, '#ff6ac8', 1.15], [240, 150, '#7fd0ff', 1.4]]; let main = false; const rocket = { x: 240, y: 270, v: -330 };
        loop(tok, (t, dt) => {
          x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H);
          if (t < 1.3) { rocket.y += rocket.v * dt; x.fillStyle = '#fff'; x.fillRect(rocket.x - 1, rocket.y, 2, 10); for (let i = 0; i < 3; i++) P.push({ x: rocket.x, y: rocket.y + 10, vx: (R() - 0.5) * 20, vy: R() * 30, l: 0.5, c: '#ffb36b', f: false }); }
          if (t >= 1.3 && !main) { main = true; tg.forEach((q, i) => { const a = R() * 6.28, s = 60 + R() * 190; P.push({ x: 240, y: rocket.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, tx: q[0], ty: q[1], l: 9, c: ['#ffd36b', '#ffb0e6', '#fff0b0'][i % 3], f: true, t0: 1.85, d: R() * 0.3 }); }); }
          bursts.forEach((b) => { if (t >= b[3] && !b.f) { b.f = true; for (let n = 0; n < 46; n++) { const a = R() * 6.28, s = 30 + R() * 90; P.push({ x: b[0], y: b[1], vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1.1, c: b[2], f: false }); } } });
          x.globalCompositeOperation = 'lighter';
          for (let i = P.length - 1; i >= 0; i--) {
            const p = P[i];
            if (p.f) {
              if (t < p.t0 + p.d) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; } else { p.x += (p.tx - p.x) * Math.min(1, dt * 6); p.y += (p.ty - p.y) * Math.min(1, dt * 6); }
              const fade = t > 5.4 ? Math.max(0, 1 - (t - 5.4) / 1.2) : 1; x.globalAlpha = fade * (0.65 + 0.35 * Math.sin(t * 12 + i)); x.fillStyle = p.c; x.fillRect(p.x - 0.8, p.y - 0.8, 2, 2); if (fade <= 0) P.splice(i, 1);
            } else { p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; if (p.l <= 0) { P.splice(i, 1); continue; } x.globalAlpha = Math.max(0, p.l); x.fillStyle = p.c; x.fillRect(p.x, p.y, 2, 2); }
          }
          x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
        });
      },
    },
    /* ---------- титры из кино ---------- */
    cinema: {
      min: 7.5, audioAt: 2.6,
      html: () => `<div class="ab vig"></div><div class="ab leak"></div><canvas class="cv grain" width="240" height="135"></canvas>
        <div class="ab bar bt"></div><div class="ab bar bb"></div><div class="wrp"><div class="ab c pre">ПРИ УЧАСТИИ</div><div class="ab c nk" data-f="nick"></div><div class="ab c am" data-f="amt"></div></div><div class="ab sub" data-f="msg"></div>`,
      fill: (st, d) => {
        const nk = st.querySelector('[data-f=nick]'); nk.textContent = d.nick.toUpperCase();
        nk.style.letterSpacing = '.2em'; nk.style.whiteSpace = 'nowrap'; nk.style.left = '0'; nk.style.right = '0'; fit(nk, 440, 12);
        st.querySelector('[data-f=amt]').textContent = money(d);
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? '— ' + trunc(d.msg, 100) + ' —' : ''; m.style.padding = '0 30px'; fit(m, 440, 8);
      },
      start: (st, d, tok) => {
        const c = st.querySelector('.grain'), x = c.getContext('2d'), img = x.createImageData(240, 135); let n = 0;
        loop(tok, () => { if (++n % 2) return; for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } x.putImageData(img, 0, 0); });
      },
    },
    /* ---------- уведомление из банка (малый алерт) ---------- */
    notif: {
      compact: true, w: 576, h: 260, min: 6, audioAt: 0.9,
      html: () => `<div class="ab bk"></div><div class="ab bn"><div class="ab ic"><img src="alert-assets/coin.png" alt=""></div>
        <div class="tt">ЗАЧИСЛЕНИЕ<span>сейчас</span></div><div class="l1">+<span data-f="cnt">0</span> <span data-f="cur"></span> <b data-f="nick"></b></div><div class="l2" data-f="msg"></div><div class="ab bar"></div></div>`,
      fill: (st, d) => {
        st.querySelector('[data-f=cur]').textContent = curOf(d); const nb = st.querySelector('[data-f=nick]'); nb.textContent = 'от ' + d.nick;
        const m = st.querySelector('[data-f=msg]'); m.textContent = d.msg ? '«' + trunc(d.msg, 120) + '»' : '';
        const l1 = st.querySelector('.l1'); let fs = 29; while (l1.scrollHeight > 40 && fs > 14) { fs -= 1; l1.style.fontSize = fs + 'px'; }
      },
      start: (st, d, tok, hold) => {
        const bn = st.querySelector('.bn'), bk = st.querySelector('.bk'), ic = st.querySelector('.ic img'), l2 = st.querySelector('.l2'), bar = st.querySelector('.bar');
        const A = (el, kf, o) => { try { return el.animate(kf, Object.assign({ fill: 'both' }, o)); } catch (_) { return null; } };
        A(bn, [{ transform: 'translateY(-300px)' }, { transform: 'none' }], { duration: 750, delay: 100, easing: 'cubic-bezier(.2,1.4,.4,1)' });
        A(bk, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 500 });
        A(bn, [{ transform: 'none' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 450, delay: 1100 });
        A(ic, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(720deg)' }], { duration: 1200, delay: 600, easing: 'cubic-bezier(.2,.8,.3,1)' });
        A(l2, [{ opacity: 0, maxHeight: '0px', marginTop: '0px' }, { opacity: 1, maxHeight: '90px', marginTop: '10px' }], { duration: 500, delay: 1900, easing: 'ease-out' });
        A(bar, [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0)', opacity: 1 }], { duration: Math.max(1500, (hold - 2.4) * 1000), delay: 2100, easing: 'linear' });
        const cnt = st.querySelector('[data-f=cnt]'); countUp(tok, d, 0.9, 0.7, (s) => { cnt.textContent = s; });
      },
    },
  };

  /** Позиция малого алерта по настройке: top | top-right | bottom-right | bottom-left | bottom. */
  function place(st, L, c) {
    const k = 1.1 * clamp((c.scale || 100) / 100, 0.4, 1.8), w = L.w * k, h = L.h * k, m = 40;
    const pos = c.lookPos || 'top';
    let left = (1920 - w) / 2, top = m;
    if (pos === 'top-right') { left = 1920 - w - m; top = m; }
    else if (pos === 'bottom-right') { left = 1920 - w - m; top = 1080 - h - m; }
    else if (pos === 'bottom-left') { left = m; top = 1080 - h - m; }
    else if (pos === 'bottom') { top = 1080 - h - m; }
    st.style.width = L.w + 'px'; st.style.height = L.h + 'px';
    st.style.left = left + 'px'; st.style.top = top + 'px'; st.style.transform = `scale(${k})`;
  }

  async function run(item, h) {
    const c = item.card, name = LOOKS[c.dlook] ? c.dlook : 'arcade', L = LOOKS[name];
    FONTS.forEach((f) => { try { if (typeof ensureFontLoaded === 'function') ensureFontLoaded(f); } catch (_) {} });
    const root = getLayer(); root.innerHTML = ''; root.style.opacity = '1'; root.style.transition = ''; root.style.display = 'block';
    const d = { nick: c.username || 'Аноним', amountText: c.amountText || '', amount: c.amount, msg: c.message || '' };
    const st = document.createElement('div'); st.className = 'dl-st dl-' + name;
    if (L.compact) place(st, L, c); else st.style.transform = 'scale(4)';
    st.innerHTML = L.html(d, c); if (L.fill) L.fill(st, d, c); root.appendChild(st);
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(700)]); } catch (_) {}
    if (L.fill) L.fill(st, d, c); // повторно: после загрузки шрифтов размеры могли измениться
    let dur = 0; if (item.audio) dur = await h.audioDuration(item.audio);
    const hold = clamp(Math.max(L.min, c.holdMin || 0, dur ? dur + L.audioAt + 0.9 : 0), L.min, Math.max(c.holdMax || 25, L.min));
    const tok = { dead: false };
    h.sfx(c.soundFly);
    st.classList.add('run'); if (L.start) L.start(st, d, tok, hold);
    const at = setTimeout(() => { if (!tok.dead) { h.sfx(c.soundLand); if (item.audio) h.playAudio(item.audio); } }, L.audioAt * 1000);
    const end = performance.now() + hold * 1000;
    while (performance.now() < end) { if (h.takeSkip()) break; await sleep(40); }
    clearTimeout(at);
    root.style.transition = 'opacity .5s'; root.style.opacity = '0'; await sleep(550);
    tok.dead = true; h.stopAudio(); hide();
  }
  function hide() { if (layer) { layer.style.display = 'none'; layer.innerHTML = ''; layer.style.transition = ''; layer.style.opacity = '1'; } }

  window.DonationLooks = { NAMES, run, hide };
})();
