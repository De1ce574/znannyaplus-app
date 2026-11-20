'use strict';
/** Допоміжні функції для роботи з розкладом */

const DAY_INDEX = { 'Нд': 0, 'Пн': 1, 'Вт': 2, 'Ср': 3, 'Чт': 4, 'Пт': 5, 'Сб': 6 };
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const toMin = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Найближче заняття групи (не раніше дати старту) */
function nextGroupLesson(group, from = new Date()) {
  const start = new Date(`${group.start_date}T00:00:00`);
  const base = start > from ? start : from;
  const [h, m] = group.start_time.split(':').map(Number);
  const days = group.days.split(',').map((d) => DAY_INDEX[d]);
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, h, m);
    if (days.includes(d.getDay()) && d > from) return d;
  }
  return new Date(base.getTime() + 7 * 864e5);
}

/** Чи перетинаються дві групи одного викладача за днями й часом */
function groupsOverlap(a, b) {
  const daysA = a.days.split(',');
  const sameDay = b.days.split(',').some((d) => daysA.includes(d));
  const fromA = toMin(a.start_time);
  const fromB = toMin(b.start_time);
  return sameDay && fromA < fromB + b.minutes && fromB < fromA + a.minutes;
}

const scheduleText = (g) => `${g.days.split(',').join(', ')} ${g.start_time}–${toTime(toMin(g.start_time) + g.minutes)}`;

module.exports = { DAYS, toMin, toTime, nextGroupLesson, groupsOverlap, scheduleText };
