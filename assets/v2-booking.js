/* V2 integration only. The shared booking controller owns the calendar and
   submission protocol; this keeps its presentation stable between bookings. */
(() => {
  'use strict';
  const app = document.querySelector('.v2-book [data-booking-app]');
  if (!app) return;
  const form = app.querySelector('[data-booking-form]');
  const submit = app.querySelector('[data-booking-submit]');
  const success = app.querySelector('[data-booking-success]');
  const weekNavigation = app.querySelector('.booking-week-nav');
  const days = app.querySelector('[data-booking-days]');
  const settings = app.querySelectorAll('.booking-choice-group');

  const sync = () => {
    // Changing duration after confirmation starts a fresh availability search.
    // The shared controller resets the success state but not the week controls.
    weekNavigation.hidden = !success.hidden;
    const pending = submit.disabled;
    settings.forEach(group => { group.disabled = pending; });
    days.inert = pending;
    weekNavigation.inert = pending;
    form.setAttribute('aria-busy', String(pending));
  };
  const observer = new MutationObserver(sync);
  observer.observe(success, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(submit, { attributes: true, attributeFilter: ['disabled'] });

  // A repeated Enter/requestSubmit while the response is pending must not
  // dispatch a second POST or reset the first request's timeout.
  form.addEventListener('submit', event => {
    if (!submit.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  sync();
})();
