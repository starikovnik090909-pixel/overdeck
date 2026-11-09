'use strict';
// Окно «Расширение для браузера»: открывается значком-пазлом вверху (и ссылкой в «Алерты → Сейчас играет»).
// Статус связи, скачивание архива, установка и список возможностей. Вкладки для этого не нужно.
(() => {
  const fab = document.getElementById('extFab'); if (!fab) return;
  const dot = document.getElementById('extDot');
  let modal = null, info = null, timer = null;
  const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  async function j(u, o) { const r = await fetch(u, o); return r.json(); }
  async function status() {
    try { const d = await j('/api/nowplaying'); const x = d.state && d.state.diag && d.state.diag.ext; return x && x.fresh ? { ok: true, browser: x.browser || '' } : { ok: false }; } catch (e) { return { ok: false }; }
  }
  async function paintDot() { const s = await status(); dot.classList.toggle('on', s.ok); fab.title = 'Расширение для браузера: ' + (s.ok ? 'подключено' : 'не подключено'); return s; }
  paintDot(); setInterval(paintDot, 5000);

  const FEATURES = [
    ['Сейчас играет', 'передаёт в Overdeck звук и видео вкладок'],
    ['Баллы канала', 'сам нажимает зелёный сундучок на Twitch'],
    ['Смайлы 7TV, BTTV, FFZ', 'показывает их в чате вместо слов'],
    ['Панель смайлов', 'отдельная кнопка у строки ввода, клик вставляет смайл'],
    ['1080p в России (бета)', 'плейлист идёт через твой релей, работает не всегда'],
  ];
  function build() {
    modal = document.createElement('div'); modal.className = 'ext-ov'; modal.hidden = true;
    modal.innerHTML = '<div class="ext-box" role="dialog" aria-label="Расширение для браузера">' +
      '<div class="ext-hd"><b>Расширение для браузера</b><span class="ext-ver" id="extVer"></span><button type="button" class="ext-x" aria-label="Закрыть">×</button></div>' +
      '<div class="ext-st" id="extSt">Проверяю…</div>' +
      '<div class="ext-sec">Что умеет</div><ul class="ext-ft">' + FEATURES.map((f) => '<li><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></li>').join('') + '</ul>' +
      '<div class="ext-sec">Установка</div>' +
      '<ol class="ext-steps"><li>Скачай архив и распакуй его (или возьми готовую папку).</li><li>Открой страницу расширений браузера и включи «Режим разработчика».</li><li>Нажми «Загрузить распакованное» и выбери папку <code>overdeck-extension</code>.</li></ol>' +
      '<div class="ext-row"><a class="btn btn-primary" href="/api/extension.zip" download>Скачать архив</a><button type="button" class="btn btn-secondary" id="extFolder">Открыть папку</button>' +
      '<select id="extBr" class="ui3-select"><option value="chrome">Chrome</option><option value="edge">Edge</option><option value="yandex">Яндекс Браузер</option><option value="other">Другой</option></select><button type="button" class="btn btn-secondary" id="extPage">Открыть страницу расширений</button></div>' +
      '<details class="ext-hd1080"><summary>1080p: как включить релей (бета)</summary><div class="ext-b"><p>Twitch в России ограничивает качество 720p. Расширение может запрашивать плейлист через твой собственный релей на Cloudflare. Это бесплатно, но результат не гарантирован.</p>' +
      '<ol><li>Зайди на dash.cloudflare.com → Workers &amp; Pages → Create → Hello World → Edit code.</li><li>Вставь код ниже и нажми Deploy.</li><li>Адрес вида <code>https://имя.аккаунт.workers.dev</code> вставь в окошко расширения и включи «1080p».</li></ol>' +
      '<div class="ext-row"><button type="button" class="btn btn-secondary" id="extRelay">Копировать код релея</button><span class="ext-note" id="extRelayMsg"></span></div></div></details>' +
      '<div class="ext-msg" id="extMsg"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.ext-x').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { close(); e.stopPropagation(); } }, true);
    modal.querySelector('#extFolder').addEventListener('click', async () => { try { const d = await j('/api/nowplaying/extension/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what: 'folder' }) }); msg(d.opened || /win/i.test(navigator.platform) ? 'Папка открыта.' : 'Путь: ' + (d.dir || '')); } catch (e) { msg('Не удалось открыть папку.'); } });
    modal.querySelector('#extPage').addEventListener('click', async () => {
      const b = modal.querySelector('#extBr').value; let d = {};
      try { d = await j('/api/nowplaying/extension/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browser: b, what: 'page' }) }); } catch (e) { d = {}; }
      if (d.store) { window.open(d.store, '_blank', 'noopener'); return; }
      if (!d.opened) { try { await navigator.clipboard.writeText(d.page || 'chrome://extensions'); } catch (e) { /* вручную */ } msg('Браузер не даёт открыть эту страницу сам. Адрес ' + (d.page || 'chrome://extensions') + ' скопирован: вставь его в адресную строку.'); }
    });
    modal.querySelector('#extRelay').addEventListener('click', async () => {
      const m = modal.querySelector('#extRelayMsg');
      try { const t = await (await fetch('/api/extension/relay.js')).text(); await navigator.clipboard.writeText(t); m.textContent = 'Скопировано'; } catch (e) { m.textContent = 'Не удалось скопировать. Код лежит в browser-extension/relay/worker.js'; }
      setTimeout(() => { m.textContent = ''; }, 2500);
    });
  }
  function msg(t) { const m = modal.querySelector('#extMsg'); m.textContent = t || ''; }
  async function paint() {
    const s = await paintDot(); const el = modal.querySelector('#extSt');
    el.textContent = s.ok ? 'Подключено' + (s.browser ? ' (' + s.browser + ')' : '') + '. Всё работает.' : 'Не подключено. Установи расширение по шагам ниже.';
    el.classList.toggle('ok', s.ok);
  }
  async function open() {
    if (!modal) build();
    modal.hidden = false; msg('');
    if (!info) { try { info = await j('/api/extension/info'); } catch (e) { info = {}; } }
    modal.querySelector('#extVer').textContent = info && info.version ? 'v' + info.version : '';
    paint(); clearInterval(timer); timer = setInterval(paint, 2500);
  }
  function close() { if (modal) modal.hidden = true; clearInterval(timer); }
  window.openExtModal = open;
  fab.addEventListener('click', open);
})();
