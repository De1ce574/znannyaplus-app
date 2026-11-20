/* Вхід / реєстрація (FR-04): POST /api/auth/login і /api/auth/register.
   Сесія — HttpOnly-cookie, яку встановлює сервер; у браузері пароль не зберігається. */
'use strict';

(function (ZP) {
  const { qs, qsa, params } = ZP.utils;

  /** Безпечна адреса повернення: лише відносний шлях цього сайту (захист від open redirect) */
  function safeNext(value) {
    if (!value || !/^[a-z0-9-]+\.html([?#][^\s]*)?$/i.test(value)) return null;
    return value;
  }

  ZP.pages = ZP.pages || {};
  ZP.pages.login = async function () {
    const form = qs('#auth-form');
    const title = qs('#auth-title');
    const submit = qs('#auth-submit');
    const switchText = qs('#auth-switch-text');
    const switchButton = qs('#auth-switch');
    const formError = qs('#auth-error');
    const registerOnly = qsa('[data-register-only]');
    const next = safeNext(params().get('next'));
    let mode = 'login';

    if (params().get('denied')) {
      formError.hidden = false;
      formError.textContent = 'Ця сторінка доступна лише адміністратору. Увійдіть під обліковим записом з відповідними правами.';
    } else if (next) {
      ZP.ui.toast('Увійдіть, щоб продовжити');
    }

    // Уже автентифікований користувач одразу переходить далі
    const current = await ZP.api.me().catch(() => null);
    if (current && !params().get('denied')) {
      window.location.replace(next || (current.role === 'admin' ? 'admin-group.html' : 'cabinet.html'));
      return;
    }

    /** Динамічна зміна вмісту форми: «Вхід» ↔ «Реєстрація» */
    function setMode(newMode) {
      mode = newMode;
      const register = mode === 'register';
      registerOnly.forEach((block) => { block.hidden = !register; });
      title.textContent = register ? 'Реєстрація' : 'Вхід';
      submit.textContent = register ? 'Зареєструватися' : 'Увійти';
      switchText.textContent = register ? 'Вже маєте акаунт?' : 'Немає акаунта?';
      switchButton.textContent = register ? 'Увійти' : 'Зареєструватися';
      qs('#password').autocomplete = register ? 'new-password' : 'current-password';
      formError.hidden = true;
      form.reset();
    }
    switchButton.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
    if (window.location.hash === '#register') setMode('register');

    qs('#toggle-password').addEventListener('click', (event) => {
      const input = qs('#password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      event.currentTarget.textContent = show ? 'Сховати' : 'Показати';
      event.currentTarget.setAttribute('aria-pressed', String(show));
    });

    // Демо-вхід: заповнює дані тестового студента (для перевірки викладачем)
    qs('#demo-login').addEventListener('click', () => {
      setMode('login');
      qs('#email').value = 'ivan.petrenko@gmail.com';
      qs('#password').value = 'znannya2026';
      form.requestSubmit();
    });

    ZP.validation.attach(form, async (formEl, data) => {
      formError.hidden = true;
      const register = mode === 'register';
      const body = { email: data.get('email').trim(), password: data.get('password') };
      if (register) body.name = data.get('name').trim();
      ZP.ui.busy(submit, true, register ? 'Створення акаунта…' : 'Вхід…');
      try {
        const user = await ZP.api.post(register ? '/api/auth/register' : '/api/auth/login', body);
        ZP.ui.toast(register ? `Акаунт створено. Вітаємо, ${user.name}!` : `Вітаємо, ${user.name}!`);
        setTimeout(() => {
          window.location.href = next || (user.role === 'admin' ? 'admin-group.html' : 'cabinet.html');
        }, 500);
      } catch (error) {
        ZP.ui.busy(submit, false);
        if (error.status === 422) {
          ZP.validation.showServerErrors(formEl, error, { name: 'name', email: 'email', password: 'password' });
        } else if (error.status === 409) {
          ZP.validation.showError(qs('#email'), error.message);
          qs('#email').focus();
        } else {
          formError.hidden = false;
          formError.textContent = error.message;
          formError.focus();
        }
      }
    });
  };
})(window.ZP);
