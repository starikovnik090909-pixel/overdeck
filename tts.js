// tts.js
// Озвучка чата через Piper (локально, офлайн, без облачных API).
// Piper — не JS-библиотека: это отдельный исполняемый файл/CLI (ставится
// через `pip install piper-tts` или готовый бинарник с GitHub), поэтому
// озвучка запускается как дочерний процесс. Модели голосов (.onnx/.onnx.json)
// скачиваются один раз и лежат в voicesDir — см. README.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Каталог голосов, которые можно скачать кнопкой в админке. Любой другой Piper-голос (.onnx + .onnx.json) можно просто положить
// в папку voices — список в админке строится по файлам в папке.
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU';
const COMMUNITY = 'https://huggingface.co/rraaww/ru_piper/resolve/main';
const CATALOG = [
  { id: 'ru_RU-irina-medium', label: 'Ирина', gender: 'женский', note: 'Официальный голос Piper', url: `${HF}/irina/medium/ru_RU-irina-medium` },
  { id: 'ru_RU-dmitri-medium', label: 'Дмитрий', gender: 'мужской', note: 'Официальный голос Piper', url: `${HF}/dmitri/medium/ru_RU-dmitri-medium` },
  { id: 'ru_RU-denis-medium', label: 'Денис', gender: 'мужской', note: 'Официальный голос Piper', url: `${HF}/denis/medium/ru_RU-denis-medium` },
  { id: 'ru_RU-ruslan-medium', label: 'Руслан', gender: 'мужской', note: 'Официальный голос Piper', url: `${HF}/ruslan/medium/ru_RU-ruslan-medium` },
  { id: 'ru_RU-terra5871-medium', label: 'Terra', gender: 'женский', experimental: true, note: 'Любительская модель (rraaww/ru_piper, Apache-2.0), обучена на ~2 часах; может звучать менее ровно', url: `${COMMUNITY}/ru_RU-terra5871-medium` },
  { id: 'ru_RU-igm3804-medium', label: 'IGM', gender: 'мужской', experimental: true, note: 'Любительская модель (rraaww/ru_piper, Apache-2.0), обучена на ~2 часах; может звучать менее ровно', url: `${COMMUNITY}/ru_RU-igm3804-medium` },
  { id: 'ru_RU-mari-medium_epoch5699', label: 'Mari', gender: 'женский', experimental: true, note: 'Любительская модель (rraaww/ru_piper, Apache-2.0); качество не гарантируется', url: `${COMMUNITY}/ru_RU-mari-medium_epoch5699` },
];
const SAFE_ID = /^[A-Za-z0-9_.:\-]{1,80}$/;

// Онлайн-голоса Microsoft Edge (Read Aloud, нейросетевые, бесплатно, нужен интернет). Идентификатор — «edge:<имя голоса>».
const EDGE_VOICES = [
  { id: 'edge:ru-RU-SvetlanaNeural', label: 'Светлана', gender: 'женский', note: 'Нейроголос Microsoft Edge, онлайн, заметно естественнее Piper' },
  { id: 'edge:ru-RU-DmitryNeural', label: 'Дмитрий', gender: 'мужской', note: 'Нейроголос Microsoft Edge, онлайн, заметно естественнее Piper' },
  { id: 'edge:en-US-AvaMultilingualNeural', label: 'Ава', gender: 'женский', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:en-US-EmmaMultilingualNeural', label: 'Эмма', gender: 'женский', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:fr-FR-VivienneMultilingualNeural', label: 'Вивьен', gender: 'женский', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:de-DE-SeraphinaMultilingualNeural', label: 'Серафина', gender: 'женский', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:en-US-AndrewMultilingualNeural', label: 'Эндрю', gender: 'мужской', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:en-US-BrianMultilingualNeural', label: 'Брайан', gender: 'мужской', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:fr-FR-RemyMultilingualNeural', label: 'Реми', gender: 'мужской', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:de-DE-FlorianMultilingualNeural', label: 'Флориан', gender: 'мужской', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
  { id: 'edge:it-IT-GiuseppeMultilingualNeural', label: 'Джузеппе', gender: 'мужской', note: 'Многоязычный нейроголос Microsoft, говорит по-русски, возможен лёгкий акцент' },
];
// Значок голоса: движок и язык (RU — русский, ОБ — многоязычный/общий).
const edgeLang = (id) => (id.startsWith('edge:ru-RU-') ? 'ru' : 'multi');
const langTag = (l) => (l === 'ru' ? 'RU' : 'ОБ');
const SILERO_NOTE = 'Silero v4, офлайн; нужен Python + torch (install-silero.bat), первый запуск скачивает модель ~40 МБ';
const SILERO_VOICES = [
  { id: 'silero:aidar', label: 'Айдар', gender: 'мужской', note: SILERO_NOTE },
  { id: 'silero:eugene', label: 'Евгений', gender: 'мужской', note: SILERO_NOTE },
  { id: 'silero:kseniya', label: 'Ксения', gender: 'женский', note: SILERO_NOTE },
  { id: 'silero:xenia', label: 'Ксения-2', gender: 'женский', note: SILERO_NOTE },
  { id: 'silero:baya', label: 'Бая', gender: 'женский', note: SILERO_NOTE },
];
const isSilero = (id) => typeof id === 'string' && id.startsWith('silero:');
const isEdge = (id) => typeof id === 'string' && id.startsWith('edge:');

// Юзернеймы популярных чат-ботов — сравнение по вхождению, регистронезависимо.
const BOT_NAME_FRAGMENTS = ['streamelements', 'nightbot', 'streamlabs', 'moobot', 'fossabot', 'wizebot', 'own3d', 'commanderroot'];

const DEFAULT_TTS = {
  enabled: false,
  voice: 'ru_RU-irina-medium',
  lengthScale: 1.0,
  noiseScale: 0.667,
  noiseWScale: 0.8,
  volume: 1.0,
  sentenceSilence: 0.2,
  readNickname: true,
  ignoreBots: true,
  maxLength: 200,
  queueEnabled: true,
  ignoredWords: [],
};

function getDefaultTts() {
  return JSON.parse(JSON.stringify(DEFAULT_TTS));
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Приводит присланные настройки TTS к валидному виду (только известные поля/диапазоны). */
function sanitizeTts(body, base) {
  const b = body || {};
  return {
    enabled: typeof b.enabled === 'boolean' ? b.enabled : base.enabled,
    voice: typeof b.voice === 'string' && SAFE_ID.test(b.voice) ? b.voice : base.voice,
    lengthScale: clampNum(b.lengthScale, 0.5, 2.0, base.lengthScale),
    noiseScale: clampNum(b.noiseScale, 0.0, 1.0, base.noiseScale),
    noiseWScale: clampNum(b.noiseWScale, 0.0, 1.0, base.noiseWScale),
    volume: clampNum(b.volume, 0.0, 2.0, base.volume),
    sentenceSilence: clampNum(b.sentenceSilence, 0.0, 2.0, base.sentenceSilence),
    readNickname: typeof b.readNickname === 'boolean' ? b.readNickname : base.readNickname,
    ignoreBots: typeof b.ignoreBots === 'boolean' ? b.ignoreBots : base.ignoreBots,
    maxLength: Math.round(clampNum(b.maxLength, 20, 500, base.maxLength)),
    queueEnabled: typeof b.queueEnabled === 'boolean' ? b.queueEnabled : base.queueEnabled,
    ignoredWords: Array.isArray(b.ignoredWords)
      ? b.ignoredWords.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim().toLowerCase()).slice(0, 200)
      : base.ignoredWords,
  };
}

// ---------- Правила фильтрации сообщений ----------

function isBotUsername(username) {
  const lower = username.toLowerCase();
  return BOT_NAME_FRAGMENTS.some((bot) => lower.includes(bot));
}

function containsIgnoredWord(text, ignoredWords) {
  if (!ignoredWords || ignoredWords.length === 0) return false;
  const lower = text.toLowerCase();
  return ignoredWords.some((w) => w && lower.includes(w));
}

/** cleanText — сообщение уже без кодов эмодзи (см. stats.recordMessage). */
function shouldSpeak(username, cleanText, ttsConfig) {
  if (!ttsConfig.enabled) return false;
  if (!cleanText || !cleanText.trim()) return false;
  if (ttsConfig.ignoreBots && isBotUsername(username)) return false;
  if (containsIgnoredWord(cleanText, ttsConfig.ignoredWords)) return false;
  return true;
}

function buildSpeechText(username, cleanText, ttsConfig) {
  let text = cleanText.trim();
  if (text.length > ttsConfig.maxLength) {
    text = text.slice(0, ttsConfig.maxLength).trim() + '…';
  }
  return ttsConfig.readNickname ? `${username} говорит: ${text}` : text;
}

// ---------- Пути к движку (внутренние, не выставляются в UI) ----------

let piperPath = 'piper';
let pythonPath = '';
let voicesDir = path.join(__dirname, 'voices');

function configurePaths(engineCfg) {
  const cfg = engineCfg || {};
  if (cfg.piperPath) piperPath = cfg.piperPath;
  // Piper, установленный install-piper.bat, лежит в папке piper рядом с проектом — подхватываем сам, если путь не задан вручную
  if (!cfg.piperPath || cfg.piperPath === 'piper') {
    const local = path.join(__dirname, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
    try { if (fs.existsSync(local)) piperPath = local; } catch (e) { /* нет — остаётся 'piper' из PATH */ }
  }
  if (cfg.pythonPath) pythonPath = cfg.pythonPath;
  if (cfg.voicesDir) voicesDir = path.isAbsolute(cfg.voicesDir) ? cfg.voicesDir : path.join(__dirname, cfg.voicesDir);
}

/** Голоса, установленные в папке voices (есть оба файла). Подписи берутся из каталога, у чужих голосов — из имени файла. */
function getVoices() {
  let files = [];
  try { files = fs.readdirSync(voicesDir); } catch (e) { files = []; }
  const set = new Set(files);
  const out = [];
  files.filter((f) => f.endsWith('.onnx') && set.has(f + '.json')).forEach((f) => {
    const id = f.slice(0, -5);
    const c = CATALOG.find((x) => x.id === id);
    out.push({ id, label: c ? `${c.label} (${c.gender})` : id.replace(/^[a-z]{2}_[A-Z]{2}-/, '').replace(/-medium|-low|-high/, ''), experimental: !!(c && c.experimental), engine: 'Piper', lang: 'ru' });
  });
  EDGE_VOICES.forEach((e) => out.push({ id: e.id, label: `${e.label} (${e.gender}) · онлайн`, experimental: false, online: true, engine: 'Edge', lang: edgeLang(e.id) }));
  SILERO_VOICES.forEach((e) => out.push({ id: e.id, label: `${e.label} (${e.gender})`, experimental: false, engine: 'Silero', lang: 'ru' }));
  out.forEach((v) => { v.label = `[${v.engine} · ${langTag(v.lang)}] ${v.label}`; });
  return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

const installing = new Map(); // id -> { state: 'run'|'done'|'error', done, total, error }

function getCatalog() {
  const have = new Set(getVoices().map((v) => v.id));
  const edge = EDGE_VOICES.map((e) => ({ id: e.id, label: e.label, gender: e.gender, note: e.note, experimental: false, installed: true, online: true, engine: 'Edge', lang: edgeLang(e.id), install: null }));
  const silero = SILERO_VOICES.map((e) => ({ id: e.id, label: e.label, gender: e.gender, note: e.note, experimental: false, installed: true, engine: 'Silero', lang: 'ru', install: null }));
  return edge.concat(silero).concat(CATALOG.map((c) => ({ id: c.id, label: c.label, gender: c.gender, note: c.note, experimental: !!c.experimental, engine: 'Piper', lang: 'ru', installed: have.has(c.id), install: installing.get(c.id) || null })));
}

async function downloadTo(url, dest, onBytes) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tmp = dest + '.part';
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    const { Readable } = require('stream');
    const rs = Readable.fromWeb(res.body);
    rs.on('data', (ch) => onBytes(ch.length));
    rs.on('error', reject); out.on('error', reject); out.on('finish', resolve);
    rs.pipe(out);
  });
  fs.renameSync(tmp, dest);
}

/** Скачивает голос из каталога в папку voices (оба файла). Возвращает сразу, ход — в getCatalog().install. */
function installVoice(id) {
  const c = CATALOG.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Такого голоса нет в каталоге' };
  const cur = installing.get(id);
  if (cur && cur.state === 'run') return { ok: true };
  fs.mkdirSync(voicesDir, { recursive: true });
  const st = { state: 'run', done: 0, total: 63500000, error: null };
  installing.set(id, st);
  (async () => {
    try {
      await downloadTo(c.url + '.onnx.json', path.join(voicesDir, id + '.onnx.json'), () => {});
      await downloadTo(c.url + '.onnx', path.join(voicesDir, id + '.onnx'), (n) => { st.done += n; });
      st.state = 'done';
    } catch (e) {
      st.state = 'error'; st.error = String(e.message || e);
      ['.onnx', '.onnx.json', '.onnx.part'].forEach((ext) => { try { fs.unlinkSync(path.join(voicesDir, id + ext)); } catch (_) {} });
    }
  })();
  return { ok: true };
}

let warnedMissingModel = new Set();
let warnedMissingBinary = false;

/** Синтезирует текст в WAV (Buffer) через Piper (child_process). */
function synthPiper(text, ttsConfig) {
  return new Promise((resolve, reject) => {
    const modelPath = path.join(voicesDir, `${ttsConfig.voice}.onnx`);

    if (!fs.existsSync(modelPath)) {
      if (!warnedMissingModel.has(modelPath)) {
        console.warn(`[TTS] Не найден файл голоса: ${modelPath}\n       Скачай модель — инструкция в README (раздел "Озвучка чата").`);
        warnedMissingModel.add(modelPath);
      }
      return reject(new Error('voice model not found'));
    }

    const tmpFile = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    const args = [
      '-m', modelPath,
      '-f', tmpFile,
      '--length-scale', String(ttsConfig.lengthScale),
      '--noise-scale', String(ttsConfig.noiseScale),
      '--noise-w-scale', String(ttsConfig.noiseWScale),
      '--sentence-silence', String(ttsConfig.sentenceSilence),
      '--volume', String(ttsConfig.volume),
    ];

    let proc;
    try {
      proc = spawn(piperPath, args);
    } catch (e) {
      return reject(e);
    }

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      if (!warnedMissingBinary) {
        console.warn(`[TTS] Не удалось запустить piper ("${piperPath}"): ${err.message}\n       Убедись, что Piper установлен и доступен в PATH — инструкция в README.`);
        warnedMissingBinary = true;
      }
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`piper завершился с кодом ${code}: ${stderr.slice(0, 300)}`));
      }
      fs.readFile(tmpFile, (err, data) => {
        fs.unlink(tmpFile, () => {});
        if (err) return reject(err);
        resolve(data);
      });
    });

    proc.stdin.write(text, 'utf8');
    proc.stdin.end();
  });
}

// ---------- Очередь синтеза на стороне сервера ----------
// Не даём piper'у запускаться параллельно на каждое сообщение: складываем
// задания в очередь (максимум 10, старые вытесняются) и обрабатываем по одному.

const MAX_QUEUE = 10;
let queue = [];
let processing = false;


/** Edge Read Aloud: пакет msedge-tts (npm install). Возвращает MP3. Скорость/громкость берутся из общих настроек озвучки. */
async function synthEdge(text, ttsConfig) {
  let lib;
  try { lib = require('msedge-tts'); } catch (e) { throw new Error('Для голосов Edge выполни в папке проекта «npm install» и перезапусти сервер'); }
  const voiceName = ttsConfig.voice.slice(5);
  const tts = new lib.MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 30000 });
  await tts.setMetadata(voiceName, lib.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const pct = (n) => (n >= 0 ? '+' : '') + Math.round(n) + '%';
  const rate = pct((1 / Math.max(0.5, ttsConfig.lengthScale || 1) - 1) * 100);
  const volume = pct(((ttsConfig.volume == null ? 1 : ttsConfig.volume) - 1) * 100);
  const { audioStream } = tts.toStream(String(text).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])), { rate, volume });
  const chunks = [];
  await new Promise((resolve, reject) => {
    audioStream.on('data', (d) => chunks.push(Buffer.from(d)));
    audioStream.on('close', resolve);
    audioStream.on('error', reject);
  });
  try { tts.close(); } catch (_) {}
  const buf = Buffer.concat(chunks);
  if (!buf.length) throw new Error('Edge не вернул звук (нет интернета или сервис недоступен)');
  return buf;
}

/** Озвучивает текст выбранным голосом (Piper или Edge). Возвращает { buffer, mime }. */
// ---------- Silero (Python-воркер, офлайн) ----------
let sileroReady = null;
let sileroSeq = 0;
const sileroWait = new Map();

function pythonCmd() {
  const venv = process.platform === 'win32'
    ? path.join(__dirname, '.silero-venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '.silero-venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return pythonPath || (process.platform === 'win32' ? 'python' : 'python3');
}

function sileroStart() {
  if (sileroReady) return sileroReady;
  sileroReady = new Promise((resolve, reject) => {
    let proc;
    let buf = '';
    let done = false;
    const fail = (msg) => {
      if (!done) { done = true; reject(new Error(msg)); }
      sileroWait.forEach((w) => w.reject(new Error(msg)));
      sileroWait.clear();
      sileroReady = null;
    };
    try {
      proc = spawn(pythonCmd(), [path.join(__dirname, 'silero', 'worker.py')], { windowsHide: true });
    } catch (e) { return fail('Не удалось запустить Python для Silero: ' + e.message); }
    proc.on('error', (e) => fail('Не удалось запустить Python для Silero. Запусти install-silero.bat (' + e.message + ')'));
    proc.on('close', () => fail('Silero-воркер остановился. Проверь, что выполнен install-silero.bat'));
    proc.stderr.on('data', (d) => { const t = String(d).trim(); if (t) console.warn('[Silero]', t.slice(0, 300)); });
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try { m = JSON.parse(line); } catch (e) { continue; }
        if (m.ready && !done) { done = true; resolve(proc); }
        else if (m.fatal) fail('Silero: ' + m.fatal);
        else if (m.id != null && sileroWait.has(m.id)) {
          const w = sileroWait.get(m.id);
          sileroWait.delete(m.id);
          if (m.error) w.reject(new Error(m.error)); else w.resolve(Buffer.from(m.wav, 'base64'));
        }
      }
    });
    // первый запуск грузит torch и может качать модель (~40 МБ)
    setTimeout(() => { if (!done) { try { proc.kill(); } catch (e) { /* ignore */ } fail('Silero не успел запуститься за 180 с'); } }, 180000);
  });
  sileroReady.catch(() => {});
  return sileroReady;
}

async function synthSilero(text, ttsConfig) {
  const proc = await sileroStart();
  const id = ++sileroSeq;
  const p = new Promise((resolve, reject) => {
    sileroWait.set(id, { resolve, reject });
    setTimeout(() => { if (sileroWait.has(id)) { sileroWait.delete(id); reject(new Error('Silero: таймаут синтеза')); } }, 60000);
  });
  const vol = Number(ttsConfig.volume);
  proc.stdin.write(JSON.stringify({ id, text, speaker: String(ttsConfig.voice).slice(7), rate: Number(ttsConfig.lengthScale) || 1, volume: vol > 0 ? vol : 1 }) + '\n');
  return p;
}

async function synthesize(text, ttsConfig) {
  if (isSilero(ttsConfig.voice)) return { buffer: await synthSilero(text, ttsConfig), mime: 'audio/wav' };
  if (isEdge(ttsConfig.voice)) return { buffer: await synthEdge(text, ttsConfig), mime: 'audio/mpeg' };
  return { buffer: await synthPiper(text, ttsConfig), mime: 'audio/wav' };
}

function enqueue(job) {
  queue.push(job);
  if (queue.length > MAX_QUEUE) queue.shift();
  processQueue();
}

function clearQueue() {
  queue = [];
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      const r = await synthesize(job.text, job.ttsConfig);
      job.onDone(r.buffer, r.mime);
    } catch (e) {
      // Piper недоступен/модель не найдена — просто пропускаем это сообщение,
      // чат-статистику это не должно ломать.
      if (typeof job.onError === 'function') { try { job.onError(e); } catch (_) {} }
    }
  }
  processing = false;
}

module.exports = {
  getVoices,
  getCatalog,
  installVoice,
  synthesize,
  DEFAULT_TTS,
  getDefaultTts,
  sanitizeTts,
  shouldSpeak,
  buildSpeechText,
  configurePaths,
  enqueue,
  clearQueue,
};
