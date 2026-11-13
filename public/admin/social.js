'use strict';
// Вкладка «Соцсети»: Телеграм, Discord и ВКонтакте в трёх колонках.
// Прежние разделы остаются как есть и открываются кнопкой «Детальная настройка» в окне поверх страницы.
(() => {
  const $ = (id) => document.getElementById(id);
  const sec = $('tab-social'); if (!sec) return;
  const NETS = [
    { k: 'tg', name: 'Телеграм', sec: 'tab-telegram', api: '/api/telegram', color: '#29A9EB', master: 'tgEnabled', test: 'tgTest',
      tog: [['Скриншот эфира', 'tgScreen'], ['Кнопка «Смотреть стрим»', 'tgButton'], ['Живой анонс', 'tgLive'], ['Пост «Стрим закончился»', 'tgEndPost'], ['Карточки из хроник', 'tgChr']],
      note: 'Текст анонса, шаблоны и предпросмотр поста — в детальной настройке.',
      info: (s) => { const ok = s.mode === 'own' ? (s.hasToken && s.chatId) : s.relayLinked; return [ok, ok ? (s.mode === 'own' ? 'Канал ' + s.chatId : (s.relayTitle || 'Канал привязан')) : 'Канал не подключён']; } },
    { k: 'dc', name: 'Discord', sec: 'tab-discord', api: '/api/discord', color: '#5865F2', master: 'dcEnabled', test: 'dcTest',
      tog: [['Анонс при старте стрима', 'dcAnn'], ['Донаты', 'dcEvDon'], ['Рейды', 'dcEvRaid'], ['Подписки', 'dcEvSub'], ['Новые фолловеры', 'dcEvFol'], ['Итог после стрима', 'dcEvEnd']],
      note: 'Вебхук, упоминания, текст анонса и бот со слэш-командами — в детальной настройке.',
      info: (s) => [s.hasWebhook, s.hasWebhook ? 'Вебхук подключён' + (s.botEnabled ? ', бот включён' : '') : 'Вебхук не подключён'] },
    { k: 'vk', name: 'ВКонтакте', sec: 'tab-vk', api: '/api/vk', color: '#0077FF', master: 'vkEnabled', test: 'vkTest',
      tog: [['Анонс при старте стрима', 'vkAnn'], ['Анонс постом на стену', 'vkWall'], ['Донаты', 'vkEvDon'], ['Рейды', 'vkEvRaid'], ['Подписки', 'vkEvSub'], ['Итог после стрима', 'vkEvEnd']],
      note: 'Ключ сообщества, ID, номер беседы и текст анонса — в детальной настройке. События идут в беседу.',
      info: (s) => { const ok = s.hasToken && s.groupId; return [ok, ok ? 'Сообщество ' + s.groupId + (s.chat ? (/[\s,;]+\d/.test(s.chat) ? ', беседы ' : ', беседа ') + s.chat : ', без беседы') : 'Ключ не подключён']; } },
  ];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const cols = $('socCols');
  cols.innerHTML = NETS.map((n) => `
    <div class="soc-col" data-k="${n.k}">
      <div class="soc-bar4" style="background:${n.color}"></div>
      <div class="soc-in">
        <div class="soc-head"><img src="assets/soc-${n.k}.png" alt=""><div class="soc-nm"><b>${n.name}</b><div class="soc-st"><i></i><span data-st>…</span></div></div>
          <label class="soc-sw" title="Включить или выключить"><input type="checkbox" data-master><i></i></label></div>
        <div><div class="soc-lbl" style="margin-bottom:6px">ЧТО ПУБЛИКОВАТЬ</div>
          <div class="soc-list">${n.tog.map(([t, id]) => `<div class="soc-row"><span>${esc(t)}</span><label class="soc-sw"><input type="checkbox" data-id="${id}"><i></i></label></div>`).join('')}</div></div>
        <div class="soc-note">${esc(n.note)}</div>
        <div class="soc-msg" data-msg></div>
        <div class="soc-btns"><button class="btn btn-secondary btn-sm" type="button" data-test>Тестовый анонс</button><button class="btn btn-primary btn-sm" type="button" data-detail>Детальная настройка</button></div>
      </div>
    </div>`).join('');

  const col = (k) => cols.querySelector(`.soc-col[data-k="${k}"]`);
  const loadedAt = {};
  function preload(n) { // раздел грузит данные, когда становится активным: включаем его невидимо на мгновение
    const s = $(n.sec); if (!s || loadedAt[n.k]) return; loadedAt[n.k] = 1;
    s.classList.add('active', 'soc-pre'); setTimeout(() => s.classList.remove('active', 'soc-pre'), 80);
  }
  function pull() { // состояние переключателей берём из прежних разделов
    NETS.forEach((n) => {
      const c = col(n.k); if (!c) return;
      const m = $(n.master); if (m && document.activeElement !== c.querySelector('[data-master]')) c.querySelector('[data-master]').checked = m.checked;
      n.tog.forEach(([, id]) => { const src = $(id), dst = c.querySelector(`[data-id="${id}"]`); if (src && dst && document.activeElement !== dst) dst.checked = src.checked; });
    });
  }
  async function status() {
    for (const n of NETS) {
      try {
        const r = await fetch(n.api); const s = await r.json(); const c = col(n.k); if (!c) continue;
        const [ok, text] = n.info(s); c.dataset.ok = ok ? '1' : ''; c.querySelector('[data-st]').textContent = text;
        const m = c.querySelector('[data-msg]'); if (!m.dataset.keep) { m.textContent = s.lastError ? 'Ошибка: ' + s.lastError : ''; m.className = 'soc-msg' + (s.lastError ? ' err' : ''); }
      } catch (e) { /* сервер занят */ }
    }
  }
  function flip(src, v) { if (!src) return; src.checked = v; src.dispatchEvent(new Event('change', { bubbles: true })); }
  cols.addEventListener('change', (e) => {
    const c = e.target.closest('.soc-col'); if (!c) return; const n = NETS.find((x) => x.k === c.dataset.k);
    if (e.target.matches('[data-master]')) flip($(n.master), e.target.checked);
    else if (e.target.dataset.id) flip($(e.target.dataset.id), e.target.checked);
    setTimeout(status, 900);
  });
  cols.addEventListener('click', (e) => {
    const c = e.target.closest('.soc-col'); if (!c) return; const n = NETS.find((x) => x.k === c.dataset.k);
    if (e.target.closest('[data-detail]')) openDetail(n);
    else if (e.target.closest('[data-test]')) {
      const b = $(n.test), m = c.querySelector('[data-msg]'); if (!b) return;
      m.dataset.keep = '1'; m.className = 'soc-msg'; m.textContent = 'Отправляю…'; b.click();
      setTimeout(() => { const src = $({ tg: 'tgMsg', dc: 'dcMsg', vk: 'vkMsg' }[n.k]); m.textContent = (src && src.textContent) || 'Готово'; m.className = 'soc-msg' + (src && /error/.test(src.className) ? ' err' : ''); setTimeout(() => { delete m.dataset.keep; status(); }, 6000); }, 2500);
    }
  });

  // окно детальной настройки
  let veil = null, openSec = null;
  function openDetail(n) {
    const s = $(n.sec); if (!s) return; closeDetail();
    veil = document.createElement('div'); veil.className = 'soc-veil'; document.body.appendChild(veil); veil.addEventListener('click', closeDetail);
    if (!s.querySelector(':scope > .soc-top')) {
      const t = document.createElement('div'); t.className = 'soc-top';
      t.innerHTML = `<img src="assets/soc-${n.k}.png" alt=""><b>${n.name}: детальная настройка</b><button class="btn btn-primary btn-sm" type="button">Готово</button>`;
      t.querySelector('button').addEventListener('click', closeDetail); s.insertBefore(t, s.firstChild);
    }
    s.classList.add('soc-open', 'active'); openSec = s; s.scrollTop = 0;
  }
  function closeDetail() {
    if (veil) { veil.remove(); veil = null; }
    if (openSec) { openSec.classList.remove('soc-open', 'active'); openSec = null; setTimeout(pull, 50); setTimeout(status, 300); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSec) closeDetail(); });

  let started = false;
  function start() { if (started) return; started = true; NETS.forEach(preload); setTimeout(pull, 700); status(); }
  const tick = () => { if (sec.classList.contains('active') && !document.hidden) { pull(); } };
  setInterval(tick, 1200); setInterval(() => { if (sec.classList.contains('active') && !document.hidden && !openSec) status(); }, 8000);
  new MutationObserver(() => { if (sec.classList.contains('active')) { start(); pull(); status(); } }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  if (sec.classList.contains('active')) start();
  document.querySelectorAll('.nav-item[data-tab="social"]').forEach((x) => x.addEventListener('click', () => setTimeout(() => { start(); status(); }, 50)));
})();
