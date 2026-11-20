/* Кабінет учня (FR-07, US-07): записи з GET /api/bookings, скасування PATCH /api/bookings/:id,
   видалення з історії DELETE /api/bookings/:id. Правило 12 годин перевіряє сервер. */
'use strict';

(function (ZP) {
  const { qs, el, formatDate, formatTime, isoDate, formatPrice, plural } = ZP.utils;
  const HOUR = 60 * 60 * 1000;
  const LOCK_HOURS = 12;

  /** Текст «через 2 год 41 хв» */
  function untilText(ms) {
    const totalMin = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (d) return `${d} дн ${h} год`;
    return h ? `${h} год ${m} хв` : `${m} хв`;
  }

  /** Відповідь API → модель заняття для інтерфейсу */
  function toLesson(b) {
    const start = new Date(b.slotAt);
    const past = start <= Date.now();
    return {
      id: b.id, start, minutes: b.minutes, course: b.title, total: b.total, canCancel: b.canCancel,
      place: `${b.tutor} · ${b.kind === 'group' ? 'групове заняття' : 'індивідуально, онлайн (Zoom)'}`,
      status: b.status === 'cancelled' ? 'cancelled' : past ? 'done' : 'paid',
    };
  }

  const BADGES = { paid: ['green', 'Оплачено'], cancelled: ['red', 'Скасовано'], done: ['gray', 'Відбулося'] };

  ZP.pages = ZP.pages || {};
  ZP.pages.cabinet = async function () {
    const user = await ZP.api.requireUser();
    if (!user) return;

    const upcomingList = qs('#upcoming');
    const pastList = qs('#past');
    const dialog = qs('#cancel-modal');
    const cancelSubmit = qs('#cancel-form [type="submit"]');
    let lessons = [];
    let balance = user.balance;
    let current = null; // заняття, яке скасовуємо
    let highlight = null;

    function lessonItem(lesson) {
      const left = lesson.start - Date.now();
      const upcoming = lesson.status === 'paid';
      const locked = upcoming && !lesson.canCancel;
      const [color, label] = BADGES[lesson.status];
      const end = new Date(lesson.start.getTime() + lesson.minutes * 60000);

      const children = [
        el('p', { class: 'lesson__date' }, [
          el('time', { class: 't-body-s t-medium', datetime: isoDate(lesson.start), text: formatDate(lesson.start) }),
          el('br'),
          el('span', { class: 't-caption t-muted', text: `${formatTime(lesson.start)} – ${formatTime(end)}` }),
        ]),
        el('div', {}, [el('p', { class: 't-medium', text: lesson.course }), el('p', { class: 't-body-s t-muted', text: lesson.place })]),
        el('span', { class: `badge badge--${color}`, text: label }),
      ];
      if (upcoming && left > 0) {
        children.push(el('div', { class: 'lesson__actions' }, [
          el('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'zoom' }, text: 'Урок у Zoom' }),
          el('button', { class: 'btn btn--outline', type: 'button', disabled: locked, dataset: { action: 'cancel' }, text: 'Скасувати' }),
        ]));
        children.push(el('p', { class: 'lesson__hint', dataset: { countdown: lesson.id } }));
      } else {
        children.push(el('div', { class: 'lesson__actions' }, [
          el('button', { class: 'btn btn--ghost', type: 'button', dataset: { action: 'delete' }, 'aria-label': `Видалити з історії: ${lesson.course}, ${formatDate(lesson.start)}`, text: 'Видалити з історії' }),
        ]));
      }
      return el('li', { class: `lesson${lesson.status === 'cancelled' ? ' lesson--cancelled' : ''}${lesson.id === highlight ? ' is-updated' : ''}`, dataset: { id: lesson.id } }, children);
    }

    function updateCountdowns() {
      lessons.forEach((lesson) => {
        const hint = qs(`[data-countdown="${lesson.id}"]`);
        if (!hint) return;
        const left = lesson.start - Date.now();
        const deadline = new Date(lesson.start - LOCK_HOURS * HOUR);
        hint.textContent = left < LOCK_HOURS * HOUR
          ? `Почнеться через ${untilText(left)}. Скасування недоступне: до заняття менше ${LOCK_HOURS} год.`
          : `Почнеться через ${untilText(left)}. Скасувати можна до ${formatDate(deadline)}, ${formatTime(deadline)}.`;
      });
    }

    function render() {
      const upcoming = lessons.filter((l) => l.status === 'paid').sort((a, b) => a.start - b.start);
      const past = lessons.filter((l) => l.status !== 'paid').sort((a, b) => b.start - a.start);
      upcomingList.replaceChildren(...(upcoming.length ? upcoming.map(lessonItem)
        : [ZP.ui.statusBlock('Запланованих занять немає. Оберіть курс у каталозі або запишіться до репетитора.', { tag: 'li' })]));
      pastList.replaceChildren(...(past.length ? past.map(lessonItem) : [ZP.ui.statusBlock('Історія занять порожня.', { tag: 'li' })]));
      qs('#tab-upcoming').textContent = `Найближчі (${upcoming.length})`;
      qs('#tab-past').textContent = `Минулі та скасовані (${past.length})`;
      qs('#balance').textContent = formatPrice(balance);
      qs('#stat-lessons').textContent = `${upcoming.length} ${plural(upcoming.length, 'заняття', 'заняття', 'занять')}`;
      updateCountdowns();
    }

    async function load() {
      upcomingList.replaceChildren(ZP.ui.statusBlock('Завантаження розкладу…', { tag: 'li' }));
      try {
        lessons = (await ZP.api.get('/api/bookings')).map(toLesson);
        render();
      } catch (error) {
        upcomingList.replaceChildren(ZP.ui.statusBlock(error.message, { error: true, retry: load, tag: 'li' }));
      }
    }

    // Делегування подій: один обробник на обидва списки
    async function onListClick(event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const lesson = lessons.find((l) => String(l.id) === button.closest('.lesson').dataset.id);
      if (button.dataset.action === 'zoom') {
        const left = lesson.start - Date.now();
        ZP.ui.toast(left > 15 * 60000 ? `Посилання на урок стане активним за 15 хв до початку (через ${untilText(left - 15 * 60000)})` : 'Відкриваємо Zoom…', 'info');
      }
      if (button.dataset.action === 'cancel') {
        current = lesson;
        qs('#cancel-what').textContent = `${lesson.course} · ${formatDate(lesson.start)}, ${formatTime(lesson.start)}`;
        qs('#cancel-sum').textContent = formatPrice(lesson.total);
        ZP.ui.openModal(dialog, button);
      }
      if (button.dataset.action === 'delete') {
        ZP.ui.busy(button, true, 'Видалення…');
        try {
          await ZP.api.del(`/api/bookings/${lesson.id}`);
          lessons = lessons.filter((l) => l !== lesson);
          render();
          ZP.ui.toast('Запис видалено з історії', 'info');
        } catch (error) {
          ZP.ui.busy(button, false);
          ZP.ui.toast(error.message, 'error');
        }
      }
    }
    upcomingList.addEventListener('click', onListClick);
    pastList.addEventListener('click', onListClick);

    // Підтвердження скасування в модальному вікні → PATCH /api/bookings/:id
    qs('#cancel-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!current) return;
      const refund = new FormData(event.target).get('refund');
      ZP.ui.busy(cancelSubmit, true, 'Скасування…');
      try {
        const updated = await ZP.api.patch(`/api/bookings/${current.id}`, { status: 'cancelled', refund });
        Object.assign(current, toLesson(updated));
        highlight = current.id;
        if (refund === 'balance') balance += current.total;
        dialog.close();
        render();
        ZP.ui.toast(refund === 'balance'
          ? `Заняття скасовано. ${formatPrice(current.total)} зараховано на баланс.`
          : `Заняття скасовано. ${formatPrice(current.total)} повернемо на картку протягом 3–5 банківських днів.`);
        current = null;
      } catch (error) {
        dialog.close();
        ZP.ui.toast(error.message, 'error');
        load(); // стан на сервері міг змінитися
      } finally {
        ZP.ui.busy(cancelSubmit, false);
      }
    });

    await load();
    setInterval(updateCountdowns, 30000);
  };
})(window.ZP);
