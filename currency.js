// currency.js
// Пересчёт сумм донатов в рубли для таймлайна. Курсы приблизительные и ЗАДАНЫ ВРУЧНУЮ (без запросов в сеть):
// для отметки на таймлайне точность до рубля не нужна. Свои курсы можно задать в config.json:
//   "currencyRates": { "USD": 95, "EUR": 105 }   (сколько рублей стоит единица валюты)

const DEFAULT_RATES = {
  RUB: 1, USD: 90, EUR: 100, GBP: 115, UAH: 2.2, KZT: 0.18, BYN: 28, PLN: 22, TRY: 2.6, CNY: 12.5, CAD: 65, AUD: 60,
  CHF: 105, JPY: 0.6, CZK: 4, GEL: 33, AMD: 0.23, UZS: 0.007, KGS: 1.05, AZN: 53, MDL: 5,
};
const ALIASES = { '₽': 'RUB', 'РУБ': 'RUB', 'РУБ.': 'RUB', 'RUR': 'RUB', '$': 'USD', '€': 'EUR', '£': 'GBP', '₴': 'UAH', '₸': 'KZT' };

let overrides = {};

/** Подставляет пользовательские курсы из config.json (неверные значения игнорируются). */
function setOverrides(obj) {
  overrides = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) overrides[String(k).trim().toUpperCase()] = n;
  });
}

function normalize(currency) {
  const raw = String(currency || 'RUB').trim().toUpperCase();
  return ALIASES[raw] || raw;
}

/**
 * Переводит сумму в рубли. Возвращает { rub, code, known }: rub — целое число рублей (null, если валюта неизвестна),
 * code — нормализованный код валюты.
 */
function toRub(amount, currency) {
  const n = Number(amount);
  const code = normalize(currency);
  const rate = overrides[code] != null ? overrides[code] : DEFAULT_RATES[code];
  if (!Number.isFinite(n) || rate == null) return { rub: null, code, known: false };
  return { rub: Math.max(0, Math.round(n * rate)), code, known: true };
}

module.exports = { toRub, setOverrides, DEFAULT_RATES };
