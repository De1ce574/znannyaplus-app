/* Кабінет репетитора: тижневий розклад, додавання слотів, скасування заняття (FR-09, US-06) */
'use strict';

(function (ZP) {
  const { qs, qsa, el, plural } = ZP.utils;

  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const toMin = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  ZP.pages = ZP.pages || {};
  ZP.pages['tutor-cabinet'] = function () {
    // Розклад тижня: type — booked (індивідуальне), group, free, cancelled
    const slots = [
      { id: 1, day: 0, start: '16:00', minutes: 60, type: 'booked', student: 'Іван П.', label: 'Іван П. · Математика' },
      { id: 2, day: 0, start: '18:00', minutes: 90, type: 'group', label: 'Група М-1' },
      { id: 3, day: 1, start: '15:00', minutes: 60, type: 'free', label: 'Вільний слот' },
      { id: 4, day: 2, start: '16:00', minutes: 60, type: 'booked', student: 'Артем В.', label: 'Артем В. · Алгебра' },
      { id: 5, day: 2, start: '18:00', minutes: 90, type: 'group', label: 'Група М-1' },
      { id: 6, day: 4, start: '17:00', minutes: 60, type: 'free', label: 'Вільний слот' },
      { id: 7, day: 5, start: '10:00', minutes: 180, type: 'group', label: 'Група М-3' },
    ];
    let nextId = 8;
    let current = null;
    const week = qs('#week');
    const dialog = qs('#slot-modal');

    function slotNode(slot) {
      const time = el('small', { text: `${slot.start}–${toTime(toMin(slot.start) + slot.minutes)}${slot.repeat ? ' · щотижня' : ''}` });
      const cls = `week__slot week__slot--${slot.type}${slot.fresh ? ' is-updated' : ''}`;
      // Заброньований слот — кнопка: за кліком відкривається вікно скасування (US-06)
      if (slot.type === 'booked') {
        return el('button', { class: cls, type: 'button', dataset: { id: slot.id }, 'aria-label': `${slot.label}, ${slot.start}. Скасувати заняття` }, [time, slot.label]);
      }
      return el('p', { class: cls }, [time, slot.label]);
    }

    function render() {
      week.replaceChildren(...DAYS.map((day, index) => el('div', { class: 'week__day' }, [
        el('h3', { class: 't-body-s t-muted', text: day }),
        ...slots.filter((s) => s.day === index).sort((a, b) => toMin(a.start) - toMin(b.start)).map(slotNode),
      ])));
      const free = slots.filter((s) => s.type === 'free').length;
      const booked = slots.filter((s) => s.type !== 'free' && s.type !== 'cancelled').length;
      qs('#week-stats').textContent = `Занять: ${booked} · вільних слотів: ${free}`;
    }

    // Делегування: клік по будь-якому заброньованому слоту
    week.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-id]');
      if (!button) return;
      current = slots.find((s) => s.id === Number(button.dataset.id));
      qs('#slot-what').textContent = `${DAYS[current.day]}, ${current.start} · ${current.label}`;
      ZP.ui.openModal(dialog, button);
    });

    // Скасування заброньованого заняття з обов'язковою причиною
    ZP.validation.attach(qs('#slot-cancel-form'), (form, data) => {
      current.type = 'cancelled';
      current.label = `Скасовано: ${data.get('reason').trim()}`;
      const student = current.student;
      form.reset();
      dialog.close();
      render();
      ZP.ui.toast(`Заняття скасовано. Учня ${student} сповіщено e-mail і в Telegram.`);
    });

    // Додавання слоту: перевірка часу та перетину з наявними заняттями
    const startInput = qs('#start');
    startInput.customCheck = (value) => {
      const day = Number(qs('#day').value);
      const minutes = Number(qs('#dur').value);
      const from = toMin(value);
      const to = from + minutes;
      if (to > toMin('21:00')) return 'Заняття має завершитися не пізніше 21:00';
      const conflict = slots.find((s) => s.day === day && s.type !== 'cancelled' && from < toMin(s.start) + s.minutes && toMin(s.start) < to);
      return conflict ? `Перетин із «${conflict.label}» (${conflict.start}–${toTime(toMin(conflict.start) + conflict.minutes)})` : true;
    };
    // При зміні дня чи тривалості перевіряємо час повторно
    qsa('#day, #dur').forEach((select) => select.addEventListener('change', () => {
      if (startInput.value) ZP.validation.validateField(startInput);
    }));

    ZP.validation.attach(qs('#slot-form'), (form, data) => {
      slots.forEach((s) => { s.fresh = false; });
      slots.push({ id: nextId++, day: Number(data.get('day')), start: data.get('start'), minutes: Number(data.get('dur')), type: 'free', label: 'Вільний слот', repeat: data.get('repeat') === 'on', fresh: true });
      render();
      ZP.ui.toast(`Слот «${DAYS[Number(data.get('day'))]}, ${data.get('start')}» додано до розкладу${data.get('repeat') ? ' (щотижня)' : ''}`);
      form.reset();
    });

    // Лічильник відвідування
    const attendance = qs('#attendance');
    const updateAttendance = () => {
      const boxes = qsa('#students input[type="checkbox"]');
      const present = boxes.filter((b) => b.checked).length;
      attendance.textContent = `Відвідали ${present} з ${boxes.length} ${plural(boxes.length, 'учня', 'учнів', 'учнів')}`;
    };
    qs('#students').addEventListener('change', updateAttendance);

    render();
    updateAttendance();
  };
})(window.ZP);
