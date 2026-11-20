'use strict';
/**
 * Початкові (демо) дані. Дати бронювань рахуються від моменту запуску,
 * тож правило «скасування не пізніше ніж за 12 год» можна перевірити будь-коли.
 */
const { nextGroupLesson } = require('./schedule');

const COURSES = [
  ['math-nmt', 'Підготовка до НМТ з математики', 'math', 'Олена Коваль', 8, 2, 'online', 'middle', '16-17', 1800, 98, 'Системний курс для учнів 10–11 класів: повторення шкільної програми, розбір типових завдань НМТ і щомісячні пробні тести з аналізом помилок.'],
  ['english-b1', 'Англійська B1–B2 для підлітків', 'english', 'Андрій Мельник', 6, 2, 'online', 'middle', '14-15,16-17', 1600, 90, 'Граматика, лексика та розмовна практика рівня B1–B2. Підготовка до НМТ з англійської та міжнародних іспитів.'],
  ['python', 'Python для школярів 12–15 років', 'prog', 'Ігор Савчук', 9, 1, 'offline', 'basic', '14-15', 1400, 85, 'Основи програмування на Python через ігри та міні-проєкти. Наприкінці курсу — власний проєкт.'],
  ['ukr-nmt', 'НМТ: українська мова та література', 'ukr', 'Наталія Бойко', 8, 2, 'online', 'middle', '16-17', 1700, 95, 'Правопис, граматика, аналіз художніх творів і тренування тестових завдань НМТ.'],
  ['algebra-10', 'Алгебра 10 клас: поглиблено', 'math', 'Олена Коваль', 4, 1, 'online', 'advanced', '14-15,16-17', 1200, 70, 'Поглиблене вивчення алгебри: тригонометрія, показникові та логарифмічні функції, олімпіадні задачі.'],
  ['english-adult', 'Англійська для дорослих (вечірня)', 'english', 'Ірина Ткач', 6, 2, 'online', 'basic', '18+', 1500, 80, 'Вечірні онлайн-заняття для дорослих: розмовна англійська для роботи, подорожей і співбесід.'],
  ['history-nmt', 'НМТ: історія України', 'history', 'Софія Литвин', 8, 2, 'offline', 'middle', '16-17', 1500, 60, 'Хронологія, персоналії, робота з джерелами та картами. Щомісячні пробні тести.'],
  ['math-9', 'Математика 9 клас: база для ліцею', 'math', 'Максим Гнатюк', 5, 2, 'offline', 'basic', '14-15', 1300, 55, 'Повторення програми 5–9 класів і підготовка до вступу до профільного ліцею.'],
  ['web', 'Веброзробка: HTML, CSS, JavaScript', 'prog', 'Ігор Савчук', 6, 1, 'online', 'middle', '16-17,18+', 1900, 88, 'Від першої сторінки до власного адаптивного сайту з інтерактивністю на JavaScript.'],
  ['speaking', 'Розмовна англійська (Speaking Club)', 'english', 'Ірина Ткач', 3, 1, 'offline', 'advanced', '16-17,18+', 900, 65, 'Дискусії, дебати та рольові ігри англійською в малих групах до 8 осіб.'],
];

// [код, курс, дні, початок, хв, дата старту, місць, зайнято, статус]
const GROUPS = [
  ['М-1', 'math-nmt', 'Пн,Ср', '18:00', 90, '2026-12-01', 10, 4, 'publish'],
  ['М-2', 'math-nmt', 'Вт,Чт', '19:00', 90, '2026-12-08', 10, 8, 'publish'],
  ['М-3', 'math-nmt', 'Сб', '10:00', 180, '2026-12-13', 10, 10, 'publish'],
  ['А-1', 'english-b1', 'Пн,Пт', '17:00', 90, '2026-12-01', 10, 8, 'publish'],
  ['А-2', 'english-b1', 'Вт,Чт', '17:00', 90, '2026-12-09', 10, 10, 'publish'],
  ['П-1', 'python', 'Сб', '12:00', 90, '2026-12-06', 12, 6, 'publish'],
  ['П-2', 'python', 'Ср', '16:00', 90, '2026-12-03', 12, 0, 'draft'],
  ['У-1', 'ukr-nmt', 'Пн,Ср', '17:00', 90, '2026-12-01', 10, 10, 'publish'],
  ['У-2', 'ukr-nmt', 'Вт,Чт', '18:00', 90, '2026-12-02', 10, 10, 'publish'],
  ['Г-1', 'algebra-10', 'Пт', '16:00', 90, '2026-12-05', 10, 8, 'publish'],
  ['Д-1', 'english-adult', 'Вт,Чт', '19:30', 90, '2026-12-02', 10, 4, 'publish'],
  ['І-1', 'history-nmt', 'Пн,Ср', '16:00', 90, '2026-12-01', 10, 3, 'publish'],
  ['Б-1', 'math-9', 'Вт,Пт', '16:00', 90, '2026-12-02', 10, 2, 'publish'],
  ['В-1', 'web', 'Пн,Чт', '18:30', 90, '2026-12-01', 10, 8, 'publish'],
  ['С-1', 'speaking', 'Сб', '11:00', 90, '2026-12-06', 8, 2, 'publish'],
];

function hoursFromNow(hours) {
  const d = new Date(Date.now() + hours * 3600e3);
  d.setMinutes(0, 0, 0);
  return d;
}
function daysFromNow(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function run(db, { hashPassword, adminPassword }) {
  const insertCourse = db.prepare(`INSERT INTO courses (id, title, subject, tutor, months, per_week, format, level, ages, price, popularity, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  COURSES.forEach((c) => insertCourse.run(...c));

  const insertGroup = db.prepare(`INSERT INTO course_groups (code, course_id, tutor, days, start_time, minutes, start_date, seats, taken, status)
    VALUES (?, ?, (SELECT tutor FROM courses WHERE id = ?), ?, ?, ?, ?, ?, ?, ?)`);
  GROUPS.forEach(([code, course, ...rest]) => insertGroup.run(code, course, course, ...rest));

  const promo = db.prepare('INSERT INTO promo_codes (code, percent, active) VALUES (?, ?, ?)');
  promo.run('ZNANNYA10', 10, 1);
  promo.run('FIRST20', 20, 1);
  promo.run('SUMMER15', 15, 0);

  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  insertUser.run('Адміністратор', 'admin@znannyaplus.com.ua', hashPassword(adminPassword), 'admin');
  const ivan = insertUser.run('Іван Петренко', 'ivan.petrenko@gmail.com', hashPassword('znannya2026'), 'student').lastInsertRowid;

  const m1 = db.prepare("SELECT * FROM course_groups WHERE code = 'М-1'").get();
  const a1 = db.prepare("SELECT * FROM course_groups WHERE code = 'А-1'").get();
  const booking = db.prepare(`INSERT INTO bookings (user_id, kind, group_id, tutor, title, slot_at, minutes, price, promo, total, method, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?)`);
  const created = new Date(Date.now() - 20 * 864e5).toISOString();
  booking.run(ivan, 'group', m1.id, 'Олена Коваль', 'Підготовка до НМТ з математики · група М-1', hoursFromNow(3).toISOString(), 90, 1800, null, 1800, 'card', created);
  booking.run(ivan, 'individual', null, 'Олена Коваль', 'Математика · індивідуальне заняття', daysFromNow(7, 16).toISOString(), 60, 450, null, 450, 'card', created);
  booking.run(ivan, 'group', a1.id, 'Андрій Мельник', 'Англійська B1–B2 для підлітків · група А-1', nextGroupLesson(a1, daysFromNow(10, 0)).toISOString(), 90, 1600, 'ZNANNYA10', 1440, 'google', created);
  booking.run(ivan, 'individual', null, 'Олена Коваль', 'Математика · індивідуальне заняття', daysFromNow(-6, 16).toISOString(), 60, 450, null, 450, 'card', created);
  booking.run(ivan, 'individual', null, 'Олена Коваль', 'Математика · індивідуальне заняття', daysFromNow(-13, 16).toISOString(), 60, 450, null, 450, 'apple', created);

  const consult = db.prepare('INSERT INTO consultations (name, phone, subject, status, created_at) VALUES (?, ?, ?, ?, ?)');
  // формат часу як у datetime('now') SQLite: «YYYY-MM-DD HH:MM:SS» (UTC)
  const ago = (hours) => new Date(Date.now() - hours * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
  consult.run('Марія Сидоренко', '+380671112233', 'Математика (НМТ)', 'new', ago(2));
  consult.run('Денис Коваленко', '+380504445566', 'Англійська мова', 'done', ago(30));
}

module.exports = { run };
