'use strict';
/** REST API заявок на консультацію: /api/consultations */
const express = require('express');
const { validate, idParam } = require('../validate');
const { HttpError, requireAdmin, rateLimit } = require('../security');

const CREATE = {
  name: { type: 'string', pattern: 'name', required: true, label: "Ім'я", message: "Ім'я: лише літери, 2–60 символів" },
  phone: { type: 'phone', required: true, label: 'Телефон' },
  subject: { type: 'string', maxLen: 60, required: true, label: 'Предмет' },
};

const toItem = (r) => ({ id: r.id, name: r.name, phone: r.phone, subject: r.subject, status: r.status, createdAt: r.created_at });

module.exports = function consultationsRouter(db) {
  const router = express.Router();
  // Захист від спаму: не більше 5 заявок за 10 хвилин з однієї IP-адреси
  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Забагато заявок. Спробуйте трохи пізніше.' });

  // CREATE (публічно) — POST /api/consultations
  router.post('/', limiter, (req, res) => {
    const v = validate(req.body, CREATE);
    const info = db.prepare('INSERT INTO consultations (name, phone, subject) VALUES (?, ?, ?)').run(v.name, v.phone, v.subject);
    res.status(201).json(toItem(db.prepare('SELECT * FROM consultations WHERE id = ?').get(info.lastInsertRowid)));
  });

  // READ (адміністратор) — GET /api/consultations?status=new
  router.get('/', requireAdmin, (req, res) => {
    const status = ['new', 'done'].includes(req.query.status) ? req.query.status : null;
    const rows = status
      ? db.prepare('SELECT * FROM consultations WHERE status = ? ORDER BY created_at DESC').all(status)
      : db.prepare('SELECT * FROM consultations ORDER BY created_at DESC').all();
    res.json(rows.map(toItem));
  });

  // UPDATE (адміністратор) — PATCH /api/consultations/:id { status: 'done' }
  router.patch('/:id', requireAdmin, (req, res) => {
    const v = validate(req.body, { status: { type: 'enum', values: ['new', 'done'], required: true, label: 'Статус' } });
    const id = idParam(req.params.id);
    const { changes } = db.prepare('UPDATE consultations SET status = ? WHERE id = ?').run(v.status, id);
    if (!changes) throw new HttpError(404, 'Заявку не знайдено');
    res.json(toItem(db.prepare('SELECT * FROM consultations WHERE id = ?').get(id)));
  });

  // DELETE (адміністратор) — DELETE /api/consultations/:id
  router.delete('/:id', requireAdmin, (req, res) => {
    const { changes } = db.prepare('DELETE FROM consultations WHERE id = ?').run(idParam(req.params.id));
    if (!changes) throw new HttpError(404, 'Заявку не знайдено');
    res.status(204).end();
  });

  return router;
};
