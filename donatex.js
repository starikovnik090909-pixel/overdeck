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

  client = new DonateXClient();
  client.on('DonationCreated', (raw) => {
    try {
      onDonation(mapDonation(raw));
    } catch (e) {
      console.warn('[DonateX] Ошибка обработки доната:', e.message);
    }
  });

  await client.login(token);
  console.log('[DonateX] Подключено, слушаем донаты.');
  return true;
}

function disconnect() {
  if (client) {
    try {
      if (typeof client.disconnect === 'function') client.disconnect();
      else if (typeof client.logout === 'function') client.logout();
    } catch (e) {
      // соединение уже могло быть закрыто — не критично
    }
    client = null;
  }
}

module.exports = { isAvailable, isConnected, connect, disconnect };
