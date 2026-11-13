// donatex.js
// Интеграция с DonateX через @hitomihiumi/donatex.js (SignalR-гейтвей,
// событие DonationCreated). Пакет — сторонний и не очень распространённый,
// его точный формат события DonationCreated не проверялся вживую (нет
// доступа в сеть из окружения разработки) — при первом реальном донате
// проверь через console.log в mapDonation(), что поля читаются верно,
// и поправь при необходимости.

let DonateXClient = null;
try {
  // eslint-disable-next-line global-require
  ({ Client: DonateXClient } = require('@hitomihiumi/donatex.js'));
} catch (e) {
  console.warn('[DonateX] Пакет @hitomihiumi/donatex.js не установлен — выполни "npm install" (см. package.json). DonateX работать не будет, остальное не затронуто.');
}

let client = null;

function isAvailable() {
  return !!DonateXClient;
}

function isConnected() {
  return !!client;
}

/** Приводит сырое событие DonationCreated к общему формату донатов проекта. */
function mapDonation(raw) {
  return {
    platform: 'donatex',
    username: raw.username || raw.name || raw.user || 'Аноним',
    amount: Number(raw.amount) || 0,
    currency: raw.currency || 'RUB',
    message: raw.message || raw.text || '',
  };
}

/** onDonation(donation) вызывается на каждое DonationCreated. Бросает при отсутствии пакета/неверном токене. */
async function connect(token, onDonation) {
  if (!DonateXClient) {
    throw new Error('Пакет @hitomihiumi/donatex.js не установлен');
  }
  disconnect();

  token = String(token || '').trim().replace(/^bearer\s+/i, '').replace(/\s+/g, '');
  if (!token) throw new Error('Не указан API-токен DonateX');
  client = new DonateXClient();
  client.on('error', (e) => console.warn('[DonateX]', e && e.message)); // без слушателя ошибка роняет процесс
  client.on('DonationCreated', (raw) => {
    try {
      onDonation(mapDonation(raw));
    } catch (e) {
      console.warn('[DonateX] Ошибка обработки доната:', e.message);
    }
  });

  try {
    await client.login(token);
  } catch (e) {
    const m = String((e && e.message) || e);
    disconnect();
    if (/401|unauthor|403|forbidden/i.test(m)) throw new Error('DonateX не принял токен: проверь, что он скопирован целиком.');
    throw new Error('Не удалось подключиться к DonateX: ' + m.replace(/^\[DonateX Client\] Failed to login: /, '').slice(0, 200));
  }
  console.log('[DonateX] Подключено, слушаем донаты.');
  return true;
}

function disconnect() {
  if (client) {
    try {
      client.removeAllListeners('DonationCreated');
      if (typeof client.destroy === 'function') client.destroy().catch(() => {}); // закрывает SignalR; иначе после переподключения донаты дублируются
      else if (typeof client.disconnect === 'function') client.disconnect();
    } catch (e) {
      // соединение уже могло быть закрыто — не критично
    }
    client = null;
  }
}

module.exports = { isAvailable, isConnected, connect, disconnect };
