const assert = require('assert'); const fs = require('fs'); const path = require('path');
const f = path.join(__dirname, '..', 'shoutouts.json'); const had = fs.existsSync(f) ? fs.readFileSync(f) : null;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
(async () => {
  const sent = []; const so = require('../shoutouts'); so.init({ say: async (t) => { sent.push(t); return true; } });
  so.setSettings({ enabled: true, onRaid: true, onReturn: true, text: 'К {user}: twitch.tv/{login}', cooldownHours: 12 });
  so.onRaid({ login: 'Tokiof', name: 'Tokiof', id: '5' }); await new Promise((r) => setTimeout(r, 20));
  ok(sent.length === 1 && sent[0] === 'К Tokiof: twitch.tv/tokiof', 'отметка при рейде');
  so.onChat('tokiof', []); await new Promise((r) => setTimeout(r, 20));
  ok(sent.length === 1, 'в паузу не отмечаем снова');
  so.remove('x'); const st = so.getState(); st.list[0].lastShoutAt = 0; // имитация: пауза прошла
  fs.writeFileSync(f, JSON.stringify({ settings: st.settings, list: st.list })); delete require.cache[require.resolve('../shoutouts')];
  const so2 = require('../shoutouts'); so2.init({ say: async (t) => { sent.push(t); return true; } });
  so2.onChat('someone', []); so2.onChat('tokiof', ['starlkov']); so2.onChat('tokiof', ['starlkov']); await new Promise((r) => setTimeout(r, 20));
  ok(sent.length === 2, 'возвращение: отметка один раз, чужие игнорируются');
  so2.setSettings({ enabled: false }); so2.onRaid({ login: 'new1', name: 'New1' }); await new Promise((r) => setTimeout(r, 20));
  ok(sent.length === 2 && so2.getState().list.some((e) => e.login === 'new1'), 'выключено: запоминает, но молчит');
  ok(so2.add('bad nick!').ok === false, 'проверка ника');
  if (had) fs.writeFileSync(f, had); else fs.unlinkSync(f);
  console.log('shoutouts: ' + n + ' проверок ок');
})().catch((e) => { if (had) fs.writeFileSync(f, had); else try { fs.unlinkSync(f); } catch (x) {} console.error(e); process.exit(1); });
