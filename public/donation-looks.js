// public/donation-looks.js — виды алерта доната: аркада, терминал, лут, взлом эфира, золотой дождь, салют, кино, уведомление.
// Подключается из donationalert.js: window.DonationLooks.run(item, helpers). Каждая сцена рисуется в 480x270 и увеличивается до 1920x1080
// (холсты — в полном разрешении), «уведомление» — малый алерт (≈30% экрана) в углу/по центру (card.lookPos).
(function () {
  const R = Math.random;
  const anim = (el, kf, o) => { try { return el.animate(kf, Object.assign({ fill: 'both', easing: 'ease-out' }, o)); } catch (_) { return null; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FONTS = ['Rubik', 'Bebas Neue', 'Oswald', 'IBM Plex Mono', 'Press Start 2P', 'Pacifico'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAMES = ['custom', 'f_neon', 'f_chat', 'f_load', 'f_vinyl', 'f_call', 'f_news', 'f_stars', 's_rings', 's_cake', 's_activity', 's_rocket', 's_level', 'arcade', 'terminal', 'loot', 'hijack', 'goldrain', 'fireworks', 'cinema', 'notif'];

  /* ---- подписки: палитра по тиру и общий текстовый блок ---- */
  const SPAL = { 0: ['#3aa8ff', '#a8d8ff', '#124f8f'], 1: ['#a970ff', '#d6bbff', '#4a2899'], 2: ['#2fd6c4', '#a6f5ec', '#0b6d63'], 3: ['#ffb62e', '#ffe19a', '#9a5a00'] };
  const rnd = (s) => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const subCtx = (c) => { const s = c.sub || {}, tn = SPAL[s.tn] ? s.tn : 1, p = SPAL[tn]; return { s, tn, col: p[0], lt: p[1], dk: p[2], n: Math.max(1, s.n | 0), gift: s.type === 'gift', type: s.type, streak: s.streak | 0 }; };
  const stxt = () => '<div class="sx"><i data-f="kick"></i><b data-f="nick"></b><em data-f="big"></em><span data-f="line"></span></div>';
  function sfill(st, d, c) {
    const x = subCtx(c), q = (f) => st.querySelector('[data-f=' + f + ']');
    q('kick').textContent = x.s.kick || ''; q('kick').style.color = x.lt; q('nick').textContent = d.nick; q('nick').style.fontSize = ''; fit(q('nick'), 262, 16);
    q('big').textContent = x.s.big || ''; q('big').style.color = x.col; q('line').textContent = x.s.line || '';
  }
  const stIn = (st, at) => st.querySelectorAll('.sx > *').forEach((e, i) => anim(e, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: at + i * 130 }));

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
    /* ---------- стандартный алерт: своя картинка/гиф + звук + текст ---------- */
    custom: {
      std: true, min: 2, audioAt: 0.3,
      html: (d, c) => {
        const u = c.custom || {};
        return `<div class="cu cu-${esc(u.pos || 'center')} cu-a-${esc(u.anim || 'zoom')}" style="--cf:${Number(u.fontSize) || 56}px;--cc:${esc(u.color || '#fff')};--ca:${esc(u.accent || '#ffd36b')};--ci:${Number(u.imgSize) || 40}%${u.font ? ";font-family:'" + esc(u.font) + "',Rubik,sans-serif" : ''}">
          ${u.image ? `<img class="cu-img" src="${esc(u.image)}" alt="">` : ''}<div class="cu-t" data-f="t"></div><div class="cu-m" data-f="msg"></div></div>`;
      },
      fill: (st, d, c) => {
        const u = c.custom || {}, t = st.querySelector('[data-f=t]');
        const parts = String(u.text || '{nick} — {amount}').split(/(\{nick\}|\{amount\})/);
        t.textContent = '';
        parts.forEach((p) => { if (!p) return; const sp = document.createElement('span'); if (p === '{nick}') { sp.textContent = d.nick; sp.className = 'cu-n'; } else if (p === '{amount}') { sp.textContent = d.amountText; sp.className = 'cu-a'; } else sp.textContent = p; t.appendChild(sp); });
        const m = st.querySelector('[data-f=msg]'); m.textContent = u.showMsg !== false && d.msg ? d.msg : '';
      },
    },

    /* ================= алерты фолловера (малые, 576x324) ================= */
    /* неоновая вывеска */
    f_neon: {
      compact: true, w: 576, h: 324, k: 1, min: 6, audioAt: 1.2,
      html: () => `<div class="ab bd"><div class="ab w">Welcome</div><div class="ab nn" data-f="nick"></div><div class="ab tb"></div></div>`,
      fill: (st, d) => { const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick.toUpperCase(); fit(n, 430, 14); },
      start: (st) => {
        const A = anim, fl = (el, dl) => A(el, [{ opacity: .12, offset: 0 }, { opacity: 1, offset: .05 }, { opacity: .15, offset: .12 }, { opacity: 1, offset: .2 }, { opacity: .3, offset: .3 }, { opacity: 1, offset: .42 }, { opacity: 1 }], { duration: 1000, delay: dl });
        A(st.querySelector('.bd'), [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 100 });
        fl(st.querySelector('.w'), 700); fl(st.querySelector('.nn'), 1600);
        A(st.querySelector('.tb'), [{ opacity: .12 }, { opacity: 1 }], { duration: 300, delay: 2400 });
        A(st.querySelector('.w'), [{ opacity: 1 }, { opacity: .82 }, { opacity: 1 }], { duration: 240, delay: 3400, iterations: 6, fill: 'forwards' });
      },
    },
    /* чат: «печатает…» */
    f_chat: {
      compact: true, w: 576, h: 324, k: 1, min: 6, audioAt: 2.3,
      html: () => `<div class="ab ch"><div class="ab tg">НОВЫЙ ФОЛЛОВЕР</div><div class="ab av" data-f="av"></div><div class="ab bb"><div class="bn" data-f="nick"></div><div class="dt"><i></i><i></i><i></i></div><div class="tm" style="display:none">Я теперь с вами! Всем привет!</div></div></div>`,
      fill: (st, d) => { st.querySelector('[data-f=av]').textContent = (d.nick[0] || '?').toUpperCase(); const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick; },
      start: (st, d, tok) => {
        anim(st.querySelector('.ch'), [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 100, easing: 'cubic-bezier(.2,1.4,.4,1)' });
        anim(st.querySelector('.tg'), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 400 });
        setTimeout(() => { if (tok.dead) return; st.querySelector('.dt').style.display = 'none'; const t = st.querySelector('.tm'); t.style.display = 'block'; anim(st.querySelector('.bb'), [{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.2,1.6,.4,1)' }); }, 2300);
      },
    },
    /* загрузка друга */
    f_load: {
      compact: true, w: 576, h: 324, k: 1, min: 6, audioAt: 2.8,
      html: () => `<div class="ab pn"><div class="t">ДОБАВЛЕНИЕ В ДРУЗЬЯ КАНАЛА</div><div class="n" data-f="nick"></div><div class="ab pc" data-f="pc">0%</div>
        <svg class="ab ok" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6dffa0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg><div class="ab tr"><div class="ab fl"></div></div></div>`,
      fill: (st, d) => { const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick; fit(n, 390, 14); },
      start: (st, d, tok) => {
        const fl = st.querySelector('.fl'), pc = st.querySelector('[data-f=pc]'), ok = st.querySelector('.ok'), pa = ok.querySelector('path');
        anim(st.querySelector('.pn'), [{ opacity: 0, transform: 'translateY(-50px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 100, easing: 'cubic-bezier(.2,1.4,.4,1)' });
        const pts = [[0, 0], [.7, 0], [1.4, .35], [2.1, .62], [2.7, 1]]; // t(c) → доля заполнения
        const frac = (t) => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const a = pts[i - 1], b = pts[i], k = (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; } return 1; };
        const t0 = performance.now() + 700; let done = false;
        (function f(now) { if (tok.dead) return; const t = (now - t0) / 1000 + 0.7, v = frac(Math.max(0, t)); fl.style.transform = `scaleX(${v})`; pc.textContent = Math.round(v * 100) + '%';
          if (v >= 1 && !done) { done = true; fl.style.background = '#43e08a'; pc.style.opacity = 0; ok.style.opacity = 1; try { const L = pa.getTotalLength(); pa.style.strokeDasharray = L; anim(pa, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 450, easing: 'ease-out' }); } catch (_) {} return; }
          requestAnimationFrame(f); })(performance.now());
      },
    },
    /* виниловая пластинка */
    f_vinyl: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.6,
      html: () => `<div class="ab slv"></div><div class="ab recw"><div class="ab rec"><div class="ab lab" data-f="lab"></div></div></div><div class="ab arm"></div><div class="ab eq"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="ab tt"><div class="k">СЕЙЧАС ИГРАЕТ</div><div class="n" data-f="nick"></div><div class="s">новый фолловер канала</div></div>`,
      fill: (st, d) => { st.querySelector('[data-f=lab]').textContent = d.nick.slice(0, 10).toUpperCase(); const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick; fit(n, 200, 14); },
      start: (st) => {
        anim(st.querySelector('.slv'), [{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 100 });
        anim(st.querySelector('.recw'), [{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
        anim(st.querySelector('.arm'), [{ opacity: 0, transform: 'rotate(-35deg)' }, { opacity: 1, transform: 'rotate(-35deg)', offset: .2 }, { opacity: 1, transform: 'rotate(12deg)' }], { duration: 800, delay: 1000, easing: 'ease-in-out' });
        anim(st.querySelector('.tt'), [{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 1600 });
        st.querySelectorAll('.eq i').forEach((e, i) => anim(e, [{ transform: 'scaleY(.12)' }, { transform: 'scaleY(' + (.5 + R() * .5) + ')' }], { duration: 180 + R() * 160, delay: 1800 + i * 50, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
      },
    },
    /* входящий вызов */
    f_call: {
      compact: true, w: 576, h: 324, k: 1, min: 6, audioAt: 2.6,
      html: () => `<div class="ab cl"><div class="ab av" data-f="av"></div><div class="ab tx"><b data-f="nick"></b><i data-f="st">входящий вызов · Канал…</i></div>
        <div class="ab bt bx" style="right:88px;background:#ff3b30"><svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M12 8c-3 0-6 1-8 3l1.5 2.5 3-1.5v-2c1-.3 2.5-.5 3.5-.5s2.5.2 3.5.5v2l3 1.5L20 11c-2-2-5-3-8-3z"/></svg></div>
        <div class="ab bt ba" style="right:20px;background:#34c759"><svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.5.55 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.2.2 2.4.55 3.5a1 1 0 01-.25 1z"/></svg></div>
        <div class="ab wv"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`,
      fill: (st, d) => { st.querySelector('[data-f=av]').textContent = (d.nick[0] || '?').toUpperCase(); const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick; fit(n, 250, 14); },
      start: (st, d, tok) => {
        anim(st.querySelector('.cl'), [{ opacity: 0, transform: 'translateY(-130px)' }, { opacity: 1, transform: 'none' }], { duration: 550, delay: 100, easing: 'cubic-bezier(.2,1.5,.4,1)' });
        anim(st.querySelector('.ba'), [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }], { duration: 350, delay: 800, iterations: 8, direction: 'alternate', fill: 'none' });
        setTimeout(() => { if (tok.dead) return; anim(st.querySelector('.bx'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.5)' }], { duration: 250 }); anim(st.querySelector('.ba'), [{ opacity: 1 }, { opacity: 0 }], { duration: 250 }); st.querySelector('[data-f=st]').textContent = 'соединено · 00:01'; anim(st.querySelector('.wv'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); }, 2500);
        st.querySelectorAll('.wv i').forEach((e, i) => anim(e, [{ transform: 'scaleY(.15)' }, { transform: 'scaleY(' + (.4 + R() * .6) + ')' }], { duration: 140 + R() * 120, delay: i * 20, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
      },
    },
    /* газетная вырезка */
    f_news: {
      compact: true, w: 576, h: 324, k: 1, min: 6, audioAt: 1.7,
      html: () => `<div class="ab np"><div class="mh">ВЕСТНИК КАНАЛА</div><div class="dt"><span>Экстренный выпуск</span><span data-f="no"></span></div><div class="hl" data-f="nick"></div><div class="cols"><i></i><i></i><i></i></div><div class="ab stp">СРОЧНО</div></div>`,
      fill: (st, d, c) => { st.querySelector('[data-f=no]').textContent = c.followNo ? 'Фолловер № ' + c.followNo : ''; const h = st.querySelector('[data-f=nick]'); h.textContent = d.nick + ' теперь с нами!'; let fs = 38; while (h.scrollHeight > 100 && fs > 16) { fs -= 2; h.style.fontSize = fs + 'px'; } },
      start: (st) => {
        const n = st.querySelector('.np');
        anim(n, [{ opacity: 0, transform: 'scale(0) rotate(-900deg)' }, { opacity: 1, transform: 'scale(1) rotate(-3deg)' }], { duration: 1200, delay: 100 });
        anim(n, [{ transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }], { duration: 800, delay: 1300, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', fill: 'forwards' });
        anim(st.querySelector('.stp'), [{ opacity: 0, transform: 'rotate(-12deg) scale(2.5)' }, { opacity: 1, transform: 'rotate(-12deg) scale(1)' }], { duration: 220, delay: 1700, easing: 'cubic-bezier(.6,0,1,.6)' });
      },
    },
    /* созвездие фолловеров */
    f_stars: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.9,
      html: () => {
        const P = [[130, 90], [200, 140], [260, 80], [340, 120], [420, 80], [170, 200], [400, 190]], L2 = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [3, 6]], nw = [300, 190];
        let h = '<div class="ab sky"></div><svg class="ab sv" viewBox="0 0 576 324" width="576" height="324">';
        L2.forEach(([a, b]) => { h += `<line class="gl" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="#8da2ff" stroke-width="1.2"/>`; });
        P.forEach((p, i) => { h += `<circle class="gs" cx="${p[0]}" cy="${p[1]}" r="${2.5 + (i % 3)}" fill="#dfe6ff"/>`; });
        h += `<line class="nl" x1="${nw[0]}" y1="${nw[1]}" x2="${P[3][0]}" y2="${P[3][1]}" stroke="#ffe08a" stroke-width="2"/><line class="nl" x1="${nw[0]}" y1="${nw[1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="#ffe08a" stroke-width="2"/>`;
        h += `<circle class="rg" cx="${nw[0]}" cy="${nw[1]}" r="10" fill="none" stroke="#ffe08a" stroke-width="2"/><circle class="nc" cx="${nw[0]}" cy="${nw[1]}" r="7" fill="#fff3b8"/></svg><div class="ab lbl"><b data-f="nick"></b><i>НОВАЯ ЗВЕЗДА В СОЗВЕЗДИИ КАНАЛА</i></div>`;
        return h;
      },
      fill: (st, d) => { const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick; fit(n, 420, 14); },
      start: (st) => {
        anim(st.querySelector('.sky'), [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 100 });
        st.querySelectorAll('.gs').forEach((e, i) => anim(e, [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, delay: 500 + i * 80 }));
        st.querySelectorAll('.gl').forEach((e, i) => anim(e, [{ opacity: 0 }, { opacity: .5 }], { duration: 500, delay: 900 + i * 100 }));
        anim(st.querySelector('.nc'), [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 400, delay: 1800, easing: 'cubic-bezier(.2,1.6,.4,1)' });
        anim(st.querySelector('.rg'), [{ opacity: 1, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(5)' }], { duration: 800, delay: 1900, easing: 'ease-out' });
        st.querySelectorAll('.nl').forEach((e, i) => anim(e, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 2200 + i * 200 }));
        anim(st.querySelector('.nc'), [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }], { duration: 500, delay: 2800, iterations: 4, direction: 'alternate', easing: 'ease-in-out', fill: 'forwards' });
        anim(st.querySelector('.lbl'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 2500 });
      },
    },
    /* ================= алерты подписок (малые, 576x324): меняются от тира, месяцев, типа ================= */
    s_rings: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.4,
      html: (d, c) => {
        const x = subCtx(c), R = Math.min(x.n, 14);
        let h = '<div class="sbg"></div><svg class="ab sv" viewBox="0 0 576 324" width="576" height="324"><circle cx="150" cy="162" r="124" fill="' + x.dk + '" opacity=".6"/><circle class="r0" cx="150" cy="162" r="118" fill="' + x.col + '"/><circle cx="150" cy="162" r="118" fill="' + x.lt + '" opacity=".35"/>';
        for (let i = R; i >= 1; i--) h += `<circle class="rr" cx="150" cy="162" r="${(8 + i * (104 / R)).toFixed(1)}" fill="none" stroke="${x.dk}" stroke-width="${i === R ? 3.2 : 1.6}" opacity="${i === R ? 1 : .55}" data-o="${i === R ? 1 : .55}"/>`;
        return h + `<circle cx="150" cy="162" r="5" fill="${x.dk}"/><path d="M150 162L262 112" stroke="${x.dk}" stroke-width="1.5" opacity=".35"/></svg>` + stxt();
      },
      fill: sfill,
      start: (st) => {
        anim(st.querySelector('.r0'), [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 500, delay: 100, easing: 'cubic-bezier(.2,1.5,.4,1)' });
        const rr = [...st.querySelectorAll('.rr')].reverse();
        rr.forEach((e, i) => anim(e, [{ opacity: 0, transform: 'scale(0)' }, { opacity: +e.dataset.o, transform: 'scale(1)' }], { duration: 400, delay: 500 + i * 110, easing: 'cubic-bezier(.2,1.8,.4,1)' }));
        stIn(st, 1000);
        anim(rr[rr.length - 1], [{ filter: 'none' }, { filter: 'drop-shadow(0 0 8px #fff)' }], { duration: 400, delay: 1800, iterations: 8, direction: 'alternate', fill: 'none' });
      },
    },
    s_cake: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.3,
      html: (d, c) => {
        const x = subCtx(c), L = Math.max(1, x.tn || 1), cn = Math.min(x.n, 12);
        let h = '<div class="sbg"></div><svg class="ab sv" viewBox="0 0 576 324" width="576" height="324"><g class="ck"><ellipse cx="150" cy="274" rx="112" ry="14" fill="rgba(0,0,0,.35)"/>';
        for (let i = 0; i < L; i++) { const w = 190 - i * 40, y = 248 - i * 50, x0 = 150 - w / 2; h += `<rect x="${x0}" y="${y}" width="${w}" height="48" rx="10" fill="${i % 2 ? x.dk : x.col}"/><path d="M${x0} ${y + 12}q${w / 8} 14 ${w / 4} 0t${w / 4} 0t${w / 4} 0t${w / 4} 0" fill="${x.lt}" opacity=".85"/>`; }
        const ty = 248 - (L - 1) * 50, tw = 190 - (L - 1) * 40;
        for (let i = 0; i < cn; i++) { const cx = 150 - tw / 2 + 16 + (i + .5) * ((tw - 32) / cn); h += `<rect x="${cx - 2.5}" y="${ty - 26}" width="5" height="26" fill="#fff"/><rect x="${cx - 2.5}" y="${ty - 26}" width="5" height="5" fill="${x.col}"/><g class="fm" style="transform-origin:${cx}px ${ty - 26}px"><ellipse cx="${cx}" cy="${ty - 34}" rx="4" ry="8" fill="#ffb02e"/><ellipse cx="${cx}" cy="${ty - 32}" rx="2" ry="4.5" fill="#fff3b8"/></g>`; }
        return h + '</g></svg>' + stxt();
      },
      fill: sfill,
      start: (st) => {
        anim(st.querySelector('.ck'), [{ opacity: 0, transform: 'translateY(-260px)', offset: 0 }, { opacity: 1, transform: 'translateY(0)', offset: .55 }, { transform: 'translateY(-34px)', offset: .72 }, { transform: 'translateY(0)', offset: .86 }, { transform: 'translateY(-9px)', offset: .94 }, { transform: 'translateY(0)', offset: 1 }], { duration: 900, delay: 200, easing: 'ease-in' });
        st.querySelectorAll('.fm').forEach((e, i) => { anim(e, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 250, delay: 1100 + i * 110, easing: 'cubic-bezier(.2,1.6,.4,1)' }); anim(e, [{ transform: 'scale(1,1)' }, { transform: 'scale(1,1.22)' }], { duration: 180, delay: 1900 + i * 50, iterations: 30, direction: 'alternate', easing: 'ease-in-out', fill: 'forwards' }); });
        stIn(st, 900);
      },
    },
    s_activity: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.4,
      html: (d, c) => {
        const x = subCtx(c), R = [110, 82, 54], cs = [x.col, x.lt, '#ffd35a'];
        const f = x.gift ? [Math.min(x.n, 10) / 10, Math.min(x.n, 10) / 10, Math.max(x.tn, .6) / 3] : [(x.n % 12 || 12) / 12, x.streak > 0 ? Math.min(1, x.streak / x.n) : 1, Math.max(x.tn, .6) / 3];
        let h = '<div class="sbg"></div><svg class="ab sv" viewBox="0 0 576 324" width="576" height="324">';
        R.forEach((r, i) => { const L = 2 * Math.PI * r; h += `<circle cx="150" cy="162" r="${r}" fill="none" stroke="${cs[i]}" stroke-opacity=".18" stroke-width="20"/><circle class="rg" data-l="${L}" data-f="${f[i]}" cx="150" cy="162" r="${r}" fill="none" stroke="${cs[i]}" stroke-width="20" stroke-linecap="round" transform="rotate(-90 150 162)" stroke-dasharray="${L}" stroke-dashoffset="${L}"/>`; });
        h += `<text class="cn" x="150" y="178" font-size="52" font-weight="800" fill="#fff" text-anchor="middle" font-family="Rubik,sans-serif">0</text><text x="150" y="198" font-size="11" font-weight="600" fill="${x.lt}" text-anchor="middle" font-family="Rubik,sans-serif">${esc(x.gift ? 'подарено' : (x.n % 10 === 1 && x.n !== 11 ? 'месяц' : (x.n % 10 > 1 && x.n % 10 < 5 && (x.n < 10 || x.n > 20) ? 'месяца' : 'месяцев')))}</text>`;
        const lg = [x.gift ? 'подарено сообществу' : x.n + ' из 12 до года', x.gift ? 'подарочные подписки' : (x.streak > 1 ? 'серия подряд: ' + x.streak : 'серия подряд'), x.s.tname || ''];
        lg.forEach((t, i) => { h += `<circle cx="304" cy="${250 + i * 22}" r="5" fill="${cs[i]}"/><text x="318" y="${255 + i * 22}" font-size="13" fill="#e6dde9" font-family="Rubik,sans-serif">${esc(t)}</text>`; });
        return h + '</svg>' + stxt();
      },
      fill: sfill,
      start: (st, d, tok, hold) => {
        st.querySelectorAll('.rg').forEach((e, i) => { const L = +e.dataset.l; anim(e, [{ strokeDashoffset: L }, { strokeDashoffset: L * (1 - +e.dataset.f) }], { duration: 1300, delay: 300 + i * 250, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
        const cn = st.querySelector('.cn'), N = subCtx({ sub: (d.sub) }).n, t0 = performance.now() + 400;
        (function f(t) { if (tok.dead) return; const k = clamp((t - t0) / 1200, 0, 1); cn.textContent = Math.round(N * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(performance.now());
        stIn(st, 900);
      },
    },
    s_rocket: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.2,
      html: (d, c) => {
        const x = subCtx(c), eng = Math.max(1, x.tn), H = Math.min(x.n, 24) / 24, fy = 250 - H * 170;
        let h = '<div class="sbg"></div><svg class="ab sv" viewBox="0 0 576 324" width="576" height="324">';
        for (let i = 0; i < 22; i++) h += `<circle cx="${(rnd(i) * 290).toFixed(0)}" cy="${(rnd(i + 50) * 300).toFixed(0)}" r="${(.6 + rnd(i + 9) * 1.4).toFixed(1)}" fill="#fff" opacity=".5"/>`;
        h += `<ellipse cx="150" cy="290" rx="90" ry="10" fill="#000" opacity=".4"/><rect class="tr" x="145" y="${fy}" width="10" height="${280 - fy}" fill="${x.col}" opacity=".5" rx="5"/>`;
        for (let k = 0; k <= 4; k++) { const yy = 250 - k * 42.5; h += `<line x1="40" y1="${yy}" x2="58" y2="${yy}" stroke="${x.lt}" stroke-width="2" opacity=".6"/><text x="34" y="${yy + 4}" font-size="10" font-weight="600" fill="${x.lt}" text-anchor="end" font-family="Rubik,sans-serif">${k * 6}</text>`; }
        h += `<g class="rk" style="transform:translate(150px,${fy}px)" data-fy="${fy}"><g class="fl">`;
        for (let i = 0; i < eng; i++) { const o = (i - (eng - 1) / 2) * 16; h += `<g class="fm" style="transform-origin:${o}px 0"><path d="M${o - 6} 0Q${o} 40 ${o + 6} 0z" fill="#ffb02e"/><path d="M${o - 3} 0Q${o} 24 ${o + 3} 0z" fill="#fff3b8"/></g>`; }
        h += `</g><path d="M0-66C20-46 20-14 16 0H-16C-20-14-20-46 0-66z" fill="#e9eef8"/><path d="M0-66C-14-46-14-14-16 0H0z" fill="#fff" opacity=".5"/><circle cx="0" cy="-36" r="9" fill="${x.col}" stroke="${x.dk}" stroke-width="3"/><path d="M-16 0l-16 22V0z M16 0l16 22V0z" fill="${x.col}"/><rect x="-18" y="-4" width="36" height="8" fill="${x.dk}"/></g></svg>`;
        return h + stxt();
      },
      fill: sfill,
      start: (st) => {
        const rk = st.querySelector('.rk'), fy = +rk.dataset.fy, dur = 1800, dl = 400, ez = 'cubic-bezier(.5,0,1,.6)';
        anim(rk, [{ transform: 'translate(150px,300px)' }, { transform: `translate(150px,${fy}px)` }], { duration: dur, delay: dl, easing: ez });
        anim(st.querySelector('.tr'), [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: dur, delay: dl, easing: ez, transformOrigin: 'bottom' });
        st.querySelector('.tr').style.cssText += ';transform-box:fill-box;transform-origin:bottom';
        st.querySelectorAll('.fm').forEach((e) => anim(e, [{ transform: 'scaleY(.6)' }, { transform: 'scaleY(1.5)' }], { duration: 120, iterations: 60, direction: 'alternate', fill: 'both' }));
        anim(st.querySelector('.fl'), [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 200 });
        anim(rk, [{ transform: `translate(150px,${fy}px)` }, { transform: `translate(150px,${fy + 5}px)` }], { duration: 300, delay: dl + dur, iterations: 8, direction: 'alternate', easing: 'ease-in-out', fill: 'forwards' });
        stIn(st, 1200);
      },
    },
    s_level: {
      compact: true, w: 576, h: 324, k: 1, min: 6.5, audioAt: 1.3,
      html: (d, c) => {
        const x = subCtx(c), xp = Math.round((x.n % 12 || 12) / 12 * 10);
        let seg = ''; for (let i = 0; i < 10; i++) seg += `<i class="${i < xp ? 'on' : ''}"></i>`;
        const rank = ['РЕКРУТ', 'СТРАЖ', 'РЫЦАРЬ', 'ЛЕГЕНДА'][x.tn];
        return `<div class="lvp" style="--c:${x.col};--l:${x.lt}"><div class="lvi"></div><div class="lvt">${x.gift ? 'GIFT DROP!' : x.type === 'new' ? 'NEW PLAYER!' : 'LEVEL UP!'}</div><div class="lvn" data-f="nick"></div><div class="lvl">${x.gift ? '+' + x.n : 'LV ' + x.n}</div><div class="lvr">${rank} · ${esc(x.s.tname || '')}</div><div class="lvx">${seg}</div></div>`;
      },
      fill: (st, d) => { const n = st.querySelector('[data-f=nick]'); n.textContent = d.nick; n.style.fontSize = ''; fit(n, 440, 14); },
      start: (st) => {
        anim(st.querySelector('.lvp'), [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 250, delay: 100 });
        anim(st.querySelector('.lvt'), [{ opacity: 0 }, { opacity: 1 }], { duration: 110, delay: 300, iterations: 8, direction: 'alternate', easing: 'steps(1)', fill: 'both' });
        ['.lvn', '.lvl', '.lvr'].forEach((q, i) => anim(st.querySelector(q), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, delay: 700 + i * 150, easing: 'cubic-bezier(.2,1.6,.4,1)' }));
        st.querySelectorAll('.lvx i').forEach((e, i) => anim(e, [{ opacity: 0 }, { opacity: 1 }], { duration: 50, delay: 1400 + i * 80, easing: 'steps(1)' }));
        const pi = st.querySelector('.lvi');
        for (let i = 0; i < 14; i++) { const p = document.createElement('b'); p.className = 'lvs'; pi.appendChild(p); anim(p, [{ opacity: 1, transform: 'translate(0,0)' }, { opacity: 0, transform: `translate(${(rnd(i) - .5) * 520}px,${(rnd(i + 7) - .5) * 240}px)` }], { duration: 1100, delay: 700, easing: 'ease-out' }); }
      },
    },
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
    const k = (L.k || 1.1) * clamp((c.scale || 100) / 100, 0.4, 1.8), w = L.w * k, h = L.h * k, m = 40;
    const pos = c.lookPos || (L.w === 576 ? 'center' : 'top');
    let left = (1920 - w) / 2, top = pos === 'center' ? (1080 - h) / 2 : m;
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
    const d = { nick: c.username || 'Аноним', amountText: c.amountText || '', amount: c.amount, msg: c.message || '', no: c.followNo || 0, sub: c.sub };
    const st = document.createElement('div'); st.className = 'dl-st dl-' + name;
    if (L.compact) place(st, L, c); else if (L.std) { st.style.cssText += ';width:1920px;height:1080px;overflow:hidden;background:transparent'; } else st.style.transform = 'scale(4)';
    st.innerHTML = L.html(d, c); if (L.fill) L.fill(st, d, c); if (name.indexOf('f_') === 0 || name.indexOf('s_') === 0) st.style.visibility = 'hidden'; root.appendChild(st);
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(700)]); } catch (_) {}
    if (L.fill) L.fill(st, d, c); // повторно: после загрузки шрифтов размеры могли измениться
    let dur = 0; if (item.audio) dur = await h.audioDuration(item.audio);
    const u = c.custom || {};
    if (u.font) { try { ensureFontLoaded(u.font); } catch (_) {} }
    let own = 0, ownAudio = null;
    if (L.std && u.audio) { ownAudio = new Audio(u.audio); ownAudio.volume = clamp((u.volume == null ? 80 : u.volume) / 100, 0, 1); own = await h.audioDuration(u.audio); }
    const voiceAt = L.std ? (own ? Math.min(own, 8) + 0.2 : 0.3) : L.audioAt;
    let hold = clamp(Math.max(L.min, c.holdMin || 0, dur ? dur + L.audioAt + 0.9 : 0), L.min, Math.max(c.holdMax || 25, L.min));
    if (L.std) hold = clamp(Math.max(Number(u.duration) || 8, dur ? dur + voiceAt + 0.8 : 0), 2, Math.max(c.holdMax || 25, Number(u.duration) || 8, 60));
    const tok = { dead: false };
    if (!L.std) h.sfx(c.soundFly);
    st.style.visibility = ''; st.classList.add('run'); if (L.start) L.start(st, d, tok, hold);
    if (ownAudio) { try { ownAudio.play().catch(() => {}); } catch (_) {} }
    const at = setTimeout(() => { if (!tok.dead) { if (!L.std) h.sfx(c.soundLand); if (item.audio) h.playAudio(item.audio); } }, voiceAt * 1000);
    const end = performance.now() + hold * 1000;
    while (performance.now() < end) { if (h.takeSkip()) break; await sleep(40); }
    clearTimeout(at); if (ownAudio) { try { ownAudio.pause(); } catch (_) {} }
    root.style.transition = 'opacity .5s'; root.style.opacity = '0'; await sleep(550);
    tok.dead = true; h.stopAudio(); hide();
  }
  function hide() { if (layer) { layer.style.display = 'none'; layer.innerHTML = ''; layer.style.transition = ''; layer.style.opacity = '1'; } }

  window.DonationLooks = { NAMES, run, hide };
})();
