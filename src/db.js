'use strict';
/**
 * База даних SQLite (вбудований модуль node:sqlite, Node.js ≥ 22.13).
 * Створює схему, вмикає зовнішні ключі та заповнює демо-даними, якщо база порожня.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { hashPassword } = require('./security');
const seed = require('./seed');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  balance       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id          TEXT    PRIMARY KEY,               -- slug: math-nmt
  title       TEXT    NOT NULL,
  subject     TEXT    NOT NULL CHECK (subject IN ('math', 'english', 'ukr', 'prog', 'history')),
  tutor       TEXT    NOT NULL,
  months      INTEGER NOT NULL CHECK (months BETWEEN 1 AND 24),
  per_week    INTEGER NOT NULL CHECK (per_week BETWEEN 1 AND 7),
  format      TEXT    NOT NULL CHECK (format IN ('online', 'offline')),
  level       TEXT    NOT NULL CHECK (level IN ('basic', 'middle', 'advanced')),
  ages        TEXT    NOT NULL,                  -- '14-15,16-17'
  price       INTEGER NOT NULL CHECK (price BETWEEN 100 AND 10000),
  popularity  INTEGER NOT NULL DEFAULT 50,
  description TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS course_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT    NOT NULL UNIQUE,
  course_id  TEXT    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tutor      TEXT    NOT NULL,
  days       TEXT    NOT NULL,                   -- 'Пн,Ср'
  start_time TEXT    NOT NULL,                   -- '18:00'
  minutes    INTEGER NOT NULL CHECK (minutes BETWEEN 30 AND 240),
  start_date TEXT    NOT NULL,                   -- '2026-12-01'
  seats      INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 30),
  taken      INTEGER NOT NULL DEFAULT 0 CHECK (taken >= 0),
  status     TEXT    NOT NULL DEFAULT 'publish' CHECK (status IN ('publish', 'draft')),
  CHECK (taken <= seats)
);

CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('group', 'individual')),
  group_id   INTEGER REFERENCES course_groups(id) ON DELETE SET NULL,
  tutor      TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  slot_at    TEXT    NOT NULL,                   -- ISO 8601: найближче заняття
  minutes    INTEGER NOT NULL,
  price      INTEGER NOT NULL,
  promo      TEXT,
  total      INTEGER NOT NULL,
  method     TEXT    NOT NULL CHECK (method IN ('card', 'apple', 'google')),
  status     TEXT    NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'cancelled')),
  refund     TEXT    CHECK (refund IN ('balance', 'card')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot
  ON bookings(tutor, slot_at) WHERE kind = 'individual' AND status = 'paid';

CREATE TABLE IF NOT EXISTS consultations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  phone      TEXT    NOT NULL,
  subject    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_codes (
  code    TEXT    PRIMARY KEY COLLATE NOCASE,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 50),
  active  INTEGER NOT NULL DEFAULT 1
);
`;

function open(file = config.dbPath, { adminPassword = config.adminPassword } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM courses').get();
  if (count === 0) seed.run(db, { hashPassword, adminPassword });
  return db;
}

/** Виконання кількох запитів як однієї транзакції */
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { open, transaction };
