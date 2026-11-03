// voicefx.js — голосовые фильтры на Web Audio. Один движок для озвучки чата, алертов доната, микрофона (voicemic.html) и проверки в админке.
// VoiceFX.build(ctx, id, сила 0..1, {live, noise}) → {input, output, rate, tail, end(), stop()}
// VoiceFX.attach(audioEl, kind) — вешается на <audio>: фильтр включается сам, если для kind он активен (по состоянию с сервера).
(function (root) {
  'use strict';
  const FILTERS = [
    { id: 'radio', name: 'Рация', emoji: '📻', note: 'Узкая полоса, лёгкий перегруз, щелчок «кнопки» и «пшш» в конце: «есть пробитие».' },
    { id: 'phone', name: 'Телефон', emoji: '☎️', note: 'Полоса 300–3400 Гц, как в проводном телефоне.' },
    { id: 'mega', name: 'Мегафон', emoji: '📢', note: 'Жёсткий верх, сжатие и перегруз: голос из рупора.' },
    { id: 'robot', name: 'Робот', emoji: '🤖', note: 'Кольцевая модуляция: металлический голос.' },
    { id: 'cave', name: 'Пещера', emoji: '🕳', note: 'Длинное эхо, гулкая комната.' },
    { id: 'demon', name: 'Демон', emoji: '😈', note: 'Голос ниже, с гулом и эхом.' },
    { id: 'chip', name: 'Бурундук', emoji: '🐿', note: 'Голос выше и бодрее.' },
    { id: 'am', name: 'Старое радио', emoji: '📼', note: 'AM-приёмник: узкая полоса и лёгкое подрагивание.' },
    { id: 'water', name: 'Под водой', emoji: '🌊', note: 'Глухой голос с плавающим тоном.' },
    { id: 'announcer', name: 'Диктор', emoji: '🎙', note: 'Густой бас и чёткая подача, как у диктора.' },
    { id: 'bit8', name: '8-бит', emoji: '🎮', note: 'Грубая «цифра», как в старых приставках.' },
    { id: 'ghost', name: 'Призрак', emoji: '👻', note: 'Дрожащий голос в большом пустом зале.' },
    { id: 'stadium', name: 'Стадион', emoji: '🏟', note: 'Эхо-повторы, как над ареной.' },
    { id: 'troll', name: 'Тролль', emoji: '🧌', note: 'Низкий хриплый голос.' },
    { id: 'drunk', name: 'Пьяный', emoji: '🥴', note: 'Голос плывёт и качается.' },
    { id: 'alien', name: 'Пришелец', emoji: '👽', note: 'Высокий вибрирующий голос с металлом.' },
    { id: 'choir', name: 'Хор', emoji: '👥', note: 'Голос двоится и звучит как толпа.' },
  ];
  const ids = FILTERS.map((f) => f.id);
  // во сколько раз меняется высота голоса (и скорость, если звук играет из файла)
  const RATE = {
    demon: (a) => 0.95 - a * 0.3, chip: (a) => 1.2 + a * 0.6, ghost: () => 0.97, troll: (a) => 0.85 - a * 0.15,
    drunk: (a) => 0.97 - a * 0.06, alien: (a) => 1.06 + a * 0.12,
  };
  const rateOf = (id, a) => (RATE[id] ? RATE[id](a) : 1);

  const curve = (k) => { const n = 2049, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1;   // нечётное число точек: тишина (0) остаётся нулём, без постоянного смещения
      c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; };
  const stepCurve = (levels) => { const n = 4097, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.round(x * levels) / levels; } return c; };
  function impulse(c, sec, decay) {   // мягкая «комната»: шум сглажен, чтобы хвост не шипел
    const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let p = 0; for (let i = 0; i < n; i++) { p = p * 0.55 + (Math.random() * 2 - 1) * 0.45; d[i] = p * Math.pow(1 - i / n, decay); } }
    return b;
  }

  function build(c, id, amt, opt) {
    opt = opt || {}; const a = Math.max(0, Math.min(1, amt == null ? 0.6 : amt));
    const input = c.createGain(), output = c.createGain();
    const stops = [];
    let noiseGain = null, tail = 0.15;
    const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
    const bq = (type, f, q, g) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; if (g != null) n.gain.value = g; return n; };
    const shaper = (k) => { const s = c.createWaveShaper(); s.curve = curve(k); s.oversample = '2x'; return s; };
    const comp = (th, ratio) => { const k = c.createDynamicsCompressor(); k.threshold.value = th == null ? -26 : th; k.ratio.value = ratio || 6; k.attack.value = 0.003; k.release.value = 0.12; return k; };
    const osc = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); stops.push(() => { try { o.stop(); } catch (e) { /* уже остановлен */ } }); return o; };
    const lfo = (f, depth, param) => { const o = osc('sine', f), g = gain(depth); o.connect(g).connect(param); return o; };
    const chainFrom = (head, ...n) => { let p = head; n.forEach((x) => { p.connect(x); p = x; }); return p; };
    const chain = (...n) => chainFrom(input, ...n);
    const limiter = comp(-4, 20); limiter.knee.value = 0; limiter.attack.value = 0.001;
    const post = (last) => { last.connect(limiter); limiter.connect(output); };
    const verb = (sec, decay, wetV, dryV, from) => {   // параллельное эхо: сухой + мокрый
      const cv = c.createConvolver(); cv.buffer = impulse(c, sec, decay); const w = gain(wetV), d = gain(dryV), mix = gain(1);
      (from || input).connect(d).connect(mix); (from || input).connect(cv).connect(w).connect(mix); tail = Math.max(tail, sec); return mix;
    };
    const vibrato = (from, f, depth) => { const d = c.createDelay(0.1); d.delayTime.value = 0.02; lfo(f, depth, d.delayTime); from.connect(d); return d; };
    const noise = (level, lo, hi) => {   // шорох эфира: только если просят, гаснет вместе с фразой
      const n = Math.floor(c.sampleRate * 2), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b; s.loop = true; noiseGain = gain(level);
      s.connect(bq('highpass', lo)).connect(bq('lowpass', hi)).connect(noiseGain).connect(limiter); s.start();
      stops.push(() => { try { s.stop(); } catch (e) { /* уже остановлен */ } });
    };
    const ring = (f, mixWet) => { const m = gain(0); osc('sine', f).connect(m.gain); input.connect(m); const dry = gain(1 - mixWet), wet = gain(mixWet * 1.6), s = gain(1); input.connect(dry).connect(s); m.connect(wet).connect(s); return s; };

    switch (id) {
      case 'radio': {
        let head = input;
        if (opt.lead !== false) { const dl = c.createDelay(0.3); dl.delayTime.value = 0.1; input.connect(dl); head = dl; }   // голос чуть позже щелчка кнопки
        post(chainFrom(head, bq('highpass', 450 + a * 250), bq('lowpass', 3300 - a * 700), shaper(2 + a * 10), comp(-28, 8), gain(1.5)));
        if (opt.noise) noise(0.003 + a * 0.009, 400, 3200);
        break;
      }
      case 'phone': post(chain(bq('highpass', 300), bq('lowpass', 3400), shaper(1 + a * 5), comp(-26, 5), gain(1.4))); break;
      case 'mega': post(chain(bq('highpass', 500 + a * 300), bq('lowpass', 4200), shaper(6 + a * 24), comp(-30, 10), gain(1.1))); break;
      case 'robot': post(ring(40 + a * 90, 0.75 + a * 0.2)); break;
      case 'cave': post(verb(2.6 + a * 1.4, 2.2, 0.5 + a * 0.7, 0.8)); break;
      case 'demon': { const lo = chain(bq('lowshelf', 250, 0, 6 + a * 8), shaper(2 + a * 6), gain(1.1)); post(verb(1.6, 3, 0.3, 1, lo)); break; }
      case 'chip': post(chain(bq('highpass', 200), gain(1.1))); break;
      case 'am': {
        const tr = gain(1); lfo(5.5, 0.12 * a, tr.gain);
        post(chain(bq('highpass', 400), bq('lowpass', 2600 - a * 500), shaper(3 + a * 8), tr, gain(1.4)));
        if (opt.noise) noise(0.004 + a * 0.01, 500, 4500);
        break;
      }
      case 'water': {
        const f = bq('lowpass', 700 + (1 - a) * 900); lfo(3.2, 250 + a * 350, f.frequency);
        const body = chain(f, gain(1.8)); post(verb(0.9, 2.5, 0.4, 1, body)); break;
      }
      case 'announcer': post(chain(bq('highpass', 80), bq('lowshelf', 200, 0, 3 + a * 6), bq('peaking', 3000, 1, 2 + a * 4), comp(-30, 5), gain(1.3))); break;
      case 'bit8': { const sh = c.createWaveShaper(); sh.curve = stepCurve(Math.round(24 - a * 18)); post(chain(bq('highpass', 150), bq('lowpass', 6000 - a * 2500), sh, bq('lowpass', 4500), gain(1.1))); break; }
      case 'ghost': { const tr = gain(1); lfo(4, 0.25 * a, tr.gain); const dry = chain(bq('highpass', 280), tr); post(verb(3.4, 2.4, 0.9, 0.35, dry)); break; }
      case 'stadium': {
        const dl = c.createDelay(1), fb = gain(0.3 + a * 0.2), wet = gain(0.55), mix = gain(1);
        dl.delayTime.value = 0.26; input.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(mix); input.connect(mix);
        const lp = bq('lowpass', 6000); mix.connect(lp); tail = 2; post(verb(1.2, 3, 0.35, 1, lp)); break;
      }
      case 'troll': post(chain(shaper(3 + a * 9), bq('lowshelf', 220, 0, 6), bq('lowpass', 3200), comp(-28, 6), gain(1.2))); break;
      case 'drunk': { const vb = vibrato(input, 0.8, 0.003 + a * 0.005), lp = bq('lowpass', 3800); vb.connect(lp); post(lp); break; }
      case 'alien': { const r = ring(300 + a * 150, 0.4 + a * 0.2); const vb = vibrato(r, 6, 0.002 + a * 0.003); post(vb); break; }
      case 'choir': {
        const mix = gain(0.6); input.connect(mix);
        [[0.021, 0.4], [0.032, 0.63], [0.043, 0.85]].forEach(([base, f]) => { const d = c.createDelay(0.1); d.delayTime.value = base; lfo(f, 0.002 + a * 0.004, d.delayTime); input.connect(d); d.connect(gain(0.45)).connect(mix); });
        post(mix); break;
      }
      default: post(chain(gain(1)));
    }
    const rate = rateOf(id, a);
    return {
      input, output, rate, tail,
      end() { if (noiseGain) { const t = c.currentTime; noiseGain.gain.cancelScheduledValues(t); noiseGain.gain.setTargetAtTime(0, t, 0.04); } },
      stop() { stops.forEach((f) => f()); stops.length = 0; try { input.disconnect(); output.disconnect(); } catch (e) { /* уже отключён */ } },
    };
  }

  // щелчок кнопки рации (start) и «пшш» после фразы (end)
  function squelch(c, dest, t, a, end) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = end ? 900 : 1250;
    const g = c.createGain(), lv = 0.12 + 0.1 * a;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 0.008); g.gain.setValueAtTime(lv, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.07);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.08);
    if (end) {
      const n = Math.floor(c.sampleRate * 0.3), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
      const ng = c.createGain(); ng.gain.setValueAtTime(0.12 * (0.5 + a), t + 0.07); ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
      s.connect(bp).connect(ng).connect(dest); s.start(t + 0.07);
    }
  }

  // ---- питч для живого микрофона (AudioWorklet), у файлов высота меняется скоростью воспроизведения ----
  const WORKLET = 'class PS extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:"ratio",defaultValue:1,minValue:0.5,maxValue:2,automationRate:"k-rate"}]}' +
    'constructor(){super();this.N=16384;this.b=new Float32Array(this.N);this.w=0;this.p=0;this.W=Math.round(0.05*sampleRate)}' +
    'process(i,o,pr){const x=i[0]&&i[0][0],y=o[0][0];if(!x){return true}const r=pr.ratio[0],N=this.N,W=this.W,b=this.b;' +
    'for(let n=0;n<y.length;n++){b[this.w]=x[n];this.w=(this.w+1)%N;this.p+=(1-r)/W;if(this.p<0)this.p+=1;if(this.p>=1)this.p-=1;' +
    'let s=0;for(let k=0;k<2;k++){const q=(this.p+k*0.5)%1,d=q*W+1,pos=this.w-d,f=Math.floor(pos),fr=pos-f,i0=((f%N)+N)%N,i1=(i0+1)%N,v=b[i0]*(1-fr)+b[i1]*fr,wt=0.5-0.5*Math.cos(2*Math.PI*q);s+=v*wt}y[n]=s}return true}}' +
    'registerProcessor("overdeck-pitch",PS);';
  const loaded = new WeakMap();
  function initLive(c) {
    if (loaded.has(c)) return loaded.get(c);
    let p;
    try { const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })); p = c.audioWorklet.addModule(url).then(() => true, () => false); } catch (e) { p = Promise.resolve(false); }
    loaded.set(c, p); return p;
  }
  /** Живой фильтр для микрофона: питч (если нужен) + эффект. Возвращает {input, output, stop}. */
  function buildLive(c, id, amt, havePitch) {
    const fx = build(c, id, amt, { live: true, lead: false, noise: false });
    if (!havePitch || Math.abs(fx.rate - 1) < 0.01) return { input: fx.input, output: fx.output, stop: fx.stop, rate: fx.rate };
    const ps = new AudioWorkletNode(c, 'overdeck-pitch'); ps.parameters.get('ratio').value = fx.rate;
    ps.connect(fx.input);
    return { input: ps, output: fx.output, rate: fx.rate, stop() { fx.stop(); try { ps.disconnect(); } catch (e) { /* уже */ } } };
  }

  // ---- состояние с сервера и подключение к <audio> ----
  const S = { filter: 'off', strength: 60, targets: { tts: true, alert: true, mic: true } };
  let ctx = null;
  function context() {
    if (!ctx) { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function setState(s) { if (!s) return; S.filter = ids.includes(s.filter) ? s.filter : 'off'; S.strength = Math.max(0, Math.min(100, Number(s.strength) || 0)); if (s.targets) S.targets = Object.assign({}, S.targets, s.targets); }
  function refresh() { return root.fetch('/api/voicefx/active', { cache: 'no-store' }).then((r) => r.json()).then(setState).catch(() => {}); }
  const wanted = (kind) => (S.filter !== 'off' && S.targets[kind] !== false ? S.filter : 'off');

  function attach(el, kind) {
    const st = { src: null, fx: null, kind: kind || 'tts' };
    function route(id) {
      const c = context(); if (!c) return;
      if (st.fx) { const old = st.fx; setTimeout(() => old.stop(), Math.ceil(old.tail * 1000) + 400); st.fx = null; }
      if (!st.src) { try { st.src = c.createMediaElementSource(el); } catch (e) { return; } }
      try { st.src.disconnect(); } catch (e) { /* ещё не подключён */ }
      if (id === 'off') { st.src.connect(c.destination); el.playbackRate = 1; return; }
      const a = S.strength / 100, fx = build(c, id, a, { noise: id === 'radio' || id === 'am' });
      st.src.connect(fx.input); fx.output.connect(c.destination); st.fx = fx;
      el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false; el.playbackRate = fx.rate;
      if (id === 'radio') squelch(c, c.destination, c.currentTime, a, false);
    }
    el.addEventListener('play', () => { const id = wanted(st.kind); if (id === 'off' && !st.src) return; route(id); });
    const done = () => {
      if (!st.fx) return;
      const fx = st.fx; fx.end();
      if (S.filter === 'radio' && ctx) squelch(ctx, ctx.destination, ctx.currentTime + 0.05, S.strength / 100, true);
    };
    el.addEventListener('ended', done);
    return st;
  }
  const curRate = (kind) => { const id = wanted(kind || 'tts'); return id === 'off' ? 1 : rateOf(id, S.strength / 100); };
  function audio(src, kind) { const a = new root.Audio(src); attach(a, kind || 'alert'); return a; }
  root.VoiceFX = { audio, curRate, FILTERS, ids, rateOf, build, buildLive, initLive, squelch, attach, setState, refresh, state: S, context };
})(typeof window !== 'undefined' ? window : globalThis);
