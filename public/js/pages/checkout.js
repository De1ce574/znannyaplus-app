/* Оформлення та оплата (FR-06, US-04): дані замовлення з API, промокод через
   GET /api/promo/:code, створення запису POST /api/bookings. Підсумкову суму рахує сервер. */
'use strict';

(function (ZP) {
  const { qs, el, formatPrice, formatDate, params } = ZP.utils;
  const INDIVIDUAL_PRICE = 450; // для показу; сервер однаково перераховує ціну

  /** Опис замовлення за параметрами адреси: ?group=ID або ?slot=ISO */
  async function loadOrder() {
    const query = params();
    if (query.get('group')) {
      const group = await ZP.api.get(`/api/groups/${encodeURIComponent(query.get('group'))}`);
      return {
        body: { kind: 'group', groupId: group.id },
        title: group.courseTitle,
        details: [['Група', `${group.code} · ${group.schedule}`], ['Старт', formatDate(new Date(`${group.startDate}T00:00`))], ['Вільних місць', String(group.left)]],
        price: group.price,
        unit: '/міс',
        full: group.left <= 0,
      };
    }
    if (query.get('slot')) {
      const slot = new Date(query.get('slot'));
      if (Number.isNaN(slot.getTime())) throw new ZP.api.ApiError('Некоректний слот у посиланні', 400);
      const time = slot.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
      return {
        body: { kind: 'individual', slotAt: slot.toISOString() },
        title: 'Математика · індивідуальне заняття',
        details: [['Репетитор', 'Олена Коваль'], ['Дата й час', `${formatDate(slot)}, ${time}`], ['Формат', '60 хв, онлайн (Zoom)']],
        price: INDIVIDUAL_PRICE,
        unit: '',
      };
    }
    throw new ZP.api.ApiError('Не обрано курс або заняття. Оберіть групу в каталозі чи слот у календарі.', 400);
  }

  ZP.pages = ZP.pages || {};
  ZP.pages.checkout = async function () {
    const user = await ZP.api.requireUser();
    if (!user) return;

    const form = qs('#checkout-form');
    const promoInput = qs('#promo');
    const promoButton = qs('#promo-apply');
    const payButton = qs('#pay');
    const payError = qs('#pay-error');
    let order;
    let discount = 0;
    let promoCode = '';

    try {
      order = await loadOrder();
    } catch (error) {
      form.replaceChildren(el('div', { class: 'stack' }, [
        ZP.ui.statusBlock(error.status === 404 ? 'Групу не знайдено або набір до неї закрито.' : error.message, { error: true }),
        el('p', {}, [el('a', { class: 'btn btn--solid', href: 'catalog.html', text: 'До каталогу курсів' })]),
      ]));
      return;
    }

    const total = () => Math.round(order.price * (1 - discount / 100));

    function renderSummary() {
      qs('#order-title').textContent = order.title;
      qs('#order-details').replaceChildren(...order.details.map(([term, value]) => el('div', { class: 'summary-line' }, [el('dt', { text: term }), el('dd', { text: value })])));
      qs('#order-price').textContent = `${formatPrice(order.price)}${order.unit}`;
      qs('#discount-row').hidden = discount === 0;
      qs('#discount-label').textContent = `Промокод ${promoCode} (−${discount}%)`;
      qs('#discount-value').textContent = `−${formatPrice(order.price - total())}`;
      qs('#order-total').textContent = formatPrice(total());
      payButton.textContent = `Сплатити ${formatPrice(total())}`;
      if (order.full) {
        payButton.disabled = true;
        payError.hidden = false;
        payError.textContent = 'У цій групі вже немає вільних місць. Оберіть іншу групу на сторінці курсу.';
      }
    }

    /** Застосування / скасування промокоду (перевірка на сервері) */
    promoButton.addEventListener('click', async () => {
      if (discount) {
        discount = 0;
        promoCode = '';
        promoInput.readOnly = false;
        promoInput.value = '';
        promoButton.textContent = 'Застосувати';
        renderSummary();
        promoInput.focus();
        return;
      }
      const code = promoInput.value.trim().toUpperCase();
      if (!code) {
        ZP.validation.showError(promoInput, 'Введіть промокод');
        promoInput.focus();
        return;
      }
      ZP.ui.busy(promoButton, true, 'Перевірка…');
      try {
        const promo = await ZP.api.get(`/api/promo/${encodeURIComponent(code)}`);
        ZP.validation.showError(promoInput, '');
        discount = promo.percent;
        promoCode = promo.code;
        promoInput.value = promo.code;
        promoInput.readOnly = true;
        ZP.ui.busy(promoButton, false);
        promoButton.textContent = 'Скасувати';
        renderSummary();
        ZP.ui.toast(`Промокод ${promo.code} застосовано: знижка ${discount}%`);
      } catch (error) {
        ZP.ui.busy(promoButton, false);
        ZP.validation.showError(promoInput, error.message);
      }
    });
    promoInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        promoButton.click();
      }
    });
    promoInput.addEventListener('input', () => ZP.validation.showError(promoInput, ''));

    /** Таймер резерву місця: 15 хвилин */
    const timer = qs('#reserve-timer');
    let secondsLeft = 15 * 60;
    const interval = setInterval(() => {
      secondsLeft -= 1;
      timer.textContent = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        qs('#reserve-note').className = 'callout callout--error';
        qs('#reserve-note').textContent = 'Час резервування минув. Оновіть сторінку, щоб зарезервувати місце знову.';
        payButton.disabled = true;
      }
    }, 1000);

    /** Демонстрація невдалої оплати (альтернативний сценарій US-04) */
    qs('#demo-fail').addEventListener('click', () => {
      payError.hidden = false;
      payError.textContent = 'Оплату не завершено: банк відхилив операцію (недостатньо коштів). Місце залишається зарезервованим — спробуйте ще раз або оберіть інший спосіб оплати.';
      payError.focus();
    });

    ZP.validation.attach(form, async (formEl, data) => {
      payError.hidden = true;
      ZP.ui.busy(payButton, true, 'Обробка платежу…');
      try {
        const booking = await ZP.api.post('/api/bookings', { ...order.body, promo: promoCode || undefined, method: data.get('pay') });
        clearInterval(interval);
        window.location.href = `success.html?id=${booking.id}`;
      } catch (error) {
        ZP.ui.busy(payButton, false);
        if (error.status === 401) { await ZP.api.requireUser(); return; }
        payError.hidden = false;
        payError.textContent = error.fields?.promo || error.fields?.slotAt || error.message;
        payError.focus();
      }
    });

    renderSummary();
  };
})(window.ZP);
