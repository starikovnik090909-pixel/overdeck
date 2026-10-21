// teamPresets.js
// Именованные пресеты команд ("Сохранить команду" / "Загрузить команду" на
// вкладке "Ивент"). Список — в saved_teams.json; у каждого пресета своя
// подпапка в uploads/teams/<id>/ со СВОИМИ копиями фото/логотипа (не
// ссылками на uploads/team/) — чтобы дальнейшая замена фото у активной
// команды не портила когда-то сохранённый пресет, и наоборот.

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, 'uploads', 'teams');
const INDEX_FILE = path.join(__dirname, 'saved_teams.json');

function ensureDir() {
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яёA-ZА-ЯЁ0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'team';
}

let index = null;

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const raw = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (raw && Array.isArray(raw.presets)) return raw;
    }
  } catch (e) {
    console.warn('[Пресеты команд] Не удалось прочитать saved_teams.json, начинаем с пустого списка:', e.message);
  }
  return { presets: [] };
}

function saveIndex() {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  } catch (e) {
    console.warn('[Пресеты команд] Не удалось сохранить saved_teams.json:', e.message);
  }
}

function init() {
  ensureDir();
  index = loadIndex();
  if (!fs.existsSync(INDEX_FILE)) saveIndex(); // создаём файл сразу, чтобы он был виден на диске с первого запуска
}

function list() {
  return index.presets.slice().sort((a, b) => b.createdAt - a.createdAt); // новые сверху
}

function uniqueId(name) {
  const base = slugify(name);
  const existing = new Set(index.presets.map((p) => p.id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Копирует файл из uploads/team/<...> в папку пресета, если он существует; возвращает имя файла в папке пресета. */
function copyAssetIfExists(sourceUrl, presetDir, targetNameBase) {
  if (!sourceUrl) return null;
  try {
    const sourceName = path.basename(sourceUrl);
    const sourcePath = path.join(__dirname, 'uploads', 'team', sourceName);
    if (!fs.existsSync(sourcePath)) return null;
    const ext = path.extname(sourceName) || '.png';
    const targetName = `${targetNameBase}${ext}`;
    fs.copyFileSync(sourcePath, path.join(presetDir, targetName));
    return targetName;
  } catch (e) {
    console.warn('[Пресеты команд] Не удалось скопировать файл в пресет:', e.message);
    return null;
  }
}

/** team — объект вида teamData.getSide(side): {teamName, logoUrl, players:[{nickname,role,about,photoUrl}]}. */
function save(name, team) {
  ensureDir();
  const cleanName = String(name || '').trim() || 'Команда';
  const id = uniqueId(cleanName);
  const presetDir = path.join(PRESETS_DIR, id);
  fs.mkdirSync(presetDir, { recursive: true });

  const logoFile = copyAssetIfExists(team.logoUrl, presetDir, 'logo');
  const players = (team.players || []).map((p, i) => ({
    nickname: p.nickname || '',
    role: p.role || '',
    about: p.about || '',
    photoFile: copyAssetIfExists(p.photoUrl, presetDir, `photo${i}`),
    crop: p.crop || null,   // кадрирование фото
  }));

  const presetData = { teamName: team.teamName || '', logoFile, logoLayout: team.logoLayout || null, players };
  fs.writeFileSync(path.join(presetDir, 'data.json'), JSON.stringify(presetData, null, 2));

  index.presets.push({ id, name: cleanName, createdAt: Date.now() });
  saveIndex();
  return { id, name: cleanName };
}

/** Возвращает данные пресета в том же формате, что и teamData.getSide() — готовые к подстановке в любую сторону. */
function load(id) {
  const presetDir = path.join(PRESETS_DIR, id);
  const dataPath = path.join(presetDir, 'data.json');
  if (!fs.existsSync(dataPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return {
      teamName: raw.teamName || '',
      logoUrl: raw.logoFile ? `/uploads/teams/${id}/${raw.logoFile}` : null,
      logoLayout: raw.logoLayout || null,
      players: (Array.isArray(raw.players) ? raw.players : []).map((p) => ({
        nickname: p.nickname || '',
        role: p.role || '',
        about: p.about || '',
        photoUrl: p.photoFile ? `/uploads/teams/${id}/${p.photoFile}` : null,
        crop: p.crop || null,
      })),
    };
  } catch (e) {
    console.warn('[Пресеты команд] Не удалось прочитать пресет', id, ':', e.message);
    return null;
  }
}

function remove(id) {
  const presetDir = path.join(PRESETS_DIR, id);
  try {
    fs.rmSync(presetDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('[Пресеты команд] Не удалось удалить папку пресета:', e.message);
  }
  const before = index.presets.length;
  index.presets = index.presets.filter((p) => p.id !== id);
  saveIndex();
  return index.presets.length !== before;
}

module.exports = { init, list, save, load, remove, PRESETS_DIR };
