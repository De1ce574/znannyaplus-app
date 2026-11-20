'use strict';
/**
 * Безпека: хешування паролів, підписані сесійні cookie, заголовки безпеки,
 * захист від CSRF, обмеження частоти запитів, перевірка ролей.
 */
const crypto = require('node:crypto');

/* ---------------- Паролі: scrypt + випадкова сіль ---------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual); // порівняння за сталий час
}

/* ---------------- Сесія: токен = base64url(дані) + "." + HMAC-SHA256 ---------------- */
const COOKIE = 'zp_session';

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function createToken(userId, secret, ttlMs) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function readToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=')).filter(([k, v]) => k && v)
    .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function sessionCookie(token, { maxAgeMs, secure }) {
  return [
    `${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`, secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

/* ---------------- Помилки HTTP ---------------- */
class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/** Обгортка для async-обробників: передає помилку в обробник помилок Express */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- Middleware ---------------- */

/** Заголовки безпеки (аналог helmet): CSP, заборона фреймів, MIME-sniffing тощо */
function securityHeaders(isProduction) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/**
 * Захист від CSRF: змінювальні запити до API мають містити заголовок X-Requested-With.
 * Сторонній сайт не може надіслати такий заголовок без дозволу CORS, а форма — не може зовсім.
 */
function csrfGuard(req, res, next) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (mutating && req.headers['x-requested-with'] !== 'ZP') {
    return next(new HttpError(403, 'Запит відхилено: відсутній заголовок X-Requested-With'));
  }
  return next();
}

/** Просте обмеження частоти запитів (у пам'яті) за IP-адресою */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return next(new HttpError(429, message));
    }
    return next();
  };
}

/** Зчитує користувача із сесійної cookie та додає його до req.user */
function loadUser(db, secret) {
  const byId = db.prepare('SELECT id, name, email, role, balance FROM users WHERE id = ?');
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const data = readToken(token, secret);
    req.user = data ? byId.get(data.uid) || null : null;
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Потрібно увійти в обліковий запис'));
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Потрібно увійти в обліковий запис'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Недостатньо прав: потрібна роль адміністратора'));
  return next();
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, createToken, readToken, parseCookies, sessionCookie,
  HttpError, asyncHandler, securityHeaders, csrfGuard, rateLimit, loadUser, requireAuth, requireAdmin,
};
