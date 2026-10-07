/* V2's small shared controller. All page content is available without JavaScript. */
(() => {
  'use strict';
  document.body.classList.add('v2-ready');
  document.querySelectorAll('[data-v2-year]').forEach(node => { node.textContent = new Date().getFullYear(); });
  const menu = document.querySelector('[data-v2-menu]');
  const nav = document.querySelector('[data-v2-nav]');
  if (nav) {
    const links = [...nav.querySelectorAll('a')];
    const currentLink = links.find(link => link.pathname !== '/v2/' && location.pathname.startsWith(link.pathname) && link.origin === location.origin);
    if (currentLink) currentLink.setAttribute('aria-current', 'page');
    let hoverLink;
    const placeIndicator = link => {
      if (!link || !nav.getClientRects().length) { nav.style.setProperty('--nav-opacity', '0'); return; }
      const bounds = nav.getBoundingClientRect();
      const item = link.getBoundingClientRect();
      nav.style.setProperty('--nav-x', `${item.left - bounds.left}px`);
      nav.style.setProperty('--nav-width', String(item.width));
      nav.style.setProperty('--nav-opacity', '1');
    };
    nav.dataset.indicator = '';
    links.forEach(link => link.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hoverLink = link; placeIndicator(link);
    }));
    nav.addEventListener('pointerleave', () => { hoverLink = null; placeIndicator(nav.contains(document.activeElement) ? document.activeElement : currentLink); });
    nav.addEventListener('focusin', event => placeIndicator(event.target.closest('a')));
    nav.addEventListener('focusout', event => { if (!nav.contains(event.relatedTarget)) placeIndicator(hoverLink || currentLink); });
    new ResizeObserver(() => placeIndicator(currentLink)).observe(nav);
    placeIndicator(currentLink);
  }
  if (menu && nav) {
    const setOpen = open => {
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      nav.dataset.open = String(open);
    };
    menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setOpen(false); menu.focus(); }
    });
    document.addEventListener('click', event => { if (!event.target.closest('.v2-header')) setOpen(false); });
    matchMedia('(min-width:541px)').addEventListener('change', event => { if (event.matches) setOpen(false); });
  }
})();
