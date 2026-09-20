/* Independent enhancement for the v2 editorial pages. All content and category
   anchor links remain usable when JavaScript is unavailable. */
(() => {
  'use strict';
  const sectionLinks = [...document.querySelectorAll('[data-v2-section]')];
  const sections = sectionLinks.map(link => ({link, target: document.getElementById(new URL(link.href).hash.slice(1))})).filter(item => item.target);
  const progress = document.querySelector('[data-v2-progress]');
  if (sections.length) {
    let queued = false;
    const sync = () => {
      queued = false;
      const marker = (document.querySelector('.v2-header')?.offsetHeight || 0) + (document.querySelector('.v2-case-nav')?.offsetHeight || 0) + 48;
      let active = sections[0];
      sections.forEach(item => { if (item.target.getBoundingClientRect().top <= marker) active = item; });
      sections.forEach(item => item === active ? item.link.setAttribute('aria-current', 'location') : item.link.removeAttribute('aria-current'));
      if (progress) {
        const scrollable = document.documentElement.scrollHeight - innerHeight;
        progress.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, Math.max(0, scrollY / scrollable)) : 1})`;
      }
    };
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(sync); } };
    addEventListener('scroll', request, {passive: true});
    addEventListener('resize', request);
    addEventListener('load', sync, {once: true});
    sync();
  }

  const search = document.querySelector('[data-v2-search]');
  if (search) {
    const groups = [...document.querySelectorAll('[data-v2-project-group]')];
    const categories = [...document.querySelectorAll('[data-v2-category]')];
    const status = document.querySelector('[data-v2-search-status]');
    const controls = document.querySelector('.v2-collection-controls');
    const params = new URLSearchParams(location.search);
    let category = params.get('category') || 'all';
    if (!categories.some(link => link.dataset.v2Category === category)) category = 'all';
    search.value = params.get('q') || '';
    document.querySelector('[data-v2-search-wrap]').hidden = false;
    const apply = (updateURL = false) => {
      const query = search.value.trim().toLocaleLowerCase();
      let total = 0;
      let relatedTools = 0;
      groups.forEach(group => {
        let visible = 0;
        group.querySelectorAll('[data-v2-project]').forEach(card => {
          const matches = (category === 'all' || category === group.dataset.v2ProjectGroup) && (!query || card.textContent.toLocaleLowerCase().includes(query));
          card.hidden = !matches;
          if (matches) {
            visible++;
            // Flight Review is a tool within Skylabs, not an additional project.
            if (!card.closest('.v2-related-tool')) total++;
            else relatedTools++;
          }
        });
        group.hidden = !visible;
      });
      categories.forEach(link => link.dataset.v2Category === category ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current'));
      status.hidden = !query && category === 'all';
      const resultParts = [];
      if (total) resultParts.push(`${total} ${total === 1 ? 'project' : 'projects'}`);
      if (relatedTools) resultParts.push(`${relatedTools} related ${relatedTools === 1 ? 'tool' : 'tools'}`);
      status.textContent = resultParts.length ? `${resultParts.join(' and ')}${query ? ` matching “${search.value.trim()}”` : ''}.` : 'No projects match. Try another term or choose All work.';
      if (updateURL) {
        const url = new URL(location.href);
        query ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q');
        category === 'all' ? url.searchParams.delete('category') : url.searchParams.set('category', category);
        history.replaceState(null, '', url.pathname + url.search);
      }
    };
    categories.forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      category = link.dataset.v2Category;
      apply(true);
      const headerHeight = document.querySelector('.v2-header')?.offsetHeight || 0;
      if (controls.getBoundingClientRect().top < headerHeight) scrollTo({top: controls.offsetTop - headerHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }));
    search.addEventListener('input', () => apply(true));
    search.addEventListener('keydown', event => { if (event.key === 'Escape') { search.value = ''; apply(true); } });
    addEventListener('popstate', () => {
      const current = new URLSearchParams(location.search);
      category = current.get('category') || 'all';
      search.value = current.get('q') || '';
      apply();
    });
    apply();
  }
  // The existing Skylabs viewer changes the per-board project link dynamically.
  // Keep that link inside the new portfolio without changing the shared viewer.
  const boardLink = document.querySelector('[data-object-project-link]');
  if (boardLink) {
    const keepV2 = () => {
      const href = boardLink.getAttribute('href');
      if (/^\/?projects\//.test(href || '')) boardLink.setAttribute('href', '/v2/' + href.replace(/^\//, ''));
    };
    keepV2();
    new MutationObserver(keepV2).observe(boardLink, {attributes: true, attributeFilter: ['href']});
  }
})();
