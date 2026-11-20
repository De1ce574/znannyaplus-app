'use strict';
/**
 * Конфігурація зі змінних середовища.
 * Секрети (SESSION_SECRET, ADMIN_PASSWORD) не зберігаються в коді та репозиторії.
 */
const crypto = require('node:crypto');

const isProduction = process.env.NODE_ENV === 'production';

function secret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Змінна середовища ${name} обов'язкова в режимі production`);
  }
  console.warn(`[config] ${name} не задано — використовується тимчасове значення для розробки`);
  return devFallback;
}

module.exports = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || 'data/znannyaplus.db',
  // у розробці без .env секрет генерується при кожному запуску (сесії скидаються після перезапуску)
  sessionSecret: secret('SESSION_SECRET', crypto.randomBytes(32).toString('hex')),
  adminPassword: secret('ADMIN_PASSWORD', 'Admin2026-dev'),
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
};
