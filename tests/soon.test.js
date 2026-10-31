// Проверки экрана «Скоро начнём»: фильтрация настроек, таймер, защита от чужих имён файлов фона.
const assert = require('assert');
const os = require('os'); const fs = require('fs'); const path = require('path');
const soon = require('../soonData');
soon.init(async () => ({ title: 'Тест', game: 'Игра', login: 'chan' }));
const before = soon.getSettings();

let s = soon.update({ accent: 'red', accent2: '#ABCDEF', minutes: 99999, emberCount: -5, chat: 'up', kicker: 'a\nb', bgImage: '../../etc/passwd', timerMode: 'clock', clock: '25:99' });
assert.strictEqual(s.accent, before.accent, 'неверный цвет не принимается');
assert.strictEqual(s.accent2, '#abcdef', 'цвет приводится к нижнему регистру');
assert.strictEqual(s.minutes, 600, 'минуты ограничены сверху');
assert.strictEqual(s.emberCount, 0, 'искры ограничены снизу');
assert.strictEqual(s.chat, before.chat, 'неверное положение чата не принимается');
assert.strictEqual(s.kicker, 'a b', 'переносы строк убираются');
assert.strictEqual(s.bgImage, '', 'имя фона нельзя задать общим сохранением');
assert.strictEqual(s.clock, before.clock, 'неверное время не принимается');
assert.strictEqual(s.timerMode, 'clock');
assert.strictEqual(soon.update({ layout: 'column' }).layout, 'column', 'вид «Колонка» принимается');
assert.strictEqual(soon.update({ layout: 'bad' }).layout, 'column', 'неверный вид не принимается');

(async () => {
  let st = await soon.state();
  assert.strictEqual(st.timer.endAt, 0, 'таймер сначала не запущен');
  assert.strictEqual(st.channel.game, 'Игра', 'категория приходит с Twitch');
  const end = soon.startTimer(5);
  assert.ok(end > Date.now() + 299000 && end < Date.now() + 301000, 'таймер на 5 минут');
  const sy = await soon.sync(); assert.strictEqual(sy.game, 'Игра', 'синхронизация берёт данные Twitch');
  soon.resetTimer(); st = await soon.state(); assert.strictEqual(st.timer.endAt, 0);
  soon.resetColors(); assert.strictEqual(soon.getSettings().accent, soon.DEFAULTS.accent);
  soon.update(before); // вернуть как было, чтобы тест не менял настройки
  try { fs.unlinkSync(path.join(__dirname, '..', 'soon_settings.json')); } catch (e) { /* файла может не быть */ }
  console.log('✓ Экран «Скоро начнём»: 15 проверок пройдено');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
