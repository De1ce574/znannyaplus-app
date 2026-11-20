/* ==========================================================================
   validation.js — клієнтська перевірка даних вебформ
   Правила задаються в розмітці: data-validate="required|email"
   Повідомлення виводяться під полем (aria-invalid + aria-describedby)
   та у зведенні над кнопкою надсилання (.form-alert).
   ========================================================================== */
'use strict';

(function (ZP) {
  const { qsa, el, plural, today } = ZP.utils;

  /** Назва поля з його <label> — для текстів помилок */
  function labelOf(field) {
    const label = field.id ? document.querySelector(`label[for="${field.id}"]`) : null;
    return (label ? label.textContent : field.name || 'поле').replace(/\s*\*$/, '').trim();
  }

  /**
   * Правила перевірки. Кожне повертає true або текст помилки.
   * Аргумент правила передається після двокрапки: minlen:8, match:password
   */
  const RULES = {
    required(value, field) {
      if (field.type === 'checkbox') return field.checked || 'Потрібно поставити позначку, щоб продовжити';
      if (field.tagName === 'SELECT') return value !== '' || `Оберіть значення у полі «${labelOf(field)}»`;
      return value.trim() !== '' || `Заповніть поле «${labelOf(field)}»`;
    },
    name: (value) => /^[A-Za-zА-ЩЬЮЯҐЄІЇа-щьюяґєії'’\- ]{2,40}$/.test(value.trim())
      || 'Ім’я має містити лише літери, від 2 до 40 символів',
    email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
      || 'Введіть e-mail у форматі name@example.com',
    phone: (value) => /^\+380\d{9}$/.test(value.replace(/[\s()-]/g, ''))
      || 'Введіть номер у форматі +380 XX XXX XX XX (12 цифр)',
    minlen: (value, field, n) => value.trim().length >= Number(n)
      || `Мінімум ${n} ${plural(Number(n), 'символ', 'символи', 'символів')} (зараз ${value.trim().length})`,
    password: (value) => (/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(value) && /\d/.test(value))
      || 'Пароль має містити щонайменше одну літеру та одну цифру',
    match(value, field, otherId) {
      const other = document.getElementById(otherId);
      return (other && value === other.value) || 'Паролі не збігаються';
    },
    integer: (value) => /^\d+$/.test(value.trim()) || 'Введіть ціле число без пробілів і літер',
    min: (value, field, n) => Number(value) >= Number(n) || `Значення має бути не менше ${n}`,
    max: (value, field, n) => Number(value) <= Number(n) || `Значення має бути не більше ${n}`,
    future: (value) => new Date(`${value}T00:00`) >= today() || 'Дата не може бути в минулому',
    timeRange(value, field, range) {
      const [from, to] = range.split('-');
      return (value >= from && value <= to) || `Оберіть час у межах ${from}–${to}`;
    },
  };

  /* ---- Показ / приховування повідомлення під полем ---- */
  function setDescribedBy(field, id, add) {
    const ids = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    if (add) ids.add(id); else ids.delete(id);
    if (ids.size) field.setAttribute('aria-describedby', [...ids].join(' '));
    else field.removeAttribute('aria-describedby');
  }

  function showError(field, message) {
    const wrapper = field.closest('.field') || field.parentElement;
    const errorId = `${field.id || field.name}-error`;
    let error = wrapper.querySelector('.field__error');
    if (message) {
      if (!error) {
        error = el('p', { class: 'field__error', id: errorId });
        wrapper.append(error);
      }
      error.textContent = message;
      field.setAttribute('aria-invalid', 'true');
      setDescribedBy(field, errorId, true);
      wrapper.classList.add('field--error');
    } else {
      if (error) error.remove();
      field.removeAttribute('aria-invalid');
      setDescribedBy(field, errorId, false);
      wrapper.classList.remove('field--error');
    }
  }

  /** Перевірка одного поля; повертає true, якщо поле коректне */
  function validateField(field) {
    const rules = (field.dataset.validate || '').split('|').filter(Boolean);
    const value = field.value || '';
    let message = '';

    for (const rule of rules) {
      // аргумент — усе після першої двокрапки (у timeRange:08:00-20:00 він сам містить «:»)
      const separator = rule.indexOf(':');
      const name = separator === -1 ? rule : rule.slice(0, separator);
      const arg = separator === -1 ? undefined : rule.slice(separator + 1);
      // необов'язкове порожнє поле перевіряти не потрібно
      if (name !== 'required' && field.type !== 'checkbox' && value.trim() === '') continue;
      const result = RULES[name](value, field, arg);
      if (result !== true) {
        message = result;
        break;
      }
    }
    // Додаткова перевірка, яку задає сторінка (наприклад, перетин розкладу)
    if (!message && typeof field.customCheck === 'function') {
      const result = field.customCheck(value);
      if (result !== true) message = result;
    }
    showError(field, message);
    return !message;
  }

  /**
   * Підключення перевірки до форми.
   * @param {HTMLFormElement} form
   * @param {(form: HTMLFormElement, data: FormData, submitter: HTMLElement) => void} onValid
   */
  function attach(form, onValid) {
    form.noValidate = true; // замість стандартних підказок браузера — власні повідомлення
    const fields = () => qsa('[data-validate]', form).filter((field) => !field.disabled && !field.closest('[hidden]'));
    const summary = form.querySelector('.form-alert');

    // Делегування подій: один обробник на всю форму
    form.addEventListener('focusout', (event) => {
      const field = event.target;
      if (field.matches('[data-validate]') && field.type !== 'checkbox' && field.value !== '') validateField(field);
    });
    form.addEventListener('input', (event) => {
      if (event.target.getAttribute('aria-invalid') === 'true') validateField(event.target);
    });
    form.addEventListener('change', (event) => {
      if (event.target.matches('[data-validate]') && (event.target.type === 'checkbox' || event.target.tagName === 'SELECT')) {
        validateField(event.target);
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const invalid = fields().filter((field) => !validateField(field));
      if (invalid.length) {
        if (summary) {
          summary.hidden = false;
          summary.textContent = `Перевірте форму: ${invalid.length} ${plural(invalid.length, 'помилка', 'помилки', 'помилок')}. Поля з помилками виділено червоним.`;
        }
        invalid[0].focus();
        return;
      }
      if (summary) summary.hidden = true;
      onValid(form, new FormData(form), event.submitter);
    });

    form.addEventListener('reset', () => {
      fields().forEach((field) => showError(field, ''));
      if (summary) summary.hidden = true;
    });
  }

  /** Автоформатування телефону: 0671234567 → +380 67 123 45 67 */
  function formatPhone(input) {
    input.addEventListener('input', () => {
      let digits = input.value.replace(/\D/g, '');
      if (!digits) {
        input.value = input.value.startsWith('+') ? '+' : '';
        return;
      }
      if (digits.startsWith('0')) digits = `38${digits}`;
      else if (!digits.startsWith('380') && !'380'.startsWith(digits)) digits = `380${digits}`;
      digits = digits.slice(0, 12);
      const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 8), digits.slice(8, 10), digits.slice(10, 12)].filter(Boolean);
      input.value = `+${parts.join(' ')}`;
    });
  }

  /**
   * Показ помилок, які повернув сервер (HTTP 422/409 з полем fields).
   * map — відповідність назв полів API ідентифікаторам елементів форми.
   */
  function showServerErrors(form, error, map = {}) {
    const fieldErrors = error.fields || {};
    let first = null;
    Object.entries(fieldErrors).forEach(([name, message]) => {
      const field = map[name] ? document.getElementById(map[name]) : form.querySelector(`[name="${name}"]`);
      if (field) {
        showError(field, message);
        first = first || field;
      }
    });
    const summary = form.querySelector('.form-alert');
    if (summary) {
      summary.hidden = false;
      summary.textContent = first ? `${error.message}. Виправте поля, виділені червоним.` : error.message;
    }
    if (first) first.focus();
    return Boolean(first);
  }

  ZP.validation = { attach, validateField, showError, showServerErrors, formatPhone, RULES };
})(window.ZP);
