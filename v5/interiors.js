/* Enhance the complete HTML archive with shareable, keyboard-friendly filters. */
(() => {
  'use strict';
  const form = document.querySelector('[data-filters]');
  if (!form) return;
  const query = form.elements.q;
  const discipline = form.elements.discipline;
  const entries = [...document.querySelectorAll('[data-project]')];
  const count = document.querySelector('[data-count]');
  const empty = document.querySelector('[data-empty]');
  let announceTimer;

  function readURL() {
    const params = new URL(location.href).searchParams;
    query.value = params.get('q') || '';
    const requested = params.get('discipline') || '';
    discipline.value = [...discipline.options].some(o => o.value === requested) ? requested : '';
  }

  function apply({ writeURL = true, immediate = false } = {}) {
    const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const category = discipline.value;
    let visible = 0;
    for (const entry of entries) {
      const matches = (!category || entry.dataset.category === category) && words.every(w => entry.dataset.search.includes(w));
      entry.hidden = !matches;
      if (matches) visible++;
    }
    empty.hidden = visible !== 0;
    clearTimeout(announceTimer);
    const announce = () => { count.textContent = `${visible} of ${entries.length} projects` + (category ? ` · ${category}` : ''); };
    if (immediate) announce(); else announceTimer = setTimeout(announce, 180);
    if (writeURL) {
      const url = new URL(location.href);
      query.value.trim() ? url.searchParams.set('q', query.value.trim()) : url.searchParams.delete('q');
      category ? url.searchParams.set('discipline', category) : url.searchParams.delete('discipline');
      // Keep unrelated URL parameters and the current fragment.
      try { history.replaceState(history.state, '', url); } catch (_) { /* Filtering remains usable if URL writes are restricted. */ }
    }
  }

  function reset() {
    query.value = '';
    discipline.value = '';
    apply({ immediate: true });
  }

  readURL();
  form.hidden = false;
  apply({ writeURL: false, immediate: true });
  form.addEventListener('submit', event => { event.preventDefault(); apply({ immediate: true }); });
  query.addEventListener('input', () => apply());
  discipline.addEventListener('change', () => apply({ immediate: true }));
  form.addEventListener('reset', event => { event.preventDefault(); reset(); });
  document.querySelector('[data-reset]').addEventListener('click', () => { reset(); query.focus(); });
  window.addEventListener('popstate', () => { readURL(); apply({ writeURL: false, immediate: true }); });
})();
