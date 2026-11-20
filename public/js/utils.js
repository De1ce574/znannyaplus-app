/* ==========================================================================
   utils.js — спільні допоміжні функції (простір імен ZP)
   Підключається першим; інші скрипти використовують ZP.utils.
   ========================================================================== */
'use strict';

window.ZP = window.ZP || {};

(function (ZP) {
  /** Пошук одного / кількох елементів у DOM */
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /**
   * Створення DOM-елемента: el('a', { class: 'btn', href: '#' }, ['Текст'])
   * props: class, text, dataset, on<подія> (обробник) або звичайні атрибути
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children).forEach((child) => {
      if (child === null || child === undefined) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  /** 1800 → «1 800 грн» */
  const formatPrice = (value) => `${Math.round(value).toLocaleString('uk-UA')} грн`;

  /** Українські форми множини: plural(3, 'курс', 'курси', 'курсів') → «курси» */
  function plural(n, one, few, many) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  const DAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

  /** Date → «Чт, 27 листопада» */
  const formatDate = (date) => `${DAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`;
  /** Date → «16:00» */
  const formatTime = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  /** Date → «2026-11-27» (для атрибута datetime та полів type="date") */
  const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  /** Початок поточного дня */
  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Безпечна робота з sessionStorage (може бути недоступним у приватному режимі) */
  const storage = {
    get(key, fallback = null) {
      try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        /* сховище недоступне — дані живуть лише до перезавантаження */
      }
    },
    remove(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        /* ігноруємо */
      }
    },
  };

  /** Затримка виклику функції (для полів пошуку) */
  function debounce(fn, ms = 200) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /** Параметри адресного рядка: ?id=math-nmt */
  const params = () => new URLSearchParams(window.location.search);

  ZP.utils = { qs, qsa, el, formatPrice, plural, formatDate, formatTime, isoDate, today, storage, debounce, params, DAYS_SHORT, MONTHS_GEN };
})(window.ZP);
