// keyfile.js — «Ключ авторизации»: создать файл со всеми данными / открыть файл на другом ПК (⚙ → «Настройки админки»).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const msg = $('keyMsg');
  if (!msg) return;
  const say = (t, cls) => { msg.textContent = t; msg.className = 'form-message ' + (cls || ''); };
  const mb = (n) => (n / 1048576 >= 1 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');

  async function status() { try { return await (await fetch('/api/key/status')).json(); } catch (e) { return {}; } }

  function waitRestart(kind) {
    if (kind === 'auto') {
      say('Данные применены. Оверлей перезапускается…', 'success');
      let tries = 0;
      const t = setInterval(async () => {
        tries++;
        try { const r = await fetch('/api/key/status', { cache: 'no-store' }); if (r.ok && tries > 2) { clearInterval(t); location.reload(); } } catch (e) { /* ещё перезапускается */ }
        if (tries > 60) { clearInterval(t); say('Перезапуск затянулся — открой админку заново.', 'error'); }
      }, 1000);
    } else {
      say('Данные применены. Закрой оверлей и запусти его заново (Overdeck.exe или start.bat) — тогда всё подтянется.', 'success');
    }
  }

  $('btnKeyCreate').addEventListener('click', async () => {
    if (($('keyPassword').value || '').length < 6) { say('Сначала задай пароль для файла — минимум 6 символов. В файле лежат все ключи и токены.', 'error'); $('keyPassword').focus(); return; }
    say('Собираем файл…');
    try {
      const r = await fetch('/api/key/export', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('keyPassword').value, includeMedia: $('keyMedia').checked }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'ошибка ' + r.status); }
      const n = r.headers.get('X-Key-Files');
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = m ? m[1] : 'overdeck-key.overdeckkey';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say('Файл создан (' + n + ' файлов, ' + mb(blob.size) + ')' + ', защищён паролем.', 'success');
    } catch (e) { say('Не удалось создать файл: ' + e.message, 'error'); }
  });

  $('btnKeyOpen').addEventListener('click', () => $('keyFile').click());
  $('keyFile').addEventListener('change', async () => {
    const f = $('keyFile').files[0];
    $('keyFile').value = '';
    if (!f) return;
    say('Читаем файл…');
    let text;
    try { text = await f.text(); } catch (e) { say('Не удалось прочитать файл.', 'error'); return; }
    let password = '';
    for (;;) {
      const r = await fetch('/api/key/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, password, dryRun: true }) }).then((x) => x.json()).catch(() => ({ error: 'Сетевая ошибка.' }));
      if (r.needPassword) {
        const p = window.prompt(password ? 'Неверный пароль. Введи пароль файла ещё раз:' : 'Файл защищён паролем. Введи пароль:');
        if (p === null) { say('Отменено.'); return; }
        password = p; continue;
      }
      if (!r.success) { say(r.error || 'Не удалось открыть файл.', 'error'); return; }
      const s = r.summary;
      const ok = window.confirm('Применить файл авторизации?\n\nКанал: ' + (s.channel || '—') + '\nФайлов: ' + s.count + '\nСоздан: ' + new Date(s.created).toLocaleString('ru-RU') +
        '\n\nТекущие данные этого оверлея будут заменены (копия старых сохранится в папке backup_before_import).');
      if (!ok) { say('Отменено.'); return; }
      say('Применяем… (большой файл может занять минуту)');
      const a = await fetch('/api/key/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, password }) }).then((x) => x.json()).catch(() => ({ error: 'Сетевая ошибка.' }));
      if (!a.success) { say(a.error || 'Не удалось применить файл.', 'error'); return; }
      waitRestart(a.restart);
      return;
    }
  });

  $('btnKeyChannel').addEventListener('click', async () => {
    const r = await fetch('/api/key/channel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: $('keyChannel').value }) }).then((x) => x.json()).catch(() => ({ error: 'Сетевая ошибка.' }));
    if (!r.success) { say(r.error || 'Не удалось сохранить.', 'error'); return; }
    waitRestart(r.restart);
  });

  // Пустое приложение: показываем плашку сверху и поле для имени канала
  status().then((st) => {
    if (!st.setup) return;
    $('keyChannelRow').style.display = '';
    const bar = document.createElement('div');
    bar.className = 'setup-bar';
    bar.innerHTML = '<b>Overdeck ещё не настроен.</b> Начни с вкладки «Подключения» — или открой файл авторизации с другого ПК. <button type="button" class="btn btn-secondary" id="setupGo">Открыть файл авторизации</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    $('setupGo').addEventListener('click', () => { const g = $('adminSettingsGear'); if (g) g.click(); setTimeout(() => $('keyCard').scrollIntoView({ block: 'center' }), 100); });
  });
})();
