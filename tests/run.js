// npm test — те же тихие проверки, что и в приложении, но из консоли.
const selfCheck = require('../selfCheck');
selfCheck.runAll().then((s) => {
  s.problems.forEach((p) => console.log('✗ ' + p.title + ': ' + p.text));
  console.log(s.ok ? '✓ Все проверки (' + s.checked + ') пройдены' : '\nПроблем: ' + s.problems.length);
  process.exit(s.ok ? 0 : 1);
});
