// settings-shell.js — «Настройки админки»: меню разделов слева, выбранный раздел справа.
// Готовые карточки (ключ, копии, уведомления, лаунчер, режим разработчика) не пересоздаются, а переносятся в панели
// вместе со своими обработчиками. Карточки, которые другие скрипты дорисовывают позже, подхватываются по мере появления.
(function () {
  'use strict';
  const sec = document.getElementById('tab-admin-settings');
  if (!sec || sec.querySelector('.st-shell')) return;

  const ico = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const SECTIONS = [
    { id: 'key', sel: '#keyCard', title: 'Ключ авторизации', sub: 'Вход, токены, все настройки', desc: 'Всё для запуска оверлея на другом ПК: вход в Twitch и донаты, токены бота, виджеты, шрифты. В файле лежат ключи: храни его как пароль и никому не отправляй.',
      icon: ico('<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3m-4 4 3 3m-6 0 2 2"/>') },
    { id: 'hist', sel: '.qol-hist', title: 'Копии и история', sub: 'Копия и точки отката', desc: 'Копия: один файл с настройками, без пароля и картинок трансляции. Точки отката Overdeck делает сам, пока ты меняешь настройки.', fill: true,
      icon: ico('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>') },
    { id: 'notify', sel: '#ntCard', title: 'Уведомления', sub: 'Плашки на рабочем столе', desc: 'Маленькие плашки в углу экрана Windows: «Источники OBS обновлены», «Анонс в Telegram не доставлен». Не берут фокус и не мешают играм.',
      icon: ico('<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/>') },
    { id: 'launcher', sel: '#lcCard', title: 'Лаунчер', sub: 'Звук и анимация запуска', desc: 'Настройки окна Overdeck.exe. Действуют со следующего запуска лаунчера.',
      icon: ico('<rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8M12 17v4M10.5 8.5v4l3.5-2-3.5-2Z"/>') },
    { id: 'dev', sel: '#devCard', title: 'Режим разработчика', sub: 'Закрытые вкладки', desc: 'Открывает закрытые вкладки: «Турнир», «Чат-аватары», «Расширение Twitch». Это тестовые функции, в обычную версию они не входят. Нужен пароль.',
      icon: ico('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>') },
  ];

  const KEY = 'stPane';
  const lsGet = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const lsSet = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* без хранилища просто не запоминаем */ } };

  // шапка (заголовок + описание) в одну строку
  const top = document.createElement('div'); top.className = 'st-top';
  const title = sec.querySelector(':scope > .tab-title'), descr = sec.querySelector(':scope > .tab-description');
  if (title) top.appendChild(title);
  if (descr) top.appendChild(descr);

  const shell = document.createElement('div'); shell.className = 'st-shell';
  const nav = document.createElement('div'); nav.className = 'st-nav'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Разделы настроек');
  shell.appendChild(nav);

  const panes = {}, items = {};
  SECTIONS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'st-ni'; b.id = 'stNav-' + s.id; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', 'false'); b.setAttribute('aria-controls', 'stPane-' + s.id);
    b.innerHTML = `<span class="ic">${s.icon}</span><span class="tx"><b>${s.title}</b><span>${s.sub}</span></span>`;
    b.addEventListener('click', () => show(s.id));
    nav.appendChild(b); items[s.id] = b;

    const p = document.createElement('section');
    p.className = 'st-pane'; p.id = 'stPane-' + s.id; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'stNav-' + s.id);
    p.innerHTML = `<header class="st-ph"><span class="ic">${s.icon}</span><div><h2>${s.title}</h2><p>${s.desc}</p></div></header><div class="st-pb${s.fill ? ' fill' : ''}"></div>`;
    shell.appendChild(p); panes[s.id] = p;
  });

  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const ids = SECTIONS.map((s) => s.id), cur = ids.findIndex((id) => items[id].getAttribute('aria-selected') === 'true');
    const next = ids[(cur + (e.key === 'ArrowDown' ? 1 : ids.length - 1)) % ids.length];
    show(next); items[next].focus();
  });

  function show(id) {
    if (!panes[id]) id = SECTIONS[0].id;
    SECTIONS.forEach((s) => {
      const on = s.id === id;
      panes[s.id].classList.toggle('on', on);
      items[s.id].setAttribute('aria-selected', on ? 'true' : 'false');
      items[s.id].tabIndex = on ? 0 : -1;
    });
    lsSet(id);
  }

  // вставляем каркас перед скрытым блоком с темами, а карточки переносим в панели
  const hiddenTail = sec.querySelector(':scope > div[hidden]');
  sec.insertBefore(top, sec.firstChild);
  sec.insertBefore(shell, hiddenTail);

  function adopt() {
    let left = 0;
    SECTIONS.forEach((s) => {
      const body = panes[s.id].querySelector('.st-pb');
      const el = sec.querySelector(s.sel);
      if (el && el.parentNode !== body) body.appendChild(el);
      if (!body.firstElementChild) left++;
    });
    sec.querySelectorAll('.qol-gear-grid').forEach((w) => { if (!w.children.length) w.remove(); }); // пустая обёртка из qol.js
    return left;
  }
  if (adopt() > 0) {
    const mo = new MutationObserver(() => { if (adopt() === 0) mo.disconnect(); });
    mo.observe(sec, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 15000);
  }

  // старые ссылки «покажи ключ авторизации» (мастер, строка «Overdeck ещё не настроен») теперь открывают нужный раздел
  const key = document.getElementById('keyCard');
  if (key) key.scrollIntoView = function () { show('key'); };

  show(lsGet() || 'key');
})();
