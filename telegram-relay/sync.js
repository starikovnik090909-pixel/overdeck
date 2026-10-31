const fs = require('fs');
for (const d of ['vercel', 'netlify']) fs.copyFileSync(__dirname + '/worker.js', `${__dirname}/${d}/lib/worker.js`);
console.log('ok');
