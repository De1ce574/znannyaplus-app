/* ==========================================================================
   main.js — точка входу: ініціалізує спільні компоненти й сценарій сторінки.
   Назва сценарію береться з атрибута <body data-page="...">.
   ========================================================================== */
'use strict';

(function (ZP) {
  ZP.ui.init();
  const page = document.body.dataset.page;
  if (ZP.pages && typeof ZP.pages[page] === 'function') ZP.pages[page]();
})(window.ZP);
