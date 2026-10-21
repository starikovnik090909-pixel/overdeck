'use strict';
// Лента событий для виджета «События»: последние фолловы, подписки, подарки, рейды, донаты, награды за баллы.
// Хранится в памяти (на оверлее нужны только свежие события). Фейк-режим создаёт свою ленту — с настоящей не смешивается.

const TYPES = ['follow', 'sub', 'giftsub', 'raid', 'donation', 'channelpoints'];
const MAX = 40;

function createFeed() {
  let list = [];
  let seq = 0;
  return {
    add(evt, ts) {
      if (!evt || !TYPES.includes(evt.type)) return null;
      const meta = evt.meta || {};
      const item = {
        id: ++seq,
        type: evt.type,
        username: evt.username || '',
        ts: ts || Date.now(),
        amount: evt.type === 'donation' ? Number(meta.amountRub != null ? meta.amountRub : meta.amount) || 0 : undefined,
        currency: evt.type === 'donation' ? (meta.currency || 'RUB') : undefined,
        count: evt.type === 'giftsub' ? Number(meta.total) || 1 : evt.type === 'raid' ? Number(meta.viewers) || 0 : undefined,
        tier: evt.type === 'sub' || evt.type === 'giftsub' ? (meta.tier || null) : undefined,
        text: evt.type === 'channelpoints' ? String(meta.reward || '') : evt.type === 'donation' ? String(meta.message || '') : undefined,
      };
      list.push(item);
      if (list.length > MAX) list = list.slice(-MAX);
      return item;
    },
    /** Новые сверху. */
    getList(n) { return list.slice(-(n || 12)).reverse(); },
    reset() { list = []; },
  };
}

module.exports = { createFeed, TYPES };
