'use strict';
// overdeckApp.js — общее приложение Overdeck на dev.twitch.tv (тип Public).
// С ним стримеру не нужно создавать своё приложение и вставлять Client ID/Secret:
// вход по коду (Device Code Flow) — Overdeck показывает код, стример вводит его на twitch.tv/activate.
// Client ID публичного приложения — не секрет, его можно хранить в коде.
// Свои ключи (вкладка «Подключения» → «Расширенный режим») по-прежнему работают и имеют приоритет.

const TWITCH_PUBLIC_CLIENT_ID = '';

function twitchClientId() {
  return String(process.env.OVERDECK_TWITCH_CLIENT_ID || TWITCH_PUBLIC_CLIENT_ID || '').trim();
}

module.exports = { twitchClientId };
