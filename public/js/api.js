/* ==========================================================================
   api.js — клієнт REST API (Fetch API + async/await)
   Усі запити до сервера проходять через ZP.api.request(): тут додаються
   заголовки, розбирається JSON і обробляються помилки мережі та сервера.
   ========================================================================== */
'use strict';

(function (ZP) {
  /** Помилка API з HTTP-статусом і помилками окремих полів (422) */
  class ApiError extends Error {
    constructor(message, status, fields = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.fields = fields;
    }
  }

  /**
   * Базовий запит.
   * @param {string} method HTTP-метод
   * @param {string} url шлях, наприклад '/api/courses'
   * @param {object} [body] тіло запиту (буде перетворено на JSON)
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<any>} розібраний JSON або null (204 No Content)
   */
  async function request(method, url, body, { signal } = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'ZP' }; // заголовок захисту від CSRF
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(url, {
        method, headers, signal, credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error; // запит скасовано новішим — це не помилка
      throw new ApiError('Немає зв’язку із сервером. Перевірте підключення до інтернету та спробуйте ще раз.', 0);
    }

    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(data?.error || `Помилка сервера (${response.status})`, response.status, data?.fields);
    }
    return data;
  }

  let mePromise = null;

  ZP.api = {
    ApiError,
    request,
    get: (url, options) => request('GET', url, undefined, options),
    post: (url, body) => request('POST', url, body ?? {}),
    put: (url, body) => request('PUT', url, body),
    patch: (url, body) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),

    /** Поточний користувач або null (результат кешується на сторінці) */
    me(refresh = false) {
      if (!mePromise || refresh) {
        mePromise = request('GET', '/api/auth/session').then((data) => data.user);
      }
      return mePromise;
    },

    /**
     * Сторінка лише для користувачів, що увійшли: інакше — перехід на вхід
     * з поверненням на цю сторінку після автентифікації.
     */
    async requireUser(role) {
      const user = await this.me();
      if (!user || (role && user.role !== role)) {
        const next = encodeURIComponent(window.location.pathname.replace(/^\//, '') + window.location.search);
        window.location.href = `login.html?next=${next}${user ? '&denied=1' : ''}`;
        return null;
      }
      return user;
    },
  };
})(window.ZP);
