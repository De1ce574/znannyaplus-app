/* Сторінка курсу: GET /api/courses/:id — опис, програма (акордеон), групи з вільними місцями */
'use strict';

(function (ZP) {
  const { qs, el, formatPrice, params } = ZP.utils;
  const { SUBJECTS, LEVELS } = ZP.data;
  const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const dateText = (iso) => { const d = new Date(`${iso}T00:00`); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

  function fill(course) {
    document.title = `${course.title} — ЗнанняПлюс`;
    qs('#course-title').textContent = course.title;
    qs('#course-crumb').textContent = course.title;
    qs('#course-desc').textContent = course.description;
    qs('#course-badges').replaceChildren(
      el('span', { class: 'badge badge--indigo', text: course.format === 'online' ? 'Онлайн' : 'Офлайн' }),
      el('span', { class: 'badge badge--green', text: SUBJECTS[course.subject] }),
      el('span', { class: 'badge badge--gray', text: `Рівень: ${LEVELS[course.level].toLowerCase()}` })
    );
    qs('#meta-duration').textContent = `${course.months} міс.`;
    qs('#meta-lessons').textContent = `${course.perWeek} р/тиж · 90 хв`;
    qs('#meta-format').textContent = course.format === 'online' ? 'Онлайн (Zoom)' : 'Офлайн, ауд. 204';
    qs('#meta-age').textContent = course.ages.map((age) => (age === '18+' ? '18+' : `${age} р.`)).join(', ');
    qs('#course-price').textContent = `${formatPrice(course.price)} / міс`;
    qs('#teacher-name').textContent = course.tutor;
    qs('#teacher-avatar').textContent = course.tutor.split(' ').map((part) => part[0]).join('');

    qs('#program').replaceChildren(...course.program.map(([title, period, text], index) => {
      const panelId = `module-${index + 1}`;
      return el('li', { class: 'program__item accordion__item' }, [
        el('button', { class: 'accordion__button', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId }, [
          el('span', { class: 'program__num', 'aria-hidden': 'true', text: String(index + 1) }),
          el('span', { class: 'accordion__title' }, [el('span', { class: 't-medium', text: title }), el('span', { class: 't-body-s t-muted', text: period })]),
          el('span', { class: 'accordion__icon', 'aria-hidden': 'true', text: '+' }),
        ]),
        el('p', { class: 'accordion__panel t-body-s', id: panelId, hidden: true, text }),
      ]);
    }));

    const groups = qs('#groups-list');
    if (!course.groups.length) {
      groups.replaceChildren(ZP.ui.statusBlock('Набір у групи ще не відкрито. Залиште заявку на консультацію.', { tag: 'li' }));
      return;
    }
    groups.replaceChildren(...course.groups.map((group) => el('li', { class: 'group-row' }, [
      el('div', {}, [el('p', { class: 't-medium', text: `Група ${group.code}` }), el('p', { class: 't-body-s t-muted', text: `Старт ${dateText(group.startDate)} · ${group.schedule}` })]),
      ZP.render.placesBadge(group.left),
      group.left > 0
        ? el('a', { class: 'btn btn--solid', href: `checkout.html?group=${group.id}`, text: 'Записатися' })
        : el('button', { class: 'btn btn--outline', type: 'button', dataset: { modalOpen: 'waitlist-modal', group: group.code }, text: 'Лист очікування' }),
    ])));
  }

  ZP.pages = ZP.pages || {};
  ZP.pages.course = async function () {
    const id = params().get('id') || 'math-nmt';
    try {
      const course = await ZP.api.get(`/api/courses/${encodeURIComponent(id)}`);
      fill(course);
      qs('#groups-list').addEventListener('click', (event) => {
        const button = event.target.closest('[data-group]');
        if (button) qs('#waitlist-group').textContent = `${course.title}, група ${button.dataset.group}`;
      });
    } catch (error) {
      const main = qs('#main');
      main.replaceChildren(el('div', { class: 'section container stack' }, [
        el('h1', { text: error.status === 404 ? 'Курс не знайдено' : 'Не вдалося завантажити курс' }),
        el('p', { class: 't-muted', text: error.message }),
        el('p', {}, [el('a', { class: 'btn btn--solid', href: 'catalog.html', text: 'До каталогу курсів' })]),
      ]));
      return;
    }

    qs('#enroll-scroll').addEventListener('click', () => {
      const first = qs('#groups-list a.btn');
      qs('#groups').scrollIntoView({ behavior: 'smooth' });
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 400);
    });

    ZP.validation.attach(qs('#waitlist-form'), (form, data) => {
      form.closest('dialog').close();
      form.reset();
      ZP.ui.toast(`Вас додано до листа очікування. Повідомимо на ${data.get('email')}, щойно звільниться місце.`);
    });
  };
})(window.ZP);
