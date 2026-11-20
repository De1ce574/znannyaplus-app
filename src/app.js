'use strict';
/**
 * Express-застосунок: middleware безпеки, REST API та статичні файли клієнта.
 * Створюється функцією, щоб тести могли запускати його з окремою базою даних.
 */
const path = require('node:path');
const express = require('express');
const {
  HttpError, securityHeaders, csrfGuard, loadUser,
} = require('./security');

function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by'); // не розкриваємо технологію сервера
  if (config.isProduction) app.set('trust proxy', 1); // за проксі хостингу (req.ip, HTTPS)

  app.use(securityHeaders(config.isProduction));
  app.use(express.json({ limit: '10kb' })); // обмеження розміру тіла запиту

  // ---- REST API ----
  const api = express.Router();
  api.use(csrfGuard);
  api.use(loadUser(db, config.sessionSecret));
  api.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  api.use('/auth', require('./routes/auth')(db, config));
  api.use('/courses', require('./routes/courses')(db));
  api.use('/groups', require('./routes/groups')(db));
  api.use('/consultations', require('./routes/consultations')(db));
  api.use('/', require('./routes/bookings')(db)); // /bookings, /promo/:code, /slots
  api.use((req, res, next) => next(new HttpError(404, `Маршрут ${req.method} ${req.originalUrl} не знайдено`)));
  app.use('/api', api);

  // ---- Клієнтська частина (HTML, CSS, JS з ЛР № 3–4) ----
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    extensions: ['html'],
    maxAge: config.isProduction ? '1h' : 0,
  }));
  app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));

  // ---- Єдиний обробник помилок ----
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    let status = error.status || error.statusCode || 500;
    let message = error.message;
    if (error.type === 'entity.parse.failed') { status = 400; message = 'Некоректний JSON у тілі запиту'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'Завеликий запит'; }
    if (status >= 500) {
      console.error(error); // деталі — лише в журнал сервера
      message = 'Внутрішня помилка сервера'; // клієнту не показуємо стек і SQL
    }
    res.status(status).json({ error: message, ...(error.fields ? { fields: error.fields } : {}) });
  });

  return app;
}

module.exports = { createApp };
