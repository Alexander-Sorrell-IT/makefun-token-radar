// The app: read the data the run wrote, read the address, render the section, and wire the controls.
// One render function, one place for state, no framework: every control writes the address and the
// router reads it back, so the page and its URL never disagree.

import { categoryOf } from './format.js';
import { parse, write } from './router.js';
import { controls, foot, head, kpis, table } from './views/board.js';
import { detail } from './views/detail.js';
import { live } from './views/live.js';
import { method } from './views/method.js';

const DATA = window.RADAR;
const main = document.getElementById('main');
const railMeta = document.getElementById('rail-meta');

/** The rows a filter keeps: search over name, category and chains; category; confidence. */
function filterRows(rows, filters, scope) {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (scope === 'watchlist' && !r.watchlisted) return false;
    if (filters.category !== 'all' && categoryOf(r) !== filters.category) return false;
    if (filters.conf !== 'all' && r.confidence !== filters.conf) return false;
    if (!q) return true;
    return [r.name, r.slug, categoryOf(r), (r.chains || []).join(' ')].join(' ').toLowerCase().includes(q);
  });
}

/** The rows in the sort the address asks for, with the slug as the tie-break so it is stable. */
function sortRows(rows, filters) {
  const key = filters.sort;
  const dir = filters.dir;
  return rows.slice().sort((a, b) => {
    let av;
    let bv;
    if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
    else if (key === 'growth') { av = a.change_7d ?? -Infinity; bv = b.change_7d ?? -Infinity; }
    else if (key === 'age') { av = a.age_days ?? Infinity; bv = b.age_days ?? Infinity; }
    else { av = a.implied_value_usd; bv = b.implied_value_usd; }
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
}

/** The board or watchlist page: shared, because the watchlist is the board's floor, not another page. */
function boardPage(route, scope) {
  const rows = sortRows(filterRows(DATA.rows, route.filters, scope), route.filters);
  const title = scope === 'watchlist' ? 'The floor, ranked: 40 protocols the house already watches.' : 'Every protocol with no token, ranked by what a launch could be worth.';
  const lead = scope === 'watchlist'
    ? 'This is the watchlist the house kept: $50M of TVL or more, no token recorded, and no wrapper, stake or bridge of one that trades. It is the board’s floor, never its ceiling — the full board carries every pre-token protocol the snapshot has, at any size.'
    : 'The board covers every protocol on the snapshot’s watchlist and every other protocol that records no token, at any size. Each row is priced by the category’s measured market-cap multiple, its seven-day growth and how long it has run without a token, and each carries a farm plan with its cost and its time.';
  const categories = [...new Set(DATA.rows.map((r) => categoryOf(r)))].sort();
  return `<div class="page">
  ${head(DATA, { eyebrow: scope === 'watchlist' ? 'Watchlist' : 'Board', title, lead })}
  ${kpis(DATA, scope === 'watchlist' ? DATA.rows.filter((r) => r.watchlisted) : DATA.rows)}
  ${controls(route.filters, categories, rows.length, scope === 'watchlist' ? DATA.rows.filter((r) => r.watchlisted).length : DATA.rows.length)}
  ${table(rows, route.filters)}
  ${foot(DATA)}
</div>`;
}

/** Draw the section the address names. */
function render() {
  const route = parse();
  main.setAttribute('aria-busy', 'true');

  if (route.detail) {
    const row = DATA.rows.find((r) => r.slug === route.slug);
    const peers = row ? DATA.rows.filter((r) => categoryOf(r) === categoryOf(row)) : [];
    main.innerHTML = detail(DATA, row, peers);
  } else if (route.section === 'live') {
    main.innerHTML = live(DATA);
  } else if (route.section === 'method') {
    main.innerHTML = method(DATA);
  } else {
    main.innerHTML = boardPage(route, route.section === 'watchlist' ? 'watchlist' : 'board');
  }

  // The rail says which section is open, and carries the snapshot's identity.
  const current = route.detail ? 'board' : route.section;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.getAttribute('data-nav') === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  main.setAttribute('aria-busy', 'false');
  wire(route);
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

/** Attach the controls of whatever section was just drawn. */
function wire(route) {
  const search = main.querySelector('#q');
  if (search) {
    search.addEventListener('input', () => {
      const filters = { ...route.filters, q: search.value };
      write(route.section, filters);
      const rows = sortRows(filterRows(DATA.rows, filters, route.section === 'watchlist' ? 'watchlist' : 'board'), filters);
      const tableWrap = main.querySelector('.panel');
      const fresh = document.createElement('div');
      fresh.innerHTML = table(rows, filters);
      tableWrap.replaceWith(fresh.firstElementChild);
      const count = main.querySelector('.count');
      if (count) {
        const total = route.section === 'watchlist' ? DATA.rows.filter((r) => r.watchlisted).length : DATA.rows.length;
        count.textContent = `${rows.length} of ${total} rows shown`;
      }
      wire(route);
      const input = main.querySelector('#q');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    });
  }

  const select = main.querySelector('#category');
  if (select) {
    select.addEventListener('change', () => {
      write(route.section, { ...route.filters, category: select.value });
      render();
    });
  }

  main.querySelectorAll('[data-conf]').forEach((button) => {
    button.addEventListener('click', () => {
      write(route.section, { ...route.filters, conf: button.getAttribute('data-conf') });
      render();
    });
  });

  main.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-sort');
      const dir = route.filters.sort === key ? -route.filters.dir : -1;
      write(route.section, { ...route.filters, sort: key, dir });
      render();
    });
  });

  main.querySelectorAll('tr[data-slug]').forEach((row) => {
    const open = () => { window.location.hash = `#/p/${encodeURIComponent(row.getAttribute('data-slug'))}`; };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });
}

/** The rail's own figures: the snapshot, the model, the floor's coverage. */
function rail() {
  const coverage = Math.round(DATA.stats.watchlist_coverage * 100);
  railMeta.innerHTML = `
  <div>snapshot <b>${DATA.as_of}</b></div>
  <div>model <b>${DATA.model_version}</b></div>
  <div>rows <b>${DATA.stats.board_size}</b></div>
  <div>floor <b>${coverage}%</b> covered</div>
  <div class="meter" aria-hidden="true"><i style="width:${coverage}%"></i></div>`;
}

rail();
window.addEventListener('hashchange', render);
render();
