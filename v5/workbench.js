const workbench = document.querySelector('[data-workbench]');

if (workbench) {
  const tabList = workbench.querySelector('[data-workbench-tabs]');
  const tabs = [...tabList.querySelectorAll('[data-workbench-tab]')];
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  const compact = matchMedia('(max-width: 760px)');

  function select(index) {
    tabs.forEach((tab, i) => {
      const active = index === i;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[i].hidden = !active;
    });
  }

  function selectFragment(reset = false) {
    const index = tabs.findIndex(tab => tab.hash === location.hash);
    if (index >= 0 || reset) select(Math.max(0, index));
  }

  function setOrientation() {
    tabList.setAttribute('aria-orientation', compact.matches ? 'horizontal' : 'vertical');
  }

  tabList.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    const panel = panels[index];
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      select(index);
      history.replaceState(history.state, '', tab.hash);
    });
  });

  tabList.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const [previous, next] = compact.matches ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const destination = {
      [previous]: (index - 1 + tabs.length) % tabs.length,
      [next]: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (event.key === ' ') {
      event.preventDefault();
      tabs[index].click();
    } else if (destination !== undefined) {
      event.preventDefault();
      tabs[destination].click();
      tabs[destination].focus();
    }
  });

  compact.addEventListener('change', setOrientation);
  addEventListener('hashchange', () => selectFragment());
  setOrientation();
  selectFragment(true);
  workbench.dataset.workbenchReady = '';
}
