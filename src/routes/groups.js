'use strict';
/** REST API груп курсів: /api/groups */
const express = require('express');
const { validate, idParam } = require('../validate');
const { HttpError, requireAdmin } = require('../security');
const { toMin, groupsOverlap, scheduleText } = require('../schedule');

const GROUP_SCHEMA = {
  courseId: { type: 'string', pattern: 'slug', required: true, label: 'Курс' },
  tutor: { type: 'string', pattern: 'name', required: true, label: 'Викладач' },
  days: { type: 'days', required: true, label: 'Дні занять' },
  startTime: { type: 'time', from: '08:00', to: '20:00', required: true, label: 'Час початку' },
  minutes: { type: 'int', min: 30, max: 240, required: true, label: 'Тривалість' },
  startDate: { type: 'date', future: true, required: true, label: 'Дата старту' },
  seats: { type: 'int', min: 1, max: 30, required: true, label: 'Максимум місць' },
  status: { type: 'enum', values: ['publish', 'draft'], label: 'Статус' },
};

function toGroup(row) {
  return {
    id: row.id, code: row.code, courseId: row.course_id, courseTitle: row.course_title, tutor: row.tutor,
    days: row.days.split(','), startTime: row.start_time, minutes: row.minutes, startDate: row.start_date,
    seats: row.seats, taken: row.taken, left: row.seats - row.taken, status: row.status, schedule: scheduleText(row), price: row.price,
  };
}

module.exports = function groupsRouter(db) {
  const router = express.Router();
  const SELECT = 'SELECT g.*, c.title AS course_title, c.price FROM course_groups g JOIN courses c ON c.id = g.course_id';
  const byId = db.prepare(`${SELECT} WHERE g.id = ?`);

  /** Перевірка розкладу: завершення до 21:00 і відсутність перетину з іншими групами викладача */
  function checkSchedule(group, excludeId = 0) {
    if (toMin(group.start_time) + group.minutes > toMin('21:00')) {
      throw new HttpError(422, 'Дані не пройшли перевірку', { startTime: 'Заняття має завершитися не пізніше 21:00' });
    }
    const others = db.prepare('SELECT * FROM course_groups WHERE tutor = ? AND id != ?').all(group.tutor, excludeId);
    const conflict = others.find((other) => groupsOverlap(group, other));
    if (conflict) {
      throw new HttpError(409, 'Розклад перетинається з іншою групою викладача', {
        startTime: `Перетин із групою ${conflict.code} цього викладача (${scheduleText(conflict)})`,
      });
    }
  }

  // READ: GET /api/groups?course=math-nmt  (адміністратор з ?all=1 бачить і чернетки)
  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    if (req.query.course) { where.push('g.course_id = ?'); params.push(String(req.query.course)); }
    const admin = req.user && req.user.role === 'admin' && req.query.all === '1';
    if (!admin) where.push("g.status = 'publish'");
    const rows = db.prepare(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY g.id DESC`).all(...params);
    res.json(rows.map(toGroup));
  });

  router.get('/:id', (req, res) => {
    const row = byId.get(idParam(req.params.id));
    if (!row || (row.status === 'draft' && req.user?.role !== 'admin')) throw new HttpError(404, 'Групу не знайдено');
    res.json(toGroup(row));
  });

  // CREATE — POST /api/groups (адміністратор)
  router.post('/', requireAdmin, (req, res) => {
    const v = validate(req.body, GROUP_SCHEMA);
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(v.courseId);
    if (!course) throw new HttpError(422, 'Дані не пройшли перевірку', { courseId: 'Такого курсу не існує' });
    const group = { tutor: v.tutor, days: v.days, start_time: v.startTime, minutes: v.minutes };
    checkSchedule(group);

    // Код групи: префікс наявних груп курсу (М-1 → М) + наступний вільний номер
    const sample = db.prepare('SELECT code FROM course_groups WHERE course_id = ? LIMIT 1').get(course.id);
    const prefix = sample ? sample.code.split('-')[0] : v.courseId.slice(0, 1).toUpperCase();
    let n = 1;
    while (db.prepare('SELECT 1 FROM course_groups WHERE code = ?').get(`${prefix}-${n}`)) n += 1;

    const info = db.prepare(`INSERT INTO course_groups (code, course_id, tutor, days, start_time, minutes, start_date, seats, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`${prefix}-${n}`, course.id, v.tutor, v.days, v.startTime, v.minutes, v.startDate, v.seats, v.status || 'publish');
    res.status(201).json(toGroup(byId.get(info.lastInsertRowid)));
  });

  // UPDATE — PATCH /api/groups/:id (адміністратор): статус, кількість місць, розклад
  router.patch('/:id', requireAdmin, (req, res) => {
    const current = byId.get(idParam(req.params.id));
    if (!current) throw new HttpError(404, 'Групу не знайдено');
    const { courseId, ...schema } = GROUP_SCHEMA;
    const v = validate(req.body, schema, { partial: true });
    if (v.seats !== undefined && v.seats < current.taken) {
      throw new HttpError(422, 'Дані не пройшли перевірку', { seats: `Не менше кількості записаних учнів (${current.taken})` });
    }
    const next = {
      tutor: v.tutor ?? current.tutor, days: v.days ?? current.days, start_time: v.startTime ?? current.start_time,
      minutes: v.minutes ?? current.minutes, start_date: v.startDate ?? current.start_date,
      seats: v.seats ?? current.seats, status: v.status ?? current.status,
    };
    if (v.tutor || v.days || v.startTime || v.minutes) checkSchedule(next, current.id);
    db.prepare(`UPDATE course_groups SET tutor = ?, days = ?, start_time = ?, minutes = ?, start_date = ?, seats = ?, status = ? WHERE id = ?`)
      .run(next.tutor, next.days, next.start_time, next.minutes, next.start_date, next.seats, next.status, current.id);
    res.json(toGroup(byId.get(current.id)));
  });

  // DELETE — DELETE /api/groups/:id (адміністратор; лише групи без учнів)
  router.delete('/:id', requireAdmin, (req, res) => {
    const current = byId.get(idParam(req.params.id));
    if (!current) throw new HttpError(404, 'Групу не знайдено');
    if (current.taken > 0) throw new HttpError(409, `Групу ${current.code} не можна видалити: записано учнів — ${current.taken}`);
    db.prepare('DELETE FROM course_groups WHERE id = ?').run(current.id);
    res.status(204).end();
  });

  return router;
};
