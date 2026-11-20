/* Успішна оплата: деталі запису з GET /api/bookings/:id, завантаження квитанції */
'use strict';

(function (ZP) {
  const { qs, el, formatPrice, formatDate, params } = ZP.utils;
  const METHODS = { card: 'Банківська картка', apple: 'Apple Pay', google: 'Google Pay' };

  ZP.pages = ZP.pages || {};
  ZP.pages.success = async function () {
    const user = await ZP.api.requireUser();
    if (!user) return;
    const details = qs('#paid-details');
    let booking;
    try {
      booking = await ZP.api.get(`/api/bookings/${encodeURIComponent(params().get('id') || '0')}`);
    } catch (error) {
      details.replaceChildren(ZP.ui.statusBlock(error.status === 404 ? 'Запис не знайдено. Перегляньте свої записи в особистому кабінеті.' : error.message, { error: true }));
      qs('#receipt').hidden = true;
      return;
    }

    const receiptNo = `ZP-${String(booking.id).padStart(6, '0')}`;
    const when = new Date(booking.slotAt);
    const rows = [
      ['Послуга', booking.title],
      [booking.kind === 'group' ? 'Перше заняття' : 'Дата й час', `${formatDate(when)}, ${when.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`],
      ['Спосіб оплати', METHODS[booking.method]],
      ...(booking.promo ? [['Промокод', booking.promo]] : []),
      ['Сплачено', formatPrice(booking.total)],
      ['№ квитанції', receiptNo],
    ];
    qs('#paid-email').textContent = user.email;
    details.replaceChildren(...rows.map(([term, value]) => el('div', { class: 'summary-line' }, [el('dt', { text: term }), el('dd', { text: value })])));

    // Квитанція формується в браузері та завантажується як текстовий файл
    qs('#receipt').addEventListener('click', () => {
      const lines = ['ЗнанняПлюс — квитанція про оплату', `№ ${receiptNo}`, `Дата оплати: ${new Date(`${booking.createdAt.replace(' ', 'T')}Z`).toLocaleString('uk-UA')}`,
        `Платник: ${user.name} (${user.email})`, ...rows.map(([t, v]) => `${t}: ${v}`)];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const link = el('a', { href: URL.createObjectURL(blob), download: `kvytantsiia-${receiptNo}.txt` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      ZP.ui.toast('Квитанцію завантажено');
    });
  };
})(window.ZP);
