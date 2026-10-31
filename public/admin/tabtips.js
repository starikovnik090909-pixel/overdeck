// tabtips.js — анимированные подсказки по вкладкам: серия окошек с мини-копией интерфейса и курсором.
// Показываются один раз при первом открытии вкладки. Вернуть: кнопка «?» → «Показать подсказки».
(function () {
  'use strict';
  const SEEN_KEY = 'tabTipsSeen_v1';
  const OFF_KEY = 'tabTipsOff_v1';
  const IDS = ['home', 'auth', 'obs', 'chat', 'donations', 'donalerts', 'chatbot', 'voice', 'chronicles', 'telegram', 'widgets', 'settings'];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* не критично */ } },
  };
  const seenMap = () => { try { return JSON.parse(store.get(SEEN_KEY) || '{}'); } catch (e) { return {}; } };


/* ---------- помощники анимации ---------- */
let CSS='', NK=0; const KF={};
const KIND={
  fade:['opacity:0','opacity:1'],
  rise:['opacity:0;transform:translateY(8px)','opacity:1;transform:none'],
  drop:['opacity:0;transform:translateY(-10px)','opacity:1;transform:none'],
  slide:['opacity:0;transform:translateX(-14px)','opacity:1;transform:none'],
  slideR:['opacity:0;transform:translateX(14px)','opacity:1;transform:none'],
  pop:['opacity:0;transform:scale(.86)','opacity:1;transform:none'],
  out:['opacity:1','opacity:0'],
};
function kf(kind,a,b){
  b=b||92; const key='tt_'+kind+'_'+a+'_'+b;
  if(!KF[key]){
    const k=KIND[kind];
    CSS+= kind==='out'
      ? '@keyframes '+key+'{0%,'+a+'%{opacity:1}'+(a+5)+'%,'+b+'%{opacity:0}'+(b+5)+'%,100%{opacity:0}}'
      : '@keyframes '+key+'{0%,'+a+'%{'+k[0]+'}'+(a+5)+'%,'+b+'%{'+k[1]+'}'+(b+5)+'%,100%{'+k[0]+'}}';
    KF[key]=1;
  }
  return key;
}
const A=(kind,a,b)=>'animation:'+kf(kind,a,b)+' var(--T) ease-out infinite both;';
function E(cls,x,y,w,h,html,anim,extra){
  return '<div class="e '+cls+'" style="left:'+x+'px;top:'+y+'px;'+(w!=null?'width:'+w+'px;':'')+(h!=null?'height:'+h+'px;':'')+(extra?extra.replace(/;?\s*$/,';'):'')+(anim||'')+'">'+(html==null?'':html)+'</div>';
}
function cur(pts){
  const key='tt_c'+(NK++);
  CSS+='@keyframes '+key+'{'+pts.map(p=>p[0]+'%{left:'+p[1]+'px;top:'+p[2]+'px}').join('')+'}';
  return '<i class="cur" style="animation:'+key+' var(--T) ease-in-out infinite both"></i>';
}
function rip(x,y,t){
  const key='tt_r'+(NK++);
  CSS+='@keyframes '+key+'{0%,'+t+'%{opacity:0;transform:scale(.3)}'+(t+1)+'%{opacity:.9;transform:scale(.5)}'+(t+7)+'%{opacity:0;transform:scale(1.7)}100%{opacity:0}}';
  return '<i class="rip" style="left:'+x+'px;top:'+y+'px;animation:'+key+' var(--T) ease-out infinite both"></i>';
}
function hl(x,y,w,h,a,b){return E('hl',x,y,w,h,'',A('fade',a,b));}
function typ(text,a,w,cls){
  const key='tt_t'+(NK++);
  CSS+='@keyframes '+key+'{0%,'+a+'%{width:0}'+(a+14)+'%,100%{width:'+w+'px}}';
  return '<span class="typ '+(cls||'')+'" style="animation:'+key+' var(--T) steps('+Math.max(4,text.length)+') infinite both">'+text+'</span>';
}
function fill(x,y,w,h,a,b,to){
  const key='tt_f'+(NK++);
  CSS+='@keyframes '+key+'{0%,'+a+'%{width:0}'+b+'%,92%{width:'+(to||100)+'%}100%{width:'+(to||100)+'%;opacity:0}}';
  return E('bar',x,y,w,h,'<i style="animation:'+key+' var(--T) ease-out infinite both"></i>');
}
const tog=(x,y,on,flipAt)=>flipAt==null?E('tog'+(on?' on':''),x,y):E('tog',x,y,null,null,'',null)+E('tog on',x,y,null,null,'',A('fade',flipAt));
const btn=(x,y,w,h,t,p,anim)=>E('u-btn'+(p?' p':''),x,y,w,h,t,anim);
const row=(x,y,w,h,html,anim)=>E('u-row',x,y,w,h,html,anim);
const chip=(x,y,w,h,t,cl,anim)=>E('u-chip '+(cl||''),x,y,w,h,t,anim);
const frame=(x,y,w,h,title)=>E('u-card',x,y,w,h)+(title?E('u-h',x+10,y+8,w-20,14,title):'');

/* ---------- сцены ---------- */
const S={};

S.home0=()=>{
  let h=frame(8,6,324,158,'Настройка Overdeck')+chip(262,8,62,16,'1 из 5','');
  const st=['Подключить Twitch','Добавить оверлей в OBS','Подключить донаты','Включить озвучку чата'];
  st.forEach((s,i)=>{const y=30+i*32;
    h+=row(16,y,308,27,'<span class="ring"></span>'+s)
      +(i<3?btn(250,y+4,66,19,'Настроить',i===0,A('out',18+i*22,92)):'')
      +E('tick',22,y+8,12,12,'✓',A('pop',18+i*22,92));});
  h+=cur([[0,300,150],[8,284,44],[14,284,44],[34,284,76],[40,284,76],[56,284,108],[62,284,108],[100,300,150]])+rip(284,44,14)+rip(284,76,40)+rip(284,108,62);
  return h;
};
S.home1=()=>{
  let h=frame(8,6,324,158,'')+E('u-card',0,0,340,170,'','background:rgba(0,0,0,.45);border:0;border-radius:0;'+A('fade',6,92));
  h+=E('u-card',50,26,240,118,'','box-shadow:0 12px 40px rgba(0,0,0,.6);'+A('pop',8,92))
   +E('u-in f',60,36,220,22,'<span class="mut">🔍&nbsp;</span>'+typ('алерт',16,34,'mono'),A('pop',8,92))
   +chip(236,40,38,14,'Ctrl K','n',A('pop',8,92));
  [['Алерты','вкладка'],['Настройки алерта','Алерты'],['Тест алерта','Алерты']].forEach((r,i)=>{
    h+=row(60,66+i*24,220,21,r[0]+'<span class="mut" style="margin-left:auto">'+r[1]+'</span>',A('rise',32+i*5,92));});
  h+=hl(58,64,224,25,44,92);
  return h;
};
S.auth0=()=>{
  let h=frame(8,6,324,158,'Подключение Twitch')
   +btn(86,36,168,26,'Войти через Twitch',true,'')
   +E('u-in',86,76,168,28,'<span class="mono acc" style="font-size:15px;letter-spacing:.2em;margin:auto">ABCD-1234</span>',A('rise',24,92))
   +E('mut',60,108,220,12,'Подтверди код на twitch.tv/activate',A('fade',28,92),'text-align:center')
   +row(60,130,220,24,'<span class="okc">●</span>Подключено · starlkov',A('rise',58,92));
  h+=cur([[0,250,150],[12,170,52],[20,170,52],[100,250,150]])+rip(170,52,20);
  return h;
};
S.auth1=()=>{
  const pc=(x,t,d)=>E('u-card',x,36,90,84,'')+E('u-h',x+10,44,70,14,t)+E('mut',x+10,64,74,40,d,'white-space:normal');
  let h=pc(14,'ПК 1','настройки, ключи, темы')+pc(236,'ПК 2','пока пусто');
  CSS+='@keyframes tt_kfile{0%,12%{left:130px;opacity:0}18%{left:130px;opacity:1}46%,52%{left:196px;opacity:1}58%,100%{left:196px;opacity:0}}';
  h+='<div class="e u-card" style="top:56px;width:46px;height:44px;text-align:center;border-color:#E8545F;animation:tt_kfile var(--T) ease-in-out infinite both"><div class="acc" style="font-size:15px;margin-top:5px">🔑</div><div class="mono" style="font-size:6px;margin-top:2px">.key</div></div>';
  h+=E('u-in',242,92,78,18,'<span class="okc">●</span>&nbsp;данные',A('fade',56,92))
   +chip(120,138,100,16,'Всё подтянулось ✓','g',A('pop',58,92));
  return h;
};
S.obs0=()=>{
  let h=frame(8,6,324,50,'')+E('u-in',16,16,222,24,'<span class="mut">http://localhost:3001/</span>alerts.html')+btn(246,16,76,24,'Копировать',true,'')
   +chip(246,44,76,14,'Скопировано ✓','g',A('pop',20,50));
  h+=E('u-card',60,64,220,100,'','box-shadow:0 8px 24px rgba(0,0,0,.6)')+E('u-h',70,70,200,14,'Свойства источника «Браузер»')
   +E('mut',70,92,40,12,'URL')+E('u-in f',96,88,176,20,'<span class="mut" style="font-size:9px">localhost:3001/</span>'+typ('alerts.html',30,68,'mono'))
   +E('mut',70,116,50,12,'Размер')+E('u-in',112,112,52,20,'1920')+E('u-in',170,112,52,20,'1080')
   +btn(214,140,54,20,'ОК',true,'');
  h+=cur([[0,200,30],[10,284,28],[17,284,28],[34,96,100],[60,96,100],[82,236,150],[88,236,150],[100,200,30]])+rip(284,28,17)+rip(236,150,86);
  return h;
};
S.obs1=()=>{
  let h=frame(8,6,324,102,'Источник «Браузер»')
   +row(18,30,304,24,'<span style="width:34px"></span>Отключать источник, когда он не виден')
   +row(18,60,304,24,'<span style="width:34px"></span>Обновлять браузер при показе сцены')
   +E('tog on',24,35,null,null,'',A('out',24,92))+E('tog',24,35,null,null,'',A('fade',24,92))+E('tog',24,65)
   +hl(14,28,312,28,22,92)
   +frame(8,114,324,50,'')+E('u-h',20,122,120,14,'Ссылки для OBS')
   +row(18,138,160,20,'Оповещения')+chip(186,141,110,14,'Открыт в OBS','g',A('pop',50,92))
   +cur([[0,300,100],[16,34,42],[24,34,42],[100,300,100]])+rip(34,42,22);
  return h;
};
S.chat0=()=>{
  let h=frame(8,6,224,158,'Чат · в реальном времени');
  const m=[['anna','привет всем!','#D84B55'],['max','го играть 🔥','#5B8DEF'],['kot','KEKW','#3DD68C'],['lis','лучший стрим','#F2A93B']];
  m.forEach((r,i)=>{h+=row(16,28+i*30,208,25,'<i class="av" style="background:'+r[2]+'"></i><b style="color:'+r[2]+'">'+r[0]+'</b>'+r[1],A('slide',6+i*16,92));});
  h+=frame(238,6,94,158,'Вид');
  [['Бейджи',8],['Аватарки',40],['Смайлы 7TV',64]].forEach((r,i)=>{
    h+=E('u-h',246,28+i*44,80,12,r[0],'font-weight:400;font-size:10px')+E('tog',246,44+i*44)+E('tog on',246,44+i*44,null,null,'',A('fade',r[1],92));});
  return h;
};
S.chat1=()=>{
  let h=frame(8,6,150,158,'Источники')
   +row(16,28,134,20,'Экран игры')+row(16,52,134,20,'Веб-камера')
   +row(16,76,134,20,'🌐 Чат · Браузер',A('rise',24,92))+hl(14,74,138,24,26,92)
   +btn(16,136,134,20,'+ Браузер',true,A('out',22,92));
  h+=E('u-card',166,6,166,158,'','border-color:rgba(237,237,239,.2)')+E('mut',172,10,100,12,'Сцена');
  h+=E('u-card',172,24,70,134,'','background:#0A0A0C')+E('mut',178,28,60,12,'игра');
  h+=E('u-card',250,34,76,118,'','border-color:#E8545F;'+A('pop',40,92));
  [['an','hi'],['mx','go!'],['kt','GG']].forEach((r,i)=>{h+=E('u-row',254,40+i*22,68,18,'<b class="acc">'+r[0]+'</b>'+r[1],A('slide',46+i*8,92));});
  h+=E('mono mut',250,156,80,10,'500 × 800',A('fade',44,92),'font-size:9px');
  h+=cur([[0,300,140],[10,70,144],[16,70,144],[30,230,120],[100,300,140]])+rip(70,144,16);
  return h;
};
S.chat2=()=>{
  let h=E('u-card',8,6,324,22,'','border-radius:8px')+E('mut',16,11,300,12,'Файл  Правка  Вид  <b class="acc" style="font-weight:600">Док-панели</b>  Профиль')
   +E('u-card',16,34,208,128,'','background:#0A0A0C')+E('mut',22,38,100,12,'Сцена и источники')
   +E('u-card',230,34,102,128,'','border-color:#E8545F;'+A('pop',44,92))+E('u-h',238,40,90,12,'Чат',A('fade',44,92))
   +E('u-row',236,56,90,20,'<b class="acc">anna</b>привет',A('slide',52,92))+E('u-row',236,80,90,20,'<b class="acc">max</b>го!',A('slide',60,92))+E('u-row',236,104,90,20,'<b class="acc">kot</b>KEKW',A('slide',68,92));
  h+=E('u-card',60,16,220,74,'','box-shadow:0 8px 24px rgba(0,0,0,.6);'+A('rise',14,40))
   +E('u-h',70,22,200,12,'Пользовательские док-панели браузера',A('rise',14,40))
   +E('u-in',70,42,200,20,'<span class="mut">http://localhost:3001/</span>chat-widget.html',A('rise',16,40))
   +btn(204,66,66,18,'Применить',true,A('rise',16,40));
  h+=cur([[0,300,150],[16,236,76],[24,236,76],[36,244,76],[100,300,150]])+rip(244,76,28);
  return h;
};
S.don0=()=>{
  let h=frame(8,6,324,158,'Донатный хаб');
  [['DonationAlerts','#D84B55'],['DonateX','#F2A93B'],['DonatePay','#3DD68C']].forEach((r,i)=>{h+=chip(16+i*86,28,80,16,r[0],'n');});
  [['anna','DonationAlerts','+300 ₽','#D84B55'],['max','DonateX','+150 ₽','#F2A93B'],['kot','DonatePay','+500 ₽','#3DD68C']].forEach((r,i)=>{
    h+=row(16,52+i*34,308,29,'<i class="av" style="background:'+r[3]+'"></i><b>'+r[0]+'</b><span class="mut">'+r[1]+'</span><b class="okc" style="margin-left:auto">'+r[2]+'</b>',A('drop',10+i*22,92));});
  return h;
};
S.don1=()=>{
  let h=frame(8,6,324,158,'Донатный хаб');
  [['anna','+300 ₽'],['max','+150 ₽'],['kot','+500 ₽']].forEach((r,i)=>{
    h+=row(16,30+i*30,308,26,'<b>'+r[0]+'</b><b class="okc" style="margin-left:auto">'+r[1]+'</b>',A('out',34+i*3,92));});
  h+=btn(206,132,118,22,'Сбросить историю',false,'')+E('mut',112,142,90,12,'Топ донатеров',A('out',40,92))
   +E('mut',130,70,100,12,'Лента пуста',A('fade',46,92),'text-align:center;left:120px')
   +cur([[0,300,60],[20,262,142],[32,262,142],[100,300,60]])+rip(262,142,32);
  return h;
};
S.al0=()=>{
  const t=['Донат','Цель сбора','Подписки','Рейд','Фоллоу','Hype Train','Баллы канала','Серия просмотров','Сейчас играет'];
  let h=frame(8,6,324,158,'Алерты');
  t.forEach((n,i)=>{const x=14+(i%3)*106,y=30+Math.floor(i/3)*42;
    h+=row(x,y,102,34,'<span class="okc" style="font-size:8px">●</span>'+n,'font-size:8.5px;padding:0 4px;gap:4px')+E('hl',x-1,y-1,100,36,'',A('fade',8+i*9,8+i*9+9)+'border-radius:8px');});
  return h;
};
S.al1=()=>{
  let h=frame(8,6,100,158,'Типы');
  ['Донат','Подписки','Рейд','Фоллоу'].forEach((n,i)=>{h+=row(14,28+i*28,88,24,n,i===2?'border-color:#E8545F':'');});
  h+=frame(116,6,216,158,'Настройки алерта',A('fade',22,92))
   +E('mut',126,28,100,12,'Текст',A('rise',26,92))+E('u-in',126,40,196,20,'Спасибо за рейд, {user}!',A('rise',26,92))
   +E('mut',126,66,100,12,'Цвета',A('rise',32,92))+E('u-in',126,78,80,20,'<i class="av" style="background:#D84B55"></i>&nbsp;акцент',A('rise',32,92))
   +E('mut',126,102,120,12,'Звук и время показа',A('rise',38,92))+E('u-in',126,117,116,20,'raid.ogg ▾',A('rise',38,92))+E('u-in',250,117,72,20,'6 сек',A('rise',38,92))
   +btn(246,140,76,20,'Сохранить',true,A('rise',44,92));
  h+=cur([[0,300,150],[14,56,86],[20,56,86],[56,290,150],[100,300,150]])+rip(56,86,20);
  return h;
};
S.al2=()=>{
  let h=frame(8,6,324,158,'Звук алерта')
   +E('u-in f',16,30,308,22,'raid.ogg ▾')
   +row(16,56,308,20,'chime.mp3',A('fade',10,92))+row(16,78,308,20,'level-up.wav',A('fade',10,92))
   +row(16,100,308,20,'<b class="acc">мой-звук.mp3</b><span class="chip" style="margin-left:auto"></span>',A('rise',46,92))+chip(262,103,56,14,'новый','g',A('pop',50,92));
  h+=E('u-card',16,122,308,40,'<div style="padding:5px 8px;line-height:1.5"><span class="mut">📁</span> <span class="mono">public/alert-sounds</span><br><span class="mono acc">мой-звук.mp3</span></div>','background:#0E0E10;'+A('slide',14,92));
  h+=cur([[0,300,140],[28,200,138],[44,200,138],[60,180,110],[100,300,140]]);
  return h;
};
S.al3=()=>{
  let h=frame(8,6,150,158,'Алерты')+btn(16,30,134,22,'Тест алерта',true,'')+btn(16,58,134,22,'Пропустить текущий',false,'');
  h+=E('u-card',166,6,166,158,'','background:#0A0A0C')+E('mut',172,10,120,12,'OBS · 1920 × 1080');
  h+=E('u-card',182,46,134,60,'<div style="text-align:center;padding-top:8px"><div class="acc" style="font-size:16px;font-weight:800">+500 ₽</div><div>kot задонатил</div><div class="mut" style="font-size:9px">спасибо за поддержку!</div></div>','border-color:#E8545F;box-shadow:0 0 22px rgba(232,84,95,.35);'+A('pop',24,70));
  h+=E('u-row',16,90,142,50,'<span class="wn">🔊</span><span>Нет звука? Включи «Управлять звуком через OBS»</span>','white-space:normal;font-size:9px;line-height:1.35;'+A('rise',56,92));
  h+=cur([[0,300,150],[14,80,44],[20,80,44],[100,300,150]])+rip(80,44,20);
  return h;
};
S.bot0=()=>{
  const card=(x,t,s,delay,ok)=>E('u-card',x,10,158,148,'','border-color:'+(ok?'#E8545F':'rgba(237,237,239,.12)')+';'+A('rise',delay,92))
    +E('u-h',x+10,20,140,14,t,A('rise',delay,92))
    +E('mut',x+10,40,140,50,s,'white-space:normal;'+A('rise',delay,92));
  let h=card(8,'Свой аккаунт','Бот пишет в чат от твоего имени. Проще всего начать.',6,true)
   +card(174,'Отдельный аккаунт','Ответы приходят от бота со своим ником.',16,false)
   +E('u-row',18,104,138,24,'<span class="okc">●</span>Подключено',A('rise',30,92))
   +E('u-row',184,104,138,24,'<span class="okc">●</span>Подключено',A('rise',44,92))
   ;
  return h;
};
S.bot1=()=>{
  let h=frame(8,6,324,158,'Чат')
   +row(16,30,200,24,'<i class="av" style="background:#5B8DEF"></i><b style="color:#5B8DEF">anna</b>'+typ('!дискорд',6,50,'mono'),A('slide',4,92))
   +row(106,66,210,26,'<span class="chip"></span><i class="av" style="background:#E8545F"></i><b class="acc">бот</b>@anna, вот наш дискорд!',A('slide',34,92))
   +E('u-card',16,104,308,50,'','background:#0E0E10;'+A('fade',50,92))
   +E('mono',24,110,290,36,'<span class="mut">команда</span> !дискорд<br><span class="mut">ответ</span> @{user}, наш дискорд: discord.gg/пример',A('fade',52,92),'line-height:1.6');
  return h;
};
S.bot2=()=>{
  let h=frame(8,6,158,158,'Таймер')
   +E('','',0,0,'')+E('u-card',50,34,74,74,'<div style="text-align:center;padding-top:20px"><div class="acc" style="font-size:16px;font-weight:800">30:00</div><div class="mut" style="font-size:9px">минут</div></div>','border-radius:50%;border:3px solid #E8545F;'+A('fade',6,92))
   +E('mut',18,120,140,28,'Сообщение раз в 15–60 минут',A('fade',10,92),'white-space:normal');
  h+=frame(174,6,158,158,'Автомодерация')
   +row(182,30,142,24,'<b>troll</b>плохое слово',A('out',40,92)+'')
   +E('chip',0,0,0,0,'')
   +chip(232,62,90,14,'бот удалил ✓','g',A('pop',46,92))
   +row(182,86,142,24,'<b>anna</b>всем привет',A('fade',4,92))
   +E('mut',182,118,142,30,'Список слов: сообщения с ними бот удаляет сам',A('fade',50,92),'white-space:normal');
  return h;
};
S.voi0=()=>{
  const eng=[['Edge','нужен интернет','Самый естественный. Начни с него','#E8545F',6],['Piper','офлайн','Нужен install-piper.bat','#6F7078',20],['Silero','офлайн','Нужен install-silero.bat, 1–2 ГБ','#6F7078',34]];
  let h=frame(8,6,324,158,'Три движка, хватит одного');
  eng.forEach((e,i)=>{h+=row(16,30+i*40,308,34,'<b style="min-width:42px">'+e[0]+'</b>'+chip(0,0,0,0,'','')+'<span class="mut">'+e[1]+'</span><span style="margin-left:auto;font-size:9.5px">'+(i?e[2]:'')+'</span>',A('rise',e[4],92));});
  h+=hl(14,28,312,38,48,92)+chip(222,38,94,14,'Начни с него','',A('pop',52,92));
  return h;
};
S.voi1=()=>{
  let h=frame(8,6,324,60,'Папка проекта')
   +row(16,28,150,26,'⚙ <b>install-piper.bat</b>')+E('mut',174,34,80,12,'двойной клик',A('fade',16,92))
   +fill(16,58,150,5,20,48)+chip(250,28,66,16,'готово ✓','g',A('pop',50,92));
  h+=frame(8,72,324,92,'Каталог голосов');
  [['Ирина','ru'],['Дмитрий','ru']].forEach((r,i)=>{h+=row(16,92+i*30,308,25,'<b>'+r[0]+'</b><span class="mut">Piper · '+r[1]+'</span>')+btn(262,95+i*30,54,19,i?'Скачать':'Готово',!i,i?'':A('fade',72,92));});
  h+=cur([[0,300,50],[10,60,42],[16,60,42],[62,288,106],[70,288,106],[100,300,50]])+rip(60,42,16)+rip(288,106,70);
  return h;
};
S.voi2=()=>{
  let h=frame(8,6,324,76,'Silero · один раз')
   +row(16,28,160,26,'⚙ <b>install-silero.bat</b>')
   +E('mut',186,32,136,22,'нужен Python, скачает torch 1–2 ГБ',A('fade',10,92),'white-space:normal')
   +fill(16,60,306,6,16,60)+E('mono okc',16,68,200,12,'ГОТОВО',A('pop',64,92),'font-weight:800');
  h+=frame(8,88,324,76,'После установки')
   +row(16,110,300,22,'1. Перезапусти оверлей',A('rise',50,92))+row(16,136,300,22,'2. Выбери голос: Айдар, Евгений, Ксения, Бая',A('rise',62,92));
  h+=cur([[0,300,60],[10,60,42],[16,60,42],[100,300,60]])+rip(60,42,16);
  return h;
};
S.chr0=()=>{
  let h=frame(8,6,324,158,'Хроники');
  [['Дюна','8/10'],['Матрица','9/10']].forEach((r,i)=>{h+=row(16,30+i*28,308,24,'<i class="av" style="background:#3A3A40"></i>'+r[0]+'<b class="wn" style="margin-left:auto">★ '+r[1]+'</b>');});
  h+=row(16,86,308,24,'<i class="av" style="background:#E8545F"></i><b>Новая запись</b><b class="wn" style="margin-left:auto">★ 7/10</b>',A('drop',22,92))
   +E('u-card',16,114,308,44,'<div style="padding:6px 9px;line-height:1.5"><span class="mut">Вставь таблицу:</span> <span class="mono">Дюна  55.8% 8/10</span><br><span class="okc">Импорт сам найдёт название и оценку</span></div>',A('rise',44,92));
  return h;
};
S.chr1=()=>{
  let h=frame(8,6,324,158,'Публикация')
   +E('mut',18,28,120,12,'Имя в заголовке страницы')+E('u-in f',18,44,200,22,typ('Starikov',6,60,'mono'))
   +btn(226,42,96,22,'Опубликовать',true,'')
   +E('u-card',18,76,304,78,'','background:#0A0A0C;'+A('rise',44,92))
   +E('u-h',30,84,200,14,'Starikov · Хроники',A('rise',46,92))+E('mut',30,102,200,12,'Дюна ★ 8 · Матрица ★ 9',A('rise',50,92))
   +chip(30,124,130,16,'🔗 страница для зрителей','g',A('pop',56,92));
  h+=cur([[0,300,140],[26,274,53],[34,274,53],[100,300,140]])+rip(274,53,34);
  return h;
};
S.tg0=()=>{
  let h=E('u-card',8,6,324,158,'','background:#0A0A0C')+E('u-h',20,12,200,12,'Канал · Overdeck')
   +E('u-card',20,32,220,48,'<div style="padding:7px 9px"><b class="acc">🔴 Стрим начался</b><br>Заходи: twitch.tv/starlkov</div>','border-radius:4px 12px 12px 12px;'+A('slide',8,92))
   +E('u-card',20,94,236,60,'<div style="padding:7px 9px"><b class="acc">Стрим закончился</b><br><span class="mut">Длительность 3 ч · пик 42 зрителя<br>Игры: Dota 2, Minecraft</span></div>','border-radius:4px 12px 12px 12px;'+A('slide',50,92));
  return h;
};
S.wid0=()=>{
  let h=E('u-card',8,6,324,158,'','background:repeating-linear-gradient(0deg,transparent 0 19px,rgba(237,237,239,.06) 19px 20px),repeating-linear-gradient(90deg,transparent 0 19px,rgba(237,237,239,.06) 19px 20px),#0A0A0C');
  const key='wm'; CSS+='@keyframes tt_wm{0%,8%{left:20px;top:20px;width:80px;height:40px}36%,48%{left:180px;top:80px;width:80px;height:40px}74%,92%{left:180px;top:80px;width:120px;height:62px}100%{left:180px;top:80px;width:120px;height:62px;opacity:0}}';
  h+='<div class="e" style="border:1.5px solid #E8545F;background:rgba(216,75,85,.16);border-radius:7px;animation:tt_wm var(--T) ease-in-out infinite both;display:flex;align-items:center;justify-content:center;font-weight:700" ><span class="acc">Чат</span></div>';
  h+=chip(204,12,120,14,'в оверлее сразу ✓','g',A('pop',74,92));
  h+=cur([[0,60,36],[8,60,36],[36,220,100],[48,220,100],[56,262,134],[74,298,142],[100,298,142]]);
  return h;
};
S.wid1=()=>{
  let h=frame(8,6,324,158,'Стиль оформления в OBS');
  const st=['Классический','Frost','Valorant','Cyberpunk 2077'];
  st.forEach((n,i)=>{h+=row(16,28+i*26,150,22,'<span class="mut">'+i+'</span>'+n,i===2?'':'')+E('hl',15,27+i*26,152,24,'',A('fade',10+i*18,10+i*18+18)+'border-radius:7px');});
  h+=E('u-card',176,28,148,100,'','background:#0A0A0C')+E('mut',182,32,100,12,'как выглядит на сцене');
  [['#E8545F',10],['#F2A93B',28],['#3DD68C',46],['#5B8DEF',64]].forEach((c,i)=>{h+=E('u-card',186,48,128,64,'<div style="padding:8px 10px"><b style="color:'+c[0]+'">Донат +500 ₽</b><br><span class="mut">kot</span></div>','border-color:'+c[0]+';'+A('fade',c[1],c[1]+18));});
  h+=row(176,134,148,24,'Эффект стекла<span class="tog on" style="margin-left:auto"></span>');
  return h;
};
S.wid2=()=>{
  let h=frame(8,6,324,158,'Оверлей целиком')
   +E('u-in',16,30,308,22,'<span class="mut">http://localhost:3001/</span>overlay.html')
   +E('u-row',16,60,308,26,'Источник «Браузер»<span class="mono" style="margin-left:auto">1920 × 1080</span>',A('rise',12,92))
   +E('u-card',16,94,308,62,'','background:#0A0A0C')+E('mut',24,98,200,12,'фон прозрачный',A('fade',24,92))
   +E('u-card',30,116,70,34,'<div style="padding:5px 7px"><b class="acc">Чат</b></div>','border-color:#E8545F;'+A('pop',30,92))
   +E('u-card',236,116,76,34,'<div style="padding:5px 7px"><b class="okc">Цель</b></div>','border-color:#3DD68C;'+A('pop',40,92))
   +E('u-card',130,112,70,28,'<div style="padding:5px 7px"><b class="wn">Алерт</b></div>','border-color:#F2A93B;'+A('pop',50,92));
  return h;
};
S.set0=()=>{
  let h=frame(8,6,150,158,'Акцентный цвет');
  [['#D84B55',6],['#2DC4D6',30],['#3DD68C',54],['#F2A93B',78]].forEach((c,i)=>{h+=E('','',0,0,'')+E('',20+i*32,32,22,22,'','background:'+c[0]+';border-radius:50%;border:2px solid rgba(255,255,255,.15)');});
  h+=E('e',0,0,0,0,'')+E('hl',17,29,28,28,'',A('fade',6,28)+'border-radius:50%')+E('hl',49,29,28,28,'',A('fade',30,52)+'border-radius:50%')+E('hl',81,29,28,28,'',A('fade',54,76)+'border-radius:50%')+E('hl',113,29,28,28,'',A('fade',78,92)+'border-radius:50%');
  h+=E('mut',18,64,130,12,'подхватят все виджеты')+E('u-in',18,82,128,20,'Шрифт: Inter ▾')+E('mut',18,112,130,36,'Цвет текста, фон панелей и прозрачность',A('fade',10,92),'white-space:normal');
  h+=frame(166,6,166,158,'Предпросмотр');
  [['#D84B55',6,28],['#2DC4D6',30,52],['#3DD68C',54,76],['#F2A93B',78,92]].forEach(c=>{
    h+=E('u-card',176,32,146,50,'<div style="padding:8px 10px"><b style="color:'+c[0]+'">Донат +500 ₽</b><br><span class="mut">kot</span></div>','border-color:'+c[0]+';'+A('fade',c[1],c[2]))
     +E('',176,92,146,8,'','border-radius:5px;background:'+c[0]+';'+A('fade',c[1],c[2]))
     +chip(176,108,50,16,'Цель','',A('fade',c[1],c[2]));});
  return h;
};
S.set1=()=>{
  let h=frame(8,6,324,158,'Свои шрифты')
   +btn(16,30,140,24,'Добавить свой шрифт',true,'')
   +row(16,62,308,22,'<span class="mono">Orbitron-Bold.ttf</span><span class="mut" style="margin-left:auto">.ttf .otf .woff .woff2</span>',A('rise',20,92))
   +E('u-card',16,92,308,64,'<div style="padding:8px 12px"><div style="font-family:Impact,Haettenschweiler,sans-serif;font-size:20px;letter-spacing:.04em" class="acc">Спасибо за донат!</div><div class="wn" style="font-size:9.5px;margin-top:4px">Нужна кириллица, иначе буквы заменит запасной шрифт</div></div>',A('pop',44,92));
  h+=cur([[0,300,60],[12,90,42],[18,90,42],[100,300,60]])+rip(90,42,18);
  return h;
};
S.set2=()=>{
  let h=E('u-card',8,6,324,24,'','border-radius:8px')+E('u-h',18,13,120,12,'Overdeck')+E('',298,10,18,16,'⚙','text-align:center;color:#E8545F;font-size:13px')
   +hl(293,8,26,20,6,92);
  h+=frame(8,36,324,128,'Настройки админки · Темы');
  [['Overdeck','#0E0E10','#D84B55'],['Океан','#091518','#2DC4D6'],['Бумага','#F3F0EA','#E0583C']].forEach((t,i)=>{
    h+=row(16,62+i*27,308,24,'<span style="display:flex;border-radius:5px;overflow:hidden"><i style="width:10px;height:14px;background:'+t[1]+'"></i><i style="width:10px;height:14px;background:#EDEDEF"></i><i style="width:10px;height:14px;background:'+t[2]+'"></i></span>'+t[0]);});
  h+=btn(196,142,128,18,'Создать свою тему',true,A('rise',34,92))+E('hl',14,60,312,28,'',A('fade',14,34)+'border-radius:7px');
  h+=cur([[0,300,150],[8,306,18],[14,306,18],[30,120,100],[40,270,150],[100,300,150]])+rip(306,18,14);
  return h;
};

/* ---------- данные подсказок ---------- */
const TABS=[
 {n:'Главная',s:[
  {t:'Иди по списку сверху вниз',x:'В блоке «Настройка Overdeck» каждый шаг ведёт на нужную вкладку: нажми «Настроить». Готовый шаг отмечается сам.',st:'home0'},
  {t:'Поиск по всему Overdeck',x:'Нажми Ctrl + K и начни писать: найдутся и вкладки, и отдельные настройки.',st:'home1'}]},
 {n:'Подключения',s:[
  {t:'Одна кнопка вместо ключей',x:'Нажми «Войти через Twitch» и подтверди код на twitch.tv. Свой Client ID и ключи нужны только в расширенном режиме.',st:'auth0'},
  {t:'Перенос на другой компьютер',x:'Файл авторизации хранит ключи, настройки и темы. Открой его на другом ПК, и всё подтянется.',tip:'В файле лежат ключи и токены: храни его как пароль и никому не отправляй.',st:'auth1'}]},
 {n:'Ссылки для OBS',s:[
  {t:'Копируй ссылку, вставляй в «Браузер»',x:'В OBS: Источники → + → Браузер. Вставь ссылку и размер из строки «Рекомендуемый размер источника».',st:'obs0'},
  {t:'Одна галочка, чтобы всё работало',x:'Сними «Отключать источник, когда он не виден». Статус «Открыт в OBS» значит, что виджет подключился к Overdeck.',st:'obs1'}]},
 {n:'Чат',s:[
  {t:'Бейджи, аватарки и смайлы 7TV',x:'Переключатели справа действуют сразу. Ставки и опросы запускаются тут же, для них нужен вход через Twitch.',st:'chat0'},
  {t:'Чат как источник в OBS',x:'Источники → + → Браузер, адрес /chat-widget.html и размер, например 500 × 800. Чат окажется прямо на сцене.',st:'chat1'},
  {t:'Или как док-панель OBS',x:'Док-панели → Пользовательские док-панели браузера: вставь тот же адрес. Чат будет рядом с окном OBS и не попадёт на стрим.',st:'chat2'}]},
 {n:'Донаты',s:[
  {t:'Все платформы в одной ленте',x:'DonationAlerts, DonateX и DonatePay собираются в одном списке. Подключи ту платформу, которой пользуешься.',st:'don0'},
  {t:'Осторожно с «Сбросить историю»',x:'Кнопка очищает ленту и топ донатеров целиком. Нажимай осознанно.',st:'don1'}]},
 {n:'Алерты',s:[
  {t:'Тут не только донаты',x:'Девять видов: донат, цель сбора, подписки, рейд, фоллоу, Hype Train, баллы канала, серия просмотров и «Сейчас играет». Каждый включается отдельно.',st:'al0'},
  {t:'Где настройки',x:'Выбери нужный алерт в списке, и справа откроются «Настройки алерта»: текст, цвета, звук и время показа. Не забудь «Сохранить».',st:'al1'},
  {t:'Свой звук для алерта',x:'Положи .ogg, .mp3 или .wav в папку public/alert-sounds и обнови страницу админки. Файл появится в списке звуков.',st:'al2'},
  {t:'Проверь и добавь в OBS',x:'«Тест алерта» показывает карточку в OBS: источник «Браузер», размер 1920 × 1080. Цель сбора идёт отдельным источником.',tip:'Нет звука в OBS: в свойствах источника отметь «Управлять звуком через OBS».',st:'al3'}]},
 {n:'Чат-бот',s:[
  {t:'Подойдёт и основной аккаунт',x:'Бот может писать от твоего имени. Отдельный аккаунт нужен, если хочешь, чтобы ответы приходили от «бота» со своим ником.',st:'bot0'},
  {t:'Команды с подстановками',x:'Зритель пишет !дискорд, бот отвечает. В ответе можно писать {user} и {channel}, они заменятся на ник и название канала.',st:'bot1'},
  {t:'Таймер и автомодерация',x:'Таймер шлёт сообщение раз в 15–60 минут. Сообщения со словами из списка бот удаляет сам.',tip:'Для автомодерации у отдельного бот-аккаунта должна быть роль модератора: /mod имя_бота.',st:'bot2'}]},
 {n:'Озвучка',s:[
  {t:'Три движка, хватит одного',x:'Edge работает сразу, нужен интернет, и голос самый естественный. Piper и Silero работают офлайн, но ставятся отдельно.',st:'voi0'},
  {t:'Как поставить Piper',x:'Запусти install-piper.bat из папки проекта (~22 МБ), перезапусти оверлей и скачай голоса в «Каталоге голосов» кнопкой «Скачать».',st:'voi1'},
  {t:'Как поставить Silero',x:'Запусти install-silero.bat. Если Python нет, скрипт его поставит. Потом перезапусти оверлей и выбери голос.',tip:'Звук идёт из страницы оверлея в OBS. Алерты донатов говорят тем же голосом.',st:'voi2'}]},
 {n:'Хроники',s:[
  {t:'Журнал просмотренного',x:'Добавляй фильмы и сериалы с оценкой или вставь целую таблицу: название и оценка распознаются сами.',st:'chr0'},
  {t:'Страница для зрителей',x:'Опубликуй общую страницу. Имя в её заголовке можно поменять в окне публикации.',st:'chr1'}]},
 {n:'Телеграм',s:[
  {t:'Анонс уходит в канал сам',x:'Когда начинается стрим, в твой Telegram-канал приходит анонс, а в конце итоговое сообщение: длительность, пик зрителей и игры.',st:'tg0'}]},
 {n:'Сцена',s:[
  {t:'Тащи мышью, тяни за угол',x:'Положение и размер блоков применяются на оверлее сразу, пока двигаешь. Сетка 20 × 20 помогает выровнять.',st:'wid0'},
  {t:'Стиль оформления в OBS',x:'17 готовых стилей, от Frost до Cyberpunk и Valorant, и переключатель «Эффект стекла». Меняется на оверлее на лету.',st:'wid1'},
  {t:'Вся сцена одним источником',x:'Источник «Браузер», адрес /overlay.html, размер 1920 × 1080. Фон прозрачный, виджеты окажутся поверх игры.',st:'wid2'}]},
 {n:'Стиль',s:[
  {t:'Цвета подхватят все виджеты',x:'Выбери акцентный цвет и цвет текста, задай фон и прозрачность панелей. Применяется сразу, без перезагрузки OBS.',st:'set0'},
  {t:'Свой шрифт',x:'Добавь файл .ttf, .otf, .woff или .woff2. Шрифт появится во всех виджетах и алертах.',tip:'Шрифт должен поддерживать кириллицу, иначе русские буквы будут запасным шрифтом.',st:'set1'},
  {t:'Тему самой панели меняй в шестерёнке',x:'Справа вверху: «Настройки админки». Там 11 тем, свои цвета и своя тема. Рядом переключатель светлого и тёмного режима.',st:'set2'}]},
];


  TABS.forEach((t, i) => { t.id = IDS[i]; });
  const byId = {};
  TABS.forEach((t) => { byId[t.id] = t; });

  /* ---------- окно ---------- */
  const styleEl = document.createElement('style');
  styleEl.id = 'ttDynCss';
  document.head.appendChild(styleEl);
  let ov = null, cur_ = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fit() {
    if (!ov) return;
    const w = ov.querySelector('.tt-cvw').clientWidth;
    ov.querySelector('.tt-cv').style.transform = 'scale(' + (w / 340) + ')';
  }
  function markSeen(id) { const m = seenMap(); m[id] = 1; store.set(SEEN_KEY, JSON.stringify(m)); }
  function close() {
    if (!ov) return;
    if (cur_) markSeen(cur_.tab.id);
    ov.remove(); ov = null; cur_ = null;
    window.removeEventListener('resize', fit);
  }
  function show(k) {
    const sl = cur_.tab.s[k];
    cur_.i = k;
    CSS = '';
    const html = S[sl.st]();
    styleEl.textContent += CSS;
    ov.querySelector('.tt-cv').innerHTML = html;
    ov.querySelector('h3').textContent = sl.t;
    ov.querySelector('.tt-text').textContent = sl.x;
    const tb = ov.querySelector('.tt-tip');
    tb.hidden = !sl.tip; tb.textContent = sl.tip ? '💡 ' + sl.tip : '';
    ov.querySelector('.tt-cnt').textContent = cur_.tab.s.length > 1 ? (k + 1) + ' из ' + cur_.tab.s.length : '';
    ov.querySelectorAll('.tt-dots button').forEach((d, j) => d.classList.toggle('on', j === k));
    const last = k === cur_.tab.s.length - 1;
    ov.querySelector('[data-a=prev]').style.visibility = k ? 'visible' : 'hidden';
    ov.querySelector('[data-a=next]').textContent = last ? 'Понятно' : 'Дальше';
    fit();
  }
  function open(id) {
    const tab = byId[id];
    if (!tab || ov) return false;
    cur_ = { tab, i: 0 };
    ov = document.createElement('div');
    ov.className = 'tt-ov';
    ov.innerHTML = '<div class="tt-box" role="dialog" aria-modal="true">' +
      '<div class="tt-head"><i class="tt-logo"></i><b>' + esc(tab.n) + '</b><span class="tt-cnt"></span>' +
      '<button class="tt-x" type="button" title="Закрыть" data-a="x">✕</button></div>' +
      '<div class="tt-stage"><div class="tt-cvw"><div class="tt-cv"></div></div></div>' +
      '<h3></h3><p class="tt-text"></p><div class="tt-tip" hidden></div>' +
      '<div class="tt-foot"><div class="tt-dots">' + tab.s.map(() => '<button type="button"></button>').join('') + '</div><span class="tt-sp"></span>' +
      '<button class="btn btn-secondary" type="button" data-a="prev">Назад</button>' +
      '<button class="btn btn-primary" type="button" data-a="next">Дальше</button></div>' +
      '<button class="tt-off" type="button" data-a="off">Больше не показывать подсказки</button></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll('.tt-dots button').forEach((d, j) => d.addEventListener('click', () => show(j)));
    ov.addEventListener('click', (e) => {
      if (e.target === ov) return close();
      const a = e.target.closest('[data-a]');
      if (!a) return;
      const act = a.dataset.a;
      if (act === 'x') close();
      else if (act === 'prev') show(Math.max(0, cur_.i - 1));
      else if (act === 'next') { if (cur_.i >= cur_.tab.s.length - 1) close(); else show(cur_.i + 1); }
      else if (act === 'off') { store.set(OFF_KEY, '1'); close(); }
    });
    window.addEventListener('resize', fit);
    show(0);
    return true;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov) { e.stopPropagation(); close(); } }, true);

  window.OvTips = {
    has: (id) => !!byId[id],
    open,
    /** Автопоказ: один раз на вкладку, не поверх других окон. Возвращает true, если подсказка занята этой вкладкой. */
    auto(id) {
      if (!byId[id]) return false;
      if (store.get(OFF_KEY) === '1' || seenMap()[id]) return true; // подсказки этой вкладки больше не нужны, старый гайд тоже не показываем
      if (ov) return true;
      if (document.querySelector('#tpOv, .ui3-dlg-ov.open, .guide-overlay.open, .help-modal-overlay.open')) { setTimeout(() => window.OvTips.auto(id), 1500); return true; }
      open(id);
      return true;
    },
  };
})();
