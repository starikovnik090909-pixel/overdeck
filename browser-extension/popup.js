const st = document.getElementById('st'), port = document.getElementById('port');
async function draw() {
  const s = await chrome.storage.local.get({ port: 3001, lastOk: 0, lastErr: '', enabled: false, count: 0 });
  port.value = s.port;
  const fresh = Date.now() - s.lastOk < 5000;
  st.className = fresh ? 'ok' : 'bad';
  st.textContent = fresh ? ('Связь с Overdeck есть. Видео и аудио на вкладках: ' + s.count + (s.enabled ? '' : '. Алерт «Сейчас играет» выключен в админке.')) : ('Нет связи с Overdeck' + (s.lastErr ? ': ' + s.lastErr : '. Запусти Overdeck и проверь порт.'));
}
port.addEventListener('change', async () => { await chrome.storage.local.set({ port: Number(port.value) || 3001 }); draw(); });
draw(); setInterval(draw, 1000);
