/* Адмін-панель (FR-12, US-08): CRUD груп через /api/groups і заявок через /api/consultations.
   Доступ лише для ролі admin — перевіряє і клієнт (перенаправлення), і сервер (403). */
'use strict';

(function (ZP) {
  const { qs, qsa, el } = ZP.utils;

  const toMin = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  // Назви полів API → id полів форми (для показу серверних помилок 422/409)
  const FIELD_MAP = { courseId: 'g-course', tutor: 'g-tutor', startDate: 'g-start', minutes: 'g-duration', startTime: 'g-time', seats: 'g-max', days: 'g-day-0' };

  ZP.pages = ZP.pages || {};
  ZP.pages.admin = async function () {
    const user = await ZP.api.requireUser('admin');
    if (!user) return;

    const form = qs('#group-form');
    const tbody = qs('#groups-body');
    const filter = qs('#groups-filter');
    const timeInput = qs('#g-time');
    const firstDay = qs('#g-day-0');
    const confirmDialog = qs('#confirm-modal');
    const confirmButton = qs('#confirm-form [type="submit"]');
    let groups = [];
    let pendingDelete = null; // () => Promise — дія, що чекає підтвердження
    const selectedDays = () => qsa('input[name="days"]:checked', form).map((input) => input.value);
    const schedule = (g) => `${g.days.join(', ')} ${g.startTime}–${toTime(toMin(g.startTime) + g.minutes)}`;

    /* ---------- Довідники: курси й викладачі з API ---------- */
    async function loadCourses() {
      const courses = await ZP.api.get('/api/courses?limit=50');
      const options = courses.map((c) => el('option', { value: c.id, text: c.title }));
      qs('#g-course').append(...options);
      filter.append(...courses.map((c) => el('option', { value: c.id, text: c.title })));
      const tutors = [...new Set(courses.map((c) => c.tutor))].sort((a, b) => a.localeCompare(b, 'uk'));
      qs('#g-tutor').append(...tutors.map((t) => el('option', { value: t, text: t })));
      // Обрано курс — підставляємо його викладача
      qs('#g-course').addEventListener('change', (event) => {
        const course = courses.find((c) => c.id === event.target.value);
        if (course) qs('#g-tutor').value = course.tutor;
      });
    }

    /* ---------- Таблиця груп (READ / UPDATE / DELETE) ---------- */
    function render(highlightId) {
      if (!groups.length) {
        tbody.replaceChildren(el('tr', {}, [el('td', { colspan: '7', text: 'Груп не знайдено' })]));
      } else {
        tbody.replaceChildren(...groups.map((g) => el('tr', { class: g.id === highlightId ? 'is-updated' : null, dataset: { id: g.id } }, [
          el('td', { class: 't-medium', text: g.code }),
          el('td', { text: g.courseTitle }),
          el('td', { text: g.tutor }),
          el('td', { text: schedule(g) }),
          el('td', { text: `${g.taken} / ${g.seats}` }),
          el('td', {}, [el('span', { class: `badge badge--${g.status === 'publish' ? 'green' : 'gray'}`, text: g.status === 'publish' ? 'Опубліковано' : 'Чернетка' })]),
          el('td', {}, [el('div', { class: 'row row--tight' }, [
            el('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'toggle' }, 'aria-label': `${g.status === 'publish' ? 'Зняти з публікації' : 'Опублікувати'} групу ${g.code}`, text: g.status === 'publish' ? 'У чернетку' : 'Опублікувати' }),
            el('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'delete' }, 'aria-label': `Видалити групу ${g.code}`, text: 'Видалити' }),
          ])]),
        ])));
      }
      qs('#groups-count').textContent = `Групи курсів (${groups.length})`;
    }

    async function loadGroups(highlightId) {
      tbody.setAttribute('aria-busy', 'true');
      try {
        const course = filter.value ? `&course=${encodeURIComponent(filter.value)}` : '';
        groups = await ZP.api.get(`/api/groups?all=1${course}`);
        render(highlightId);
      } catch (error) {
        tbody.replaceChildren(el('tr', {}, [el('td', { colspan: '7' }, [ZP.ui.statusBlock(error.message, { error: true, retry: () => loadGroups() })])]));
      } finally {
        tbody.removeAttribute('aria-busy');
      }
    }
    filter.addEventListener('change', () => loadGroups());

    /** Підтвердження небезпечної дії в модальному вікні */
    function askConfirm(text, opener, action) {
      qs('#confirm-text').textContent = text;
      pendingDelete = action;
      ZP.ui.openModal(confirmDialog, opener);
    }
    qs('#confirm-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!pendingDelete) return;
      ZP.ui.busy(confirmButton, true, 'Видалення…');
      try {
        await pendingDelete();
        confirmDialog.close();
      } catch (error) {
        confirmDialog.close();
        ZP.ui.toast(error.message, 'error', 6000);
      } finally {
        ZP.ui.busy(confirmButton, false);
        pendingDelete = null;
      }
    });

    tbody.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const group = groups.find((g) => String(g.id) === button.closest('tr').dataset.id);
      if (button.dataset.action === 'toggle') {
        ZP.ui.busy(button, true, 'Збереження…');
        try {
          const status = group.status === 'publish' ? 'draft' : 'publish';
          Object.assign(group, await ZP.api.patch(`/api/groups/${group.id}`, { status }));
          render(group.id);
          ZP.ui.toast(status === 'publish' ? `Групу ${group.code} опубліковано` : `Групу ${group.code} переведено в чернетки`);
        } catch (error) {
          ZP.ui.busy(button, false);
          ZP.ui.toast(error.message, 'error', 6000);
        }
      }
      if (button.dataset.action === 'delete') {
        askConfirm(`Група ${group.code} (${group.courseTitle}, ${schedule(group)}) буде видалена без можливості відновлення.`, button, async () => {
          await ZP.api.del(`/api/groups/${group.id}`);
          groups = groups.filter((g) => g !== group);
          render();
          ZP.ui.toast(`Групу ${group.code} видалено`, 'info');
        });
      }
    });

    /* ---------- Форма створення групи (CREATE) ---------- */
    firstDay.customCheck = () => selectedDays().length > 0 || 'Оберіть хоча б один день тижня';
    // Швидка перевірка на клієнті; остаточну (з урахуванням усіх груп) виконує сервер
    timeInput.customCheck = (value) => {
      const days = selectedDays();
      const tutor = qs('#g-tutor').value;
      const minutes = Number(qs('#g-duration').value);
      const from = toMin(value);
      if (from + minutes > toMin('21:00')) return 'Заняття має завершитися не пізніше 21:00';
      const conflict = groups.find((g) => g.tutor === tutor && g.days.some((d) => days.includes(d))
        && from < toMin(g.startTime) + g.minutes && toMin(g.startTime) < from + minutes);
      return conflict ? `Перетин із групою ${conflict.code} цього викладача (${schedule(conflict)})` : true;
    };
    form.addEventListener('change', (event) => {
      if (event.target.matches('input[name="days"], #g-tutor, #g-duration')) {
        if (event.target.name === 'days') ZP.validation.validateField(firstDay);
        if (timeInput.value) ZP.validation.validateField(timeInput);
      }
    });

    ZP.validation.attach(form, async (formEl, data, submitter) => {
      const status = submitter && submitter.value === 'draft' ? 'draft' : 'publish';
      const body = {
        courseId: data.get('course'), tutor: data.get('tutor'), days: data.getAll('days'), startTime: data.get('time'),
        minutes: Number(data.get('duration')), startDate: data.get('start'), seats: Number(data.get('max')), status,
      };
      const buttons = qsa('button[type="submit"]', formEl);
      buttons.forEach((b) => ZP.ui.busy(b, true, b === submitter ? 'Збереження…' : b.textContent));
      try {
        const group = await ZP.api.post('/api/groups', body);
        formEl.reset();
        filter.value = '';
        await loadGroups(group.id);
        ZP.ui.toast(status === 'publish'
          ? `Групу ${group.code} опубліковано — вона вже відображається на сторінці курсу`
          : `Групу ${group.code} збережено як чернетку — відвідувачі її не бачать`);
        qs('#groups-title').scrollIntoView({ behavior: 'smooth' });
      } catch (error) {
        ZP.validation.showServerErrors(formEl, error, FIELD_MAP);
      } finally {
        buttons.forEach((b) => ZP.ui.busy(b, false));
      }
    });

    /* ---------- Заявки на консультацію ---------- */
    const consultBody = qs('#consult-body');
    const consultFilter = qs('#consult-filter');
    let consultations = [];

    function renderConsultations() {
      qs('#consult-count').textContent = `Заявки на консультацію (${consultations.length})`;
      if (!consultations.length) {
        consultBody.replaceChildren(el('tr', {}, [el('td', { colspan: '5', text: 'Заявок немає' })]));
        return;
      }
      consultBody.replaceChildren(...consultations.map((c) => el('tr', { dataset: { id: c.id } }, [
        el('td', { text: new Date(`${c.createdAt.replace(' ', 'T')}Z`).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) }),
        el('td', { class: 't-medium', text: c.name }),
        el('td', {}, [el('a', { href: `tel:${c.phone}`, text: c.phone })]),
        el('td', { text: c.subject }),
        el('td', {}, [el('div', { class: 'row row--tight' }, [
          el('label', { class: 'check' }, [
            el('input', { type: 'checkbox', checked: c.status === 'done', dataset: { action: 'done' } }),
            c.status === 'done' ? 'Опрацьовано' : 'Нова',
          ]),
          el('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'delete' }, 'aria-label': `Видалити заявку ${c.name}`, text: 'Видалити' }),
        ])]),
      ])));
    }

    async function loadConsultations() {
      try {
        const status = consultFilter.value ? `?status=${consultFilter.value}` : '';
        consultations = await ZP.api.get(`/api/consultations${status}`);
        renderConsultations();
      } catch (error) {
        consultBody.replaceChildren(el('tr', {}, [el('td', { colspan: '5' }, [ZP.ui.statusBlock(error.message, { error: true, retry: loadConsultations })])]));
      }
    }
    consultFilter.addEventListener('change', loadConsultations);

    consultBody.addEventListener('change', async (event) => {
      if (event.target.dataset.action !== 'done') return;
      const item = consultations.find((c) => String(c.id) === event.target.closest('tr').dataset.id);
      try {
        Object.assign(item, await ZP.api.patch(`/api/consultations/${item.id}`, { status: event.target.checked ? 'done' : 'new' }));
        renderConsultations();
        ZP.ui.toast(item.status === 'done' ? `Заявку від ${item.name} позначено як опрацьовану` : `Заявку від ${item.name} повернуто в нові`, 'info');
      } catch (error) {
        event.target.checked = !event.target.checked;
        ZP.ui.toast(error.message, 'error');
      }
    });
    consultBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="delete"]');
      if (!button) return;
      const item = consultations.find((c) => String(c.id) === button.closest('tr').dataset.id);
      askConfirm(`Заявку від ${item.name} (${item.phone}) буде видалено.`, button, async () => {
        await ZP.api.del(`/api/consultations/${item.id}`);
        consultations = consultations.filter((c) => c !== item);
        renderConsultations();
        ZP.ui.toast('Заявку видалено', 'info');
      });
    });

    try {
      await loadCourses();
    } catch (error) {
      ZP.ui.toast(`Не вдалося завантажити список курсів: ${error.message}`, 'error');
    }
    await Promise.all([loadGroups(), loadConsultations()]);
  };
})(window.ZP);
