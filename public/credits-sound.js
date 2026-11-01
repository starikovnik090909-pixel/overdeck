// credits-sound.js — звук афиши с титрами: фоновый эмбиент и мягкие звуки сцены.
// Всё рисуется WebAudio прямо в браузере: файлов нет, прав на VOD не касается. Один движок на страницу.
// Используется и сценой (credits.html через gazette-views.js), и админкой (прослушивание перед выбором).
(function () {
  'use strict';
  const LIST = [
    { key: 'credits', name: 'Титры', hint: 'мягкие пэды, медленная смена аккордов, редкие колокольчики' },
    { key: 'keys', name: 'Тёплые клавиши', hint: 'мягкое арпеджио, как пианино через реверб' },
    { key: 'box', name: 'Шкатулка', hint: 'нежные высокие ноты с длинным эхом' },
    { key: 'dawn', name: 'Рассвет', hint: 'тёплые струнные пэды, плывущие аккорды' },
    { key: 'neon', name: 'Неон', hint: 'синтвейв: пульсирующий бас и лёгкий арпеджио, 100 BPM' },
    { key: 'grid', name: 'Гридлок', hint: 'тёмный пульс, сухие хэты, «пиканья» с эхом, 110 BPM' },
    { key: 'data', name: 'Датастрим', hint: 'быстрый секвенсор с эхом, самый динамичный, 120 BPM' },
    { key: 'nc', name: 'Бетон и неон', hint: 'тяжёлый бас с перегрузом, индустриальные удары, 92 BPM' },
  ];
  const BPM = { neon: 100, grid: 110, data: 120, nc: 92 };

  function create() {
    let ctx = null, cur = null, level = 0.4, sfxBus = null, sfxOn = true, sfxLevel = 0.1, revNode = null;
    const style = { typing: 'k1', title: 'chord' };
    const AC = window.AudioContext || window.webkitAudioContext;
    function ensure() {
      if (!AC) return false;
      if (!ctx) { ctx = new AC(); sfxBus = ctx.createGain(); sfxBus.gain.value = sfxLevel * 0.6; sfxBus.connect(ctx.destination); }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* без жеста не включится — не страшно */ } }
      return true;
    }
  function rev(c){var len=c.sampleRate*3.2,b=c.createBuffer(2,len,c.sampleRate);for(var ch=0;ch<2;ch++){var d=b.getChannelData(ch);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}var cv=c.createConvolver();cv.buffer=b;return cv}
  function tone(f,t,dur,type,g,out,att){var o=ctx.createOscillator(),e=ctx.createGain();o.type=type;o.frequency.value=f;e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+(att||.05));e.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(e);e.connect(out);o.start(t);o.stop(t+dur+.1)}
  var N=function(m){return 440*Math.pow(2,(m-69)/12)};
  function nz(t,dur,g,out,hp){var n=ctx.sampleRate*dur,b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(var i=0;i<n;i++)d[i]=Math.random()*2-1;var s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),e=ctx.createGain();s.buffer=b;f.type='highpass';f.frequency.value=hp;e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(e);e.connect(out);s.start(t)}
  function hat(t,g,out){nz(t,.05,g,out,7000)}
  function noiseSnare(t,g,out){nz(t,.18,g,out,1800)}
  function kick(t,g,out){var o=ctx.createOscillator(),e=ctx.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(.0001,t+.22);o.connect(e);e.connect(out);o.start(t);o.stop(t+.25)}
  function bass(f,t,dur,g,out,cut){var o=ctx.createOscillator(),fl=ctx.createBiquadFilter(),e=ctx.createGain();o.type='sawtooth';o.frequency.value=f;fl.type='lowpass';fl.frequency.setValueAtTime(cut*2,t);fl.frequency.exponentialRampToValueAtTime(cut*.6,t+dur);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.01);e.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(fl);fl.connect(e);e.connect(out);o.start(t);o.stop(t+dur+.05)}
  function blip(f,t,dur,g,out,cut){var o=ctx.createOscillator(),fl=ctx.createBiquadFilter(),e=ctx.createGain();o.type='square';o.frequency.value=f;fl.type='lowpass';fl.frequency.setValueAtTime(cut,t);fl.frequency.exponentialRampToValueAtTime(cut*.35,t+dur);e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(fl);fl.connect(e);e.connect(out);o.start(t);o.stop(t+dur+.05)}
  function pad(fs,t,dur,out){fs.forEach(function(f){[-7,7].forEach(function(dt){var o=ctx.createOscillator(),fl=ctx.createBiquadFilter(),e=ctx.createGain();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;fl.type='lowpass';fl.frequency.value=900;e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(.012,t+.6);e.gain.linearRampToValueAtTime(0,t+dur);o.connect(fl);fl.connect(e);e.connect(out);o.start(t);o.stop(t+dur+.1)})})}
  var shp=null;function dist(){if(!shp){var n=2048,c=new Float32Array(n);for(var i=0;i<n;i++){var x=i*2/n-1;c[i]=Math.tanh(x*5)}shp=c}var w=ctx.createWaveShaper();w.curve=shp;w.oversample='2x';return w}
  function grit(f,t,dur,g,out,cut){var o=ctx.createOscillator(),o2=ctx.createOscillator(),w=dist(),fl=ctx.createBiquadFilter(),e=ctx.createGain();o.type='sawtooth';o2.type='square';o.frequency.value=f;o2.frequency.value=f*.5;fl.type='lowpass';fl.frequency.setValueAtTime(cut*2.5,t);fl.frequency.exponentialRampToValueAtTime(cut*.5,t+dur);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.01);e.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(w);o2.connect(w);w.connect(fl);fl.connect(e);e.connect(out);o.start(t);o2.start(t);o.stop(t+dur+.05);o2.stop(t+dur+.05)}
  function clang(f,t,g,out){[1,2.76,5.4,8.9].forEach(function(r,i){var o=ctx.createOscillator(),e=ctx.createGain();o.type='sine';o.frequency.value=f*r;e.gain.setValueAtTime(g/(i+1),t);e.gain.exponentialRampToValueAtTime(.0001,t+1.6/(i+1));o.connect(e);e.connect(out);o.start(t);o.stop(t+1.8)})}
  function glitch(t,out,g){var n=2+Math.floor(Math.random()*3),f=300+Math.random()*1800;for(var i=0;i<n;i++){var o=ctx.createOscillator(),e=ctx.createGain();o.type='square';o.frequency.value=f*(1+i*.5);e.gain.setValueAtTime(g,t+i*.045);e.gain.setValueAtTime(0,t+i*.045+.03);o.connect(e);e.connect(out);o.start(t+i*.045);o.stop(t+i*.045+.04)}}

  var songs={
    credits:function(out){var ch=[[57,60,64,67],[53,57,60,64],[55,59,62,65],[52,55,59,62]],i=0;
      function step(){var t=ctx.currentTime;ch[i%4].forEach(function(m,k){tone(N(m),t+k*.12,7,'sine',.07,out,2.2);tone(N(m)*1.003,t+k*.12,7,'triangle',.03,out,2.4)});
        if(i%2)tone(N(ch[i%4][3]+12),t+2.2,3.5,'sine',.05,out,.02);i++}
      step();return setInterval(step,6000)},
    box:function(out){var sc=[72,74,76,79,81,84,86],seq=[0,2,4,2,5,4,2,3,1,3,4,6,4,3,2,1],k=0;
      function step(){var m=sc[seq[k%16]];if(k%16===0&&k>0&&Math.random()<.5)m-=12;var t=ctx.currentTime;tone(N(m),t,3.2,'sine',.09,out,.005);tone(N(m)*3,t,.5,'sine',.015,out,.005);k++}
      step();return setInterval(step,780)},
    dawn:function(out){var ch=[[50,57,62,66],[47,54,59,63],[43,50,55,59],[45,52,57,61]],i=0;
      function step(){var t=ctx.currentTime;ch[i%4].forEach(function(m){[-6,6].forEach(function(dt){var o=ctx.createOscillator(),f=ctx.createBiquadFilter(),e=ctx.createGain();o.type='sawtooth';o.frequency.value=N(m);o.detune.value=dt;f.type='lowpass';f.frequency.setValueAtTime(300,t);f.frequency.linearRampToValueAtTime(1100,t+5);f.frequency.linearRampToValueAtTime(350,t+10);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(.022,t+4.5);e.gain.linearRampToValueAtTime(0,t+10);o.connect(f);f.connect(e);e.connect(out);o.start(t);o.stop(t+10.2)})});i++}
      step();return setInterval(step,8000)},
    neon:function(out){var bpm=100,st=60/bpm/2,i=0,root=[45,41,48,43];
      function step(){var t=ctx.currentTime,bar=Math.floor(i/8)%4,r=root[bar];
        if(i%2===0){bass(N(r-12),t,st*1.8,.05,out,520)}
        if(i%8===0){pad([r,r+7,r+12,r+15].map(function(m){return N(m)}),t,st*8,out)}
        var arp=[0,7,12,15,12,7,15,19][i%8];if(i%2===1||i%8===6)blip(N(r+12+arp),t,st*.9,.028,out,1800);
        if(i%2===1)hat(t,.03,out);if(i%8===0||i%8===5)kick(t,.12,out);i++}
      step();return setInterval(step,st*1000)},
    grid:function(out){var bpm=110,st=60/bpm/4,i=0,root=[38,38,41,36];
      function step(){var t=ctx.currentTime,bar=Math.floor(i/16)%4,r=root[bar],k=i%16;
        if(k===0||k===6||k===10)bass(N(r-12),t,st*3,.07,out,300);
        if(k%4===0)kick(t,.12,out);if(k%2===1)hat(t,k%4===3?.035:.018,out);
        if(k===4||k===12)noiseSnare(t,.04,out);
        if(k===3||k===11||(k===14&&Math.random()<.5)){blip(N(r+24+[0,3,7,10][Math.floor(Math.random()*4)]),t,st*1.5,.03,out,2400)}
        if(k===0&&bar%2===0)pad([N(r),N(r+7),N(r+15)],t,st*30,out);i++}
      step();return setInterval(step,st*1000)},
    data:function(out){var bpm=120,st=60/bpm/4,i=0,chords=[[57,60,64,67],[53,57,60,64],[48,52,55,59],[55,59,62,65]];
      function step(){var t=ctx.currentTime,bar=Math.floor(i/16)%4,c=chords[bar],k=i%16;
        var pat=[0,2,1,3,2,1,3,2,0,1,3,2,1,3,2,1][k],m=c[pat]+(k%8>=4?12:0);
        blip(N(m),t,st*.9,.026,out,700+((i%64)*34));
        if(k%4===0){kick(t,.1,out);bass(N(c[0]-24),t,st*3.5,.05,out,260)}
        if(k%4===2)hat(t,.025,out);if(k===12)noiseSnare(t,.03,out);i++}
      step();return setInterval(step,st*1000)},
    nc:function(out){var bpm=92,st=60/bpm/4,i=0,root=[33,33,36,31];
      function step(){var t=ctx.currentTime,bar=Math.floor(i/16)%4,r=root[bar],k=i%16;
        if(k===0||k===3||k===8||k===11)grit(N(r),t,st*3.2,.05,out,260);
        if(k===0||k===8)kick(t,.14,out);if(k===4||k===12){noiseSnare(t,.05,out);clang(N(r+36),t,.012,out)}
        if(k%2===1)hat(t,.02,out);
        if(k===0&&bar%2===0)pad([N(r+12),N(r+19),N(r+24)],t,st*30,out);
        if(k===6||k===14)blip(N(r+36+[0,3,7][Math.floor(Math.random()*3)]),t,st*2,.024,out,1500);i++}
      step();return setInterval(step,st*1000)},
    keys:function(out){var ar=[[57,64,69,72],[53,60,65,69],[48,55,60,64],[55,62,67,71]],i=0,k=0;
      function step(){var c=ar[Math.floor(i/4)%4],m=c[[0,1,2,3,2,1,2,1][k%8]];tone(N(m),ctx.currentTime,2.4,'triangle',.08,out,.01);tone(N(m)*2,ctx.currentTime,1.2,'sine',.02,out,.01);k++;if(k%8===0)i+=4}
      step();return setInterval(step,620)}
  };

    function startAmbient(key, o) {
      o = o || {};
      if (!songs[key] || !ensure()) return false;
      stopAmbient(o.crossfade ? 0.6 : 0.15);
      level = o.volume == null ? level : o.volume;
      const now = ctx.currentTime, target = () => level * 0.35;
      const master = ctx.createGain(); master.gain.setValueAtTime(0, now);
      const fade = Math.max(0.3, +o.fadeIn || 0);
      master.gain.linearRampToValueAtTime(target(), now + fade);
      master.connect(ctx.destination);
      const dry = ctx.createGain(), wet = ctx.createGain(), r = rev(ctx), out = ctx.createGain();
      out.connect(dry); out.connect(r); r.connect(wet); dry.gain.value = 0.5; wet.gain.value = 0.9; dry.connect(master); wet.connect(master);
      if (BPM[key]) {
        const dl = ctx.createDelay(1), fb = ctx.createGain(), dg = ctx.createGain();
        dl.delayTime.value = 60 / BPM[key] * 0.75; fb.gain.value = 0.32; dg.gain.value = 0.35;
        out.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dg); dg.connect(master);
      }
      cur = { key, master, out, iv: songs[key](out), target };
      return true;
    }
    function stopAmbient(fadeOut) {
      if (!cur || !ctx) { cur = null; return; }
      const c = cur; cur = null; clearInterval(c.iv);
      const t = ctx.currentTime, f = Math.max(0.1, fadeOut == null ? 1.5 : fadeOut);
      c.master.gain.cancelScheduledValues(t); c.master.gain.setValueAtTime(c.master.gain.value, t); c.master.gain.setTargetAtTime(0, t, f / 3);
      (c.out._nodes || []).forEach((n) => { try { n.stop(t + f + 0.2); } catch (e) { /* уже остановлен */ } });
      setTimeout(() => { try { c.master.disconnect(); } catch (e) { /* ok */ } }, (f + 1.2) * 1000);
    }
    function setLevel(v) {
      level = v; if (!ctx) return; const t = ctx.currentTime;
      if (cur) cur.master.gain.setTargetAtTime(cur.target(), t, 0.15);
    }
    function setSfxLevel(v) { sfxLevel = v; if (ctx && sfxBus) sfxBus.gain.setTargetAtTime(v * 0.6, ctx.currentTime, 0.1); }
    const playing = () => (cur ? cur.key : null);

    // --- мягкие звуки сцены (идут на отдельную шину, выключаются сразу) ---
    function noiseBuf(dur) { const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
    function sweep(t, dur, f0, f1, g, q) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain();
      s.buffer = noiseBuf(dur + 0.1); f.type = 'bandpass'; f.Q.value = q || 0.9; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + dur * 0.35); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(e); e.connect(sfxBus); s.start(t);
    }
    function ping(f, t, dur, g, type) {
      const o = ctx.createOscillator(), e = ctx.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
    }
    // механическая клавиатура: пластик свитча (шум) + корпус (низкий тон) + тихий щелчок отпускания
    const KEYS = {
      k1: { g: 0.55, nd: 0.035, ng: 0.35, nf: 1800, nq: 0.7, bf: 170, bd: 0.09, bg: 0.9, up: 1, ud: 0.085, ug: 0.12 },
      k2: { g: 0.5, nd: 0.03, ng: 0.5, nf: 2400, nq: 0.9, bf: 200, bd: 0.07, bg: 0.7, top: 900, up: 1, ud: 0.07, ug: 0.2 },
      k3: { g: 0.6, nd: 0.04, ng: 0.25, nf: 1400, nq: 0.6, bf: 130, bd: 0.12, bg: 1, up: 1, ud: 0.09, ug: 0.1 },
      k4: { g: 0.5, nd: 0.03, ng: 0.4, nf: 2800, nq: 0.8, bf: 240, bd: 0.06, bg: 0.6, up: 1, ud: 0.06, ug: 0.14 },
      k5: { g: 0.5, nd: 0.025, ng: 0.7, nf: 3200, nq: 1.1, bf: 190, bd: 0.07, bg: 0.6, top: 1400, up: 1, ud: 0.055, ug: 0.3 },
      k6: { g: 0.38, nd: 0.04, ng: 0.2, nf: 1500, nq: 0.5, bf: 150, bd: 0.1, bg: 0.85, up: 0 },
    };
    function hit(t, d, g, f0, f1, q) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain();
      s.buffer = noiseBuf(d + 0.05); f.type = 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + d);
      e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(f); f.connect(e); e.connect(sfxBus); s.start(t);
    }
    function tone2(f, t, d, g, type, f1, out) {
      const o = ctx.createOscillator(), e = ctx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(e); e.connect(out || sfxBus); o.start(t); o.stop(t + d + 0.05);
    }
    function keyDown(t, o) {
      const j = 1 + (Math.random() - 0.5) * 0.14, g = o.g * (0.85 + Math.random() * 0.3);
      hit(t, o.nd, g * o.ng, o.nf * j, o.nf * 0.55 * j, o.nq);
      tone2(o.bf * j, t, o.bd, g * o.bg, 'sine', o.bf * 0.5 * j);
      if (o.top) tone2(o.top * j, t, 0.03, g * 0.12, 'triangle', o.top * 0.6);
      if (o.up) hit(t + o.ud, 0.02, g * o.ug, o.nf * 0.9, o.nf * 0.6, o.nq);
    }
    function reverb() {
      if (revNode) return revNode;
      const len = Math.floor(ctx.sampleRate * 1.8), bf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = bf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
      revNode = ctx.createConvolver(); revNode.buffer = bf; const g = ctx.createGain(); g.gain.value = 0.7; revNode.connect(g); g.connect(sfxBus); return revNode;
    }
    // удар на слово заголовка: мягкий аккорд, каждое слово выше предыдущего
    function titleHit(i) {
      const t = ctx.currentTime;
      if (style.title === 'soft') {
        const r = 165 * Math.pow(2, (i || 0) * 2 / 12);
        [0, 7, 12, 16].forEach((st, k) => tone2(r * Math.pow(2, st / 12), t + k * 0.015, 0.9, 0.08, k % 2 ? 'triangle' : 'sine'));
      } else {
        const r = 220 * Math.pow(2, (i || 0) * 2 / 12), c = style.title === 'echo' ? reverb() : null;
        [0, 7, 12].forEach((st, k) => {
          const o = ctx.createOscillator(), e = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = r * Math.pow(2, st / 12);
          e.gain.setValueAtTime(0, t + k * 0.012); e.gain.linearRampToValueAtTime(c ? 0.06 : 0.07, t + k * 0.012 + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.012 + (c ? 0.8 : 0.7));
          o.connect(e); e.connect(sfxBus); if (c) e.connect(c); o.start(t + k * 0.012); o.stop(t + k * 0.012 + 0.95);
        });
      }
    }
    const fx = {
      on(v) { sfxOn = !!v; },
      style(o) { if (o && KEYS[o.typing]) style.typing = o.typing; if (o && ['chord', 'soft', 'echo'].includes(o.title)) style.title = o.title; },
      type() { if (!sfxOn || !ensure()) return; keyDown(ctx.currentTime, KEYS[style.typing] || KEYS.k1); },
      thud(i) { if (!sfxOn || !ensure()) return; titleHit(i); },
      whoosh() { if (!sfxOn || !ensure()) return; sweep(ctx.currentTime, 1.0, 300, 3200, 0.09, 0.8); },
      swish() { if (!sfxOn || !ensure()) return; sweep(ctx.currentTime, 0.45, 2800, 600, 0.07, 1.1); },
      tick() { if (!sfxOn || !ensure()) return; ping(2300, ctx.currentTime, 0.03, 0.04, 'triangle'); },
      chime() { if (!sfxOn || !ensure()) return; const t = ctx.currentTime; ping(880, t, 2, 0.12); ping(1320, t + 0.02, 1.8, 0.07); ping(1760, t + 0.05, 1.4, 0.04); },
      finale() { if (!sfxOn || !ensure()) return; const t = ctx.currentTime; [220, 277, 330, 440].forEach((f, i) => ping(f, t + i * 0.08, 3.5, 0.07)); },
    };
    return { startAmbient, stopAmbient, setLevel, setSfxLevel, playing, fx, ensure };
  }
  window.CreditsSound = { LIST, create };
})();
