'use strict';
/** Точка входу сервера: npm start */
process.env.TZ = process.env.TZ || 'Europe/Kyiv'; // розклад занять ведеться за київським часом

const config = require('./src/config');
const { open } = require('./src/db');
const { createApp } = require('./src/app');

const db = open(config.dbPath, { adminPassword: config.adminPassword });
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`ЗнанняПлюс працює: http://localhost:${config.port} (${config.isProduction ? 'production' : 'development'})`);
});

// Коректне завершення: закриваємо з'єднання й базу даних
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
