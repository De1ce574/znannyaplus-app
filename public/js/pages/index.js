/* Головна сторінка: популярні курси з даних, лічильники, форма консультації */
'use strict';

(function (ZP) {
  const { qs, qsa, el } = ZP.utils;

  /** Анімація чисел у блоці статистики, коли він потрапляє в зону видимості */
  function animateStats() {
    const items = qsa('[data-count]');
    if (!items.length || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const node = entry.target;
        const target = Number(node.dataset.count);
        const suffix = node.dataset.suffix || '';
        const decimals = target % 1 ? 1 : 0;
        const startTime = performance.now();
        const step = (now) => {
          const progress = Math.min((now - startTime) / 900, 1);
          const value = (target * progress).toFixed(decimals).replace('.', ',');
          node.textContent = `${Number(decimals) ? value : Number(value).toLocaleString('uk-UA')}${suffix}`;
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        observer.unobserve(node);
      });
    }, { threshold: 0.6 });
    items.forEach((item) => observer.observe(item));
  }

  /** Форма безкоштовної консультації (FR-14): POST /api/consultations */
  function initConsultation() {
    const form = qs('#consultation-form');
    if (!form) return;
    ZP.validation.formatPhone(qs('#c-phone'));

    ZP.validation.attach(form, async (formEl, data, submitter) => {
      ZP.ui.busy(submitter, true, 'Надсилаємо…');
      try {
        const saved = await ZP.api.post('/api/consultations', {
          name: data.get('name'), phone: data.get('phone'), subject: data.get('subject'),
        });
        const success = el('div', { class: 'card stack consultation-done', tabindex: '-1' }, [
          el('p', { class: 'callout callout--success', text: `Дякуємо, ${saved.name}! Заявку № ${saved.id} прийнято.` }),
          el('p', { class: 't-body-s', text: `Адміністратор зателефонує на номер ${data.get('phone')} протягом робочого дня, щоб підібрати курс (${saved.subject}).` }),
          el('button', { class: 'btn btn--outline', type: 'button', text: 'Надіслати ще одну заявку' }),
        ]);
        success.querySelector('button').addEventListener('click', () => {
          formEl.reset();
          success.replaceWith(formEl);
          qs('#c-name').focus();
        });
        formEl.replaceWith(success);
        success.focus();
        ZP.ui.toast('Заявку на консультацію надіслано');
      } catch (error) {
        ZP.validation.showServerErrors(formEl, error, { name: 'c-name', phone: 'c-phone', subject: 'c-subject' });
      } finally {
        ZP.ui.busy(submitter, false);
      }
    });
  }

  /** Популярні курси: GET /api/courses?sort=popular&limit=4 */
  async function loadPopular() {
    const list = qs('#popular-list');
    if (!list) return;
    list.replaceChildren(ZP.ui.statusBlock('Завантаження курсів…'));
    try {
      const courses = await ZP.api.get('/api/courses?sort=popular&limit=4');
      list.replaceChildren(...courses.map((course) => ZP.render.courseCard(course)));
    } catch (error) {
      list.replaceChildren(ZP.ui.statusBlock(error.message, { error: true, retry: loadPopular }));
    }
  }

  ZP.pages = ZP.pages || {};
  ZP.pages.index = function () {
    loadPopular();
    animateStats();
    initConsultation();
  };
})(window.ZP);
