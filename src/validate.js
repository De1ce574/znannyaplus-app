'use strict';
/**
 * Серверна перевірка вхідних даних. Клієнтській валідації довіряти не можна:
 * кожен запит до API перевіряється повторно за схемою.
 */
const { HttpError } = require('./security');

const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^\+380\d{9}$/,
  name: /^[A-Za-zА-ЩЬЮЯҐЄІЇа-щьюяґєії'’\- ]{2,60}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  slug: /^[a-z0-9-]{2,40}$/,
};
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/**
 * @param {object} input тіло запиту
 * @param {object} schema { поле: { type, required, label, min, max, maxLen, values } }
 * @param {{partial?: boolean}} options partial — для PATCH/PUT: перевіряти лише передані поля
 * @returns {object} очищені значення
 */
function validate(input, schema, { partial = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const values = {};
  const errors = {};

  for (const [field, rule] of Object.entries(schema)) {
    let value = body[field];
    const label = rule.label || field;
    const missing = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
    if (missing) {
      if (rule.required && !partial) errors[field] = `Поле «${label}» обов'язкове`;
      continue;
    }
    if (typeof value === 'string') value = value.trim();

    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') errors[field] = `Поле «${label}» має бути текстом`;
        else if (rule.maxLen && value.length > rule.maxLen) errors[field] = `Поле «${label}»: не більше ${rule.maxLen} символів`;
        else if (rule.minLen && value.length < rule.minLen) errors[field] = `Поле «${label}»: мінімум ${rule.minLen} символів`;
        else if (rule.pattern && !PATTERNS[rule.pattern].test(value)) errors[field] = rule.message || `Поле «${label}» має неправильний формат`;
        break;
      case 'phone':
        value = String(value).replace(/[\s()-]/g, '');
        if (!PATTERNS.phone.test(value)) errors[field] = 'Телефон має бути у форматі +380XXXXXXXXX';
        break;
      case 'email':
        value = String(value).toLowerCase();
        if (value.length > 120 || !PATTERNS.email.test(value)) errors[field] = 'Неправильний формат e-mail';
        break;
      case 'int':
        value = Number(value);
        if (!Number.isInteger(value)) errors[field] = `Поле «${label}» має бути цілим числом`;
        else if (rule.min !== undefined && value < rule.min) errors[field] = `Поле «${label}»: не менше ${rule.min}`;
        else if (rule.max !== undefined && value > rule.max) errors[field] = `Поле «${label}»: не більше ${rule.max}`;
        break;
      case 'enum':
        if (!rule.values.includes(value)) errors[field] = `Поле «${label}»: допустимі значення — ${rule.values.join(', ')}`;
        break;
      case 'date':
        if (!PATTERNS.date.test(value) || Number.isNaN(Date.parse(value))) errors[field] = `Поле «${label}»: формат РРРР-ММ-ДД`;
        else if (rule.future && new Date(`${value}T23:59:59`) < new Date()) errors[field] = 'Дата не може бути в минулому';
        break;
      case 'time':
        if (!PATTERNS.time.test(value)) errors[field] = `Поле «${label}»: формат ГГ:ХХ`;
        else if (rule.from && (value < rule.from || value > rule.to)) errors[field] = `Час має бути в межах ${rule.from}–${rule.to}`;
        break;
      case 'days': {
        const list = Array.isArray(value) ? value : String(value).split(',');
        if (!list.length || list.some((d) => !DAYS.includes(d))) errors[field] = 'Оберіть дні тижня з переліку Пн–Сб';
        else value = DAYS.filter((d) => list.includes(d)).join(',');
        break;
      }
      case 'datetime':
        if (Number.isNaN(Date.parse(value))) errors[field] = `Поле «${label}»: некоректна дата й час`;
        else value = new Date(value).toISOString();
        break;
      default:
        throw new Error(`Невідомий тип правила: ${rule.type}`);
    }
    if (!errors[field]) values[field] = value;
  }

  if (Object.keys(errors).length) throw new HttpError(422, 'Дані не пройшли перевірку', errors);
  return values;
}

/** Ідентифікатор з адреси (:id) — додатне ціле число */
function idParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Некоректний ідентифікатор');
  return id;
}

module.exports = { validate, idParam, PATTERNS, DAYS };
