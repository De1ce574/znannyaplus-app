/* Каталог курсів: фільтрація на сервері через GET /api/courses (US-01) */
'use strict';

(function (ZP) {
  const { qs, qsa, plural, params, debounce } = ZP.utils;

  ZP.pages = ZP.pages || {};
  ZP.pages.catalog = function () {
    const form = qs('#filters');
    const list = qs('#course-list');
    const count = qs('#results-count');
    const empty = qs('#empty-state');
    const toggle = qs('.filters-button');
    const sort = qs('#sort');
    const from = qs('#p-from');
    const to = qs('#p-to');
    let controller = null; // для скасування застарілого запиту

    // 1. Початковий стан фільтрів — з адресного рядка
    const urlParams = params();
    qsa('input, select', form).forEach((field) => {
      const values = urlParams.getAll(field.name);
      if (!values.length) return;
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = values.includes(field.value);
      else field.value = values[0];
    });
    if (urlParams.get('sort')) sort.value = urlParams.get('sort');

    function priceValid() {
      const ok = from.value === '' || to.value === '' || Number(from.value) <= Number(to.value);
      ZP.validation.showError(to, ok ? '' : 'Значення «До» має бути не менше, ніж «Від»');
      return ok;
    }

    /** Параметри форми → рядок запиту (однакові для адреси сторінки й API) */
    function buildQuery() {
      const query = new URLSearchParams();
      new FormData(form).forEach((value, key) => {
        if (value !== '' && !(key === 'format' && value === 'all')) query.append(key, value);
      });
      if (sort.value !== 'popular') query.set('sort', sort.value);
      return query;
    }

    /** Запит до API та перебудова списку (async/await + AbortController) */
    async function render() {
      if (!priceValid()) return;
      const query = buildQuery();
      const apiQuery = new URLSearchParams(query);
      if (apiQuery.has('from')) { apiQuery.set('min', apiQuery.get('from')); apiQuery.delete('from'); }
      if (apiQuery.has('to')) { apiQuery.set('max', apiQuery.get('to')); apiQuery.delete('to'); }
      apiQuery.set('sort', sort.value);

      if (controller) controller.abort(); // попередній запит більше не потрібен
      controller = new AbortController();
      list.setAttribute('aria-busy', 'true');
      count.textContent = 'Пошук курсів…';
      try {
        const courses = await ZP.api.get(`/api/courses?${apiQuery}`, { signal: controller.signal });
        list.replaceChildren(...courses.map((course) => ZP.render.courseCard(course)));
        list.hidden = courses.length === 0;
        empty.hidden = courses.length !== 0;
        count.textContent = `Знайдено ${courses.length} ${plural(courses.length, 'курс', 'курси', 'курсів')}`;
      } catch (error) {
        if (error.name === 'AbortError') return;
        list.hidden = false;
        empty.hidden = true;
        list.replaceChildren(ZP.ui.statusBlock(error.message, { error: true, retry: render, tag: 'li' }));
        count.textContent = 'Не вдалося завантажити курси';
      } finally {
        list.removeAttribute('aria-busy');
      }

      const active = ['q', 'subject', 'format', 'level', 'age'].filter((k) => query.has(k)).length + (query.has('from') || query.has('to') ? 1 : 0);
      toggle.textContent = active ? `Фільтри (${active})` : 'Фільтри';
      const text = query.toString();
      history.replaceState(null, '', text ? `?${text}` : window.location.pathname);
    }

    form.addEventListener('change', render);
    form.addEventListener('input', debounce((event) => {
      if (event.target.matches('input[type="search"], input[type="number"]')) render();
    }, 350));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      render();
      if (window.matchMedia('(max-width: 767px)').matches) setPanel(false);
    });
    form.addEventListener('reset', () => setTimeout(render, 0));
    sort.addEventListener('change', render);
    qs('#empty-reset').addEventListener('click', () => form.reset());

    function setPanel(open) {
      form.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }
    toggle.addEventListener('click', () => setPanel(!form.classList.contains('is-open')));

    render();
  };
})(window.ZP);
