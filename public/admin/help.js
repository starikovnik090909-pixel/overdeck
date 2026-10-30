// help.js — «Связь с автором»: сообщить о проблеме, предложить улучшение, поддержать автора (кнопки внизу боковой панели).
// При первом открытии после обновления один раз показывает подсказку, где эти кнопки.
(function () {
  'use strict';
  const TG = 'https://t.me/Xstarikov';
  const SUPPORT = [
    { name: 'DonationAlerts', url: 'https://www.donationalerts.com/r/starikov0' },
    { name: 'DonatX', url: 'https://donatex.gg/donate/starikov' },
  ];
  const sb = document.querySelector('.sidebar');
  const anchor = sb && sb.querySelector('.side-ver');
  if (!sb || !anchor) return;

  const IC = {
    bug: '<path d="M8 8a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0zM12 12v6M4 8l3 2M20 8l-3 2M4 16l3-2M20 16l-3-2M9 4 8 2M15 4l1-2"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  };
  const svg = (n) => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>';

  const box = document.createElement('div');
  box.className = 'side-help';
  box.innerHTML =
    '<button type="button" data-h="bug">' + svg('bug') + '<span>Сообщить о проблеме</span></button>' +
    '<button type="button" data-h="idea">' + svg('idea') + '<span>Предложить улучшение</span></button>' +
    '<button type="button" data-h="love" class="love">' + svg('heart') + '<span>Поддержать автора</span></button>';
  anchor.parentNode.insertBefore(box, anchor);

  /* ---------- окно ---------- */
  const ov = document.createElement('div');
  ov.className = 'hp-ov';
  ov.innerHTML = '<div class="hp-card" role="dialog" aria-modal="true"><button type="button" class="hp-x" aria-label="Закрыть">×</button><h3 class="hp-t"></h3><div class="hp-b"></div></div>';
  document.body.appendChild(ov);
  const card = ov.querySelector('.hp-card'), tt = ov.querySelector('.hp-t'), bb = ov.querySelector('.hp-b');
  const close = () => ov.classList.remove('open');
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.hp-x').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
  const toast = (t, e) => window.ui3Toast && window.ui3Toast(t, e);

  function diag() {
    const v = (document.getElementById('sideVersion') || {}).textContent || '';
    const sc = window.ui3LastSelfCheck;
    const lines = ['Overdeck ' + v, 'Браузер: ' + navigator.userAgent.slice(0, 120), 'Время: ' + new Date().toLocaleString('ru-RU')];
    lines.push(sc && sc.problems && sc.problems.length ? 'Самопроверка: ' + sc.problems.map((p) => p.title + ' (' + p.text + ')').join('; ') : 'Самопроверка: проблем нет');
    return lines.join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { try { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (x) { return false; } }
  }
  const link = (href, label, cls) => '<a class="hp-btn ' + (cls || '') + '" href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';

  function show(kind) {
    if (kind === 'bug') {
      tt.textContent = 'Сообщить о проблеме';
      bb.innerHTML = '<p>Опиши, что пошло не так и что ты делал перед этим. Если есть скриншот, приложи его.</p>' +
        '<p class="hp-mut">При нажатии мы скопируем в буфер короткие данные для диагностики (версия, результат самопроверки). Просто вставь их в сообщение.</p>' +
        link(TG, 'Написать в Telegram @Xstarikov', 'primary') + '<button type="button" class="hp-btn" id="hpCopy">Только скопировать данные</button>';
      bb.querySelector('.primary').addEventListener('click', async () => { if (await copy(diag())) toast('Данные скопированы, вставь их в сообщение'); });
      bb.querySelector('#hpCopy').addEventListener('click', async () => { const ok = await copy(diag()); toast(ok ? 'Данные скопированы' : 'Не удалось скопировать', !ok); });
    } else if (kind === 'idea') {
      tt.textContent = 'Предложить улучшение';
      bb.innerHTML = '<p>Чего не хватает в Overdeck, что неудобно или что можно сделать красивее? Напиши идею в Telegram, даже короткую.</p>' + link(TG, 'Написать в Telegram @Xstarikov', 'primary');
    } else {
      tt.textContent = 'Поддержать автора';
      bb.innerHTML = '<p>Overdeck делается одним человеком. Если он тебе помогает, можно отправить донат любым удобным способом. Спасибо!</p>' +
        SUPPORT.map((s, i) => link(s.url, s.name, i ? '' : 'primary')).join('');
    }
    ov.classList.add('open');
    const f = bb.querySelector('a'); if (f) f.focus({ preventScroll: true });
  }
  box.addEventListener('click', (e) => { const b = e.target.closest('button[data-h]'); if (b) { hideTip(true); show(b.dataset.h); } });

  /* ---------- подсказка «где кнопки», один раз ---------- */
  const KEY = 'ui3.help.seen';
  const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const tip = document.createElement('div');
  tip.className = 'hp-tip';
  tip.innerHTML = '<b>Связь с автором</b><span>Здесь можно сообщить об ошибке, предложить идею или поддержать автора донатом.</span><button type="button" class="btn btn-primary">Понятно</button>';
  document.body.appendChild(tip);
  function hideTip(mark) {
    tip.classList.remove('show'); box.classList.remove('pulse');
    if (mark) { try { localStorage.setItem(KEY, '1'); } catch (e) { /* без хранилища покажем ещё раз, не страшно */ } }
  }
  tip.querySelector('button').addEventListener('click', () => hideTip(true));
  let tries = 0;
  function showTip() {
    if (seen()) return;
    box.scrollIntoView({ block: 'nearest' });
    const r = box.getBoundingClientRect();
    const hit = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    if (!hit || !box.contains(hit)) { if (++tries < 40) setTimeout(showTip, 3000); return; } // кнопки закрыты мастером или окном: подождём
    tip.style.left = Math.round(r.right + 16) + 'px';
    tip.classList.add('show'); box.classList.add('pulse');
    const h = tip.offsetHeight;
    tip.style.top = Math.max(12, Math.min(innerHeight - h - 12, Math.round(r.top + r.height / 2 - 50))) + 'px';
    const arrow = Math.max(14, Math.min(h - 26, Math.round(r.top + r.height / 2 - parseFloat(tip.style.top) - 6)));
    tip.style.setProperty('--ay', arrow + 'px');
  }
  setTimeout(showTip, 3500);
})();
