// Закрытые темы STARIKOV: без пароля не видны и не применяются (запуск: node tests/test_closed_themes.js).
const express=require('express');process.chdir(require('path').join(__dirname,'..'));
const R=require('path').join(__dirname,'..')+'/';
const themes=require(R+'themes'),adminThemes=require(R+'adminThemes'),tabLock=require(R+'lock');
adminThemes.init();
const app=express();app.use(express.json());
const config={},widgets=require(R+'widgets');
require(R+'routes/themes').part2({tabLock,timeline:{},widgets,widgetsPersistence:{saveSettingsDebounced(){}},themes,config,saveConfigToDisk(){},DEFAULT_THEME:{accent:'#fff',bgPanelRGB:[0,0,0]},app,broadcast(){}});
require(R+'routes/themes').part4({themes,adminThemes,tabLock,app});
const s=app.listen(0,async()=>{
 const b='http://localhost:'+s.address().port;
 const j=async(u,o)=>{const r=await fetch(b+u,o);return [r.status,await r.json()]};
 const tok=tabLock.verify; // can't know password; fake token via module internals
 const T=(()=>{const c=require('crypto');const src=require('fs').readFileSync(R+'lock.js','utf8');const H=Buffer.from(/HASH = Buffer.from\('([0-9a-f]+)'/.exec(src)[1],'hex');return c.createHmac('sha256',H).update('overlay-tab-lock-v1').digest('hex')})();
 let [,a]=await j('/api/themes');console.log('themes closed',a.themes.map(t=>t.id));
 [,a]=await j('/api/themes',{headers:{'X-Lock-Token':T}});console.log('themes open',a.themes.map(t=>t.id));
 console.log('apply closed',(await j('/api/themes/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({themeId:'starikov'})}))[0]);
 console.log('apply open',(await j('/api/themes/apply',{method:'POST',headers:{'content-type':'application/json','X-Lock-Token':T},body:JSON.stringify({themeId:'starikov'})}))[1].theme.fontMain);
 [,a]=await j('/api/admin-themes');console.log('admin closed has',a.adminThemes.themes.some(t=>t.id==='p-starikov'));
 [,a]=await j('/api/admin-themes',{headers:{'X-Lock-Token':T}});console.log('admin open has',a.adminThemes.themes.some(t=>t.id==='p-starikov'));
 console.log('activate closed',(await j('/api/admin-themes/p-starikov/activate',{method:'POST'}))[0]);
 console.log('activate open',(await j('/api/admin-themes/p-starikov/activate',{method:'POST',headers:{'X-Lock-Token':T}}))[1].adminThemes.activeThemeId);
 [,a]=await j('/api/admin-themes');console.log('closed active falls to',a.adminThemes.activeThemeId);
 await j('/api/admin-themes/p-polnoch/activate',{method:'POST'});
 s.close();
});
