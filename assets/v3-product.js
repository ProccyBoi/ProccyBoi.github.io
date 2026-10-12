/* Independent v3 presentation. Shared v2 navigation is deliberately not loaded. */
(() => {
  'use strict';
  const body = document.body;
  if (!body.matches('.v2.v3-product')) return;
  body.classList.add('v3-product-ready', 'v2-ready');
  document.querySelectorAll('[data-v2-year], [data-current-year]').forEach(node => { node.textContent = new Date().getFullYear(); });
  const compact = matchMedia('(max-width:1024px), (pointer:coarse)');
  const menu = document.querySelector('[data-v3-menu]');
  const nav = document.querySelector('[data-v3-nav]');
  const quick = document.querySelector('.v3-quick-projects');
  const route = () => {
    if (!nav) return;
    [...nav.querySelectorAll('a')].forEach(link => {
      const local = link.origin === location.origin;
      const current = local && (link.hash ? location.pathname === link.pathname && location.hash === link.hash : location.pathname.startsWith(link.pathname) && !(link.pathname === '/v3/about/' && location.hash === '#contact'));
      current ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    });
    if (quick) location.pathname.startsWith('/v3/projects/') ? quick.setAttribute('aria-current', 'page') : quick.removeAttribute('aria-current');
  };
  if (menu && nav) {
    const setOpen = (open, recover = false) => {
      open = compact.matches && open;
      if (!open && recover && compact.matches && nav.contains(document.activeElement)) menu.focus({preventScroll:true});
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      nav.dataset.open = String(open);
      nav.inert = compact.matches && !open;
    };
    menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setOpen(false, true); menu.focus({preventScroll:true}); } });
    document.addEventListener('click', event => { if (!event.target.closest('.v2-header')) setOpen(false); });
    document.addEventListener('focusin', event => { if (!event.target.closest('.v2-header')) setOpen(false); });
    compact.addEventListener('change', () => {
      const menuFocused = document.activeElement === menu;
      setOpen(false, true);
      if (!compact.matches && (menuFocused || document.activeElement === menu)) nav.querySelector('a')?.focus({preventScroll:true});
    });
    addEventListener('pageshow', () => setOpen(false, true));
    setOpen(false);
  }
  route(); addEventListener('hashchange', route);

  // A compact case navigator uses the same real anchors as the desktop links.
  // It lives in the introduction, never as a second sticky touch toolbar.
  const caseNav = document.querySelector('.v2-case-nav');
  const links = [...document.querySelectorAll('[data-v2-section]')];
  const intro = document.querySelector('.project-hero');
  if (caseNav && links.length && intro) {
    const label = document.createElement('label');
    label.className = 'v3-product-section-control';
    const text = document.createElement('span'); text.textContent = 'On this page';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'On this page');
    links.forEach(link => { const option = document.createElement('option'); option.value = new URL(link.href).hash; option.textContent = link.textContent.trim(); select.append(option); });
    label.append(text, select); intro.append(label);
    const sync = () => {
      if (document.activeElement === select) return;
      select.value = links.find(link => link.hasAttribute('aria-current')) ? new URL(links.find(link => link.hasAttribute('aria-current')).href).hash : select.options[0].value;
    };
    const layout = () => {
      const hide = compact.matches;
      label.hidden = !hide;
      if (hide && caseNav.contains(document.activeElement)) select.focus({preventScroll:true});
      if (!hide && document.activeElement === select) (links.find(link => new URL(link.href).hash === select.value) || links[0]).focus({preventScroll:true});
      caseNav.inert = hide;
      sync();
    };
    select.addEventListener('change', () => {
      const target = document.getElementById(select.value.slice(1));
      if (!target) return;
      // Native fragment navigation keeps Back, deep links and reduced motion.
      location.hash = select.value;
    });
    select.addEventListener('blur', sync);
    const observer = new MutationObserver(sync);
    links.forEach(link => observer.observe(link, {attributes:true, attributeFilter:['aria-current']}));
    compact.addEventListener('change', layout); layout();
  }
})();
