// gazette-views.js — экраны «Вечернего выпуска» для OBS: афиша с титрами (credits.html), газета (gazette.html), эфир (onair.html).
// Данные приходят с сервера (/api/gazette/issue), команды «показать/скрыть» — опросом /api/gazette/state раз в секунду.
(function () {
  'use strict';
  const PAL = {
    comeback: ['#c0392b', '#e8b84a'], raid: ['#2f6fd0', '#7cc4ff'], donation: ['#b8860b', '#f0cf6a'], donationBig: ['#b8860b', '#f0cf6a'],
    donationTop: ['#b8860b', '#f0cf6a'], tech: ['#3b5ea8', '#8aa6e0'], quiet: ['#3d7a5a', '#d8c98a'], quietWord: ['#3d7a5a', '#d8c98a'],
    subWave: ['#a83a78', '#f08ac0'], stormWord: ['#7a3bb0', '#c79bf0'], stormEmote: ['#7a3bb0', '#c79bf0'], stormCause: ['#7a3bb0', '#c79bf0'],
    peak: ['#c06a1c', '#f2b36a'], deaths: ['#5a5a66', '#c0c0d0'], game: ['#2a7f8a', '#8ae0ea'], sub: ['#a83a78', '#f08ac0'],
  };
  const DEF_PAL = ['#a23b2a', '#e8b84a'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const plural = (n, f) => { n = Math.abs(n); const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? f[0] : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? f[1] : f[2]; };
  const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  const dur = (m) => (m >= 60 ? Math.floor(m / 60) + ' ч ' + (m % 60 ? (m % 60) + ' мин' : '') : m + ' мин').trim();
  const api = (path, opt) => fetch(path, opt).then((r) => r.json());
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const mix = (h, base, t) => { const a = hex(h), b = hex(base); return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join(''); };
  function palette(kind) { return PAL[kind] || DEF_PAL; }
  function applyPalette(stage, kind) {
    const p = palette(kind);
    stage.style.setProperty('--ga', p[0]); stage.style.setProperty('--gb', p[1]);
    stage.style.setProperty('--gaDark', mix(p[0], '#07070a', 0.55)); stage.style.setProperty('--gbSoft', rgba(p[1], 0.14)); stage.style.setProperty('--gaGlow', rgba(p[0], 0.6));
  }

  // --- сцена 1920×1080, подгоняется под окно ---
  const stages = new Set();
  function fitAll() { stages.forEach((st) => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); st.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`; }); }
  addEventListener('resize', fitAll);
  function makeStage(cls) { const st = el('div', 'gz-stage ' + cls); document.body.appendChild(st); stages.add(st); fitAll(); return st; }
  function dropStage(st, fast) { stages.delete(st); st.classList.remove('on'); setTimeout(() => st.remove(), fast ? 0 : 1000); }

  // --- общие заготовки ---
  function artSvg(kind, p) {
    return `<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gzg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="#1a1210"/></linearGradient></defs>
    <rect width="300" height="400" fill="url(#gzg)"/><circle cx="210" cy="130" r="70" fill="${p[0]}" opacity=".85"/><path d="M0 330L70 250l60 60 70-90 100 100v70H0z" fill="#12100e" opacity=".85"/>
    <g fill="#fff" opacity=".9"><circle cx="60" cy="60" r="2"/><circle cx="120" cy="90" r="1.6"/><circle cx="260" cy="40" r="2.2"/><circle cx="30" cy="150" r="1.4"/></g>
    <g transform="translate(150 300)" fill="#0b0908"><circle cy="-34" r="9"/><rect x="-8" y="-25" width="16" height="30" rx="4"/><rect x="-9" y="5" width="7" height="22"/><rect x="2" y="5" width="7" height="22"/><path d="M-8-22L-34-6l4 6 22-12z"/></g></svg>`;
  }
  function posterInner(issue, p) {
    if (issue.art) return `<img alt="" src="${esc(issue.art)}">`;
    return artSvg(issue.leadKind, p);
  }
  function wideVignette(kind, w) {
    const ground = '<rect y="128" width="300" height="32" fill="#8d7a52"/>';
    const man = (x, y, c) => `<g transform="translate(${x} ${y})" fill="${c || '#2a2318'}"><circle cx="0" cy="-22" r="5"/><rect x="-4" y="-17" width="8" height="16" rx="2"/><rect x="-6" y="-1" width="4" height="12"/><rect x="2" y="-1" width="4" height="12"/></g>`;
    let s = '';
    if (kind === 'comeback') s = `<rect width="300" height="160" fill="#d8c79c"/>${ground}<g class="gzBoss"><ellipse cx="150" cy="82" rx="46" ry="52" fill="#3a2f20"/><circle cx="136" cy="62" r="4" fill="#d8c79c"/><circle cx="164" cy="62" r="4" fill="#d8c79c"/></g><g class="gzHop">${man(60, 126, '#a23b2a')}</g><text x="196" y="30" font-size="20" font-weight="900" fill="#a23b2a" font-family="Playfair Display">GG!</text>`;
    else if (kind === 'raid') s = `<rect width="300" height="160" fill="#d8c79c"/>${ground}` + [0, 1, 2, 3, 4, 5, 6].map((i) => `<g class="gzFig" style="animation-delay:${-i * 0.45}s">${man(0, 126 + (i % 2) * 4)}</g>`).join('') + '<text x="12" y="28" font-size="16" font-weight="900" fill="#a23b2a" font-family="Playfair Display">РЕЙД!</text>';
    else if (/^donation/.test(kind)) s = `<rect width="300" height="160" fill="#d8c79c"/>${ground}` + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<g class="gzCoin" style="animation-delay:${-i * 0.28}s"><circle cx="${30 + i * 34}" cy="0" r="9" fill="#c9962c" stroke="#7b5a14"/><text x="${30 + i * 34}" y="4" text-anchor="middle" font-size="10" fill="#5b410d" font-weight="700">₽</text></g>`).join('');
    else if (kind === 'tech') s = '<rect width="300" height="160" fill="#2a2318"/>' + [10, 40, 62, 95, 120].map((y, i) => `<rect class="gzGlt" style="animation-delay:${i * 0.13}s" x="20" y="${y}" width="${150 + i * 18}" height="10" fill="#d8c79c" opacity=".55"/>`).join('') + '<text x="150" y="86" text-anchor="middle" font-size="22" font-weight="900" fill="#e8dcc0" font-family="Playfair Display">НЕТ СИГНАЛА</text>';
    else if (kind === 'quiet' || kind === 'quietWord') s = `<rect width="300" height="160" fill="#b9a67a"/><circle cx="230" cy="40" r="20" fill="#f1e8d3"/>${ground}<rect x="60" y="100" width="42" height="30" rx="4" fill="#3a2f20"/><path d="M102 106q16 0 0 16" stroke="#3a2f20" stroke-width="5" fill="none"/>` + [0, 1, 2].map((i) => `<path class="gzSteam" style="animation-delay:${i * 0.8}s" d="M${72 + i * 12} 96q-6-8 0-16t0-14" stroke="#f1e8d3" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('');
    else s = `<rect width="300" height="160" fill="#d8c79c"/>${ground}` + [0, 1, 2, 3, 4].map((i) => `<g class="gzBub" style="animation-delay:${-i * 0.8}s"><rect x="${28 + i * 52}" y="110" width="${34 + w.length * 4}" height="22" rx="10" fill="#f1e8d3" stroke="#2a2318"/><text x="${28 + i * 52 + (34 + w.length * 4) / 2}" y="125" text-anchor="middle" font-size="12" font-weight="700" fill="#2a2318">${esc(w)}</text></g>`).join('');
    return `<svg viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice">${s}</svg>`;
  }
  // анимации виньеток (один раз на страницу)
  function injectVignetteCss() {
    if (document.getElementById('gzVigCss')) return;
    const st = el('style'); st.id = 'gzVigCss';
    st.textContent = '.gzFig{animation:gzRun 3.2s linear infinite}@keyframes gzRun{from{transform:translateX(-40px)}to{transform:translateX(330px)}}.gzCoin{animation:gzFall 2.2s ease-in infinite}@keyframes gzFall{from{transform:translateY(-30px)}to{transform:translateY(190px)}}.gzBoss{transform-origin:150px 140px;animation:gzBoss 4s ease-in infinite}@keyframes gzBoss{0%,55%{transform:rotate(0)}70%{transform:rotate(-4deg)}100%{transform:rotate(-82deg) translateX(-20px)}}.gzHop{animation:gzHop 1s ease-in-out infinite}@keyframes gzHop{50%{transform:translateY(-14px)}}.gzGlt{animation:gzGlt .7s steps(3) infinite}@keyframes gzGlt{33%{transform:translateX(14px)}66%{transform:translateX(-10px)}}.gzSteam{animation:gzSteam 2.6s ease-in-out infinite}@keyframes gzSteam{from{transform:translateY(8px);opacity:0}50%{opacity:.8}to{transform:translateY(-14px);opacity:0}}.gzBub{animation:gzBub 4s ease-out infinite}@keyframes gzBub{from{transform:translateY(40px);opacity:0}25%{opacity:1}to{transform:translateY(-110px);opacity:0}}';
    document.head.appendChild(st);
  }

  // --- фон: угольки и зерно плёнки ---
  function startFx(stage, p, withGrain) {
    const cv = el('canvas', 'gz-fx'); cv.width = 960; cv.height = 540; stage.appendChild(cv);
    const ctx = cv.getContext('2d');
    const parts = Array.from({ length: 70 }, () => ({ x: Math.random() * 960, y: Math.random() * 540, r: 0.8 + Math.random() * 2.2, vy: 6 + Math.random() * 18, dx: (Math.random() - 0.5) * 8, ph: Math.random() * 6.28 }));
    let raf = 0, last = 0, alive = true;
    const gb = hex(p[1]);
    function frame(ts) {
      if (!alive) return; raf = requestAnimationFrame(frame);
      if (ts - last < 33) return; const dt = Math.min(0.1, (ts - last) / 1000 || 0.033); last = ts;
      ctx.clearRect(0, 0, 960, 540);
      parts.forEach((q) => {
        q.y -= q.vy * dt; q.x += (q.dx + Math.sin(ts / 900 + q.ph) * 6) * dt;
        if (q.y < -10) { q.y = 550; q.x = Math.random() * 960; }
        const a = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(ts / 600 + q.ph));
        ctx.fillStyle = `rgba(${gb[0]},${gb[1]},${gb[2]},${a})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill();
      });
    }
    raf = requestAnimationFrame(frame);
    let gt = 0;
    if (withGrain) {
      const gc = el('canvas', 'gz-grain'); gc.width = 192; gc.height = 108; stage.appendChild(gc);
      const g = gc.getContext('2d'), img = g.createImageData(192, 108);
      gt = setInterval(() => { for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }, 140);
    }
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(gt); };
  }

  function ghostSpawner(stage, issue, on) {
    if (!on || !issue.ghost || !issue.ghost.length) return () => {};
    const box = el('div', 'gz-ghosts'); stage.appendChild(box);
    let i = Math.floor(Math.random() * issue.ghost.length);
    const id = setInterval(() => {
      const g = issue.ghost[i++ % issue.ghost.length];
      const e = el('div', 'gz-ghost', `<b>${esc(g.user)}</b>${esc(g.text)}`);
      e.style.left = (Math.random() < 0.5 ? 40 + Math.random() * 170 : 640 + Math.random() * 130) + 'px';
      box.appendChild(e); setTimeout(() => e.remove(), 17500);
    }, 1400);
    return () => clearInterval(id);
  }

  // =============== афиша + титры ===============
  function Credits(issue, settings, opts) {
    const p = palette(issue.leadKind);
    let stage = null, timers = [], stops = [], raf = 0, done = false;
    const T = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

    function rollHtml() {
      const R = issue.roster || {}, F = issue.facts || {}, parts = [];
      if (issue.timeline && issue.timeline.length) parts.push('<h6>Хроника вечера</h6>' + issue.timeline.map((t) => `<div class="ln"><time>${esc(t.time)}</time>${esc(t.text)}</div>`).join(''));
      const roles = ['Голос чата', 'Второй план', 'Душа компании'];
      const top = (R.chatters || []).slice(0, 8);
      if (top.length) parts.push('<h6>В главных ролях</h6>' + top.map((c, i) => `<div class="nm">${esc(c.user)}<small>${roles[i] || (i < 6 ? 'Постоянный актёр' : 'Актёр')} · ${c.n} ${plural(c.n, ['реплика', 'реплики', 'реплик'])}</small></div>`).join(''));
      if ((R.donors || []).length) parts.push('<h6>Щедрое сердце</h6>' + R.donors.slice(0, 6).map((d, i) => `<div class="nm">${esc(d.user)}<small>${i === 0 ? 'Меценат вечера · ' : ''}${money(d.sum)}</small></div>`).join(''));
      const raiders = (R.raiders || []).filter((r) => r.user);
      if (raiders.length) parts.push('<h6>Гости из рейда</h6>' + raiders.map((r) => `<div class="nm">${esc(r.user)}<small>привёл ${r.viewers} ${plural(r.viewers, ['зрителя', 'зрителей', 'зрителей'])}</small></div>`).join(''));
      const fresh = [];
      if ((R.subs || []).length) fresh.push(['Присоединились к своим', R.subs]);
      if ((R.follows || []).length) fresh.push(['Пришли на канал', R.follows]);
      fresh.forEach((f) => { parts.push(`<h6>${f[0]}</h6><div class="wall">${f[1].map((n) => `<span style="animation-delay:${(Math.random() * 3).toFixed(1)}s">${esc(n)}</span>`).join('')}</div>`); });
      if (issue.word) parts.push(`<h6>Слово вечера</h6><div class="big">${esc(issue.word.w)}</div><div class="cr" style="margin-top:14px">× ${issue.word.n}${issue.emote ? ` · эмоут вечера <b>${esc(issue.emote.w)}</b> × ${issue.emote.n}` : ''}</div>`);
      if (issue.quote) parts.push(`<h6>Цитата вечера</h6><div class="q">«${esc(issue.quote.text)}»<small>${esc(issue.quote.user)}</small></div>`);
      parts.push('<h6>Съёмочная группа</h6><div class="cr">' + [
        `<b>Режиссёр</b> — ${esc(issue.studio)}`, issue.game ? `<b>Сюжет</b> — ${esc(issue.game)}` : '', `<b>В эфире</b> — ${dur(F.mins || 0)}`,
        `<b>Погода</b> — ${esc(issue.weather.icon + ' ' + issue.weather.label)}`, F.chat ? `<b>Реплик в зале</b> — ${F.chat}` : '',
      ].filter(Boolean).join('<br>') + '</div>');
      const rest = (R.chatters || []).slice(8);
      if (settings.wallNames && rest.length) parts.push('<h6>В эпизодах</h6><div class="wall">' + rest.map((c) => `<span style="animation-delay:${(Math.random() * 4).toFixed(1)}s">${esc(c.user)}</span>`).join('') + '</div>');
      parts.push(`<div class="thanks" id="gzThanks">Спасибо,<br>что были</div>`);
      return parts.join('');
    }

    function start() {
      stage = makeStage('gz-credits'); applyPalette(stage, issue.leadKind);
      stage.appendChild(el('div', 'gz-bg'));
      stops.push(startFx(stage, p, true));
      stops.push(ghostSpawner(stage, issue, settings.ghostChat));
      stage.appendChild(el('div', 'gz-sweep'));
      const left = el('div', 'gz-left'); stage.appendChild(left);
      const lock = el('div', 'gz-lock');
      const tag = el('div', 'gz-tag'); lock.appendChild(tag);
      const t = issue.headline || 'Вечер без громких новостей';
      const words = t.split(/\s+/);
      const size = t.length > 70 ? 82 : t.length > 52 ? 96 : t.length > 36 ? 112 : 124;
      const title = el('div', 'gz-title', words.map((w, i) => `<span class="w" style="animation-delay:${(1.7 + i * 0.22).toFixed(2)}s">${esc(w)}</span>`).join(' '));
      title.style.fontSize = size + 'px'; lock.appendChild(title);
      lock.appendChild(el('div', 'gz-deck', esc(issue.deck || '')));
      lock.appendChild(el('div', 'gz-pills', ['16+', dur((issue.facts || {}).mins || 0), issue.weather.icon + ' ' + issue.weather.label].map((x) => `<span>${esc(x)}</span>`).join('')));
      left.appendChild(lock);
      const poster = el('div', 'gz-poster', `<div class="card">${posterInner(issue, p)}</div>`);
      const img = poster.querySelector('img'); if (img) img.onerror = () => { poster.querySelector('.card').innerHTML = artSvg(issue.leadKind, p); };
      left.appendChild(poster);
      left.appendChild(el('div', 'gz-cap', issue.game ? 'Сюжет · ' + esc(issue.game) : ''));
      const F = issue.facts || {};
      const items = [['реплик', F.chat], ['пик зрителей', F.peak], ['донатов, ₽', F.donations]].filter((x) => x[1] > 0);
      if (items.length < 2) items.push(['минут в эфире', F.mins || 0]);
      const stats = el('div', 'gz-stats', items.slice(0, 3).map((x) => `<div><b data-to="${x[1]}">0</b><small>${x[0]}</small></div>`).join('')); left.appendChild(stats);
      const bk = issue.buckets || [], mx = Math.max(1, ...bk);
      const pts = bk.map((v, i) => `${(i / Math.max(1, bk.length - 1) * 660).toFixed(1)},${(46 - v / mx * 42).toFixed(1)}`);
      const pulse = el('div', 'gz-pulse', `<svg viewBox="0 0 660 50" width="660" height="50"><path d="M${pts.join(' L')}"/></svg>`); left.appendChild(pulse);
      const roll = el('div', 'gz-roll'); const rin = el('div', 'gz-roll-in', rollHtml()); roll.appendChild(rin); stage.appendChild(roll);
      stage.appendChild(el('div', 'gz-vig'));
      requestAnimationFrame(() => stage.classList.add('on'));

      // 1. подпись печатается
      const tagText = 'КАНАЛ ' + String(issue.studio).toUpperCase() + ' ПРЕДСТАВЛЯЕТ';
      let ci = 0; T(function typeIt() { ci++; tag.textContent = tagText.slice(0, ci); if (ci < tagText.length) T(typeIt, 38); else tag.classList.add('done'); }, 600);
      // 2. заголовок → подзаголовок → стыковка слева
      const titleEnd = 1700 + words.length * 220 + 1100;
      T(() => stage.classList.add('on-deck'), titleEnd);
      const dockAt = titleEnd + 3800;
      T(() => lock.classList.add('dock'), dockAt);
      T(() => { poster.classList.add('in'); left.querySelector('.gz-cap').style.opacity = 1; stats.style.opacity = 1; pulse.style.opacity = 1; pulse.classList.add('go'); countUp(stats); }, dockAt + 900);
      T(() => { roll.classList.add('in'); scroll(rin); }, dockAt + 1700);
    }

    function countUp(stats) {
      const t0 = performance.now();
      const tick = (ts) => { const k = Math.min(1, (ts - t0) / 3000), e = 1 - Math.pow(1 - k, 3); stats.querySelectorAll('b').forEach((b) => { b.textContent = Math.round(+b.dataset.to * e).toLocaleString('ru-RU'); }); if (k < 1 && !done) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }

    function scroll(rin) {
      const speed = { slow: 52, normal: 76, fast: 110 }[settings.creditsSpeed] || 76;
      const thanks = rin.querySelector('#gzThanks');
      const endY = 540 - (thanks.offsetTop + thanks.offsetHeight / 2);
      let y = 1080, last = performance.now();
      const step = (ts) => {
        if (done) return;
        const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
        y -= speed * dt;
        if (y <= endY) { y = endY; rin.style.transform = `translateY(${y}px)`; finish(); return; }
        rin.style.transform = `translateY(${y}px)`; raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    function finish() {
      if (opts.loop) { T(() => { stop(true); start(); }, 7000); return; }
      if (settings.creditsHoldSec > 0 && opts.onDone) T(opts.onDone, settings.creditsHoldSec * 1000);
    }

    function stop(fast) {
      done = true; timers.forEach(clearTimeout); timers = []; stops.forEach((f) => f()); stops = []; cancelAnimationFrame(raf);
      if (stage) { dropStage(stage, fast); stage = null; }
      done = false;
    }
    return { start, stop };
  }

  // =============== газета на весь экран ===============
  function News(issue, settings, opts) {
    let stage = null, timers = [], stops = [];
    const T = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    function start() {
      injectVignetteCss();
      stage = makeStage('gz-news'); applyPalette(stage, issue.leadKind);
      const F = issue.facts || {};
      const d = new Date(issue.startTs + (issue.clockOffsetMin || 0) * 60000);
      const date = String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' + d.getUTCFullYear();
      const photo = issue.art ? `<img alt="" src="${esc(issue.art)}">` : wideVignette(issue.leadKind, (issue.emote && issue.emote.w) || (issue.word && issue.word.w) || 'GG');
      const tl = (issue.timeline || []).length ? `<ul class="tl">${issue.timeline.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6).sort((a, b) => (a.time < b.time ? -1 : 1)).map((t) => `<li><time>${esc(t.time)}</time><span>${esc(t.text)}</span></li>`).join('')}</ul>` : '<p><i>Происшествий не было — и это тоже новость.</i></p>';
      const heroes = [issue.heroes && issue.heroes.talker ? `Главный болтун: <b>${esc(issue.heroes.talker.user)}</b> (${issue.heroes.talker.n})` : '', issue.heroes && issue.heroes.donor ? `Щедрее всех: <b>${esc(issue.heroes.donor.user)}</b> (${money(issue.heroes.donor.sum)})` : ''].filter(Boolean).join('<br>');
      stage.innerHTML = `<div class="sheet"><div class="mast"><b>${esc(issue.masthead)}</b><small><span>Вечерний выпуск · ${date}</span><span>${esc(issue.weather.icon + ' ' + issue.weather.label)}</span><span>${dur(F.mins || 0)} в эфире</span></small></div>
      <h2 class="hl typing" id="gzHl"></h2><p class="dk">${esc(issue.deck || '')}</p>
      <div class="cols"><div><div class="ph">${photo}</div><p class="cap">${issue.art ? 'Кадр из эфира.' : 'Иллюстрация вечера.'}</p><p class="lead">${esc(issue.lead || '')}</p></div>
      <div><div class="box"><h4>Хроника вечера</h4>${tl}</div></div>
      <div>${issue.quote ? `<div class="box"><h4>Цитата вечера</h4><div class="quote">«${esc(issue.quote.text)}»<small>— ${esc(issue.quote.user)}</small></div></div>` : ''}${issue.word ? `<div class="box"><h4>Слово вечера</h4><div class="word">${esc(issue.word.w)}</div><small>× ${issue.word.n}${issue.emote ? ' · эмоут: ' + esc(issue.emote.w) + ' × ' + issue.emote.n : ''}</small></div>` : ''}<div class="box"><h4>Герои вечера</h4><div style="font:400 21px/1.4 Inter,sans-serif">${heroes || '—'}</div></div></div></div>
      <div class="whisper" id="gzWh"></div><div class="stamp" id="gzStamp">Свежий выпуск</div></div>`;
      const sheet = stage.querySelector('.sheet');
      requestAnimationFrame(() => { stage.classList.add('on'); sheet.classList.add('in'); });
      const hl = stage.querySelector('#gzHl'), text = issue.headline || '';
      let i = 0; T(function typeIt() { i++; hl.textContent = text.slice(0, i); if (i < text.length) T(typeIt, 42); else hl.classList.remove('typing'); }, 1500);
      const boxes = [...stage.querySelectorAll('.box')];
      boxes.forEach((b, k) => T(() => b.classList.add('in'), 2600 + k * 700));
      T(() => { const s = stage.querySelector('#gzStamp'); s.classList.add('go'); }, 3000);
      const wh = stage.querySelector('#gzWh'); const gh = issue.ghost || []; let gi = Math.floor(Math.random() * Math.max(1, gh.length));
      if (settings.ghostChat && gh.length) { const id = setInterval(() => { const g = gh[gi++ % gh.length]; const sp = el('span', null, `${esc(g.user)}: ${esc(g.text)}`); wh.appendChild(sp); while (wh.scrollWidth > wh.clientWidth + 4 && wh.firstChild) wh.removeChild(wh.firstChild); }, 2300); stops.push(() => clearInterval(id)); }
      const total = 1500 + text.length * 42 + 4000;
      if (opts.loop) T(() => { stop(true); start(); }, total + 9000);
      else if (settings.creditsHoldSec > 0 && opts.onDone) T(opts.onDone, total + settings.creditsHoldSec * 1000);
    }
    function stop(fast) { timers.forEach(clearTimeout); timers = []; stops.forEach((f) => f()); stops = []; if (stage) { dropStage(stage, fast); stage = null; } }
    return { start, stop };
  }

  // =============== эфир: бегущая строка и плашка главной новости ===============
  function OnAir(opts) {
    const stage = makeStage('oa' + (opts.preview ? ' gz-prevbg' : '')); stage.classList.add('on');
    stage.innerHTML = '<div class="oa-bug"><i></i>ЭФИР</div><div class="oa-ticker"><b>СВОДКА</b><div class="oa-clip"><span class="oa-track"></span></div></div><div class="oa-plate"><span class="tg">Главная новость</span><div class="hd"></div><div class="dk"></div><div class="bar"></div></div>';
    const bug = stage.querySelector('.oa-bug'), tick = stage.querySelector('.oa-ticker'), track = stage.querySelector('.oa-track'), plate = stage.querySelector('.oa-plate');
    let issue = null, settings = null, lastText = '', lastHeadline = '', nextAt = Date.now() + (opts.preview ? 3500 : 90000), demoUntil = 0, pulseRev = null, hideT = 0;

    function applyIssue(is) {
      issue = is; applyPalette(stage, is.leadKind);
      let items = (is.timeline || []).map((t) => t.time + ' · ' + t.text);
      if (!items.length) items = [`Чат: ${(is.facts || {}).chat || 0} ${plural((is.facts || {}).chat || 0, ['реплика', 'реплики', 'реплик'])}`, is.weather.icon + ' ' + is.weather.label];
      const text = items.join('   ◆   ') + '   ◆   ';
      if (text !== lastText) { lastText = text; track.textContent = text; track.style.animationDuration = Math.max(20, (text.length * 17 + 1500) / 150) + 's'; }
    }
    function showPlate(force) {
      if (!issue || !settings) return;
      const F = issue.facts || {};
      if (!force && (issue.confidence === 'low' || (F.mins || 0) < 10 || issue.headline === lastHeadline)) { nextAt = Date.now() + 2 * 60000; return; }
      lastHeadline = issue.headline;
      plate.querySelector('.hd').textContent = issue.headline; plate.querySelector('.dk').textContent = issue.deck || '';
      const sec = opts.preview ? 9 : settings.onair.plateSec; plate.style.setProperty('--dur', sec + 's');
      plate.classList.remove('in'); void plate.offsetWidth; plate.classList.add('in');
      clearTimeout(hideT); hideT = setTimeout(() => plate.classList.remove('in'), sec * 1000 + 900);
      nextAt = Date.now() + (opts.preview ? 16000 : settings.onair.intervalMin * 60000);
    }
    async function refresh() {
      if (Date.now() < demoUntil) return;
      try { const r = await api('/api/gazette/issue' + (opts.demo ? '?demo=' + encodeURIComponent(opts.demo) : '')); if (r.issue) applyIssue(r.issue); } catch (e) { /* сервер недоступен — остаётся прошлое */ }
    }
    async function poll() {
      try {
        const st = await api('/api/gazette/state'); settings = st.settings;
        const on = settings.onair; const live = issue && ((issue.facts || {}).chat > 0 || (issue.timeline || []).length > 0 || opts.demo);
        bug.classList.toggle('in', opts.preview || (on.bug && !!live)); tick.classList.toggle('in', opts.preview || (on.ticker && !!live));
        if (pulseRev === null) pulseRev = st.pulse.rev;
        else if (st.pulse.rev !== pulseRev) {
          pulseRev = st.pulse.rev;
          if (st.pulse.demo) { const r = await api('/api/gazette/issue?demo=' + st.pulse.demo); if (r.issue) { applyIssue(r.issue); demoUntil = Date.now() + 60000; } }
          showPlate(true);
        }
        if (!opts.preview && !on.plate) return;
        if (Date.now() >= nextAt) showPlate(false);
      } catch (e) { /* ждём следующий опрос */ }
    }
    refresh(); setInterval(refresh, opts.preview ? 60000 : 20000); setInterval(poll, 1000); poll();
  }

  // =============== запуск страниц ===============
  function make(format, issue, settings, opts) { return format === 'credits' ? Credits(issue, settings, opts) : News(issue, settings, opts); }
  async function previewLoop(format, demo) {
    const [st, r] = await Promise.all([api('/api/gazette/state'), api('/api/gazette/issue' + (demo ? '?demo=' + encodeURIComponent(demo) : ''))]);
    make(format, r.issue, { ...st.settings, creditsHoldSec: 0 }, { loop: true, preview: true }).start();
  }
  function mountScreen(format) {
    const q = new URLSearchParams(location.search);
    if (q.get('preview')) { previewLoop(format, q.get('demo') || ''); return; }
    let rev = -1, cur = null;
    async function tick() {
      try {
        const st = await api('/api/gazette/state'), sc = st.screen;
        if (sc.rev === rev) return; rev = sc.rev;
        if (cur) { cur.stop(); cur = null; }
        if (sc.format !== format) return;
        const r = await api('/api/gazette/issue' + (sc.demo ? '?demo=' + sc.demo : ''));
        cur = make(format, r.issue, st.settings, { onDone: () => post('/api/gazette/hide') }); cur.start();
      } catch (e) { /* ждём следующий опрос */ }
    }
    setInterval(tick, 1000); tick();
  }
  function mountOnAir() { const q = new URLSearchParams(location.search); OnAir({ preview: !!q.get('preview'), demo: q.get('demo') || '' }); }

  window.GazetteViews = { mountScreen, mountOnAir };
})();
