// chatRoles.js
// Роли автора сообщения: модератор, VIP, новичок (первое сообщение в чате канала), рейдер — для подсветки в зеркале чата, и стример (broadcaster) — для пиксельного аватара.
// Что известно точно, а что — эвристика:
//  • модератор и VIP — из меток Twitch (badges.moderator / tags.mod, badges.vip) — точно;
//  • новичок — метка Twitch first-msg=1: ставится ТОЛЬКО на самое первое сообщение человека в этом чате (дальше он уже не «новый»);
//  • РЕЙДЕР — эвристика: Twitch не помечает зрителей, пришедших с рейда, поэтому считаем рейдером того, кто написал свою ПЕРВУЮ
//    за эту сессию строчку в течение RAID_WINDOW_MS (10 минут) после рейда. Так в рейдеры попадёт и давний лурк, который решил
//    впервые написать именно сейчас — отличить его от пришедшего с рейдом нельзя. Метка остаётся на его сообщениях до конца сессии.
//    Стример и сам канал рейдерами не считаются.

const RAID_WINDOW_MS = 10 * 60 * 1000;

function createTracker(now = () => Date.now()) {
  let raidWindowUntil = 0;
  const seen = new Set();     // кто уже писал в этой сессии (логины в нижнем регистре)
  const raiders = new Set();

  return {
    /** Пришёл рейд — открываем (или продлеваем) окно, в котором первые сообщения новых людей считаются рейдерскими. */
    noteRaid() { raidWindowUntil = now() + RAID_WINDOW_MS; },

    /** Роли для сообщения по его меткам (tags от tmi.js). Вызывать на КАЖДОЕ сообщение — так собирается список «уже писали». */
    rolesFor(tags) {
      const t = tags || {};
      const login = String(t.username || '').toLowerCase();
      const badges = t.badges || {};
      const isBroadcaster = !!badges.broadcaster;
      if (login && !seen.has(login)) {
        seen.add(login);
        if (!isBroadcaster && now() < raidWindowUntil) raiders.add(login);
      }
      const mod = !!badges.moderator || String(t.mod) === '1';
      const vip = !!badges.vip;
      const first = String(t['first-msg']) === '1' || t['first-msg'] === true;
      // broadcaster — стример (значок Twitch). Нужен странице пиксельного аватара, чтобы реагировать только на сообщения стримера.
      return { mod, vip, first, raider: !!login && raiders.has(login), broadcaster: isBroadcaster };
    },

    /** Сброс статистики стрима — начинаем «сессию» заново. */
    reset() { raidWindowUntil = 0; seen.clear(); raiders.clear(); },
  };
}

module.exports = { createTracker, RAID_WINDOW_MS };
