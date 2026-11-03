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

  const nfmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function render(s) {
    st = s; const c = s.settings, rwOn = !!c.rewardsOn, marked = s.sounds.filter((x) => x.reward.on).length;
    $('#spPwr').classList.toggle('on', !!c.enabled); $('#spPwrT').textContent = c.enabled ? 'Саундпад включён' : 'Саундпад выключен';
    $('#spVol').value = c.volume; $('#spVolV').textContent = c.volume + '%';
    $('#spRwPwr').classList.toggle('on', rwOn); $('#spRwPwrT').textContent = rwOn ? 'Награды за баллы включены' : 'Награды за баллы выключены';
    if (document.activeElement !== $('#spRwCostAll')) $('#spRwCostAll').value = c.rewardCost;
    if (document.activeElement !== $('#spRwCdAll')) $('#spRwCdAll').value = c.rewardCooldown;
    const r = s.reward, bad = r && r.text && !['ok', 'idle', 'wait'].includes(r.state);
    $('#spRwStat').textContent = (marked ? 'Отмечено звуков: ' + marked : 'Отметь монетой звуки, которые отдаёшь за баллы') + (rwOn && r && r.text ? ' · ' + r.text : '');
    $('#spRwStat').style.color = bad ? '#e5484d' : '';
    $('#spGrid').classList.toggle('rw-off', !rwOn);
    $('#spGrid').innerHTML = s.sounds.map((x) => '<div class="sp-t' + (x.reward.on ? ' marked' : '') + '" role="button" tabindex="0" data-id="' + esc(x.id) + '" title="Нажми, чтобы послушать у себя">' +
      '<button type="button" class="tb rwb" data-mark="' + esc(x.id) + '" title="' + (x.reward.on ? 'Звук отмечен для наград: ' + nfmt(x.reward.effCost) + ' баллов. Нажми, чтобы снять' : 'Отметить для награды за баллы') + '">🪙' + (x.reward.on ? '<i>' + nfmt(x.reward.effCost) + '</i>' : '') + '</button>' +
      '<button type="button" class="tb gear" data-gear="' + esc(x.id) + '" title="Настройки звука">⚙</button>' +
      '<span class="em">' + esc(x.emoji) + '</span><span class="nm">' + esc(x.name) + '</span>' + (x.hotkey ? '<span class="hk" title="Горячая клавиша">⌨ ' + esc(x.hotkey) + '</span>' : '') +
      '<button type="button" class="tb live" data-live="' + esc(x.id) + '" title="Сыграть на стриме">▶ на стрим</button></div>').join('') +
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
  // клик по плитке — послушать у себя; ▶ — сыграть на стриме; 🪙 — отметить для награды; ⚙ — настройки
  function hear(id) {
    const x = st && st.sounds.find((y) => y.id === id); if (!x) return;
    if (listen) { listen.pause(); listen = null; }
    listen = new Audio('/' + x.url); listen.volume = Math.min(1, x.volume / 100 * (st.settings.volume / 100) + 0.0001); listen.play().catch(() => flash('Браузер не дал проиграть звук'));
  }
  function fire(id, el) { if (!el) return; el.classList.add('fire'); setTimeout(() => el.classList.remove('fire'), 450); }
  $('#spGrid').addEventListener('click', (e) => {
    if (e.target.closest('#spAdd')) { $('#spFile').click(); return; }
    const g = e.target.closest('[data-gear]'); if (g) { e.stopPropagation(); openBox(g.dataset.gear); return; }
    const m = e.target.closest('[data-mark]'); if (m) { e.stopPropagation(); const x = st.sounds.find((y) => y.id === m.dataset.mark); post('/api/soundpad/mark', { ids: [m.dataset.mark], on: !(x && x.reward.on) }).then((j) => { render(j); setTimeout(load, 4000); }); return; }
    const l = e.target.closest('[data-live]'); if (l) { e.stopPropagation(); const t = l.closest('.sp-t'); fire(l.dataset.live, t); post('/api/soundpad/play', { id: l.dataset.live }).then((j) => { if (j && j.success === false) flash(j.error || 'Не сыграло'); else if (j && j.played === false) flash('Саундпад выключен'); else flash('Играет на стриме'); }); return; }
    const t = e.target.closest('.sp-t[data-id]'); if (!t) return;
    fire(t.dataset.id, t); hear(t.dataset.id);
  });
  $('#spGrid').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sp-t') && e.target.dataset.id) { e.preventDefault(); fire(e.target.dataset.id, e.target); hear(e.target.dataset.id); } });

  // награды: главный переключатель, цена и пауза по умолчанию, отметить все / снять
  $('#spRwPwr').addEventListener('click', () => {
    if (!st) return; const on = !st.settings.rewardsOn;
    if (on && !st.sounds.some((x) => x.reward.on)) flash('Сначала отметь монетой нужные звуки или нажми «Отметить все»');
    setS({ rewardsOn: on }); setTimeout(load, 5000);
  });
  let rwT = 0;
  ['#spRwCostAll', '#spRwCdAll'].forEach((q) => $(q).addEventListener('input', () => { clearTimeout(rwT); rwT = setTimeout(() => { setS({ rewardCost: Number($('#spRwCostAll').value) || 100, rewardCooldown: Number($('#spRwCdAll').value) || 0 }); setTimeout(load, 5000); }, 600); }));
  $('#spMarkAll').addEventListener('click', () => post('/api/soundpad/mark', { all: true, on: true }).then((j) => { render(j); flash('Отмечено: ' + j.sounds.length); setTimeout(load, 5000); }));
  $('#spMarkNone').addEventListener('click', () => post('/api/soundpad/mark', { all: true, on: false }).then((j) => { render(j); flash('Отметки сняты'); setTimeout(load, 5000); }));
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
      $('#spRwOn').checked = !!x.reward.on; $('#spRwTitle').value = x.reward.title; $('#spRwTitle').placeholder = x.emoji + ' ' + x.name; $('#spRwCost').value = x.reward.cost > 0 ? x.reward.cost : ''; $('#spRwCost').placeholder = st.settings.rewardCost; $('#spRwCd').value = x.reward.cooldown >= 0 ? x.reward.cooldown : ''; $('#spRwCd').placeholder = st.settings.rewardCooldown;
    }
    const k = st.keys || {}; $('#spHk').value = x.hotkey || '';
    $('#spHkMsg').textContent = !x.hotkey ? '' : (k.supported === false ? 'Горячие клавиши работают только на Windows. Ссылка для Stream Deck ниже работает везде.' : (k.failed || []).includes(x.id) ? 'Это сочетание занято другой программой. Выбери другое.' : k.running ? 'Сочетание активно.' : (k.text || 'Запускаем...'));
    $('#spHkMsg').style.color = x.hotkey && ((k.failed || []).includes(x.id) || (k.text && !k.running)) ? '#e5484d' : '';
    $('#spSdUrl').value = location.origin + '/api/soundpad/hit/' + encodeURIComponent(x.id) + '?key=' + st.settings.hitKey;
    $('#spRwBox').style.display = x.reward.on ? '' : 'none'; $('#spBDel').style.display = x.builtin ? 'none' : '';
    const r = st.reward; $('#spRwMsg').textContent = r && r.text ? r.text : 'Награду создаёт само приложение. Нужен вход через Twitch. Работает, когда включены «Награды за баллы» над плитками.'; $('#spRwMsg').style.color = r && !['ok', 'idle', 'wait'].includes(r.state) ? '#e5484d' : '';
  }
  let sv = 0;
  function saveBox() {
    const x = cur(); if (!x) return; clearTimeout(sv);
    sv = setTimeout(() => post('/api/soundpad/sound', { id: x.id, name: $('#spBName').value, emoji: $('#spBEm').value, volume: Number($('#spBVol').value), reward: { on: $('#spRwOn').checked, title: $('#spRwTitle').value, cost: $('#spRwCost').value === '' ? 0 : Number($('#spRwCost').value), cooldown: $('#spRwCd').value === '' ? -1 : Number($('#spRwCd').value), id: x.reward.id } }).then((j) => { if (j.success === false) flash(j.error); else { render(j); flash('Сохранено'); setTimeout(load, 4000); } }), 350);
  }
  ['#spBName', '#spBEm', '#spBVol', '#spRwOn', '#spRwTitle', '#spRwCost', '#spRwCd'].forEach((q) => $(q).addEventListener(q === '#spRwOn' ? 'change' : 'input', () => { $('#spBVolV').textContent = $('#spBVol').value + '%'; if (q === '#spRwOn') $('#spRwBox').style.display = $('#spRwOn').checked ? '' : 'none'; saveBox(); }));
  // горячая клавиша: нажми в поле, затем сочетание
  const KEYNAME = (e) => {
    const c = e.code; let m;
    if ((m = /^Key([A-Z])$/.exec(c))) return m[1]; if ((m = /^Digit([0-9])$/.exec(c))) return m[1]; if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
    if ((m = /^Numpad([0-9])$/.exec(c))) return 'Num' + m[1];
    return ({ Space: 'Space', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Pause: 'Pause', ScrollLock: 'ScrollLock' })[c] || '';
  };
  function setHotkey(text) {
    const x = cur(); if (!x) return;
    post('/api/soundpad/sound', { id: x.id, hotkey: text }).then((j) => { if (j.success === false) { flash(j.error); $('#spHkMsg').textContent = j.error; $('#spHkMsg').style.color = '#e5484d'; $('#spHk').value = x.hotkey || ''; } else { render(j); flash(text ? 'Клавиша назначена' : 'Клавиша убрана'); setTimeout(load, 2500); } });
  }
  $('#spHk').addEventListener('focus', () => { $('#spHk').value = ''; $('#spHk').placeholder = 'Нажми сочетание клавиш…'; });
  $('#spHk').addEventListener('blur', () => { const x = cur(); $('#spHk').value = x ? x.hotkey || '' : ''; $('#spHk').placeholder = 'Нажми сюда, затем сочетание, например Ctrl+Alt+1'; });
  $('#spHk').addEventListener('keydown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { $('#spHk').blur(); return; }
    const key = KEYNAME(e); if (!key) return;    // одни модификаторы — ждём основную клавишу
    const text = [e.ctrlKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.metaKey ? 'Win' : '', key].filter(Boolean).join('+');
    $('#spHk').blur(); setHotkey(text);
  });
  $('#spHkClr').addEventListener('click', () => setHotkey(''));
  $('#spSdCopy').addEventListener('click', () => { const u = $('#spSdUrl').value; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => flash('Ссылка скопирована'), () => { $('#spSdUrl').select(); flash('Выдели и скопируй вручную'); }); });
  $('#spSdUrl').addEventListener('focus', () => $('#spSdUrl').select());
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
