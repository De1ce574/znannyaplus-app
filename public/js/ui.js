/* ==========================================================================
   ui.js — спільні інтерактивні компоненти:
   навігація (меню, активний пункт, якорі), повідомлення (toast),
   модальні вікна (<dialog>), вкладки, акордеон, кнопка «Нагору»
   ========================================================================== */
'use strict';

(function (ZP) {
  const { qs, qsa, el } = ZP.utils;

  /* ---------------- Шапка та головне меню ---------------- */
  function initHeader() {
    const header = qs('.site-header');
    if (!header) return;
    const button = qs('.menu-button', header);
    const buttonText = qs('.visually-hidden', button);

    const setOpen = (open) => {
      header.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      buttonText.textContent = open ? 'Закрити меню' : 'Відкрити меню';
    };

    button.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));

    // Закриття меню: клавіша Esc, клік поза шапкою, вибір пункту (делегування)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        button.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (header.classList.contains('is-open') && !header.contains(event.target)) setOpen(false);
    });
    header.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });

    // Активний пункт меню визначається розділом сторінки (data-section у <body>)
    const section = document.body.dataset.section;
    qsa('.main-nav__link', header).forEach((link) => {
      if (section && link.getAttribute('href') === section) link.setAttribute('aria-current', 'page');
    });

    // Тінь шапки під час прокручування
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Стан входу береться із сервера (GET /api/auth/me): замінюємо «Увійти / Реєстрація»
    const actions = qs('.site-header__actions', header);
    ZP.api.me().then((user) => {
      if (!user || !actions) return;
      const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
      const cabinet = user.role === 'admin' ? 'admin-group.html' : 'cabinet.html';
      // Ім'я, ініціали й роль у бічному меню кабінетів (data-me="…")
      qsa('[data-me="name"]').forEach((node) => { node.textContent = user.name; });
      qsa('[data-me="initials"]').forEach((node) => { node.textContent = initials; });
      qsa('[data-me="role"]').forEach((node) => { node.textContent = user.role === 'admin' ? 'Адміністратор' : 'Учень'; });
      actions.replaceChildren(
        el('a', { class: 'btn btn--ghost', href: cabinet, text: user.role === 'admin' ? 'Адмін-панель' : 'Мій кабінет' }),
        el('a', { class: 'avatar avatar--s', href: cabinet, 'aria-label': `Профіль: ${user.name}`, title: user.name, text: initials })
      );
    }).catch(() => { /* сервер недоступний — шапка лишається в стані гостя */ });
  }

  /* ---------------- Плавна прокрутка до якорів ---------------- */
  function initAnchors() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href*="#"]');
      if (!link) return;
      const url = new URL(link.href);
      if (url.pathname !== window.location.pathname || url.hash.length < 2) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.replaceState(null, '', url.hash);
    });
  }

  /* ---------------- Кнопка «Нагору» ---------------- */
  function initScrollTop() {
    const button = el('button', { class: 'scroll-top', type: 'button', 'aria-label': 'Повернутися нагору', hidden: true, text: '↑' });
    document.body.append(button);
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => { button.hidden = window.scrollY < 600; }, { passive: true });
  }

  /* ---------------- Toast-повідомлення ---------------- */
  let toastRegion = null;

  /**
   * Показ короткого повідомлення.
   * @param {string} message текст
   * @param {'success'|'error'|'info'} type тип (колір)
   * @param {number} duration тривалість показу, мс
   */
  function toast(message, type = 'success', duration = 4000) {
    if (!toastRegion) {
      toastRegion = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(toastRegion);
    }
    const close = el('button', { class: 'toast__close', type: 'button', 'aria-label': 'Закрити повідомлення', text: '×' });
    const item = el('div', { class: `toast callout callout--${type}` }, [el('span', { class: 'toast__text', text: message }), close]);
    toastRegion.append(item);

    const remove = () => {
      item.classList.add('is-leaving');
      setTimeout(() => item.remove(), 200);
    };
    close.addEventListener('click', remove);
    setTimeout(remove, duration);
  }

  /* ---------------- Модальні вікна ---------------- */
  function openModal(dialog, opener) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.addEventListener('close', () => {
      if (opener && document.contains(opener)) opener.focus();
    }, { once: true });
  }

  function initModals() {
    // Делегування: будь-який елемент з data-modal-open / data-modal-close
    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-modal-open]');
      if (opener) {
        event.preventDefault();
        openModal(document.getElementById(opener.dataset.modalOpen), opener);
        return;
      }
      const closer = event.target.closest('[data-modal-close]');
      if (closer) closer.closest('dialog').close();
    });
    // Клік по затемненому фону закриває вікно
    qsa('dialog.modal').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  /* ---------------- Вкладки (role="tablist") ---------------- */
  function initTabs() {
    qsa('[data-tabs]').forEach((tablist) => {
      const tabs = qsa('[role="tab"]', tablist);
      const activate = (tab) => {
        tabs.forEach((item) => {
          const selected = item === tab;
          item.setAttribute('aria-selected', String(selected));
          item.tabIndex = selected ? 0 : -1;
          document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
        });
      };
      tablist.addEventListener('click', (event) => {
        const tab = event.target.closest('[role="tab"]');
        if (tab) activate(tab);
      });
      // Навігація стрілками ← →
      tablist.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(document.activeElement);
        if (index < 0) return;
        let next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (next) {
          event.preventDefault();
          next.focus();
          activate(next);
        }
      });
    });
  }

  /* ---------------- Акордеон ---------------- */
  function initAccordions() {
    qsa('[data-accordion]').forEach((accordion) => {
      accordion.addEventListener('click', (event) => {
        const button = event.target.closest('.accordion__button');
        if (!button) return;
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        panel.hidden = expanded;
      });
    });
  }

  /* ---------------- Вихід з акаунта (посилання «Вийти» в меню кабінетів) ---------------- */
  function initLogout() {
    document.addEventListener('click', async (event) => {
      const link = event.target.closest('#logout');
      if (!link) return;
      event.preventDefault();
      try {
        await ZP.api.post('/api/auth/logout');
      } finally {
        window.location.href = 'index.html';
      }
    });
  }

  function init() {
    initHeader();
    initLogout();
    initAnchors();
    initScrollTop();
    initModals();
    initTabs();
    initAccordions();
  }

  /** Стан очікування відповіді сервера для кнопки */
  function busy(button, isBusy, text = 'Зачекайте…') {
    if (!button) return;
    if (isBusy) {
      button.dataset.label = button.textContent;
      button.textContent = text;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      if (button.dataset.label) button.textContent = button.dataset.label;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  /** Блок «завантаження / помилка» замість списку */
  function statusBlock(message, { error = false, retry, tag = 'div' } = {}) {
    const block = el(tag, { class: `load-state${error ? ' load-state--error' : ''}`, role: error ? 'alert' : 'status' }, [el('p', { text: message })]);
    if (retry) block.append(el('button', { class: 'btn btn--outline', type: 'button', text: 'Спробувати ще раз', onclick: retry }));
    return block;
  }

  ZP.ui = { init, toast, openModal, initAccordions, busy, statusBlock };
})(window.ZP);
