// public/eventfeed.js — виджет «События»: сверху карточка последнего события, ниже вертикальная линия с предыдущими.
// Новое событие «вдвигается» сверху, прежняя карточка уменьшается в строку линии. Данные: snapshot.eventFeed (новые первыми).
// Цвета/шрифты/скругления берутся из темы и стиля оформления (CSS-переменные), размеры — из размера блока (ResizeObserver).

(function () {
  const host = document.getElementById('eventFeedHost');
  if (!host) { window.EventFeedModule = { render() {} }; return; }

  const KICK = { follow: 'новый фолловер', sub: 'новая подписка', giftsub: 'подарочные подписки', donation: 'донат', raid: 'рейд', channelpoints: 'баллы канала', watchstreak: 'серия просмотров' };
  const SVG = {
    follow: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="3.4"/><path d="M3.6 19.5c.6-3.3 3.1-5 6.4-5s5.8 1.7 6.4 5M19 8v6M16 11h6"/></svg>',
    sub: '<svg viewBox="0 0 24 24"><path class="f" d="M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.6l6.4-.9z"/></svg>',
    giftsub: '<svg viewBox="0 0 24 24"><path d="M4 9.5h16v3H4zM5.2 12.5h13.6V20H5.2zM12 9.5V20M12 9.5c-2.6 0-4.4-.8-4.4-2.4S9.3 4.8 10.6 6c.8.7 1.4 2 1.4 3.5zM12 9.5c2.6 0 4.4-.8 4.4-2.4S14.7 4.8 13.4 6c-.8.7-1.4 2-1.4 3.5z"/></svg>',
    donation: '<b>₽</b>',
    raid: '<svg viewBox="0 0 24 24"><path d="M5.5 6.5 11 12l-5.5 5.5M12.5 6.5 18 12l-5.5 5.5"/></svg>',
    channelpoints: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>',
    watchstreak: '<svg viewBox="0 0 24 24"><path class="f" d="M12 3c.5 3-1.6 4.6-3.2 6.6C7.4 11.3 7 12.6 7 14a5 5 0 0 0 10 0c0-1.8-.8-3.1-1.7-4.2-.3 1-.9 1.6-1.6 1.9.6-3-.2-6.2-1.7-8.7z"/></svg>',
  };
  const CSS_TYPE = { follow: 'follow', sub: 'sub', giftsub: 'gift', donation: 'don', raid: 'raid', channelpoints: 'pts', watchstreak: 'streak' };
  const DEFAULTS = { maxRows: 5, showFollow: true, showSub: true, showGift: true, showRaid: true, showDonation: true, showPoints: false, showStreak: true, minDonation: 0, showTime: true };

  host.innerHTML = '<div class="ef-spine"></div><div class="ef-empty">Пока событий нет</div>';
  const spine = host.querySelector('.ef-spine');
  const emptyEl = host.querySelector('.ef-empty');
  const els = new Map(); // key -> element
  let events = [];       // отфильтрованные, новые первыми
  let lastKey = '';
  let box = { w: 0, h: 0 };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
  const settings = () => ({ ...DEFAULTS, ...((window.widgetSettings && window.widgetSettings.eventfeed) || {}) });
  const keyOf = (e) => e.id + '_' + e.ts;

  function allowed(e, s) {
    if (e.type === 'follow') return s.showFollow;
    if (e.type === 'sub') return s.showSub;
    if (e.type === 'giftsub') return s.showGift;
    if (e.type === 'raid') return s.showRaid;
    if (e.type === 'channelpoints') return s.showPoints;
    if (e.type === 'watchstreak') return s.showStreak;
    if (e.type === 'donation') return s.showDonation && (e.amount || 0) >= s.minDonation;
    return false;
  }

  function detail(e) {
    if (e.type === 'follow') return 'подписался на канал';
    if (e.type === 'sub') return e.tier === '2000' ? 'Tier 2' : e.tier === '3000' ? 'Tier 3' : 'Tier 1';
    if (e.type === 'giftsub') return 'подарил ' + (e.count || 1) + ' подписок';
    if (e.type === 'raid') return 'рейд · ' + fmt(e.count) + ' зрителей';
    if (e.type === 'channelpoints') return e.text || 'награда за баллы';
    if (e.type === 'watchstreak') { const n = e.count || 0; const m = n % 100; const r = n % 10; return 'серия просмотров · ' + n + ' ' + (m >= 11 && m <= 14 ? 'стримов' : r === 1 ? 'стрим' : r >= 2 && r <= 4 ? 'стрима' : 'стримов') + ' подряд'; }
    return e.text || '';
  }

  function ago(e) {
    const sec = Math.max(0, (Date.now() - e.ts) / 1000);
    if (sec < 8) return 'сейчас';
    if (sec < 60) return Math.round(sec) + ' с';
    if (sec < 3600) return Math.round(sec / 60) + ' мин';
    return Math.round(sec / 3600) + ' ч';
  }

  function body(e, hero) {
    const amt = e.type === 'donation' ? '<span class="ef-amt">' + fmt(e.amount) + ' ₽</span>' : '';
    const d = esc(detail(e));
    return '<div class="ef-col"><div class="ef-ic">' + SVG[e.type] + '</div></div>' +
      '<div class="ef-bd"><div class="ef-kick">' + KICK[e.type] + '</div><div class="ef-nm">' + esc(e.username || '—') + '</div>' +
      '<div class="ef-dt">' + (!hero && amt ? amt + (d ? ' · ' : '') : '') + d + '</div></div>' +
      '<div class="ef-rt">' + (hero ? amt : '') + '<span class="ef-ago"></span></div>';
  }

  function layout() {
    const s = settings();
    const H = host.clientHeight, W = host.clientWidth;
    box = { w: W, h: H };
    if (!H || !W) return;
    const u = Math.max(0.55, Math.min(1.7, Math.min(W / 340, H / 400)));
    host.style.setProperty('--ef-u', u.toFixed(3));
    const heroH = Math.round(Math.min(112 * u, H * 0.4));
    const gap = Math.round(10 * u);
    const rowMin = 44 * u;
    const fit = Math.max(0, Math.floor((H - heroH - gap) / rowMin));
    const total = Math.max(1, Math.min(s.maxRows, 1 + fit, events.length || 1));
    const rowH = total > 1 ? (H - heroH - gap) / (total - 1) : rowMin;
    const rowUse = Math.min(rowH, 62 * u);
    host.classList.toggle('ef-narrow', W < 250);
    host.classList.toggle('ef-notime', !s.showTime);
    spine.style.left = Math.round(34 * u) + 'px';
    spine.style.top = (heroH + gap / 2) + 'px';

    const seen = new Set();
    const shown = events.slice(0, total);
    shown.forEach((e, i) => {
      const key = keyOf(e);
      seen.add(key);
      const hero = i === 0;
      let el = els.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ef-it ef-t-' + CSS_TYPE[e.type];
        el.innerHTML = body(e, hero);
        el.style.top = '-' + (heroH + 20) + 'px';
        el.style.height = heroH + 'px';
        el.style.opacity = '0';
        host.appendChild(el);
        els.set(key, el);
        void el.offsetWidth;
      }
      const was = el.classList.contains('ef-hero');
      if (hero !== was) { el.classList.toggle('ef-hero', hero); el.innerHTML = body(e, hero); }
      el.style.top = (hero ? 0 : heroH + gap + (i - 1) * rowUse) + 'px';
      el.style.height = (hero ? heroH : rowUse) + 'px';
      el.style.opacity = hero ? '1' : String(Math.max(0.3, 1 - i * 0.13));
      el._e = e;
    });
    els.forEach((el, key) => {
      if (!seen.has(key)) { els.delete(key); el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }
    });
    // цвет верха линии — как у главной карточки
    const heroEl = shown.length ? els.get(keyOf(shown[0])) : null;
    spine.style.display = shown.length > 1 ? '' : 'none';
    if (heroEl) spine.style.setProperty('--ef-c0', getComputedStyle(heroEl).getPropertyValue('--ef-c') || '#888');
    emptyEl.style.display = shown.length ? 'none' : '';
    updateTimes();
  }

  function updateTimes() {
    els.forEach((el) => { const a = el.querySelector('.ef-ago'); if (a && el._e) a.textContent = ago(el._e); });
  }

  function render(data) {
    if (!data || !Array.isArray(data.eventFeed)) return;
    const s = settings();
    events = data.eventFeed.filter((e) => allowed(e, s));
    const sig = events.map(keyOf).join(',') + '|' + JSON.stringify(s);
    if (sig === lastKey) return;
    lastKey = sig;
    layout();
  }

  if (window.ResizeObserver) new ResizeObserver(() => { if (host.clientWidth !== box.w || host.clientHeight !== box.h) layout(); }).observe(host);
  setInterval(updateTimes, 1000);
  window.EventFeedModule = { render };
})();
