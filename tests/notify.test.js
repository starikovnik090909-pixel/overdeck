// Уведомления: каталог по блокам и важности, настройки, склейка повторов, «только ошибки», ошибки не роняют вызов.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const notify = require('../notify');

notify.init(); notify._reset();
let st = notify.state();
assert.ok(st.groups.length >= 6, 'блоки по темам');
st.groups.forEach((g) => {
  const order = { crit: 0, err: 1, warn: 2, ok: 3, info: 4 };
  for (let i = 1; i < g.events.length; i++) assert.ok(order[g.events[i - 1].level] <= order[g.events[i].level], 'внутри блока по важности: ' + g.id);
});
assert.strictEqual(notify.emit('нет-такого', {}), false);
assert.doesNotThrow(() => notify.emit('obs.refreshed', null));
// не Windows: плашки не показываем, но журнал ведём
assert.strictEqual(notify.emit('obs.refreshed', { count: 3 }), false);
assert.ok(notify.state().history.length >= 1);
assert.strictEqual(notify.state().history[0].title, 'Источники OBS обновлены');
assert.strictEqual(notify.state().history[0].text, 'Обновлено: 3');
// настройки
st = notify.update({ corner: 'tl', onlyErrors: true, events: { 'tg.sent': false, 'нет': false } });
assert.strictEqual(st.settings.corner, 'tl'); assert.strictEqual(st.settings.onlyErrors, true);
assert.strictEqual(st.groups.find((g) => g.id === 'social').events.find((e) => e.id === 'tg.sent').on, false);
assert.strictEqual(notify.update({ corner: 'zz' }).settings.corner, 'tl', 'неверный угол игнорируется');
// журнал не растёт бесконечно
for (let i = 0; i < 80; i++) notify.emit('obs.refreshed', { count: i });
assert.ok(notify.state().history.length <= 15);
notify.update({ corner: 'br', onlyErrors: false, events: { 'tg.sent': true } });
fs.rmSync(path.join(__dirname, '..', 'notify_settings.json'), { force: true });
console.log('notify: ok'); process.exit(0);
