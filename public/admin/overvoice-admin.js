// overvoice-admin.js — вкладка «Овервойс»: библиотека голосов, прослушка, настройки, звук и OBS.
// Овервойс (мод) работает отдельной программой; вкладка говорит с ним через Overdeck: /api/mods/overvoice/p/api/nv/...
(function () {
  'use strict';
  const sec = document.getElementById('tab-overvoice'); if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const P = '/api/mods/overvoice/p';
  const jget = (u) => fetch(u).then((r) => r.json());
  const jsend = (m, u, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json());
  const lsGet = (k) => { try { return localStorage.getItem('ov.' + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('ov.' + k, v); } catch (e) { /* без хранилища не страшно */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => VoicePack.norm(s), stem = (s) => VoicePack.stem(s);
  const flash = (m) => { const e = $('#ovSaved'); e.textContent = m; e.className = 'ui3-saved' + (m ? ' ok' : ''); clearTimeout(flash.t); flash.t = setTimeout(() => { e.textContent = ''; e.className = 'ui3-saved'; }, 1800); };

  // ---- состояние ----
  let prog = null, nv = null, lib = null, info = null, cable = null, busy = false, tick = 0;
  let sel = lsGet('sel') || '', pane = 'voice', playing = '', selfTest = null, working = false;
  const audio = new Audio();
  audio.onended = () => { playing = ''; renderGrid(); };

  // ---- движок ----
  const setS = (key, val) => fetch(P + '/api/nv/engine/update_settings', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key: key, val: String(val) }) })
    .then((r) => r.json()).then((j) => { if (j && j.modelSlots) info = j; return j; });
  const gateToVal = (v) => (Number(v) === 0 ? 0 : Math.pow(10, -5 + Number(v) / 50));
  const KEYS = { pitch: ['tran', (v) => v], idx: ['indexRatio', (v) => v / 100], gate: ['silentThreshold', gateToVal], vol: ['serverOutputAudioGain', (v) => v / 100] };
  const slotOf = (v) => { if (!info) return -1; const s = (info.modelSlots || []).filter((x) => x && x.name && norm(stem(x.name)) === norm(stem(v.model)))[0]; return s ? Number(s.slotIndex) : -1; };
  const cur = () => (lib && lib.voices || []).filter((v) => v.name === sel)[0] || null;
  const live = () => !!info && Number(info.serverAudioStated) === 1;
  const engineUp = () => !!info;

  function applyVoice(v) {   // выбрать голос в движке и применить его настройки
    const slot = slotOf(v); if (slot < 0) return Promise.resolve(false);
    let ch = setS('modelSlotIndex', slot).then(() => setS('passThrough', modeOwn() ? 1 : 0));
    Object.keys(KEYS).forEach((k) => { ch = ch.then(() => { if (k === 'idx' && !v.hasIndex) return; return setS(KEYS[k][0], KEYS[k][1](v.settings[k])); }).catch(() => { }); });
    return ch.then(() => true);
  }
  const modeOwn = () => !!info && Number(info.passThrough) === 1;

  // ---- загрузка данных ----
  function load() {
    return jget('/api/mods/overvoice').then((p) => {
      prog = p;
      if (!p.installed || !p.running) { nv = lib = info = cable = null; return; }
      return Promise.all([jget(P + '/api/nv/state'), jget(P + '/api/nv/library')]).then((r) => {
        nv = r[0]; lib = r[1];
        if (!sel && lib.voices && lib.voices[0]) { sel = lib.voices[0].name; }
        if (nv.status && nv.status.running) return jget(P + '/api/nv/engine/info').then((i) => { info = i; }).catch(() => { info = null; });
        info = null;
      }).then(() => { if (!cable || tick % 4 === 0) return jget(P + '/api/nv/cable').then((c) => { cable = c; }).catch(() => { }); });
    }).catch(() => { }).then(() => { tick++; render(); });
  }

  // ---- отрисовка ----
  const hue = (n) => { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360; return h; };
  function render() {
    const p = prog; if (!p) return;
    $('#ovEmpty').hidden = !!p.installed;
    $('#ovAutoW').hidden = !p.installed; if (document.activeElement !== $('#ovAuto')) $('#ovAuto').checked = !!p.autostart;
    $('#ovStart').hidden = !p.installed || p.running; $('#ovStop').hidden = !p.running;
    $('#ovStart').disabled = busy || p.starting; $('#ovStart').textContent = (busy || p.starting) ? 'Запускаю…' : '▶ Запустить Овервойс';
    const msg = $('#ovMsg'); msg.hidden = !(p.installed && !p.running); msg.textContent = 'Овервойс сейчас выключен. Нажми «Запустить Овервойс».';
    $('#ovMain').hidden = !(p.installed && p.running && lib);
    renderBanner();
    const up = engineUp();
    $('#ovMode').hidden = !up; $('#ovLive').hidden = !up;
    if (up) {
      const own = modeOwn();
      [].forEach.call(sec.querySelectorAll('#ovMode button'), (b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'own') === own)));
      $('#ovLive').classList.toggle('on', live()); $('#ovLiveT').textContent = live() ? 'В эфире: идёт' : 'В эфире: выключено';
    }
    if (!lib) return;
    renderGrid(); renderPanel(); renderSound();
  }
  function renderBanner() {
    const b = $('#ovBanner'); if (!nv || !prog.running) { b.hidden = true; return; }
    const st = nv.status || {}, btn = $('#ovBannerBtn'), t = $('#ovBannerT'), pr = $('#ovProg');
    b.hidden = false; b.classList.remove('warn'); pr.hidden = true; btn.hidden = false; btn.disabled = false;
    if (st.state === 'downloading' || st.state === 'unpacking') { t.textContent = st.text || 'Устанавливаю движок…'; pr.hidden = false; $('#ovBar').style.width = (st.pct || 0) + '%'; btn.hidden = true; btn._a = ''; return; }
    if (!nv.installed) { b.classList.add('warn'); t.textContent = st.state === 'error' ? 'Не удалось скачать движок: ' + (st.text || '') : 'Движок голоса не установлен (около 3 ГБ). Без него голоса не работают, но их уже можно добавлять в библиотеку.'; btn.textContent = st.state === 'error' ? 'Повторить' : 'Скачать движок'; btn._a = 'install'; return; }
    const b2 = $('#ovBannerBtn2'); b2.hidden = true;
    if (st.state === 'working') { t.textContent = st.text || 'Подожди…'; btn.hidden = true; return; }
    if (st.state === 'starting') { t.textContent = st.text || 'Запускаю движок…'; btn.hidden = true; pr.hidden = true; return; }
    if (!info) { b.classList.add('warn'); const why = (st.state === 'error' || (st.state === 'ready' && /код|Visual/.test(st.text || ''))) ? st.text : '', tl = (nv.tail || []).slice(-3).join('\n');
      t.textContent = 'Движок остановлен. Голоса подключатся к нему при запуске.' + (why ? '\nПричина: ' + why : '') + (why && tl ? '\n' + tl : ''); btn.textContent = '▶ Запустить движок'; btn._a = 'start'; b2.hidden = !(st.fix === 'vc' || st.fix === 'reinstall'); b2._a = st.fix; b2.textContent = st.fix === 'reinstall' ? 'Переустановить движок' : 'Установить Visual C++'; return; }
    b.hidden = true;
  }
  function renderGrid() {
    const g = $('#ovGrid'), vs = (lib && lib.voices) || [], active = (info && vs.filter((v) => slotOf(v) === Number(info.modelSlotIndex))[0]) || null;
    let h = '<div class="ov-drop" id="ovDropTile" tabindex="0" role="button"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 10v5M9.8 12.2 12 10l2.2 2.2"/></svg><span><b>Кинь сюда папку с голосом</b>или сразу папку с несколькими. Они сохранятся в библиотеку.</span></div>';
    h += vs.map((v) => {
      const st = v.loaded ? 'on' : (lib.running ? 'wait' : 'wait'), stT = v.loaded ? 'в движке' : (lib.running ? 'подключается…' : 'ждёт запуска');
      const isSel = v.name === sel, isAct = !!active && active.name === v.name && live();
      return '<div class="ov-v' + (isSel ? ' sel' : '') + '" role="button" tabindex="0" data-n="' + esc(v.name) + '"><div class="ov-av" style="background:linear-gradient(135deg,hsl(' + hue(v.name) + ' 70% 55%),hsl(' + ((hue(v.name) + 30) % 360) + ' 60% 32%))">' + esc(v.name.slice(0, 1).toUpperCase()) + '</div><span class="nm" title="' + esc(v.name) + '">' + esc(v.name) + '</span><span class="tg"><span class="ov-dot ' + (isAct ? 'on' : st) + '"></span>' + (isAct ? 'в эфире' : stT) + (v.hasIndex ? ' · .index' : '') + '</span><button type="button" class="ov-play' + (playing === v.name ? ' on' : '') + '" data-p="' + esc(v.name) + '"' + (v.hasSample ? '' : ' disabled') + ' title="' + (v.hasSample ? 'Послушать пример' : 'В папке нет файла примера (sample.mp3)') + '">' + (playing === v.name ? '<span class="ov-eq"><i></i><i></i><i></i></span>' : '▶') + '</button></div>';
    }).join('');
    const key = h + '|' + sel + '|' + live();
    if (g._k !== key) { g.innerHTML = h; g._k = key; }
    $('#ovCnt').textContent = vs.length + ' из ' + (info ? (info.modelSlots || []).length : 8) + ' мест';
  }
  function renderPanel() {
    const v = cur(); const e = !v;
    $('#ovVh').textContent = v ? 'Настройки: ' + v.name : 'Выбери голос слева';
    ['Pitch', 'Idx', 'Gate', 'Vol'].forEach((k) => { $('#ov' + k).disabled = e; });
    $('#ovSelf').disabled = e; $('#ovReset').disabled = e;
    $('#ovSelf').textContent = selfTest ? '■ Остановить проверку' : '🎧 Проверить на мне';
    if (!v) return;
    const s = v.settings, set = (id, val, f) => { const el = $('#' + id); if (document.activeElement !== el) el.value = val; $('#' + id + 'V').textContent = f(Number(el.value)); };
    set('ovPitch', s.pitch, (x) => (x > 0 ? '+' : '') + x); set('ovIdx', s.idx, (x) => x + '%'); set('ovGate', s.gate, (x) => x + '%'); set('ovVol', s.vol, (x) => x + '%');
    $('#ovIdx').disabled = !v.hasIndex; $('#ovIdxS').textContent = v.hasIndex ? 'насколько похоже на голос' : 'у этого голоса нет файла .index';
  }
  const devSig = (l) => (l || []).map((d) => d.index + d.name).join('|');
  function fillSel(el, list, withOff, valueNow) {
    const sig = devSig(list) + withOff; if (el._s !== sig) { el._s = sig; el.innerHTML = (withOff ? '<option value="-1">Не слышать</option>' : '') + (list || []).map((d) => '<option value="' + d.index + '">' + esc(d.name) + (d.hostAPI ? ' [' + esc(d.hostAPI) + ']' : '') + '</option>').join(''); }
    if (document.activeElement !== el && valueNow != null) el.value = String(valueNow);
  }
  const nameOf = (list, id) => { const d = (list || []).filter((x) => String(x.index) === String(id))[0]; return d ? d.name : ''; };
  let defaulted = false;
  function renderSound() {
    const i = info, ins = (i && i.serverAudioInputDevices) || [], outs = (i && i.serverAudioOutputDevices) || [];
    fillSel($('#ovIn'), ins, false, i ? i.serverInputDeviceId : null); fillSel($('#ovOut'), outs, false, i ? i.serverOutputDeviceId : null); fillSel($('#ovMon'), outs, true, i ? i.serverMonitorDeviceId : null);
    if (i && !defaulted && !busy) {   // первый раз: подобрать микрофон и кабель автоматически
      defaulted = true;
      const pick = (list, saved, rx) => { const byName = saved && list.filter((d) => d.name === saved)[0]; return byName || (rx && list.filter((d) => rx.test(d.name))[0]) || null; };
      const inD = nameOf(ins, i.serverInputDeviceId) ? null : pick(ins, lsGet('in'), /./), outD = nameOf(outs, i.serverOutputDeviceId) && /CABLE Input/i.test(nameOf(outs, i.serverOutputDeviceId)) ? null : pick(outs, lsGet('out'), /CABLE Input/i);
      if (inD) setS('serverInputDeviceId', inD.index); if (outD) setS('serverOutputDeviceId', outD.index);
    }
    // чек-лист
    const v = cur(), outName = i ? nameOf(outs, i.serverOutputDeviceId) : '', inName = i ? nameOf(ins, i.serverInputDeviceId) : '';
    const items = [
      [!!i, 'Движок работает', i ? ((i.gpus || []).filter((g) => g && g.id >= 0)[0] || { name: 'процессор' }).name : 'запусти движок'],
      [!!v && v.loaded, 'Голос выбран и подключён', v ? v.name : 'выбери карточку'],
      [!!inName, 'Микрофон выбран', inName || ''],
      [!!cable && cable.installed, 'Виртуальный кабель установлен', cable ? (cable.supported ? (cable.installed ? 'VB-Cable' : 'нет') : 'только Windows') : '...'],
      [/CABLE Input/i.test(outName), 'Голос идёт в кабель', outName || '']
    ];
    $('#ovChecks').innerHTML = items.map((c) => '<div class="ov-chk ' + (c[0] ? '' : 'bad') + '"><div class="ic">' + (c[0] ? '✓' : '!') + '</div><span>' + c[1] + '</span><small>' + esc(c[2]) + '</small></div>').join('') +
      ((cable && cable.supported && !cable.installed) ? '<div class="ov-chk todo"><div class="ic">·</div><span>Кабель нужен, чтобы голос попал в OBS</span><button type="button" class="btn btn-primary btn-sm" id="ovCable"' + (cable.status && cable.status.state === 'working' ? ' disabled' : '') + '>' + (cable.status && cable.status.state === 'working' ? 'Ставлю…' : 'Установить') + '</button></div>' : '');
  }

  // ---- действия ----
  const toast = (m) => flash(m);
  $('#ovGrid').addEventListener('click', (e) => {
    const pb = e.target.closest('.ov-play');
    if (pb) { e.stopPropagation(); if (pb.disabled) return; const n = pb.dataset.p; if (playing === n) { audio.pause(); playing = ''; } else { audio.src = P + '/api/nv/library/' + encodeURIComponent(n) + '/sample'; audio.play().catch(() => toast('Не удалось проиграть пример')); playing = n; } renderGrid(); return; }
    if (e.target.closest('#ovDropTile')) { $('#ovDir').click(); return; }
    const c = e.target.closest('.ov-v'); if (!c) return;
    sel = c.dataset.n; lsSet('sel', sel); const v = cur(); renderGrid(); renderPanel();
    if (v && info) { if (slotOf(v) < 0) toast('Голос ещё подключается к движку'); else applyVoice(v).then(() => flash('Включён голос «' + v.name + '»')); }
  });
  $('#ovGrid').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.ov-v,#ovDropTile')) { e.preventDefault(); e.target.click(); } });
  $('#ovAdd').addEventListener('click', openDlg);
  sec.querySelector('.ov-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pane = b.dataset.p; [].forEach.call(sec.querySelectorAll('.ov-tabs button'), (x) => x.setAttribute('aria-selected', String(x === b))); $('#ovPvoice').hidden = pane !== 'voice'; $('#ovPsound').hidden = pane !== 'sound'; if (pane === 'sound') startMeter(); else stopMeter(); });

  // ползунки голоса: сразу применяем в движке (если это активный голос) и сохраняем в библиотеку
  const saveT = {};
  [['ovPitch', 'pitch', (x) => (x > 0 ? '+' : '') + x], ['ovIdx', 'idx', (x) => x + '%'], ['ovGate', 'gate', (x) => x + '%'], ['ovVol', 'vol', (x) => x + '%']].forEach(([id, k, f]) => {
    $('#' + id).addEventListener('input', (e) => {
      const v = cur(); if (!v) return; const val = Number(e.target.value); v.settings[k] = val; $('#' + id + 'V').textContent = f(val);
      clearTimeout(saveT[k]); saveT[k] = setTimeout(() => {
        if (info && slotOf(v) === Number(info.modelSlotIndex)) setS(KEYS[k][0], KEYS[k][1](val)).catch(() => { });
        jsend('PUT', P + '/api/nv/library/' + encodeURIComponent(v.name) + '/settings', { [k]: val }).then(() => flash('Сохранено'));
      }, 250);
    });
  });
  sec.querySelector('.ov-chips').addEventListener('click', (e) => { const b = e.target.closest('button'); const v = cur(); if (!b || !v) return; $('#ovPitch').value = b.dataset.v; $('#ovPitch').dispatchEvent(new Event('input')); });
  $('#ovReset').addEventListener('click', () => { const v = cur(); if (!v) return; const d = { pitch: 0, idx: v.hasIndex ? 50 : 0, gate: 20, vol: 100 }; Object.assign(v.settings, d); renderPanel(); jsend('PUT', P + '/api/nv/library/' + encodeURIComponent(v.name) + '/settings', d).then(() => { if (info && slotOf(v) === Number(info.modelSlotIndex)) applyVoice(v); flash('Сброшено'); }); });

  // звук
  $('#ovIn').addEventListener('change', () => { lsSet('in', nameOf(info && info.serverAudioInputDevices, $('#ovIn').value)); setS('serverInputDeviceId', $('#ovIn').value).then(() => { startMeter(true); }); });
  $('#ovOut').addEventListener('change', () => { lsSet('out', nameOf(info && info.serverAudioOutputDevices, $('#ovOut').value)); setS('serverOutputDeviceId', $('#ovOut').value); });
  $('#ovMon').addEventListener('change', () => { setS('serverMonitorDeviceId', $('#ovMon').value); });
  $('#ovCopy').addEventListener('click', () => { const t = 'CABLE Output'; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => flash('Скопировано: ' + t), () => flash('Выдели название и скопируй вручную')); });
  $('#ovChecks').addEventListener('click', (e) => { if (e.target.id === 'ovCable') { jsend('POST', P + '/api/nv/cable/install').then(() => { flash('Windows спросит разрешение: нажми «Да»'); load(); }); } });

  // ---- авто-переключение микрофонов в OBS (obs-websocket) ----
  let obsCfg = null;
  const obsMsg = (t, bad) => { const e = $('#ovObsMsg'); e.textContent = t || ''; e.style.color = bad ? 'var(--err)' : ''; };
  const obsFill = (sel, list, cur) => { sel.innerHTML = '<option value="">— выбери —</option>' + list.map((n) => '<option>' + esc(n) + '</option>').join(''); if (cur && list.indexOf(cur) < 0) sel.insertAdjacentHTML('beforeend', '<option>' + esc(cur) + '</option>'); sel.value = cur || ''; };
  const obsSave = () => jsend('PUT', P + '/api/nv/obs', { enabled: $('#ovObsOn').checked, port: Number($('#ovObsPort').value) || 4455, main: $('#ovObsMain').value, cable: $('#ovObsCable').value, password: $('#ovObsPass').value ? $('#ovObsPass').value : undefined }).then((r) => { if (r && r.obs) obsCfg = r.obs; $('#ovObsPass').value = ''; $('#ovObsPass').placeholder = obsCfg && obsCfg.hasPassword ? '•••••• (сохранён)' : 'если задан в OBS'; $('.ov-auto', sec).classList.toggle('off', !$('#ovObsOn').checked); });
  const obsInputs = () => { obsMsg('Подключаюсь…'); return obsSave().then(() => jget(P + '/api/nv/obs/inputs')).then((r) => { if (!r || !r.success) { obsMsg((r && r.error) || 'Нет связи с OBS', true); return; } const names = r.inputs.map((i) => i.name); obsFill($('#ovObsMain'), names, obsCfg && obsCfg.main); obsFill($('#ovObsCable'), names, obsCfg && obsCfg.cable); obsMsg('OBS найден, источников: ' + names.length); }); };
  jget(P + '/api/nv/obs').then((r) => { if (!r || !r.obs) return; obsCfg = r.obs; $('#ovObsOn').checked = obsCfg.enabled; $('#ovObsPort').value = obsCfg.port; $('#ovObsPass').placeholder = obsCfg.hasPassword ? '•••••• (сохранён)' : 'если задан в OBS'; obsFill($('#ovObsMain'), [], obsCfg.main); obsFill($('#ovObsCable'), [], obsCfg.cable); $('.ov-auto', sec).classList.toggle('off', !obsCfg.enabled); }).catch(() => {});
  $('#ovObsOn').addEventListener('change', () => { obsSave().then(() => { if ($('#ovObsOn').checked) obsInputs(); }); });
  ['ovObsMain', 'ovObsCable', 'ovObsPort'].forEach((id) => $('#' + id).addEventListener('change', () => { obsSave(); }));
  $('#ovObsLoad').addEventListener('click', obsInputs);
  const obsLive = (on) => (obsCfg && obsCfg.enabled ? jsend('POST', P + '/api/nv/obs/live', { on }).then((r) => { if (r && r.success === false) flash('OBS: ' + r.error); }).catch(() => {}) : Promise.resolve());

  // режим и эфир
  $('#ovMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !info) return; setS('passThrough', b.dataset.m === 'own' ? 1 : 0).then(() => { flash(b.dataset.m === 'own' ? 'Обход: в эфир идёт твой голос' : 'Нейроголос включён'); render(); }); });
  function goLive(on) {
    const ch = on
      ? setS('serverInputDeviceId', $('#ovIn').value).then(() => setS('serverOutputDeviceId', $('#ovOut').value)).then(() => setS('serverMonitorDeviceId', $('#ovMon').value)).then(() => setS('enableServerAudio', 1)).then(() => setS('serverAudioStated', 1))
      : setS('serverAudioStated', 0);
    return ch;
  }
  $('#ovLive').addEventListener('click', () => {
    if (!info || busy) return; busy = true; $('#ovLive').disabled = true;
    const on = !live(), v = cur();
    (on && v ? applyVoice(v) : Promise.resolve()).then(() => goLive(on)).then(() => obsLive(on)).then(() => { selfTest = null; return load(); }).catch(() => flash('Не удалось переключить эфир')).then(() => { busy = false; $('#ovLive').disabled = false; });
  });
  // «проверить на мне»: звук идёт только в наушники, в кабель (OBS) ничего не уходит
  $('#ovSelf').addEventListener('click', () => {
    if (!info || busy) { flash('Сначала запусти движок'); return; }
    if (selfTest) { const st = selfTest; selfTest = null; busy = true; setS('serverAudioStated', st.wasLive ? 1 : 0).then(() => setS('serverOutputDeviceId', st.out)).then(() => load()).then(() => { busy = false; }); return; }
    const mon = Number($('#ovMon').value), v = cur();
    if (!(mon >= 0)) { flash('Выбери наушники в «Слышать себя»'); pane = 'sound'; sec.querySelector('.ov-tabs button[data-p=sound]').click(); return; }
    if (!v) return; busy = true;
    const st = { out: Number(info.serverOutputDeviceId), wasLive: live() }; selfTest = st;
    applyVoice(v).then(() => setS('serverOutputDeviceId', mon)).then(() => setS('serverMonitorDeviceId', -1)).then(() => setS('serverInputDeviceId', $('#ovIn').value)).then(() => setS('enableServerAudio', 1)).then(() => setS('serverAudioStated', 1)).then(() => { flash('Говори: результат слышишь только ты'); return load(); }).catch(() => { selfTest = null; flash('Не удалось запустить проверку'); }).then(() => { busy = false; renderPanel(); });
  });
  $('#ovBannerBtn2').addEventListener('click', () => { const a = $('#ovBannerBtn2')._a; if (a === 'reinstall') jsend('POST', P + '/api/nv/install', { force: true }).then(load); else jsend('POST', P + '/api/nv/vc/install').then(load); });
  $('#ovBannerBtn').addEventListener('click', () => { const a = $('#ovBannerBtn')._a; if (a === 'install') jsend('POST', P + '/api/nv/install').then(load); else if (a === 'start') jsend('POST', P + '/api/nv/start').then(load); });

  // программа Овервойс
  $('#ovStart').addEventListener('click', () => { busy = true; load(); jsend('POST', '/api/mods/overvoice/start').then((j) => { busy = false; if (j.success === false) { const m = $('#ovMsg'); m.hidden = false; m.textContent = j.error || 'Не удалось запустить'; } load(); }); });
  $('#ovStop').addEventListener('click', () => { jsend('POST', '/api/mods/overvoice/stop').then(load); });
  $('#ovAuto').addEventListener('change', () => { jsend('POST', '/api/mods/overvoice/settings', { autostart: $('#ovAuto').checked }).then(() => flash('Сохранено')); });

  // ---- индикатор уровня микрофона (в браузере) ----
  let stream = null, actx = null, raf = 0;
  function stopMeter() { cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; if (actx) { try { actx.close(); } catch (e) { /* ок */ } actx = null; } $('#ovLvl').style.width = '0'; }
  function startMeter(again) {
    if (again) stopMeter(); if (stream || !navigator.mediaDevices) { if (!navigator.mediaDevices) $('#ovMeterMsg').textContent = 'Браузер не даёт доступ к микрофону для индикатора.'; return; }
    const want = nameOf(info && info.serverAudioInputDevices, $('#ovIn').value).replace(/\s*\[.*\]$/, '').toLowerCase();
    const open = (id) => navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true });
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s0) => { s0.getTracks().forEach((t) => t.stop()); return navigator.mediaDevices.enumerateDevices(); })
      .then((ds) => { const m = want && ds.filter((d) => d.kind === 'audioinput' && d.label && (want.indexOf(d.label.toLowerCase().replace(/^default - /, '')) >= 0 || d.label.toLowerCase().indexOf(want) >= 0))[0]; return open(m ? m.deviceId : null); })
      .then((s) => {
        if (pane !== 'sound' || stream) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s; $('#ovMeterMsg').textContent = ''; actx = new (window.AudioContext || window.webkitAudioContext)(); const an = actx.createAnalyser(); an.fftSize = 512; actx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize); const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i] - 128)); $('#ovLvl').style.width = Math.min(100, m / 90 * 100) + '%'; raf = requestAnimationFrame(loop); }; loop();
      }).catch(() => { $('#ovMeterMsg').textContent = 'Индикатор уровня не работает: браузер не дал доступ к микрофону. На сам голос это не влияет.'; });
  }

  // ---- окно «Добавить голоса» ----
  const modal = $('#ovOv'), box = modal.querySelector('.mu-mbox');
  const say = (t, kind) => { const e = $('#ovPmsg'); e.textContent = t || ''; e.className = 'ex-sm' + (kind === 'ok' ? ' ov-ok' : (kind === 'err' ? ' ov-bad' : '')); };
  const clean = (n) => String(n).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim().slice(0, 80) || 'Голос';
  function openDlg() { modal.hidden = false; }
  function closeDlg() { if (working) return; modal.hidden = true; box.classList.remove('busy'); $('#ovPlist').innerHTML = ''; say(''); }
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-ovclose]')) closeDlg(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeDlg(); });
  $('#ovDrop').addEventListener('click', () => $('#ovDir').click());
  $('#ovDrop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#ovDir').click(); } });
  $('#ovFiles').addEventListener('click', () => $('#ovFile').click());
  const fromInput = (inp) => [].slice.call(inp.files || []).map((f) => ({ path: f.webkitRelativePath || f.name, name: f.name, file: f }));
  $('#ovDir').addEventListener('change', () => { const l = fromInput($('#ovDir')); $('#ovDir').value = ''; openDlg(); addFiles(l); });
  $('#ovFile').addEventListener('change', () => { const l = fromInput($('#ovFile')); $('#ovFile').value = ''; openDlg(); addFiles(l); });
  const walk = (entry, path, out) => new Promise((resolve) => {
    if (entry.isFile) { entry.file((f) => { out.push({ path: path + f.name, name: f.name, file: f }); resolve(); }, () => resolve()); return; }
    const rd = entry.createReader(); let all = [];
    (function next() { rd.readEntries((b) => { if (!b.length) { Promise.all(all.map((en) => walk(en, path + entry.name + '/', out))).then(resolve); return; } all = all.concat([].slice.call(b)); next(); }, () => resolve()); })();
  });
  const fromDrop = (dt) => {
    const items = [].slice.call(dt.items || []).map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean), out = [];
    if (!items.length) return Promise.resolve([].slice.call(dt.files || []).map((f) => ({ path: f.name, name: f.name, file: f })));
    return Promise.all(items.map((en) => walk(en, '', out))).then(() => out);
  };
  // файлы хранятся под именем голоса (model.pth у разных голосов одинаковый, движок их бы перепутал)
  const ext = (n) => (/\.[^.]+$/.exec(n) || [''])[0].toLowerCase();
  const target = (name, f, kind) => (kind === 'sample' ? 'sample' : name) + ext(f.name);
  const put = (name, f, kind, onp) => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('PUT', P + '/api/nv/library/' + encodeURIComponent(name) + '/' + encodeURIComponent(target(name, f, kind)));
    x.setRequestHeader('Content-Type', 'application/octet-stream'); x.upload.onprogress = (e) => { if (e.lengthComputable) onp(e.loaded); };
    x.onload = () => (x.status < 400 ? resolve() : reject(new Error('put'))); x.onerror = () => reject(new Error('put')); x.send(f);
  });
  function addFiles(list) {
    if (working) return; const g = VoicePack.group(list);
    if (!g.voices.length) { say('В этой папке нет файла голоса (.pth). Кинь папку, где лежит модель.', 'err'); return; }
    working = true; box.classList.add('busy'); say('');
    jget(P + '/api/nv/library').catch(() => ({})).then((lb) => {
      const have = {}, used = {}; ((lb && lb.voices) || []).forEach((v) => { have[norm(v.name)] = 1; });
      const rows = g.voices.map((v) => {
        let nm = clean(v.name), n = 1; const k = norm(nm); while (used[norm(nm)]) { n++; nm = clean(v.name) + ' (' + n + ')'; } used[norm(nm)] = 1; v.libName = nm; v.exists = !!have[k] && n === 1;
        const li = document.createElement('li'); li.className = 'ov-pi';
        li.innerHTML = '<span class="t">' + esc(nm) + '</span><span class="s">ждёт</span><span class="m">' + (v.index ? 'Модель и файл сходства (.index)' : 'Только модель, без .index (сходство работать не будет)') + (v.sample ? ' · есть пример' : '') + '</span><span class="pb"><i></i></span>';
        $('#ovPlist').appendChild(li); return li;
      });
      let added = 0, failed = 0, chain = Promise.resolve();
      g.voices.forEach((v, n) => {
        chain = chain.then(() => {
          const li = rows[n], st = li.querySelector('.s'), bar = li.querySelector('i'), fin = (c, t) => { li.classList.add(c); st.textContent = t; };
          if (v.exists) { fin('err', 'уже есть'); failed++; return; }
          const total = v.model.file.size + (v.index ? v.index.file.size : 0); let done = 0; const tk = (c) => { const p = Math.min(1, (done + c) / (total || 1)); bar.style.width = Math.round(p * 100) + '%'; st.textContent = Math.round(p * 100) + '%'; };
          st.textContent = '0%';
          return put(v.libName, v.model.file, 'model', tk).then(() => { done = v.model.file.size; if (v.index) return put(v.libName, v.index.file, 'index', tk); })
            .then(() => { if (v.index) done += v.index.file.size; if (v.sample && v.sample.file.size < 30e6) return put(v.libName, v.sample.file, 'sample', () => { }).catch(() => { }); })
            .then(() => { bar.style.width = '100%'; fin('ok', 'сохранён'); added++; }).catch(() => { fin('err', 'ошибка'); failed++; });
        });
      });
      return chain.then(() => { if (!added) return { added: 0, failed: failed }; say('Подключаю к движку…'); return jsend('POST', P + '/api/nv/library/sync').catch(() => null).then((sync) => ({ added, failed, sync })); });
    }).then((r) => {
      working = false; const sy = r.sync; let txt;
      if (!r.added) txt = 'Ничего не добавлено';
      else { txt = 'Добавлено голосов: ' + r.added + (r.failed ? ', не удалось: ' + r.failed : '') + '. '; txt += sy && sy.running ? (sy.failed ? 'Не все подключились к движку, попробуй ещё раз.' : (sy.full ? 'В движке нет свободных мест для ' + sy.full + ' гол.' : 'Они уже в списке голосов.')) : 'Движок не запущен: голоса подключатся сами при его запуске.'; }
      if (g.skipped.length) txt += ' ' + g.skipped.join('; ');
      say(txt, r.added && !r.failed ? 'ok' : (r.added ? '' : 'err')); load();
    });
  }
  let dragN = 0; const hasFiles = (e) => e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0, active = () => sec.classList.contains('active');
  window.addEventListener('dragenter', (e) => { if (!active() || !hasFiles(e)) return; e.preventDefault(); dragN++; if (!working) openDlg(); });
  window.addEventListener('dragleave', (e) => { if (!active() || !hasFiles(e)) return; dragN = Math.max(0, dragN - 1); $('#ovDrop').classList.remove('over'); });
  window.addEventListener('dragover', (e) => { if (!active() || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; $('#ovDrop').classList.toggle('over', !!e.target.closest('#ovOv')); });
  window.addEventListener('drop', (e) => { if (!active() || !hasFiles(e)) return; e.preventDefault(); dragN = 0; $('#ovDrop').classList.remove('over'); if (working) return; openDlg(); fromDrop(e.dataTransfer).then(addFiles); });

  // ---- мини-гайд: кнопка пульсирует, пока не нажато «Прочитано» ----
  const gm = $('#ovGuide'), gb = $('#ovGuideBtn');
  const guideRead = () => lsGet('guideRead') === '1';
  const syncGuide = () => gb.classList.toggle('pulse', !guideRead());
  const guideClose = () => { gm.hidden = true; };
  gb.addEventListener('click', () => { gm.hidden = false; $('#ovGuideRead').textContent = guideRead() ? '✓ Прочитано (отмечено)' : '✓ Прочитано'; });
  gm.addEventListener('click', (e) => { if (e.target.closest('[data-ovgclose]')) guideClose(); });
  $('#ovGuideRead').addEventListener('click', () => { lsSet('guideRead', '1'); syncGuide(); guideClose(); flash('Гайд отмечен прочитанным'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !gm.hidden) guideClose(); });
  syncGuide();

  // ---- жизненный цикл ----
  const nav = document.querySelector('[data-tab="overvoice"]');
  if (nav) nav.addEventListener('click', () => { setTimeout(load, 50); });
  document.querySelectorAll('.nav-item[data-tab]').forEach((n) => { if (n.dataset.tab !== 'overvoice') n.addEventListener('click', () => { stopMeter(); audio.pause(); playing = ''; }); });
  setInterval(() => { if (active() && !busy && !working) load(); }, 1800);
  load();
})();
