'use strict';
/** REST API курсів: /api/courses */
const express = require('express');
const { validate } = require('../validate');
const { HttpError, requireAdmin } = require('../security');
const { PROGRAMS } = require('../programs');
const { scheduleText } = require('../schedule');

const COURSE_SCHEMA = {
  id: { type: 'string', pattern: 'slug', required: true, label: 'Ідентифікатор', message: 'Ідентифікатор: латинські малі літери, цифри та дефіс' },
  title: { type: 'string', required: true, minLen: 3, maxLen: 120, label: 'Назва' },
  subject: { type: 'enum', values: ['math', 'english', 'ukr', 'prog', 'history'], required: true, label: 'Предмет' },
  tutor: { type: 'string', pattern: 'name', required: true, label: 'Викладач' },
  months: { type: 'int', min: 1, max: 24, required: true, label: 'Тривалість, міс.' },
  perWeek: { type: 'int', min: 1, max: 7, required: true, label: 'Занять на тиждень' },
  format: { type: 'enum', values: ['online', 'offline'], required: true, label: 'Формат' },
  level: { type: 'enum', values: ['basic', 'middle', 'advanced'], required: true, label: 'Рівень' },
  ages: { type: 'string', maxLen: 40, required: true, label: 'Вік' },
  price: { type: 'int', min: 100, max: 10000, required: true, label: 'Ціна' },
  description: { type: 'string', maxLen: 600, label: 'Опис' },
};

const SORT = { popular: 'c.popularity DESC', 'price-asc': 'c.price ASC', 'price-desc': 'c.price DESC' };
const list = (value) => (value === undefined ? [] : [].concat(value).flatMap((v) => String(v).split(',')).filter(Boolean));

/** Рядок БД → об'єкт API (camelCase, масив віків, кількість вільних місць) */
function toCourse(row) {
  return {
    id: row.id, title: row.title, subject: row.subject, tutor: row.tutor, months: row.months, perWeek: row.per_week,
    format: row.format, level: row.level, ages: row.ages.split(','), price: row.price, popularity: row.popularity,
    description: row.description, places: row.places ?? 0,
  };
}

const PLACES = `(SELECT COALESCE(MAX(g.seats - g.taken), 0) FROM course_groups g WHERE g.course_id = c.id AND g.status = 'publish') AS places`;

module.exports = function coursesRouter(db) {
  const router = express.Router();

  // READ: список з фільтрами — GET /api/courses?subject=math&format=online&q=...&sort=price-asc
  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    const inList = (column, values) => {
      if (!values.length) return;
      where.push(`${column} IN (${values.map(() => '?').join(', ')})`); // лише плейсхолдери — без конкатенації даних
      params.push(...values);
    };
    inList('c.subject', list(req.query.subject));
    inList('c.level', list(req.query.level));
    if (['online', 'offline'].includes(req.query.format)) {
      where.push('c.format = ?');
      params.push(req.query.format);
    }
    const ages = list(req.query.age);
    if (ages.length) {
      where.push(`(${ages.map(() => "(',' || c.ages || ',') LIKE ?").join(' OR ')})`);
      params.push(...ages.map((a) => `%,${a},%`));
    }
    if (req.query.q) {
      where.push('(c.title LIKE ? OR c.tutor LIKE ?)');
      const q = `%${String(req.query.q).slice(0, 60)}%`;
      params.push(q, q);
    }
    if (req.query.min) { where.push('c.price >= ?'); params.push(Number(req.query.min) || 0); }
    if (req.query.max) { where.push('c.price <= ?'); params.push(Number(req.query.max) || 0); }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50); // ціле число 1–50

    const sql = `SELECT c.*, ${PLACES} FROM courses c ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${SORT[req.query.sort] || SORT.popular} LIMIT ${limit}`;
    res.json(db.prepare(sql).all(...params).map(toCourse));
  });

  // READ: один курс з програмою та опублікованими групами — GET /api/courses/:id
  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT c.*, ${PLACES} FROM courses c WHERE c.id = ?`).get(req.params.id);
    if (!row) throw new HttpError(404, 'Курс не знайдено');
    const groups = db.prepare(`SELECT * FROM course_groups WHERE course_id = ? AND status = 'publish' ORDER BY start_date, code`).all(row.id)
      .map((g) => ({ id: g.id, code: g.code, startDate: g.start_date, schedule: scheduleText(g), left: g.seats - g.taken, seats: g.seats }));
    res.json({ ...toCourse(row), program: PROGRAMS[row.subject] || [], groups });
  });

  // CREATE — POST /api/courses (адміністратор)
  router.post('/', requireAdmin, (req, res) => {
    const c = validate(req.body, COURSE_SCHEMA);
    if (db.prepare('SELECT 1 FROM courses WHERE id = ?').get(c.id)) throw new HttpError(409, 'Курс з таким ідентифікатором уже існує', { id: 'Ідентифікатор зайнятий' });
    db.prepare(`INSERT INTO courses (id, title, subject, tutor, months, per_week, format, level, ages, price, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.id, c.title, c.subject, c.tutor, c.months, c.perWeek, c.format, c.level, c.ages, c.price, c.description || '');
    res.status(201).json(toCourse(db.prepare(`SELECT c.*, ${PLACES} FROM courses c WHERE c.id = ?`).get(c.id)));
  });

  // UPDATE — PUT /api/courses/:id (адміністратор; можна передати лише змінені поля)
  router.put('/:id', requireAdmin, (req, res) => {
    const current = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!current) throw new HttpError(404, 'Курс не знайдено');
    const { id, ...schema } = COURSE_SCHEMA;
    const c = validate(req.body, schema, { partial: true });
    const columns = { title: 'title', subject: 'subject', tutor: 'tutor', months: 'months', perWeek: 'per_week', format: 'format', level: 'level', ages: 'ages', price: 'price', description: 'description' };
    const fields = Object.keys(c);
    if (!fields.length) throw new HttpError(400, 'Немає полів для оновлення');
    db.prepare(`UPDATE courses SET ${fields.map((f) => `${columns[f]} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((f) => c[f]), current.id);
    res.json(toCourse(db.prepare(`SELECT c.*, ${PLACES} FROM courses c WHERE c.id = ?`).get(current.id)));
  });

  // DELETE — DELETE /api/courses/:id (адміністратор; заборонено, якщо є записані учні)
  router.delete('/:id', requireAdmin, (req, res) => {
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(req.params.id);
    if (!course) throw new HttpError(404, 'Курс не знайдено');
    const { taken } = db.prepare('SELECT COALESCE(SUM(taken), 0) AS taken FROM course_groups WHERE course_id = ?').get(course.id);
    if (taken > 0) throw new HttpError(409, `Курс не можна видалити: у групах записано учнів (${taken})`);
    db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
    res.status(204).end();
  });

  return router;
};
