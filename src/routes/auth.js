'use strict';
/** Автентифікація: /api/auth (реєстрація, вхід, вихід, поточний користувач) */
const express = require('express');
const { validate } = require('../validate');
const {
  HttpError, hashPassword, verifyPassword, createToken, sessionCookie, rateLimit, requireAuth,
} = require('../security');

const REGISTER = {
  name: { type: 'string', pattern: 'name', required: true, label: "Ім'я", message: "Ім'я: лише літери, 2–60 символів" },
  email: { type: 'email', required: true, label: 'E-mail' },
  password: { type: 'string', minLen: 8, maxLen: 128, required: true, label: 'Пароль' },
};
const LOGIN = {
  email: { type: 'email', required: true, label: 'E-mail' },
  password: { type: 'string', maxLen: 128, required: true, label: 'Пароль' },
};

module.exports = function authRouter(db, config) {
  const router = express.Router();
  // Захист від підбору пароля: не більше 10 спроб входу за 15 хвилин з однієї IP-адреси
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Забагато спроб входу. Спробуйте через 15 хвилин.' });

  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, balance: u.balance });

  function startSession(res, userId) {
    const token = createToken(userId, config.sessionSecret, config.sessionTtlMs);
    res.setHeader('Set-Cookie', sessionCookie(token, { maxAgeMs: config.sessionTtlMs, secure: config.isProduction }));
  }

  router.post('/register', loginLimiter, (req, res) => {
    const v = validate(req.body, REGISTER);
    if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(v.password) || !/\d/.test(v.password)) {
      throw new HttpError(422, 'Дані не пройшли перевірку', { password: 'Пароль має містити щонайменше одну літеру та одну цифру' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(v.email)) {
      throw new HttpError(409, 'Користувач із таким e-mail уже існує', { email: 'Цей e-mail уже зареєстровано' });
    }
    const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(v.name, v.email, hashPassword(v.password));
    startSession(res, info.lastInsertRowid);
    res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
  });

  router.post('/login', loginLimiter, (req, res) => {
    const v = validate(req.body, LOGIN);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(v.email);
    // однакове повідомлення для неіснуючого e-mail і хибного пароля — не розкриваємо, які адреси зареєстровано
    if (!user || !verifyPassword(v.password, user.password_hash)) throw new HttpError(401, 'Неправильний e-mail або пароль');
    startSession(res, user.id);
    res.json(publicUser(user));
  });

  router.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', sessionCookie('', { maxAgeMs: 0, secure: config.isProduction }));
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => res.json(req.user));
  // Стан сесії для інтерфейсу: гостю — 200 { user: null } (без помилки 401 у консолі браузера)
  router.get('/session', (req, res) => res.json({ user: req.user || null }));

  return router;
};
