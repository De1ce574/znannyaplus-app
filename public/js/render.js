/* ==========================================================================
   render.js — побудова повторюваних елементів інтерфейсу з даних
   ========================================================================== */
'use strict';

(function (ZP) {
  const { el, formatPrice } = ZP.utils;
  const { SUBJECTS } = ZP.data;

  /** Стан наявності місць → колір і текст бейджа */
  function placesBadge(left) {
    if (left === 0) return el('span', { class: 'badge badge--red', text: 'Місць немає' });
    if (left <= 2) return el('span', { class: 'badge badge--amber', text: `Залишилось ${left} ${left === 1 ? 'місце' : 'місця'}` });
    return el('span', { class: 'badge badge--green', text: `Є місця: ${left}` });
  }

  /** Картка курсу (компонент CourseCard з дизайн-системи) */
  function courseCard(course, headingLevel = 'h3') {
    const url = `course.html?id=${encodeURIComponent(course.id)}`;
    const full = course.places === 0;
    return el('article', { class: 'course-card', dataset: { id: course.id } }, [
      el('div', { class: 'course-card__media' }, [
        el('span', { class: 'badge badge--indigo', text: course.format === 'online' ? 'Онлайн' : 'Офлайн' }),
        el('span', { class: 'course-card__subject', 'aria-hidden': 'true', text: SUBJECTS[course.subject] }),
      ]),
      el('div', { class: 'course-card__body' }, [
        el(headingLevel, { class: 'course-card__title' }, [el('a', { href: url, text: course.title })]),
        el('p', { class: 't-body-s t-muted', text: `${course.tutor} · ${course.months} міс. · ${course.perWeek} р/тиж` }),
        placesBadge(course.places),
        el('div', { class: 'course-card__footer' }, [
          el('span', { class: 'price', text: `${formatPrice(course.price)}/міс` }),
          el('a', { class: full ? 'btn btn--outline' : 'btn btn--solid', href: url, text: full ? 'Лист очікування' : 'Детальніше' }),
        ]),
      ]),
    ]);
  }

  ZP.render = { courseCard, placesBadge };
})(window.ZP);
