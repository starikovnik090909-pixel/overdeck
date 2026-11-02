// soundpad.js (админка) — вкладка «Саундпад»: плитки со звуками, загрузка своих, награды за баллы.
(function () {
  'use strict';
  const sec = document.getElementById('tab-soundpad');
  if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const api = (p, o) => fetch(p, o).then((r) => r.json());
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let st = null, editId = '', timer = 0, listen = null;

  const url = location.origin + '/soundpad.html';
  $('#spUrl').textContent = url;
  $('#spObs').addEventListener('click', () => { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => flash('Ссылка скопирована'), () => flash('Не удалось скопировать')); });
  function flash(m) { const e = $('#spSaved'); e.textContent = m; clearTimeout(flash.t); flash.t = setTimeout(() => { e.textContent = ''; }, 1600); }

  function render(s) {
    st = s; const c = s.settings;
    $('#spPwr').classList.toggle('on', !!c.enabled); $('#spPwrT').textContent = c.enabled ? 'Саундпад включён' : 'Саундпад выключен';
    $('#spVol').value = c.volume; $('#spVolV').textContent = c.volume + '%';
    $('#spGrid').innerHTML = s.sounds.map((x) => '<button type="button" class="sp-t" data-id="' + esc(x.id) + '" title="Играть на стриме">' + (x.reward.on ? '<span class="rw">🪙 ' + x.reward.cost + '</span>' : '') +
      '<span class="gear" data-gear="' + esc(x.id) + '" title="Настроить">⚙</span><span class="em">' + esc(x.emoji) + '</span><span class="nm">' + esc(x.name) + '</span></button>').join('') +
      (s.sounds.length < s.max ? '<button type="button" class="sp-t sp-add" id="spAdd"><span class="em">＋</span><span class="nm">Свой звук</span></button>' : '');
    if (!$('#spOv').hidden) fillBox();
  }
  const load = () => api('/api/soundpad/state').then(render).catch(() => {});
  function setS(b) { return post('/api/soundpad/settings', b).then((j) => { render(j); flash('Сохранено'); }); }

  $('#spPwr').addEventListener('click', () => { if (st) setS({ enabled: !st.settings.enabled }); });
  $('#spVol').addEventListener('input', () => { $('#spVolV').textContent = $('#spVol').value + '%'; clearTimeout(timer); timer = setTimeout(() => setS({ volume: Number($('#spVol').value) }), 250); });
  $('#spStop').addEventListener('click', () => post('/api/soundpad/stop'));
  $('#spUp').addEventListener('click', () => $('#spFile').click());
  $('#spFile').addEventListener('change', () => upload($('#spFile').files[0]));
  async function upload(f) {
    $('#spFile').value = ''; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { flash('Файл больше 5 МБ'); return; }
    const fd = new FormData(); fd.append('name', f.name.replace(/\.[^.]+$/, '')); fd.append('file', f);
    const j = await fetch('/api/soundpad/upload', { method: 'POST', body: fd }).then((r) => r.json()).catch(() => ({ success: false, error: 'Нет связи с сервером' }));
    if (!j.success) { flash(j.error || 'Не загрузилось'); return; }
    render(j); flash('Звук добавлен'); openBox(j.added.id);
  }
  $('#spGrid').addEventListener('click', (e) => {
    if (e.target.closest('#spAdd')) { $('#spFile').click(); return; }
    const g = e.target.closest('[data-gear]'); if (g) { e.stopPropagation(); openBox(g.dataset.gear); return; }
    const t = e.target.closest('.sp-t[data-id]'); if (!t) return;
    t.classList.add('fire'); setTimeout(() => t.classList.remove('fire'), 450);
    post('/api/soundpad/play', { id: t.dataset.id }).then((j) => { if (j && j.success === false) flash(j.error || 'Не сыграло'); else if (j && j.played === false) flash('Саундпад выключен'); });
  });
  // перетаскивание файла на вкладку = загрузка
  ['dragover', 'drop'].forEach((ev) => sec.addEventListener(ev, (e) => { if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); if (ev === 'drop') upload(e.dataTransfer.files[0]); }));

  // ----- окно настройки звука -----
  const cur = () => (st && st.sounds.find((x) => x.id === editId)) || null;
  function openBox(id) { editId = id; $('#spOv').hidden = false; fillBox(true); }
  function closeBox() { $('#spOv').hidden = true; editId = ''; if (listen) { listen.pause(); listen = null; } }
  function fillBox(force) {
    const x = cur(); if (!x) { closeBox(); return; }
    const act = document.activeElement, inBox = act && $('#spOv').contains(act) && /INPUT/.test(act.tagName) && !force;
    if (!inBox) {
      $('#spBEmoji').textContent = x.emoji; $('#spBName').value = x.name; $('#spBEm').value = x.emoji; $('#spBVol').value = x.volume; $('#spBVolV').textContent = x.volume + '%';
      $('#spRwOn').checked = !!x.reward.on; $('#spRwTitle').value = x.reward.title || (x.emoji + ' ' + x.name); $('#spRwCost').value = x.reward.cost; $('#spRwCd').value = x.reward.cooldown;
    }
    $('#spRwBox').style.display = x.reward.on ? '' : 'none'; $('#spBDel').style.display = x.builtin ? 'none' : '';
    const r = st.reward; $('#spRwMsg').textContent = r && r.text ? r.text : 'Награду создаёт само приложение. Нужен вход через Twitch.'; $('#spRwMsg').style.color = r && !['ok', 'idle', 'wait'].includes(r.state) ? '#e5484d' : '';
  }
  let sv = 0;
  function saveBox() {
    const x = cur(); if (!x) return; clearTimeout(sv);
    sv = setTimeout(() => post('/api/soundpad/sound', { id: x.id, name: $('#spBName').value, emoji: $('#spBEm').value, volume: Number($('#spBVol').value), reward: { on: $('#spRwOn').checked, title: $('#spRwTitle').value, cost: Number($('#spRwCost').value), cooldown: Number($('#spRwCd').value), id: x.reward.id } }).then((j) => { if (j.success === false) flash(j.error); else { render(j); flash('Сохранено'); setTimeout(load, 4000); } }), 350);
  }
  ['#spBName', '#spBEm', '#spBVol', '#spRwOn', '#spRwTitle', '#spRwCost', '#spRwCd'].forEach((q) => $(q).addEventListener(q === '#spRwOn' ? 'change' : 'input', () => { $('#spBVolV').textContent = $('#spBVol').value + '%'; if (q === '#spRwOn') $('#spRwBox').style.display = $('#spRwOn').checked ? '' : 'none'; saveBox(); }));
  $('#spBListen').addEventListener('click', () => { const x = cur(); if (!x) return; if (listen) listen.pause(); listen = new Audio('/' + x.url); listen.volume = Number($('#spBVol').value) / 100 * (st.settings.volume / 100); listen.play().catch(() => {}); });
  $('#spBDel').addEventListener('click', () => { const x = cur(); if (!x || x.builtin) return; if (!window.confirm('Удалить звук «' + x.name + '»' + (x.reward.on ? ' и его награду на Twitch' : '') + '?')) return; post('/api/soundpad/delete', { id: x.id }).then((j) => { closeBox(); render(j); flash('Удалено'); }); });
  sec.addEventListener('click', (e) => { if (e.target.closest('[data-spclose]')) closeBox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#spOv').hidden) closeBox(); });

  // обновляем при открытии вкладки и раз в несколько секунд, пока она открыта (статус наград)
  const nav = document.querySelector('[data-tab="soundpad"]');
  if (nav) nav.addEventListener('click', () => setTimeout(load, 50));
  setInterval(() => { if (sec.classList.contains('active')) load(); }, 6000);
  load();
})();
