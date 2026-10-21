'use strict';
// Определение рода по нику зрителя (для «задонатил / задонатила»). Работает офлайн, без внешних сервисов.
// Это эвристика: словари имён (русские — кириллицей и транслитом, английские и др.), окончания (-ка, -ова, -ов, -off…),
// слова-подсказки (girl, queen, king, mr…). Ник читается независимо от алфавита: кириллица переводится в латиницу,
// цифры/«leet» нормализуются (Toki0FF → tokioff, Maslino44ka → maslinoka). Если уверенности нет — возвращает null,
// а что делать в этом случае, решают настройки алерта. Точечные исключения задаются вручную (overrides).

const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g' };
const translit = (s) => String(s).toLowerCase().replace(/[а-яёіїєґ]/g, (c) => CYR[c]);
const hasCyr = (s) => /[а-яёіїєґ]/i.test(s);

/** Приводит латиницу к «каноническому» виду, чтобы Maria/Mariya, Katya/Katia/Katja, Yulia/Julia совпадали. */
function canon(s) {
  return String(s).toLowerCase()
    .replace(/sch/g, 'sh').replace(/kh/g, 'h').replace(/zh/g, 'j').replace(/ts/g, 'c').replace(/ph/g, 'f')
    .replace(/ya/g, 'ia').replace(/yu/g, 'iu').replace(/ye/g, 'ie').replace(/yo/g, 'io')
    .replace(/ja/g, 'ia').replace(/ju/g, 'iu').replace(/je/g, 'ie')
    .replace(/iy$/g, 'y').replace(/ij$/g, 'y').replace(/ii/g, 'i').replace(/yy/g, 'y')
    .replace(/w/g, 'v').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/(.)\1+/g, '$1');
}
const key = (s) => canon(translit(s));

// ---- словари ----
const F_RU = 'Анна Анастасия Настя Настена Мария Маша Машенька Маруся Катя Екатерина Катерина Ольга Оля Олеся Елена Лена Леночка Алёна Алена Наташа Наталья Наталия Татьяна Таня Танюша Светлана Света Ирина Ира Ирочка Юлия Юля Юлечка Дарья Даша Дашка Полина Поля Ксения Ксюша Алиса Алла Валерия Лера Лерка Вероника Вика Виктория Вера Верочка Надежда Надя Любовь Люба Людмила Люда Галина Галя Диана Дина Алина Аля Карина Кристина Кристи Софья София Соня Сонечка Милана Мила Мирослава Ульяна Уля Яна Яночка Злата Василиса Варвара Варя Арина Аришка Ангелина Геля Эльвира Эля Лилия Лиля Лилит Регина Рита Маргарита Тамара Зоя Нина Инна Жанна Элина Эмилия Эмма Camilla Камила Амина Аделина Адель Алсу Аэлита Агата Агния Ася Белла Богдана Влада Владислава Евгения Женя Елизавета Лиза Лизка Эльза Зарина Лариса Лара Марина Марьяна Маришка Милена Мальвина Оксана Оксанка Павлина Пелагея Раиса Роза Руслана Руся Серафима Симона Стелла Тая Таисия Тоня Антонина Ульяша Фатима Эвелина Юлиана Ярослава Алёнка Аленка Лизавета Дашуля Сашенька Настюша Катюша Машуня Олечка Танечка Ленка Светка Танька Машка Катька Оленька Юлька Анька Аннушка Манюня Нюша Ляля Лялька Кошечка Принцесса Девочка Девушка Малышка Зайка Лисичка Конфетка Булочка Пироженка Ягодка Ромашка Василёк Бабочка Фея Ведьма Русалка Снегурочка Королева Леди Мисс Мамочка Мама Бабушка Тётя Тетя Сестра Подруга Красотка Милашка Куколка Кисуля Кисуня Масяня'.split(/\s+/);
const M_RU = 'Александр Саша Санёк Санек Алексей Алёша Леша Леха Андрей Андрюша Андрюха Антон Антоха Тоха Артём Артем Тёма Тема Артур Борис Боря Вадим Вадик Валентин Валера Валерий Василий Вася Виктор Витя Витёк Виталий Виталик Владимир Вова Вовка Влад Владислав Владик Всеволод Вячеслав Слава Славик Геннадий Гена Георгий Жора Григорий Гриша Данил Даниил Даня Данила Денис Деня Дмитрий Дима Димон Димка Евгений Егор Егорка Иван Ваня Ванёк Игорь Игорёк Илья Илюха Илюша Кирилл Кира Костя Константин Лев Лёва Леонид Леня Максим Макс Максимка Марк Матвей Михаил Миша Мишка Никита Никитос Николай Коля Колян Олег Олежа Павел Паша Пашка Пётр Петя Петруха Роман Рома Ромка Руслан Сергей Серёжа Серега Сергей Стас Станислав Степан Стёпа Тимофей Тима Тимур Фёдор Федя Филипп Фил Эдуард Эдик Юрий Юра Юрик Ярослав Ярик Амир Аркадий Арсений Сеня Богдан Бодя Глеб Захар Игнат Назар Прохор Родион Родя Семён Семен Святослав Тарас Тихон Эльдар Дед Дедушка Батя Папа Папочка Брат Братан Мужик Пацан Парень Король Лорд Рыцарь Воин Охотник Волк Медведь Босс Бро Дядя Дядька Старик Бандит Хулиган Сантехник Тракторист Шахтёр Шахтер Капитан'.split(/\s+/);
const NEUTRAL_RU = 'Саша Женя Валя Шура Слава Сева Никита? Паша? Леся Ника Мира Рада Любава'.split(/\s+/).filter((x) => !x.endsWith('?'));
const F_EN = 'anna annie anne amy amanda amber ava abigail alice alicia alexa alexandra alyssa angela angelina ashley audrey aurora bella beth bethany betty bianca brenda brittany brooke caitlin camila carla carol caroline cassandra catherine cathy charlotte chloe christina cindy claire clara claudia cora courtney crystal daisy dana danielle daphne debbie denise diana donna dorothy eileen elena eliza elizabeth ella ellie emily emma erica erin eva eve evelyn faith fiona florence frances gabriela gabrielle gina giselle grace gwen hailey hannah heather heidi helen holly isabel isabella isabelle ivy jackie jane janet jasmine jean jenna jennifer jenny jessica jill joan joanna jocelyn josephine joy judy julia julie juliet june karen kate katie katherine kathy kayla kelly kelsey kim kimberly kira kylie lana laura lauren layla leah lena leslie lila lily linda lisa lola lori lucy luna lydia lynn mackenzie madeline madison maggie mandy margaret maria marie marilyn martha mary maya megan melanie melissa mia michelle mila mimi mia molly monica nadia nancy naomi natalie natasha nicole nina nora olivia paige pamela patricia paula penny phoebe piper priscilla rachel rebecca rose rosie ruby ruth sabrina sally samantha sandra sara sarah sasha? scarlett selena sharon sheila shelby sherry sierra sienna sofia sophia sophie stacy stella stephanie summer susan suzanne sydney sylvia tabitha tamara tanya taylor teresa tess tiffany tina tracy valentina valerie vanessa vera veronica vicky victoria violet virginia vivian wendy whitney willow yasmin yvonne zoe zoey ayumi akiko hanako yuki? sakura haruka yui rin mei misaki nana emi hina miku asuka rei mio aiko maria juana carmen lucia rosa paloma pilar elena sofia valeria camille chantal brigitte amelie colette ines ingrid astrid freya helga greta heidi ilse katja petra sabine monika magda agnieszka zofia ewa kasia ola iwona oksana svetlana olga irina natalia tatiana yulia kseniya'.split(/\s+/).filter((x) => !/[?]/.test(x));
const M_EN = 'adam aaron adrian alan albert alex? alexander alfred andrew andy anthony arthur austin barry ben benjamin bill billy bob bobby brad bradley brandon brian bruce bryan caleb cameron carl carlos chad charles charlie chris christian christopher clark cody colin connor craig dale dan daniel danny dave david dean dennis derek devin dominic don donald doug douglas drew dylan earl ed eddie edgar edward eli elijah elliot eric ethan eugene evan felix floyd francis frank fred freddy gabriel garry gary gavin gene geoffrey george gerald gordon grant greg gregory harold harry harvey henry howard hugh hunter ian isaac ivan jack jackson jacob jake james jamie jared jason jay jeff jeffrey jeremy jerry jesse jim jimmy joe joel john johnny jon jonathan jordan joseph josh joshua juan justin keith ken kenneth kevin kyle lance larry lawrence lee leo leon leonard liam logan louis lucas luke malcolm marcus mario mark martin marty mason matt matthew max maxwell michael mike miles mitchell nathan neil nelson nicholas nick noah norman oliver oscar owen patrick paul pedro percy peter phil philip randy ray raymond reed richard rick ricky rob robert robin rodney roger ron ronald ross roy russell ryan sam samuel scott sean sebastian seth shane shaun simon spencer stanley stephen steve steven stuart ted terry theodore thomas tim timothy toby todd tom tommy tony travis trevor tyler victor vincent wade walter warren wayne wesley will william willy wyatt xavier zach zachary zack hiroshi takeshi kenji satoshi taro yuki? ryu akira daiki kaito ren sora haruto yuto hans karl klaus jurgen stefan dieter wolfgang fritz otto pierre jean jacques luc marcel antoine alain henri giovanni marco luca matteo antonio jose miguel diego pablo javier carlos sergio manuel andrei dmitri ivan sergey vladimir alexei yuri boris anton nikolai oleg'.split(/\s+/).filter((x) => !/[?]/.test(x));

const F_WORDS = 'girl girly gurl gal lady ladies queen princess prince? miss mrs ms mom mommy mama mother sister sis she her herself waifu babe babygirl fairy witch kitty kitten catgirl bunny? cutie? dollie doll barbie lolita ms diva goddess empress duchess countess madam madame senorita fraulein mademoiselle devochka devka devushka devchonka dewka babushka baba kisa kisulya zayka lisa? lisichka'.split(/\s+/).filter((x) => !/[?]/.test(x));
const M_WORDS = 'boy guy man gentleman sir mr mister king lord duke emperor tsar czar knight dad daddy papa father brother bro brother dude bruh mate macho cowboy hunter viking samurai? gigachad chad muzhik pacan patsan paren dedushka ded batya bratan bratishka kozak cossack'.split(/\s+/).filter((x) => !/[?]/.test(x));
const NEUTRAL = 'alex sasha sacha zhenya jenya valya shura slava sevi sam jamie jordan taylor charlie robin kim jules andrea yuki max?'.split(/\s+/).filter((x) => !/[?]/.test(x));

const toSet = (arr) => { const s = new Set(); arr.forEach((n) => { const k = key(n); if (k.length >= 2) s.add(k); }); return s; };
const FS = toSet(F_RU.concat(F_EN, F_WORDS));
const MS = toSet(M_RU.concat(M_EN, M_WORDS));
const NS = toSet(NEUTRAL_RU.concat(NEUTRAL));
for (const k of NS) { FS.delete(k); MS.delete(k); }
// общие слова не должны давать подсказку при вхождении внутрь другого слова
const WORDS = toSet(F_WORDS.concat(M_WORDS));

const NOISE = new Set(['tv', 'live', 'official', 'yt', 'stream', 'streamer', 'gaming', 'gamer', 'game', 'games', 'pro', 'real', 'the', 'xx', 'ttv', 'twitch', 'play', 'plays', 'bot', 'fan', 'ofc', 'tm', 'vs']);

/** Приводит ник к списку «слов» в каноническом виде. */
function tokens(nick) {
  let t = String(nick || '').normalize('NFKC');
  // длинные числа (2+ цифр) отбрасываем, одиночную цифру внутри слова читаем как букву (0→o, 3→e, 1→i, 4→a, 5→s, 7→t)
  t = t.replace(/(?<=[A-Za-zА-Яа-яЁё])\d{2,}(?=[A-Za-zА-Яа-яЁё])/g, '').replace(/\d{2,}/g, ' ');
  t = t.replace(/(?<=[A-Za-zА-Яа-яЁё])([0-9])(?=[A-Za-zА-Яа-яЁё])/g, (m, d) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' }[d] || ' '));
  t = t.replace(/\d/g, ' ');
  // границы слов: разделители и «верблюжий» регистр
  t = t.replace(/[_\-.\s]+/g, ' ').replace(/([a-zа-яё])([A-ZА-ЯЁ][a-zа-яё])/g, '$1 $2').replace(/([A-ZА-ЯЁ]+)([A-ZА-ЯЁ][a-zа-яё])/g, '$1 $2');
  const raw = t.split(/[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ]+/).filter(Boolean);
  const out = [];
  raw.forEach((w) => {
    let k = key(w);
    // «обёртки» вида xXNameXx
    if (/^ks+/.test(k) && k.length > 4) k = k.replace(/^ks+/, '');
    if (/ks+$/.test(k) && k.length > 4) k = k.replace(/ks+$/, '');
    if (k.length >= 2 && !NOISE.has(k)) out.push({ k, cyr: hasCyr(w), len: w.length });
  });
  return out;
}

const F_SUFFIX = [
  [/(ochka|echka|ichka|ushka|iushka|ulia|ulka|enka|inka|onka|yshka)$/, 2.6, 'женское уменьшительное окончание'],
  [/(skaia|ovna|evna|ichna)$/, 3, 'женское отчество/фамилия'],
  [/(ova|eva)$/, 2.4, 'женская фамилия на -ова/-ева'],
  [/(ina|ynia|nia)$/, 1.2, 'окончание -ина/-ня'],
  [/ka$/, 2.2, 'окончание -ка'],
  [/(sha|ia)$/, 1.8, 'окончание -ша/-ия'],
];
const M_SUFFIX = [
  [/(ovich|evich|ych)$/, 3, 'мужское отчество'],
  [/(skiy|sky|ski)$/, 2.2, 'мужская фамилия на -ский'],
  [/(of|ov|ev|iev)$/, 2.8, 'мужская фамилия на -ов/-ев/-off'],
  [/(ian|ianin|yan)$/, 1.6, 'мужское окончание -ян'],
];

/** Оценка одного слова: {f, m, why}. */
function scoreWord(w) {
  const k = w.k;
  let f = 0, m = 0, why = '';
  const set = (side, v, text) => { if (side === 'f') { if (v > f) { f = v; why = why || text; } } else if (v > m) { m = v; why = why || text; } };
  if (NS.has(k)) return { f: 0, m: 0, why: 'нейтральное имя' };
  if (FS.has(k)) set('f', 4, `женское имя/слово «${k}»`);
  if (MS.has(k)) set('m', 4, `мужское имя/слово «${k}»`);
  if (!f && !m && k.length >= 5 && /(ova|eva|skaia)$/.test(k)) set('f', 3.4, 'женская фамилия на -ова/-ева');
  if (!f && !m) {
    // имя внутри составного слова: «masha», «katyagamer», «gamerkatya»
    let bestF = 0, bestM = 0, nf = '', nm = '';
    FS.forEach((n) => { if (n.length >= 4 && !WORDS.has(n) && k !== n && (k.startsWith(n) || k.endsWith(n)) && n.length > bestF) { bestF = n.length; nf = n; } });
    MS.forEach((n) => { if (n.length >= 4 && !WORDS.has(n) && k !== n && (k.startsWith(n) || k.endsWith(n)) && n.length > bestM) { bestM = n.length; nm = n; } });
    if (bestF > bestM) set('f', Math.min(3.2, 1.6 + bestF * 0.25), `в нике есть женское имя «${nf}»`);
    else if (bestM > bestF) set('m', Math.min(3.2, 1.6 + bestM * 0.25), `в нике есть мужское имя «${nm}»`);
    else if (bestF) { /* одинаково — не угадать */ }
  }
  if (!f && !m) {
    // слова-подсказки внутри (girl/queen/king/mr…): длиной от 4 букв
    let hit = '';
    WORDS.forEach((n) => { if (n.length >= 4 && k.includes(n) && n.length > hit.length) hit = n; });
    if (hit) { if (FS.has(hit)) set('f', 2.4, `слово «${hit}»`); else if (MS.has(hit)) set('m', 2.4, `слово «${hit}»`); }
  }
  if (!f && !m && k.length >= 5) {
    for (const [re, v, text] of F_SUFFIX) if (re.test(k)) { set('f', v, text); break; }
    for (const [re, v, text] of M_SUFFIX) if (re.test(k)) { set('m', v, text); break; }
    // русские слова на -а/-я (в каноне это «a»/«ia») — слабый женский признак; у ников из кириллицы сильнее
    if (!f && !m && /a$/.test(k)) set('f', w.cyr ? 1.8 : 1.1, 'окончание -а/-я');
  }
  return { f, m, why };
}

/** Определяет род по нику. Возвращает { gender: 'f'|'m'|null, f, m, why }. */
function detect(nick) {
  const ws = tokens(nick);
  let f = 0, m = 0, why = '';
  ws.forEach((w) => {
    const r = scoreWord(w);
    if (r.f > f) { f = r.f; if (r.f >= r.m) why = r.why; }
    if (r.m > m) { m = r.m; if (r.m > r.f) why = r.why; }
  });
  const d = f - m;
  const gender = d >= 1.3 ? 'f' : d <= -1.3 ? 'm' : null;
  return { gender, f: Math.round(f * 10) / 10, m: Math.round(m * 10) / 10, why: gender ? why : 'не удалось определить' };
}

/** Ручные исключения: { 'ник в нижнем регистре': 'm'|'f' }. */
function parseOverrides(text) {
  const o = {};
  String(text || '').split(/\r?\n/).slice(0, 300).forEach((line) => {
    const mm = line.trim().match(/^(.{1,40}?)\s*[=:]\s*([мmжf])/i);
    if (!mm) return;
    const nick = mm[1].trim().toLowerCase();
    if (nick) o[nick] = /[жf]/i.test(mm[2]) ? 'f' : 'm';
  });
  return o;
}

/** Итог для озвучки: 'm' | 'f' | 'n' (нейтрально). */
function resolve(nick, s) {
  const st = s || {};
  const ov = st.genderOverrides && st.genderOverrides[String(nick || '').trim().toLowerCase()];
  if (ov === 'm' || ov === 'f') return ov;
  if (st.genderDetect !== false) {
    const g = detect(nick).gender;
    if (g) return g;
  }
  return st.genderUnknown === 'female' ? 'f' : st.genderUnknown === 'neutral' ? 'n' : 'm';
}

module.exports = { detect, resolve, parseOverrides, tokens };
