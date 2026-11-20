/* Налаштування: сповіщення, підключення Telegram, запрошення для батьків (FR-08, FR-10, US-05).
   Сторінка доступна лише після входу; вподобання інтерфейсу зберігаються локально в браузері. */
'use strict';

(function (ZP) {
  const { qs, qsa, el, storage } = ZP.utils;

  ZP.pages = ZP.pages || {};
  ZP.pages.settings = async function () {
    const user = await ZP.api.requireUser();
    if (!user) return;

    // 1. Перемикачі сповіщень — стан зберігається
    const prefs = storage.get('zp-prefs', {});
    const switches = qsa('#notifications input[type="checkbox"]');
    switches.forEach((input) => { if (input.name in prefs) input.checked = prefs[input.name]; });
    qs('#notifications').addEventListener('change', (event) => {
      const input = event.target;
      prefs[input.name] = input.checked;
      storage.set('zp-prefs', prefs);
      const label = input.closest('label').textContent.trim();
      ZP.ui.toast(`${label}: ${input.checked ? 'увімкнено' : 'вимкнено'}`, 'info', 2500);
    });

    // 2. Telegram: кнопка змінює стан і вміст блоку
    const tgButton = qs('#tg-button');
    const tgStatus = qs('#tg-status');
    function renderTelegram(connected) {
      tgStatus.replaceChildren(connected
        ? el('span', { class: 'badge badge--green', text: 'Підключено: @ivan_p' })
        : el('span', { class: 'badge badge--gray', text: 'Не підключено' }));
      tgButton.textContent = connected ? 'Відключити Telegram' : 'Підключити Telegram';
      tgButton.className = connected ? 'btn btn--outline btn--lg' : 'btn btn--solid btn--lg';
      qsa('[data-needs-telegram]').forEach((input) => { input.disabled = !connected; });
    }
    let connected = storage.get('zp-telegram', false);
    renderTelegram(connected);
    tgButton.addEventListener('click', () => {
      connected = !connected;
      storage.set('zp-telegram', connected);
      renderTelegram(connected);
      ZP.ui.toast(connected ? 'Telegram підключено: нагадування надходитимуть у @znannyaplus_bot' : 'Telegram відключено', connected ? 'success' : 'info');
    });

    // 3. Запрошення для батьків: перевірка e-mail і власна умова
    const invites = qs('#invites');
    const emailInput = qs('#parent-email');
    const own = user.email; // власний e-mail — з GET /api/auth/me
    emailInput.customCheck = (value) => {
      if (value.trim().toLowerCase() === own.toLowerCase()) return 'Вкажіть e-mail батьків, а не власний';
      if (qsa('li', invites).some((li) => li.dataset.email === value.trim().toLowerCase())) return 'Запрошення на цю адресу вже надіслано';
      return true;
    };
    ZP.validation.attach(qs('#invite-form'), (form, data) => {
      const email = data.get('email').trim().toLowerCase();
      invites.append(el('li', { class: 'row', dataset: { email } }, [el('span', { class: 't-body-s', text: email }), el('span', { class: 'badge badge--amber', text: 'Очікує підтвердження' })]));
      invites.hidden = false;
      form.reset();
      ZP.ui.toast(`Запрошення надіслано на ${email}`);
    });
  };
})(window.ZP);
