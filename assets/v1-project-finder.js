// The original catalogue keeps native section links and complete no-script content.
const finder = document.querySelector('[data-v1-project-finder]');
const input = finder.querySelector('input');
const clear = finder.querySelector('button');
const status = finder.querySelector('[role="status"]');
const jumpbar = document.querySelector('[data-project-jumpbar]');
const normalize = text => text.toLowerCase().trim().replace(/\s+/g, ' ');
const groups = [...jumpbar.querySelectorAll('[data-project-target]')].map(link => {
  const section = document.getElementById(link.dataset.projectTarget);
  const cards = [...section.querySelectorAll('a.catalog-card, a.project-list-row')].map(card => ({
    card,
    text: normalize([...card.querySelectorAll('h3,p,small,.catalog-category')].map(el => el.textContent).join(' ')),
  }));
  return {link, section, cards};
});

function apply(updateURL) {
  const value = input.value.trim();
  const terms = normalize(value).split(' ').filter(Boolean);
  const address = new URL(location.href);
  if (value) address.searchParams.set('q', value);
  else address.searchParams.delete('q');
  let count = 0;
  for (const {link, section, cards} of groups) {
    let matches = 0;
    for (const {card, text} of cards) {
      card.hidden = !terms.every(term => text.includes(term));
      if (!card.hidden) matches++;
    }
    section.hidden = link.hidden = matches === 0;
    const destination = new URL(address);
    destination.hash = section.id;
    link.href = destination.pathname + destination.search + destination.hash;
    count += matches;
  }
  clear.hidden = !value;
  jumpbar.hidden = count === 0;
  status.textContent = !value ? '' : count ? count + (count === 1 ? ' result.' : ' results.') : 'No matches. Try another term or clear the search.';
  if (updateURL) {
    address.hash = value ? finder.id : '';
    history.replaceState(history.state, '', address.pathname + address.search + address.hash);
  }
  document.dispatchEvent(new Event('v1cataloguechange'));
}

function restore() {
  input.value = new URLSearchParams(location.search).get('q') || '';
  apply(false);
}
function clearQuery() {
  input.value = '';
  apply(true);
  input.focus({preventScroll:true});
}
finder.closest('main').dataset.v1Results = '';
finder.hidden = false;
input.addEventListener('input', () => apply(true));
input.addEventListener('keydown', event => { if (event.key === 'Escape' && input.value) { event.preventDefault(); clearQuery(); } });
clear.addEventListener('click', clearQuery);
window.addEventListener('popstate', restore);
restore();
