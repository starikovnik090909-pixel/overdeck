// sky.js — финальный экран «Звёздное небо» для OBS (sky.html): гладкая и пиксельная темы.
// Данные приходят из /api/gazette/issue (поле sky), показ и скрытие — опросом /api/gazette/state, как у афиши.
(function () {
  'use strict';
  const TPL_SMOOTH = (D) => `<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:radial-gradient(1000px 650px at 50% 52%, #0f2236 0%, #09131f 50%, #050a12 100%);color:#eaf4f2;font-family:Inter,system-ui,sans-serif">
  
    <div class="lay cf">
      ${(D.nebs||[]).map((b)=>`
        <div class="neb" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:${b.c};animation-delay:${b.d}s"></div>
      `).join('')}
      ${(D.far||[]).map((s)=>`
        <div class="st" style="left:${s.x}px;top:${s.y}px;width:${s.r}px;height:${s.r}px;background:${s.c};--o:${s.o};animation-delay:${s.d}s"></div>
      `).join('')}
    </div>
  
    <div class="lay cm">
      ${(D.mid||[]).map((s)=>`
        <div class="st" style="left:${s.x}px;top:${s.y}px;width:${s.r}px;height:${s.r}px;background:#fff;--o:${s.o};animation-delay:${s.d}s"></div>
      `).join('')}
      <svg width="1280" height="720" viewBox="0 0 1280 720" style="position:absolute;inset:0" aria-hidden="true">
        ${(D.segs||[]).map((g)=>`
          <line class="seg" pathLength="1" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${g.c}" stroke-width="1" stroke-linecap="round" style="animation-delay:${g.d}s"></line>
        `).join('')}
      </svg>
      ${(D.titles||[]).map((t)=>`
        <div class="lab" style="position:absolute;left:${t.x}px;top:${t.y}px;white-space:nowrap;font-family:Oswald,sans-serif;font-weight:500;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${t.c};animation-delay:${t.d}s">${t.text}</div>
      `).join('')}
      ${(D.nodes||[]).map((n)=>`
        <div style="position:absolute;left:${n.x}px;top:${n.y}px;width:0;height:0">
          <div class="pop" style="position:absolute;left:${n.h}px;top:${n.h}px;width:${n.s}px;height:${n.s}px;border-radius:50%;background:${n.c};box-shadow:0 0 ${n.g}px ${n.c};animation-delay:${n.d}s"></div>
          <div class="lab" style="position:absolute;left:10px;top:${n.ly}px;white-space:nowrap;animation-delay:${n.d}s">
            <div style="font-family:Oswald,sans-serif;font-weight:500;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#eef6f5;line-height:1.1">${n.name}</div>
            <div style="font-size:10.5px;color:#86a8a4;line-height:1.3">${n.sub}</div>
          </div>
        </div>
      `).join('')}
    </div>
  
    <div class="lay cs">
      <div class="scene">
        ${(D.rings||[]).map((o)=>`
          <div class="ring" style="left:${o.l}px;top:${o.t}px;width:${o.w}px;height:${o.h}px"></div>
        `).join('')}
        <div class="halo" style="left:${D.sun.h1l}px;top:${D.sun.h1l}px;width:${D.sun.h1}px;height:${D.sun.h1}px;background:radial-gradient(circle, ${D.sun.hc0} 0%, ${D.sun.hc1} 30%, rgba(255,120,40,0) 66%)"></div>
        <div class="sun" style="left:${D.sun.l}px;top:${D.sun.l}px;width:${D.sun.s}px;height:${D.sun.s}px;background:${D.sun.bg};box-shadow:0 0 ${D.sun.sh1}px ${D.sun.sh2}px ${D.sun.glow}"></div>
        <div class="sun" style="left:${D.sun.l}px;top:${D.sun.l}px;width:${D.sun.s}px;height:${D.sun.s}px;background:${D.sun.ov}"></div>
        <div style="position:absolute;left:-200px;top:${D.sun.ty}px;width:400px;text-align:center;z-index:6">
          <div style="font-family:Unbounded,sans-serif;font-weight:700;font-size:13px;letter-spacing:.22em">${D.sun.name}</div>
          <div style="margin-top:5px;font-size:11.5px;color:#cfe0dd">${D.sun.l1}</div>
          <div style="font-size:10.5px;color:#7f9f9b">${D.sun.l2}</div>
        </div>
        ${(D.planets||[]).map((p)=>`
          <div class="orb" style="--R:${p.R}px;--r:${p.r}px;--T:${p.T}s;--p:${p.ph}s;--q:${p.pq}s">
            <div class="oy"><div class="pz">
              <div style="position:absolute;left:${p.h}px;top:${p.h}px;width:${p.s}px;height:${p.s}px;border-radius:50%;background:${p.bg};box-shadow:0 0 12px ${p.glow}"></div>
              <div style="position:absolute;left:${p.rl}px;top:${p.rt}px;width:${p.rw}px;height:${p.rh}px;border:2px solid rgba(255,220,160,.5);border-radius:50%;transform:rotate(-16deg);opacity:${p.ringo}"></div>
              <div style="position:absolute;left:${p.lx}px;top:-12px;white-space:nowrap;line-height:1.1">
                <div style="font-family:Oswald,sans-serif;font-weight:500;font-size:14px;letter-spacing:.06em;text-transform:uppercase">${p.name}</div>
                <div style="font-size:10.5px;color:#86a8a4;line-height:1.3">${p.msgs}</div>
              </div>
            </div></div>
          </div>
        `).join('')}
      </div>
    </div>
  
    <div class="sat-x"><div class="sat-y"><div class="sat-b">
      <div style="width:380px;height:150px;transform:scale(.79);transform-origin:0 0;position:relative">
      <svg width="380" height="150" viewBox="0 0 380 150" style="position:absolute;inset:0" aria-hidden="true">
        <defs><linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7f8"/><stop offset="1" stop-color="#b9c4ca"/></linearGradient></defs>
        <rect x="4" y="36" width="92" height="76" rx="3" fill="#2f64c4" stroke="#cfe0ff" stroke-width="1.2"/>
        <rect x="284" y="36" width="92" height="76" rx="3" fill="#2f64c4" stroke="#cfe0ff" stroke-width="1.2"/>
        <path d="M35 36V112M65 36V112M314 36V112M345 36V112M4 74H96M284 74H376" stroke="#cfe0ff" stroke-width="1" opacity=".6"/>
        <rect x="96" y="70" width="12" height="8" fill="#8fa0a8"/><rect x="272" y="70" width="12" height="8" fill="#8fa0a8"/>
        <path d="M190 28V16" stroke="#dfe8ec" stroke-width="3" stroke-linecap="round"/>
        <path d="M166 18 Q190 -2 214 18Z" fill="#eef3f5" stroke="#8fa0a8"/>
        <rect x="108" y="28" width="164" height="94" rx="14" fill="url(#hull)" stroke="#8fa0a8" stroke-width="1.5"/>
        <rect x="108" y="28" width="164" height="9" rx="4" fill="#2BC4B4"/>
        <rect x="120" y="44" width="140" height="66" rx="8" fill="#06131a" stroke="#2BC4B4" stroke-width="1.4"/>
        <circle cx="257" cy="33" r="2.6" fill="#ff5a5a" class="led"/><circle cx="122" cy="33" r="2.4" fill="#5aff9a" class="led2"/><circle cx="12" cy="44" r="2.4" fill="#ffcb52" class="led3"/><circle cx="368" cy="44" r="2.4" fill="#5aff9a" class="led"/><circle cx="12" cy="104" r="2.4" fill="#ff5a5a" class="led2"/><circle cx="368" cy="104" r="2.4" fill="#ffcb52" class="led3"/><circle cx="190" cy="8" r="2" fill="#ff5a5a" class="led3"/>
        <path d="M176 122h28l4 10h-36z" fill="#7d8b92"/>
      </svg>
      <div style="position:absolute;left:122px;top:46px;width:136px;height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px">
        <div class="sk-qt" style="font-family:Oswald,sans-serif;font-weight:500;font-size:13px;line-height:1.15;letter-spacing:.03em;text-transform:uppercase;color:#f3fbfa">«${D.sat.text}»</div>
        <div class="sk-qw" style="font-size:9px;letter-spacing:.14em;color:#2BC4B4;text-transform:uppercase">${D.sat.who}</div>
      </div>
      </div>
    </div></div></div>
  
    <!--SPU-->  <div class="spu"><svg width="220" height="120" viewBox="0 0 220 120" aria-hidden="true">
      <defs><radialGradient id="sph" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#eaf5ff"/><stop offset=".35" stop-color="#86b8f0"/><stop offset=".7" stop-color="#2a5fa8"/><stop offset="1" stop-color="#0a2347"/></radialGradient></defs>
      <g stroke="#c4dcf4" stroke-width="1.6" stroke-linecap="round"><path d="M112 46L214 14M116 54L216 46M116 66L216 74M112 74L214 106"/></g>
      <g fill="#9fbad4"><rect x="106" y="43" width="9" height="6" rx="2"/><rect x="110" y="51" width="9" height="6" rx="2"/><rect x="110" y="63" width="9" height="6" rx="2"/><rect x="106" y="71" width="9" height="6" rx="2"/></g>
      <circle cx="84" cy="60" r="34" fill="url(#sph)"/>
      <ellipse cx="84" cy="60" rx="9" ry="34" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
      <ellipse cx="84" cy="60" rx="14" ry="34" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
      <g class="led" transform="translate(70 44)"><circle r="7" fill="rgba(255,255,255,.35)"/><path d="M0 -8L1.6 -1.6L8 0L1.6 1.6L0 8L-1.6 1.6L-8 0L-1.6 -1.6Z" fill="#fff"/></g>
    </svg></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%, transparent 58%, rgba(0,0,0,.5) 100%)"></div>
  
    <div style="position:absolute;left:56px;top:44px;display:flex;flex-direction:column;gap:10px">
      <div style="font-family:Oswald,sans-serif;font-size:13px;letter-spacing:.42em;color:#2BC4B4">ЭФИР ЗАВЕРШЁН</div>
      <div style="font-family:Unbounded,sans-serif;font-weight:700;font-size:30px;line-height:1.12;letter-spacing:.02em;text-transform:uppercase">Звёздное<br>небо чата</div>
    </div>
    <div style="position:absolute;right:56px;top:52px;font-family:Oswald,sans-serif;font-size:12px;letter-spacing:.3em;color:#8fb4b0;border:1px solid #27424a;border-radius:99px;padding:8px 16px">${D.tag}</div>
    <div style="position:absolute;right:56px;bottom:34px;display:flex;gap:34px;font-family:Oswald,sans-serif;text-transform:uppercase">
      ${(D.facts||[]).map((f)=>`
        <div style="display:flex;flex-direction:column;gap:2px;text-align:right">
          <span style="font-size:36px;font-weight:600;line-height:1">${f.v}</span>
          <span style="font-size:11px;letter-spacing:.28em;color:#8fb4b0">${f.l}</span>
        </div>
      `).join('')}
    </div>
  </div>`;
  const TPL_PIXEL = (D) => `<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:linear-gradient(180deg,#0a0d28 0 34%,#0c1130 34% 62%,#0e1436 62% 100%);color:#e8f1ff;font-family:'Pixelify Sans',monospace;image-rendering:pixelated">
  
    <div class="lay cf">
      ${(D.nebs||[]).map((b)=>`
        <div class="px" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.w}px;background:${b.c};clip-path:${b.clip}"></div>
      `).join('')}
      ${(D.far||[]).map((s)=>`
        <div class="st" style="left:${s.x}px;top:${s.y}px;width:${s.r}px;height:${s.r}px;background:${s.c};--o:${s.o};animation-delay:${s.d}s"></div>
      `).join('')}
    </div>
  
    <div class="lay cm">
      ${(D.mid||[]).map((s)=>`
        <div class="st" style="left:${s.x}px;top:${s.y}px;width:${s.r}px;height:${s.r}px;background:#fff;--o:${s.o};animation-delay:${s.d}s"></div>
      `).join('')}
      <svg width="1280" height="720" viewBox="0 0 1280 720" style="position:absolute;inset:0" shape-rendering="crispEdges" aria-hidden="true">
        ${(D.segs||[]).map((g)=>`
          <line class="seg" pathLength="1" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${g.c}" stroke-width="2" style="animation-delay:${g.d}s"></line>
        `).join('')}
      </svg>
      ${(D.titles||[]).map((t)=>`
        <div class="lab" style="position:absolute;left:${t.x}px;top:${t.y}px;white-space:nowrap;font-family:'Press Start 2P',monospace;font-size:9px;color:${t.c};animation-delay:${t.d}s">${t.text}</div>
      `).join('')}
      ${(D.nodes||[]).map((n)=>`
        <div style="position:absolute;left:${n.x}px;top:${n.y}px;width:0;height:0">
          <div class="pop" style="position:absolute;left:${n.h}px;top:${n.h}px;width:${n.s}px;height:${n.s}px;background:${n.c};box-shadow:0 0 0 2px rgba(255,255,255,.15);animation-delay:${n.d}s"></div>
          <div class="lab" style="position:absolute;left:10px;top:${n.ly}px;white-space:nowrap;animation-delay:${n.d}s">
            <div style="font-weight:600;font-size:14px;text-transform:uppercase;color:#f1f6ff;line-height:1.1">${n.name}</div>
            <div style="font-size:11.5px;color:#8fa0d8;line-height:1.25">${n.sub}</div>
          </div>
        </div>
      `).join('')}
    </div>
  
    <div class="lay cs">
      <div class="scene">
        ${(D.rings||[]).map((o)=>`
          <div class="ring" style="left:${o.l}px;top:${o.t}px;width:${o.w}px;height:${o.h}px"></div>
        `).join('')}
        ${(D.sunGlow||[]).map((g)=>`
          <div class="px glow" style="left:${g.l}px;top:${g.l}px;width:${g.w}px;height:${g.w}px;background:${g.c};clip-path:${g.clip};z-index:2"></div>
        `).join('')}
        ${(D.sunLayers||[]).map((g)=>`
          <div class="px" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.w}px;background:${g.c};clip-path:${g.clip};z-index:3"></div>
        `).join('')}
        <div style="position:absolute;left:-200px;top:${D.sun.ty}px;width:400px;text-align:center;z-index:6">
          <div style="font-family:'Press Start 2P',monospace;font-size:11px">${D.sun.name}</div>
          <div style="margin-top:7px;font-size:13px;color:#e4ecff">${D.sun.l1}</div>
          <div style="font-size:12px;color:#8fa0d8">${D.sun.l2}</div>
        </div>
        ${(D.planets||[]).map((p)=>`
          <div class="orb" style="--R:${p.R}px;--r:${p.r}px;--T:${p.T}s;--p:${p.ph}s;--q:${p.pq}s">
            <div class="oy">
              <div style="position:absolute;left:${p.h}px;top:${p.h}px;width:${p.s}px;height:${p.s}px;background:${p.bg};clip-path:${p.clip}"></div>
              <div style="position:absolute;left:${p.rl}px;top:-3px;width:${p.rw}px;height:6px;background:rgba(255,226,170,.8);opacity:${p.ringo}"></div>
              <div style="position:absolute;left:${p.lx}px;top:-12px;white-space:nowrap;line-height:1.1">
                <div style="font-weight:600;font-size:15px;text-transform:uppercase">${p.name}</div>
                <div style="font-size:11.5px;color:#8fa0d8;line-height:1.25">${p.msgs}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  
    <div class="sat-x"><div class="sat-y"><div class="sat-b">
      <svg width="340" height="120" viewBox="0 0 85 30" shape-rendering="crispEdges" style="position:absolute;inset:0" aria-hidden="true">
        <rect x="0" y="8" width="20" height="15" fill="#8fb0ff"/><rect x="1" y="9" width="18" height="13" fill="#3a62c8"/>
        <rect x="6" y="9" width="1" height="13" fill="#8fb0ff"/><rect x="13" y="9" width="1" height="13" fill="#8fb0ff"/><rect x="1" y="15" width="18" height="1" fill="#8fb0ff"/>
        <rect x="65" y="8" width="20" height="15" fill="#8fb0ff"/><rect x="66" y="9" width="18" height="13" fill="#3a62c8"/>
        <rect x="71" y="9" width="1" height="13" fill="#8fb0ff"/><rect x="78" y="9" width="1" height="13" fill="#8fb0ff"/><rect x="66" y="15" width="18" height="1" fill="#8fb0ff"/>
        <rect x="20" y="14" width="4" height="2" fill="#9aa8b8"/><rect x="61" y="14" width="4" height="2" fill="#9aa8b8"/>
        <rect x="41" y="3" width="3" height="1" fill="#e8eef6"/><rect x="40" y="4" width="5" height="1" fill="#e8eef6"/><rect x="39" y="5" width="7" height="1" fill="#cfd9e6"/><rect x="42" y="6" width="1" height="1" fill="#9aa8b8"/>
        <rect x="24" y="7" width="37" height="20" fill="#9aa8b8"/><rect x="24" y="7" width="37" height="19" fill="#e4ebf2"/><rect x="24" y="7" width="37" height="2" fill="#2BC4B4"/>
        <rect x="27" y="10" width="31" height="13" fill="#2BC4B4"/><rect x="28" y="11" width="29" height="11" fill="#07131a"/>
        <rect x="24" y="24" width="37" height="3" fill="#b3bfcc"/>
        <rect x="40" y="27" width="5" height="2" fill="#6f7c8c"/>
        <rect x="58" y="8" width="1" height="1" fill="#ff5a5a" class="led"/><rect x="25" y="8" width="1" height="1" fill="#5aff9a" class="led2"/><rect x="1" y="9" width="1" height="1" fill="#ffcb52" class="led3"/><rect x="83" y="9" width="1" height="1" fill="#5aff9a" class="led"/><rect x="1" y="21" width="1" height="1" fill="#ff5a5a" class="led2"/><rect x="83" y="21" width="1" height="1" fill="#ffcb52" class="led3"/><rect x="42" y="2" width="1" height="1" fill="#ff5a5a" class="led3"/>
      </svg>
      <div style="position:absolute;left:116px;top:46px;width:108px;height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:3px">
        <div class="sk-qt" style="font-weight:600;font-size:11px;line-height:1.1;text-transform:uppercase;color:#f3fbfa">«${D.sat.text}»</div>
        <div class="sk-qw" style="font-size:9px;color:#2BC4B4;text-transform:uppercase">${D.sat.who}</div>
      </div>
    </div></div></div>
  
    <div class="spu">
      <div style="position:absolute;left:56px;top:32px;width:56px;height:56px;clip-path:${D.spClip};background:linear-gradient(135deg,#eaf5ff 0 16%,#8fc0f5 16% 42%,#3a73c4 42% 72%,#16396e 72% 100%)"></div>
      <svg width="220" height="120" viewBox="0 0 220 120" shape-rendering="crispEdges" style="position:absolute;inset:0" aria-hidden="true">
        <g stroke="#c4dcf4" stroke-width="2"><path d="M112 46L214 14M116 54L216 46M116 66L216 74M112 74L214 106"/></g>
        <g fill="#9fbad4"><rect x="104" y="42" width="10" height="6"/><rect x="108" y="52" width="10" height="4"/><rect x="108" y="64" width="10" height="4"/><rect x="104" y="72" width="10" height="6"/></g>
        <rect x="68" y="42" width="4" height="4" fill="#fff" class="led"/><rect x="64" y="44" width="12" height="1" fill="#fff" class="led"/><rect x="69" y="39" width="1" height="12" fill="#fff" class="led"/>
      </svg>
    </div>
    <div style="position:absolute;left:56px;top:44px;display:flex;flex-direction:column;gap:14px">
      <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:#2BC4B4">ЭФИР ЗАВЕРШЁН</div>
      <div style="font-family:'Press Start 2P',monospace;font-size:24px;line-height:1.4;text-transform:uppercase">Звёздное<br>небо чата</div>
    </div>
    <div style="position:absolute;right:56px;top:50px;font-family:'Press Start 2P',monospace;font-size:10px;color:#8fa0d8;border:3px solid #2a3470;padding:10px 14px">${D.tag}</div>
    <div style="position:absolute;right:56px;bottom:34px;display:flex;gap:30px;text-transform:uppercase">
      ${(D.facts||[]).map((f)=>`
        <div style="display:flex;flex-direction:column;gap:8px;text-align:right">
          <span style="font-family:'Press Start 2P',monospace;font-size:24px;line-height:1">${f.v}</span>
          <span style="font-size:12px;color:#8fa0d8">${f.l}</span>
        </div>
      `).join('')}
    </div>
  </div>`;
  

  // ---------- данные для шаблонов ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const plural = (n, f) => { n = Math.abs(n); const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? f[0] : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? f[1] : f[2]; };
  const durText = (m) => (m >= 60 ? Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '') : m + ' мин');
  const rgba = (h, a) => { h = h.replace('#', ''); return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')'; };
  const R1 = (n) => Math.round(n * 10) / 10;

  // цвет и размер солнца: от длительности стрима; при нескольких категориях — градиент в сторону более тёплого цвета
  function sunModel(mins, cats) {
    const tiers = [
      { max: 60, c: ['#f2f9ff', '#bfe0ff', '#7cc4ff', '#4a9be8'] },
      { max: 150, c: ['#fffbe8', '#ffe08a', '#ffb83d', '#ff8a2b'] },
      { max: 270, c: ['#fff1d0', '#ffc060', '#ff8a2b', '#e0561a'] },
      { max: 1e9, c: ['#ffe2c8', '#ff9a5a', '#e8501f', '#a82a10'] },
    ];
    let ti = tiers.findIndex((t) => mins < t.max); if (ti < 0) ti = tiers.length - 1;
    const c = tiers[ti].c, warm = tiers[Math.min(tiers.length - 1, ti + 1)].c[3];
    return { c, second: cats >= 2 ? (cats >= 3 ? rgba(warm, 0.62) : rgba(warm, 0.4)) : '', diam: Math.round(70 + 60 * Math.min(1, mins / 300)) };
  }

  function baseVals(issue) {
    const K = issue.sky || { mins: 1, cats: [], chatters: [], consts: {}, quotes: [] };
    let a = ((issue.startTs || 1) % 99991) + 7;
    const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
    const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const studio = String(issue.studio || 'Стример');
    const d = new Date(issue.endTs || Date.now());
    const tag = ('СТРИМ ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })).toUpperCase();
    const nCat = Math.max(1, (K.cats || []).length);
    const SUN = sunModel(K.mins, nCat);
    const catNames = (K.cats || []).join(' → ');
    const sunLabel = { name: esc(studio.toUpperCase()), l1: esc(durText(K.mins) + ' · ' + nCat + ' ' + plural(nCat, ['категория', 'категории', 'категорий'])), l2: esc(cut(catNames, 40)) };
    const slots = [
      { key: 'subs', title: 'Подписчики', ptitle: 'ПОДПИСЧИКИ', tx: 112, ty: 168, xs: [118, 228, 330], ys: [224, 246], c: 'TE', base: 0 },
      { key: 'stay', title: 'Долгожители', ptitle: 'ДОЛГОЖИТЕЛИ', tx: 480, ty: 168, xs: [486, 606, 706], ys: [224, 246], c: 'ST', base: 2 },
      { key: 'music', title: 'Музыкальное', ptitle: 'МУЗЫКА', tx: 880, ty: 168, xs: [886, 990, 1070], ys: [224, 246], c: 'VI', base: 4 },
      { key: 'awards', title: 'Награды', ptitle: 'НАГРАДЫ', tx: 112, ty: 506, xs: [118, 228, 330], ys: [568, 588], c: 'PK', base: 6 },
      { key: 'donors', title: 'Меценаты', ptitle: 'МЕЦЕНАТЫ', tx: 880, ty: 506, xs: [886, 990, 1070], ys: [568, 588], c: 'GO', base: 8 },
    ];
    const used = slots.filter((s) => ((K.consts || {})[s.key] || []).length);
    const quotes = (K.quotes && K.quotes.length) ? K.quotes : [{ user: studio, text: 'Спасибо, что были с нами' }];
    const hrs = Math.floor(K.mins / 60), mm = K.mins % 60;
    const facts = [
      K.peak > 0 ? { v: String(K.peak), l: plural(K.peak, ['зритель', 'зрителя', 'зрителей']) } : { v: String(K.totalChatters || 0), l: 'в чате' },
      { v: String(used.length), l: plural(used.length, ['созвездие', 'созвездия', 'созвездий']) },
      { v: String(nCat), l: plural(nCat, ['категория', 'категории', 'категорий']) },
      { v: hrs + ':' + String(mm).padStart(2, '0'), l: 'в эфире' },
    ];
    return { K, rnd, ri, studio, tag, SUN, sunLabel, used, quotes, facts, nCat };
  }

  function constellations(B, pixel) {
    const COL = pixel ? { TE: '#6ff2dc', ST: '#b4ccff', GO: '#ffd36e', PK: '#ff8fcf', VI: '#c39bff' } : { TE: '#7fe8dc', ST: '#bcd4ff', GO: '#ffd68c', PK: '#ff9ad5', VI: '#c9a0ff' };
    const lineA = pixel ? '99' : '';
    const nodes = [], segs = [], titles = [];
    B.used.forEach((s) => {
      const col = COL[s.c], list = B.K.consts[s.key].slice(0, 3);
      titles.push({ x: s.tx, y: s.ty, text: pixel ? s.ptitle : s.title, c: col, d: (s.base - 0.3).toFixed(2) });
      const pts = list.map((p, i) => ({ x: s.xs[i], y: i % 2 ? s.ys[1] : s.ys[0], name: esc(cut(p.name, 12)), sub: esc(p.sub), s: i === 0 ? (s.key === 'donors' ? (pixel ? 10 : 7) : (pixel ? 8 : 6)) : (pixel ? 6 : 4) }));
      pts.forEach((p, i) => nodes.push({ x: p.x, y: p.y, s: p.s, h: -p.s / 2, g: p.s * 2.5, c: col, name: p.name, sub: p.sub, ly: i % 2 ? -4 : -36, d: (s.base + i * 0.9).toFixed(2) }));
      for (let i = 0; i < pts.length - 1; i++) segs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, c: pixel ? col + lineA : rgba(col, 0.5), d: (s.base + (i + 1) * 0.9 - 0.5).toFixed(2) });
    });
    return { nodes, segs, titles };
  }

  const SAT = (B) => ({ text: esc(B.quotes[0].text), who: esc(cut(B.quotes[0].user, 16)) });

  function valsSmooth(issue) {
    const B = baseVals(issue), { rnd, SUN } = B;
    const X = () => Math.round(-60 + rnd() * 1400), Y = () => Math.round(-50 + rnd() * 820);
    const far = [], mid = [], cols = ['#cfe3ff', '#ffffff', '#ffe9d0', '#bfeee8'];
    for (let i = 0; i < 100; i++) far.push({ x: X(), y: Y(), r: rnd() > 0.92 ? 2 : 1.2, o: (0.25 + rnd() * 0.45).toFixed(2), d: (rnd() * 5).toFixed(2), c: cols[Math.floor(rnd() * 4)] });
    for (let i = 0; i < 26; i++) mid.push({ x: X(), y: Y(), r: rnd() > 0.8 ? 3 : 2, o: (0.45 + rnd() * 0.5).toFixed(2), d: (rnd() * 5).toFixed(2) });
    const nebs = [{ x: 40, y: 220, w: 620, h: 300, c: 'rgba(43,196,180,.13)', d: 0 }, { x: 640, y: 120, w: 560, h: 300, c: 'rgba(110,90,255,.12)', d: 6 }, { x: 420, y: 420, w: 560, h: 240, c: 'rgba(255,160,90,.07)', d: 10 }];
    const sd = SUN.diam;
    const sun = {
      s: sd, l: -sd / 2, h1: Math.round(sd * 5), h1l: -Math.round(sd * 2.5), hc0: rgba(SUN.c[2], 0.34), hc1: rgba(SUN.c[3], 0.14),
      bg: 'radial-gradient(circle at 36% 32%, ' + SUN.c[0] + ' 0%, ' + SUN.c[1] + ' 28%, ' + SUN.c[2] + ' 62%, ' + SUN.c[3] + ' 100%)',
      ov: SUN.second ? 'linear-gradient(135deg, rgba(255,255,255,0) 40%, ' + SUN.second + ' 100%)' : 'transparent',
      glow: rgba(SUN.c[2], 0.55), sh1: Math.round(sd * 0.36), sh2: Math.round(sd * 0.1), ty: Math.round(sd / 2 + 16), ...B.sunLabel,
    };
    const deco = {
      gas: 'linear-gradient(180deg, transparent 24%, rgba(255,255,255,.16) 24% 36%, transparent 36% 54%, rgba(0,0,0,.14) 54% 64%, transparent 64%)',
      rock: 'radial-gradient(circle at 36% 40%, rgba(0,0,0,.16) 0 12%, transparent 13%), radial-gradient(circle at 66% 62%, rgba(0,0,0,.13) 0 9%, transparent 10%)',
      ocean: 'radial-gradient(ellipse at 40% 45%, rgba(120,200,120,.6) 0 22%, transparent 23%), radial-gradient(ellipse at 68% 66%, rgba(120,200,120,.55) 0 14%, transparent 15%)',
      ice: 'linear-gradient(180deg, transparent 30%, rgba(255,255,255,.35) 30% 38%, transparent 38%)',
    };
    const PL = [
      [165, 54, 0.12, ['#f3dcb0', '#d9a860', '#8a5a2c'], 'gas'], [215, 40, 0.6, ['#8fc8ff', '#3d82d6', '#16376b'], 'ocean'], [265, 98, 0.3, ['#d9c4b0', '#a38b76', '#4a3a30'], 'rock'],
      [315, 72, 0.85, ['#efc9f7', '#b681da', '#52306f'], 'gas'], [355, 130, 0.45, ['#e4f6fb', '#9fd3e6', '#3d6c80'], 'ice'], [395, 88, 0.05, ['#ffd0a8', '#d98a54', '#6b3317'], 'rock'], [425, 150, 0.7, ['#ffb8a0', '#d9684a', '#6b2517'], 'rock'],
    ];
    const ch = B.K.chatters || [], top = ch.length ? ch[0].n : 1;
    const step = ch.length > 1 ? Math.min(1, 6 / (ch.length - 1)) : 1;
    const planets = ch.map((p, i) => {
      const q = PL[i], c = q[3], s = Math.round(18 + 26 * Math.pow(p.n / top, 0.7)), R = Math.round(PL[0][0] + (q[0] - PL[0][0]) * step * 1), T = q[1], ph = Math.round(q[2] * T * 10) / 10, r = Math.round(R * 0.32);
      const bg = deco[q[4]] + ', radial-gradient(circle at 30% 28%, rgba(255,255,255,.3) 0%, rgba(255,255,255,0) 42%), radial-gradient(circle at 68% 70%, rgba(0,0,12,0) 36%, rgba(0,0,12,.5) 100%), linear-gradient(135deg, ' + c[0] + ' 0%, ' + c[1] + ' 55%, ' + c[2] + ' 100%)';
      return { name: esc(cut(p.user, 14)), msgs: p.n + ' ' + plural(p.n, ['сообщ.', 'сообщ.', 'сообщ.']), s, h: -s / 2, bg, glow: c[1] + '66', lx: Math.round(s / 2 + 8), R, r, T: T / 2, ph: -ph, pq: -(ph + T / 4), ringo: i === 0 ? 1 : 0, rw: Math.round(s * 2.2), rh: Math.round(s * 0.6), rl: -Math.round(s * 1.1), rt: -Math.round(s * 0.3) };
    });
    const rings = planets.map((p) => ({ l: -p.R, t: -p.r, w: p.R * 2, h: p.r * 2 }));
    const { nodes, segs, titles } = constellations(B, false);
    return { far, mid, nebs, sun, planets, rings, nodes, segs, titles, facts: B.facts, tag: esc(B.tag), sat: SAT(B) };
  }

  const disc = (n) => {
    const r = n / 2, rows = [];
    for (let i = 0; i < n; i++) { const y = i + 0.5 - r; let xl = null, xr = null; for (let x = 0; x < n; x++) { const cx = x + 0.5 - r; if (cx * cx + y * y <= r * r) { if (xl === null) xl = x; xr = x; } } rows.push([xl, xr]); }
    const pts = [];
    rows.forEach((w, i) => { pts.push([w[1] + 1, i], [w[1] + 1, i + 1]); });
    for (let i = n - 1; i >= 0; i--) pts.push([rows[i][0], i + 1], [rows[i][0], i]);
    return 'polygon(' + pts.map((p) => (p[0] / n * 100).toFixed(2) + '% ' + (p[1] / n * 100).toFixed(2) + '%').join(',') + ')';
  };
  const sq = (c, x, y, w, h) => 'linear-gradient(' + c + ',' + c + ') ' + x + 'px ' + y + 'px / ' + w + 'px ' + h + 'px no-repeat';

  function valsPixel(issue) {
    const B = baseVals(issue), { rnd, ri, SUN } = B;
    const X = () => Math.round((-40 + rnd() * 1360) / 2) * 2, Y = () => Math.round((-40 + rnd() * 800) / 2) * 2;
    const far = [], mid = [], cols = ['#bcd0ff', '#ffffff', '#ffe3b8', '#9ff0e4'];
    for (let i = 0; i < 90; i++) far.push({ x: X(), y: Y(), r: rnd() > 0.9 ? 4 : 2, o: (0.3 + rnd() * 0.5).toFixed(2), d: (rnd() * 4).toFixed(2), c: cols[ri(0, 3)] });
    for (let i = 0; i < 24; i++) mid.push({ x: X(), y: Y(), r: rnd() > 0.7 ? 4 : 2, o: (0.6 + rnd() * 0.4).toFixed(2), d: (rnd() * 4).toFixed(2) });
    const nebs = [];
    [[300, 330, '43,196,180'], [920, 230, '120,90,255'], [700, 520, '255,150,90']].forEach(([cx, cy, rgb]) => {
      [[32, 0.03], [22, 0.035], [12, 0.04]].forEach(([n, al]) => { const w = n * 16; nebs.push({ x: cx - w / 2, y: cy - w / 2, w, c: 'rgba(' + rgb + ',' + al + ')', clip: disc(n) }); });
    });
    // солнце: клетка 6 px; число клеток растёт с длительностью
    const C = 6, N = Math.max(12, Math.min(22, 2 * Math.round(SUN.diam / 12)));
    const sunLayers = [], sunGlow = [];
    [[N, SUN.c[3], 0, 0], [N - 2, SUN.c[2], 0, 0], [N - 5, SUN.c[1], -0.5, -0.5], [Math.max(4, N - 10), SUN.c[0], -1.5, -1.5]].forEach(([n, c, dx, dy]) => { const w = n * C; sunLayers.push({ x: -w / 2 + dx * C, y: -w / 2 + dy * C, w, c, clip: disc(n) }); });
    if (SUN.second) sunLayers.push({ x: -N * C / 2, y: -N * C / 2, w: N * C, c: 'linear-gradient(135deg, rgba(255,90,50,0) 0 56%, ' + SUN.second + ' 56% 100%)', clip: disc(N) });
    [[N + 12, 0.1], [N + 6, 0.16], [N + 3, 0.2]].forEach(([n, al]) => { const w = n * C; sunGlow.push({ l: -w / 2, w, c: rgba(SUN.c[2], al), clip: disc(n) }); });
    const sun = { ty: Math.round(N * C / 2 + 22), ...B.sunLabel };
    const PL = [[165, 54, 0.12, '#d9a860', 'gas'], [215, 40, 0.6, '#3d82d6', 'ocean'], [265, 98, 0.3, '#a38b76', 'rock'], [315, 72, 0.85, '#b681da', 'gas'], [355, 130, 0.45, '#9fd3e6', 'ice'], [395, 88, 0.05, '#d98a54', 'rock'], [425, 150, 0.7, '#d9684a', 'rock']];
    const ch = B.K.chatters || [], top = ch.length ? ch[0].n : 1, K = 3;
    const step = ch.length > 1 ? Math.min(1, 6 / (ch.length - 1)) : 1;
    const planets = ch.map((p, i) => {
      const q = PL[i], g = Math.round(7 + 7 * Math.pow(p.n / top, 0.7)), s = g * K, R = Math.round(PL[0][0] + (q[0] - PL[0][0]) * step), r = Math.round(R * 0.32), T = q[1], ph = Math.round(q[2] * T * 10) / 10;
      const row = (k) => (k * 100 / g).toFixed(2) + '%';
      const L = [];
      if (q[4] === 'gas') L.push('linear-gradient(180deg, transparent 0 ' + row(2) + ', rgba(255,255,255,.22) ' + row(2) + ' ' + row(4) + ', transparent ' + row(4) + ' ' + row(g - 5) + ', rgba(0,0,0,.2) ' + row(g - 5) + ' ' + row(g - 3) + ', transparent ' + row(g - 3) + ')');
      if (q[4] === 'ice') L.push('linear-gradient(180deg, transparent 0 ' + row(3) + ', rgba(255,255,255,.5) ' + row(3) + ' ' + row(4) + ', transparent ' + row(4) + ' ' + row(g - 4) + ', rgba(255,255,255,.4) ' + row(g - 4) + ' ' + row(g - 3) + ', transparent ' + row(g - 3) + ')');
      if (q[4] === 'rock') for (let k = 0; k < 3; k++) L.push(sq('rgba(0,0,0,.24)', ri(2, g - 4) * K, ri(2, g - 4) * K, 2 * K, 2 * K));
      if (q[4] === 'ocean') { L.push(sq('rgba(120,210,110,.9)', 3 * K, 3 * K, 4 * K, 2 * K)); L.push(sq('rgba(120,210,110,.9)', (g - 5) * K, (g - 5) * K, 3 * K, 2 * K)); L.push(sq('rgba(255,255,255,.7)', 2 * K, (g - 3) * K, 6 * K, K)); }
      L.push('linear-gradient(135deg, rgba(255,255,255,.3) 0 24%, rgba(255,255,255,0) 24% 60%, rgba(0,0,24,.35) 60% 80%, rgba(0,0,24,.55) 80% 100%)');
      L.push('linear-gradient(' + q[3] + ',' + q[3] + ')');
      return { name: esc(cut(p.user, 14)), msgs: p.n + ' сообщ.', s, h: -s / 2, bg: L.join(', '), clip: disc(g), lx: Math.round(s / 2 + 8), R, r, T: T / 2, ph: -ph, pq: -(ph + T / 4), ringo: i === 0 ? 1 : 0, rw: Math.round(s * 2.4), rl: -Math.round(s * 1.2) };
    });
    const rings = planets.map((p) => ({ l: -p.R, t: -p.r, w: p.R * 2, h: p.r * 2 }));
    const { nodes, segs, titles } = constellations(B, true);
    return { spClip: disc(14), far, mid, nebs, sunLayers, sunGlow, sun, planets, rings, nodes, segs, titles, facts: B.facts, tag: esc(B.tag), sat: SAT(B) };
  }

  // ---------- показ на странице ----------
  const api = (path, opt) => fetch(path, opt).then((r) => r.json());
  const stage = document.getElementById('sk-stage');
  let quoteTimer = 0, qIdx = 0, wasOn = false, holdT = 0;
  function fit() { const k = Math.min(innerWidth / 1280, innerHeight / 720); stage.style.transform = 'scale(' + k + ')'; stage.style.left = Math.round((innerWidth - 1280 * k) / 2) + 'px'; stage.style.top = Math.round((innerHeight - 720 * k) / 2) + 'px'; }
  function stop() { clearInterval(quoteTimer); clearTimeout(holdT); stage.classList.remove('on'); }
  function start(issue, settings, opts) {
    clearInterval(quoteTimer); clearTimeout(holdT);
    const pixel = settings.skyTheme === 'pixel';
    const D = (pixel ? valsPixel : valsSmooth)(issue);
    stage.className = pixel ? 'sk-p' : 'sk-s';
    stage.innerHTML = (pixel ? TPL_PIXEL : TPL_SMOOTH)(D);
    fit();
    const quotes = (issue.sky && issue.sky.quotes && issue.sky.quotes.length) ? issue.sky.quotes : [{ user: issue.studio || '', text: 'Спасибо, что были с нами' }];
    qIdx = 0; wasOn = false;
    quoteTimer = setInterval(() => { // фраза на спутнике меняется, пока он за кадром
      const sat = stage.querySelector('.sat-x'), qt = stage.querySelector('.sk-qt'), qw = stage.querySelector('.sk-qw');
      if (!sat || !qt || !qw) return;
      const r = sat.getBoundingClientRect(), s = stage.getBoundingClientRect();
      const off = r.right <= s.left || r.left >= s.right || r.bottom <= s.top || r.top >= s.bottom;
      if (off && wasOn) { qIdx = (qIdx + 1) % quotes.length; qt.textContent = '«' + quotes[qIdx].text + '»'; qw.textContent = cut(quotes[qIdx].user, 16); wasOn = false; } else if (!off) wasOn = true;
    }, 1000);
    requestAnimationFrame(() => stage.classList.add('on'));
    if (opts && opts.onDone && settings.creditsHoldSec > 0) holdT = setTimeout(opts.onDone, settings.creditsHoldSec * 1000);
  }
  window.addEventListener('resize', fit);

  async function mount() {
    const q = new URLSearchParams(location.search);
    if (q.get('preview')) {
      try {
        const demo = q.get('demo') || '';
        const [st, r] = await Promise.all([api('/api/gazette/state'), api('/api/gazette/issue' + (demo ? '?demo=' + encodeURIComponent(demo) : ''))]);
        start(r.issue, { ...st.settings, creditsHoldSec: 0 });
      } catch (e) { /* предпросмотр не загрузился */ }
      return;
    }
    let rev = -1;
    async function tick() {
      try {
        const st = await api('/api/gazette/state'), sc = st.screen;
        if (sc.rev === rev) return; rev = sc.rev;
        stop();
        if (sc.format !== 'sky') return;
        const r = await api('/api/gazette/issue' + (sc.demo ? '?demo=' + sc.demo : ''));
        start(r.issue, st.settings, { onDone: () => api('/api/gazette/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) });
      } catch (e) { /* ждём следующий опрос */ }
    }
    setInterval(tick, 1000); tick();
  }
  window.SkyScreen = { mount, valsSmooth, valsPixel, TPL_SMOOTH, TPL_PIXEL };
  mount();
})();
