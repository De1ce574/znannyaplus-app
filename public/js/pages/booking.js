/* Запис на індивідуальне заняття: календар вільних слотів на 14 днів (US-03).
   Зайняті слоти — з GET /api/slots, сам запис створюється на сторінці оплати. */
'use strict';

(function (ZP) {
  const { qs, el, storage, formatDate, isoDate, today, DAYS_SHORT, MONTHS_GEN, params } = ZP.utils;
  const TIMES = ['10:00', '12:00', '14:00', '16:00', '18:00'];
  const TUTOR = 'Олена Коваль';

  ZP.pages = ZP.pages || {};
  ZP.pages.booking = async function () {
    const grid = qs('#calendar-grid');
    const weekTitle = qs('#week-title');
    const prev = qs('#prev-week');
    const next = qs('#next-week');
    const summaryDate = qs('#sum-date');
    const confirm = qs('#confirm');
    const hint = qs('#slot-hint');

    // 14 днів, починаючи з сьогодні
    const start = today();
    const days = Array.from({ length: 14 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    let week = 0;
    let selected = storage.get('zp-slot'); // рядок «2026-11-27T16:00» або null
    let taken = new Set(); // зайняті слоти з сервера (ISO-рядки в UTC)

    /** Слот недоступний: зайнятий або вже минув (менше ніж за 1 год від зараз) */
    function unavailable(day, time) {
      const [h, m] = time.split(':').map(Number);
      const moment = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      return taken.has(moment.toISOString()) || day.getDay() === 0 || moment.getTime() - Date.now() < 60 * 60 * 1000;
    }

    /** Побудова сітки слотів поточного тижня */
    function renderWeek() {
      const weekDays = days.slice(week * 7, week * 7 + 7);
      const first = weekDays[0];
      const last = weekDays[6];
      weekTitle.textContent = `${first.getDate()} ${MONTHS_GEN[first.getMonth()]} – ${last.getDate()} ${MONTHS_GEN[last.getMonth()]}`;
      prev.disabled = week === 0;
      next.disabled = week === 1;

      grid.replaceChildren(el('legend', { class: 'visually-hidden', text: 'Вільні слоти' }), ...weekDays.map((day) => {
        const slots = TIMES.map((time) => {
          const value = `${isoDate(day)}T${time}`;
          const off = unavailable(day, time);
          const input = el('input', {
            type: 'radio', name: 'slot', value,
            disabled: off, checked: value === selected && !off,
            'aria-label': `${formatDate(day)}, ${time}${off ? ' — недоступно' : ''}`,
          });
          return el('label', { class: 'slot' }, [input, time]);
        });
        return el('div', { class: 'calendar__day' }, [
          el('span', { class: 't-caption t-muted', text: DAYS_SHORT[day.getDay()] }),
          el('span', { class: 'calendar__date', text: String(day.getDate()) }),
          ...slots,
        ]);
      }));
    }

    /** Оновлення підсумку запису після вибору слоту */
    function updateSummary() {
      if (!selected) {
        summaryDate.textContent = 'оберіть слот';
        confirm.disabled = true;
        hint.hidden = false;
        return;
      }
      const [date, time] = selected.split('T');
      summaryDate.textContent = `${formatDate(new Date(`${date}T00:00`))}, ${time}`;
      confirm.disabled = false;
      hint.hidden = true;
    }

    // Делегування: одна подія change на всю сітку слотів
    grid.addEventListener('change', (event) => {
      if (event.target.name !== 'slot') return;
      selected = event.target.value;
      storage.set('zp-slot', selected);
      updateSummary();
    });
    prev.addEventListener('click', () => { week = 0; renderWeek(); });
    next.addEventListener('click', () => { week = 1; renderWeek(); });

    confirm.addEventListener('click', async () => {
      if (!selected) return;
      // Незареєстрований користувач: вхід, слот при цьому не втрачається (зберігається в localStorage)
      if (!(await ZP.api.me())) {
        window.location.href = 'login.html?next=booking.html%3Frestored%3D1';
        return;
      }
      storage.remove('zp-slot');
      window.location.href = `checkout.html?slot=${encodeURIComponent(new Date(selected).toISOString())}`;
    });

    // Якщо збережений слот на другому тижні — відкриваємо його
    if (selected) {
      const index = days.findIndex((day) => isoDate(day) === selected.split('T')[0]);
      if (index === -1) selected = null;
      else week = index >= 7 ? 1 : 0;
    }
    try {
      grid.setAttribute('aria-busy', 'true');
      taken = new Set(await ZP.api.get(`/api/slots?tutor=${encodeURIComponent(TUTOR)}`));
    } catch (error) {
      ZP.ui.toast(`Не вдалося перевірити зайняті слоти: ${error.message}`);
    } finally {
      grid.removeAttribute('aria-busy');
    }
    renderWeek();
    if (selected && !qs(`input[value="${selected}"]`, grid)?.checked) selected = null;
    updateSummary();

    if (params().get('restored') && selected) {
      qs('#restored').hidden = false;
      ZP.ui.toast('Ви увійшли. Обраний слот збережено.');
    }
  };
})(window.ZP);
