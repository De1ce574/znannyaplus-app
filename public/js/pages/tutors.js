/* Каталог репетиторів: фільтр за предметом і пошук за ім'ям */
'use strict';

(function (ZP) {
  const { qs, qsa, plural } = ZP.utils;

  ZP.pages = ZP.pages || {};
  ZP.pages.tutors = function () {
    const form = qs('#tutor-filter');
    const cards = qsa('.tutor-card');
    const count = qs('#tutor-count');
    const empty = qs('#tutor-empty');

    function apply() {
      const subject = new FormData(form).get('subj');
      const query = qs('#tutor-search').value.trim().toLowerCase();
      let visible = 0;
      cards.forEach((card) => {
        const show = (subject === 'all' || card.dataset.subject.split(' ').includes(subject))
          && (!query || card.dataset.name.toLowerCase().includes(query));
        card.hidden = !show;
        if (show) visible += 1;
      });
      count.textContent = `Показано ${visible} ${plural(visible, 'репетитора', 'репетиторів', 'репетиторів')} з ${cards.length}`;
      empty.hidden = visible !== 0;
    }

    form.addEventListener('change', apply);
    form.addEventListener('input', apply);
    form.addEventListener('submit', (event) => event.preventDefault());
    apply();
  };
})(window.ZP);
