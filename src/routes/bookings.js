'use strict';
/** REST API записів (бронювань) користувача: /api/bookings, а також /api/promo і /api/slots */
const express = require('express');
const { validate, idParam } = require('../validate');
const { HttpError, requireAuth } = require('../security');
const { transaction } = require('../db');
const { nextGroupLesson, scheduleText } = require('../schedule');

const HOUR = 3600e3;
const LOCK_HOURS = 12;
const INDIVIDUAL_PRICE = 450;
const INDIVIDUAL_TIMES = ['10:00', '12:00', '14:00', '16:00', '18:00'];

const CREATE = {
  kind: { type: 'enum', values: ['group', 'individual'], required: true, label: 'Тип запису' },
  groupId: { type: 'int', min: 1, label: 'Група' },
  slotAt: { type: 'datetime', label: 'Дата й час' },
  promo: { type: 'string', maxLen: 20, label: 'Промокод' },
  method: { type: 'enum', values: ['card', 'apple', 'google'], required: true, label: 'Спосіб оплати' },
};

function toBooking(row) {
  return {
    id: row.id, kind: row.kind, groupId: row.group_id, tutor: row.tutor, title: row.title, slotAt: row.slot_at,
    minutes: row.minutes, price: row.price, promo: row.promo, total: row.total, method: row.method,
    status: row.status, refund: row.refund, createdAt: row.created_at,
    // правило 12 годин обчислює сервер — клієнт лише відображає
    canCancel: row.status === 'paid' && new Date(row.slot_at) - Date.now() >= LOCK_HOURS * HOUR,
  };
}

module.exports = function bookingsRouter(db) {
  const router = express.Router();
  const promoByCode = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND active = 1');

  /** Перевірка промокоду: GET /api/promo/:code → { code, percent } */
  router.get('/promo/:code', (req, res) => {
    const promo = promoByCode.get(String(req.params.code).slice(0, 20));
    if (!promo) throw new HttpError(404, `Промокод «${String(req.params.code).toUpperCase().slice(0, 20)}» не знайдено або термін його дії минув`);
    res.json({ code: promo.code, percent: promo.percent });
  });

  /** Зайняті індивідуальні слоти репетитора: GET /api/slots?tutor=... */
  router.get('/slots', (req, res) => {
    const rows = db.prepare(`SELECT slot_at FROM bookings WHERE kind = 'individual' AND status = 'paid' AND tutor = ? AND slot_at >= ?`)
      .all(String(req.query.tutor || 'Олена Коваль'), new Date().toISOString());
    res.json(rows.map((r) => r.slot_at));
  });

  // READ: мої записи — GET /api/bookings
  router.get('/bookings', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY slot_at').all(req.user.id);
    res.json(rows.map(toBooking));
  });

  // READ: один запис — GET /api/bookings/:id (лише власний)
  router.get('/bookings/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(idParam(req.params.id), req.user.id);
    if (!row) throw new HttpError(404, 'Запис не знайдено');
    res.json(toBooking(row));
  });

  // CREATE: оплата й запис — POST /api/bookings. Ціну рахує сервер, а не клієнт.
  router.post('/bookings', requireAuth, (req, res) => {
    const v = validate(req.body, CREATE);
    let promo = null;
    if (v.promo) {
      promo = promoByCode.get(v.promo);
      if (!promo) throw new HttpError(422, 'Дані не пройшли перевірку', { promo: 'Промокод не знайдено або термін його дії минув' });
    }

    const created = transaction(db, () => {
      let data;
      if (v.kind === 'group') {
        if (!v.groupId) throw new HttpError(422, 'Дані не пройшли перевірку', { groupId: 'Оберіть групу' });
        const group = db.prepare(`SELECT g.*, c.title AS course_title, c.price FROM course_groups g JOIN courses c ON c.id = g.course_id
          WHERE g.id = ? AND g.status = 'publish'`).get(v.groupId);
        if (!group) throw new HttpError(404, 'Групу не знайдено');
        if (group.taken >= group.seats) throw new HttpError(409, `У групі ${group.code} не залишилося вільних місць`);
        if (db.prepare("SELECT 1 FROM bookings WHERE user_id = ? AND group_id = ? AND status = 'paid'").get(req.user.id, group.id)) {
          throw new HttpError(409, `Ви вже записані до групи ${group.code}`);
        }
        db.prepare('UPDATE course_groups SET taken = taken + 1 WHERE id = ?').run(group.id);
        data = {
          groupId: group.id, tutor: group.tutor, title: `${group.course_title} · група ${group.code} (${scheduleText(group)})`,
          slotAt: nextGroupLesson(group).toISOString(), minutes: group.minutes, price: group.price,
        };
      } else {
        if (!v.slotAt) throw new HttpError(422, 'Дані не пройшли перевірку', { slotAt: 'Оберіть дату й час заняття' });
        const slot = new Date(v.slotAt);
        const time = `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`;
        if (slot - Date.now() < HOUR) throw new HttpError(422, 'Дані не пройшли перевірку', { slotAt: 'Слот має бути щонайменше через 1 годину' });
        if (slot - Date.now() > 15 * 24 * HOUR) throw new HttpError(422, 'Дані не пройшли перевірку', { slotAt: 'Запис доступний лише на 14 днів уперед' });
        if (!INDIVIDUAL_TIMES.includes(time) || slot.getDay() === 0) throw new HttpError(422, 'Дані не пройшли перевірку', { slotAt: 'Такого слоту немає в розкладі' });
        if (db.prepare("SELECT 1 FROM bookings WHERE kind = 'individual' AND status = 'paid' AND tutor = ? AND slot_at = ?").get('Олена Коваль', v.slotAt)) {
          throw new HttpError(409, 'Цей слот щойно зайняли. Оберіть інший час.');
        }
        data = { groupId: null, tutor: 'Олена Коваль', title: 'Математика · індивідуальне заняття', slotAt: v.slotAt, minutes: 60, price: INDIVIDUAL_PRICE };
      }
      const total = Math.round(data.price * (1 - (promo ? promo.percent : 0) / 100));
      const info = db.prepare(`INSERT INTO bookings (user_id, kind, group_id, tutor, title, slot_at, minutes, price, promo, total, method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, v.kind, data.groupId, data.tutor, data.title, data.slotAt, data.minutes, data.price, promo ? promo.code : null, total, v.method);
      return db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);
    });
    res.status(201).json(toBooking(created));
  });

  // UPDATE: скасування — PATCH /api/bookings/:id { status: 'cancelled', refund: 'balance' | 'card' }
  router.patch('/bookings/:id', requireAuth, (req, res) => {
    const v = validate(req.body, {
      status: { type: 'enum', values: ['cancelled'], required: true, label: 'Статус' },
      refund: { type: 'enum', values: ['balance', 'card'], required: true, label: 'Спосіб повернення' },
    });
    const updated = transaction(db, () => {
      const row = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(idParam(req.params.id), req.user.id);
      if (!row) throw new HttpError(404, 'Запис не знайдено');
      if (row.status === 'cancelled') throw new HttpError(409, 'Запис уже скасовано');
      if (new Date(row.slot_at) - Date.now() < LOCK_HOURS * HOUR) {
        throw new HttpError(409, `Скасувати можна не пізніше ніж за ${LOCK_HOURS} год до початку заняття`);
      }
      db.prepare("UPDATE bookings SET status = 'cancelled', refund = ? WHERE id = ?").run(v.refund, row.id);
      if (row.group_id) db.prepare('UPDATE course_groups SET taken = MAX(taken - 1, 0) WHERE id = ?').run(row.group_id);
      if (v.refund === 'balance') db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(row.total, req.user.id);
      return db.prepare('SELECT * FROM bookings WHERE id = ?').get(row.id);
    });
    res.json(toBooking(updated));
  });

  // DELETE: видалення з історії — DELETE /api/bookings/:id (лише скасовані або минулі)
  router.delete('/bookings/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(idParam(req.params.id), req.user.id);
    if (!row) throw new HttpError(404, 'Запис не знайдено');
    if (row.status === 'paid' && new Date(row.slot_at) > Date.now()) {
      throw new HttpError(409, 'Активний майбутній запис не можна видалити — спочатку скасуйте його');
    }
    db.prepare('DELETE FROM bookings WHERE id = ?').run(row.id);
    res.status(204).end();
  });

  return router;
};
