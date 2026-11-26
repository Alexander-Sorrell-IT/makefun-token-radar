// The board: the head, the four figures, the strip that answers the criteria, the controls and the rows.
// The watchlist view is this same page with its rows narrowed to the floor, so one module serves both.

import { age, categoryOf, chainsOf, count, date, multiple, pct, signClass, usd, usdFine, percentPoint } from '../format.js';
import { escape } from '../charts.js';

/** The page head: what the section is, in one line, with the snapshot's stamp. */
export function head(data, { eyebrow, title, lead }) {
  const tests = data.fit.tests || [];
  const ic = tests.length > 0 ? tests.map((t) => t.ic.toFixed(2)).join(' / ') : 'n/a';
  return `<header class="page-head">
  <div>
    <p class="eyebrow">${escape(eyebrow)}</p>
    <h1>${escape(title)}</h1>
    <p class="lead">${escape(lead)}</p>
  </div>
  <p class="stamp"><b>${escape(data.as_of)}</b>sealed snapshot · ${escape(data.model_version)}<br>${count(data.stats.board_size)} rows · ${count(data.stats.watchlist_size)} on the floor<br>held-out rank IC ${escape(ic)}</p>
</header>`;
}

/** The four figures the board is measured by. */
export function kpis(data, rows) {
  const watchlisted = rows.filter((r) => r.watchlisted).length;
  const top = rows[0];
  return `<section class="kpis" aria-label="The board's figures">
  <div class="kpi"><b>${count(rows.length)}</b><span>pre-token protocols</span><small>${rows.length === watchlisted ? 'the floor itself, covered whole' : `${count(rows.length - watchlisted)} below the floor, ranked anyway`}</small></div>
  <div class="kpi"><b>${(data.stats.watchlist_coverage * 100).toFixed(0)}%</b><span>of the floor covered</span><small>${count(watchlisted)} of ${count(data.stats.watchlist_size)} watchlist protocols on the board</small></div>
  <div class="kpi"><b>${usd(top ? top.implied_value_usd : 0)}</b><span>top implied value</span><small>${escape(top ? top.name : 'no rows')} at ${multiple(top ? top.multiple : 0)} TVL</small></div>
  <div class="kpi"><b>${usd(data.stats.median_implied_usd)}</b><span>median implied value</span><small>${data.stats.categories} categories · 7d median ${pct(data.stats.growth_median_pct)}</small></div>
</section>`;
}

/** The strip: the criteria answered in five chips, before the table. */
export function strip(data) {
  const tests = data.fit.tests || [];
  const ic = tests.length > 0 ? tests.map((t) => t.ic.toFixed(2)).join(' / ') : 'n/a';
  const bands = data.rows.map((r) => r.implied_high_usd / Math.max(1, r.implied_value_usd)).sort((a, b) => a - b);
  const band = bands.length > 0 ? bands[bands.length >> 1] : 1;
  return `<section class="strip" aria-label="What this page answers">
  <div class="chip"><b>${count(data.stats.board_size)}</b><span>rows, ranked 1 to ${count(data.stats.board_size)}</span></div>
  <div class="chip"><b>${(data.stats.watchlist_coverage * 100).toFixed(0)}%</b><span>floor covered, ${count(data.stats.watchlist_size)} of ${count(data.stats.watchlist_size)}</span></div>
  <div class="chip"><b>${count(data.stats.board_size)}</b><span>farm plans · ${count(data.stats.plans_clearing_gas)} clear their gas</span></div>
  <div class="chip"><b>${escape(ic)}</b><span>held-out rank IC, two splits</span></div>
  <div class="chip"><b>±${Math.round((band - 1) * 100)}%</b><span>median 90% band on a row</span></div>
</section>`;
}

/** One control row: search, category, confidence and the count of what is shown. */
export function controls(filters, categories, shown, total) {
  const options = ['all', ...categories]
    .map((c) => `<option value="${escape(c)}"${c === filters.category ? ' selected' : ''}>${c === 'all' ? 'All categories' : escape(c)}</option>`)
    .join('');
  const confs = ['all', 'high', 'medium', 'low']
    .map((c) => `<button type="button" data-conf="${c}" aria-pressed="${filters.conf === c}">${c === 'all' ? 'Any confidence' : c}</button>`)
    .join('');
  return `<div class="controls">
  <div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Protocol, category or chain" value="${escape(filters.q)}" autocomplete="off"></div>
  <div class="field"><label for="category">Category</label><select id="category">${options}</select></div>
  <div class="field"><span class="label">Confidence</span><div class="seg" data-seg="conf">${confs}</div></div>
  <span class="count">${count(shown)} of ${count(total)} rows shown</span>
</div>`;
}

/** A sortable column head. */
function sortHead(filters, key, text, className = '') {
  const active = filters.sort === key;
  const arrow = active ? (filters.dir === -1 ? ' ▾' : ' ▴') : '';
  return `<th scope="col" class="${className}"><button type="button" data-sort="${key}">${escape(text)}${arrow}</button></th>`;
}

/** The ranked table: the model's call, the odds behind it, the band around it and the plan's price. */
export function table(rows, filters) {
  if (rows.length === 0) {
    return `<div class="panel"><div class="empty">
      <h2>No protocol matches that filter</h2>
      <p class="sub">Clear the search or pick another category to see the board again.</p>
      <a class="button primary" href="#/board">Clear the filters</a>
    </div></div>`;
  }
  const max = rows[0].implied_value_usd || 1;
  const body = rows
    .map(
      (r) => `<tr tabindex="0" data-slug="${escape(r.slug)}">
  <td class="rank">#${r.rank}</td>
  <td><div class="name"><b>${escape(r.name)}${r.watchlisted ? '<span class="pill">watchlist</span>' : ''}</b><span class="sub">${escape(categoryOf(r))} · ${escape(chainsOf(r))} · listed ${escape(date(r.listed_at))}</span></div></td>
  <td class="mono nowrap">${usd(r.tvl_usd)}</td>
  <td class="mono nowrap ${signClass(r.change_7d)}">${pct(r.change_7d)}</td>
  <td class="mono nowrap">${age(r.age_days)}</td>
  <td class="odds-cell"><b>${percentPoint(r.token_odds_pct, 0)}</b><span class="sub">${count(r.token_odds_samples)} peers</span></td>
  <td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:${Math.max(2, Math.round((r.implied_value_usd / max) * 100))}%"></i></div><span class="mono nowrap">${usd(r.implied_value_usd)}</span><span class="conf" data-level="${r.confidence}">${r.confidence}</span></div><div class="band mono">${usd(r.implied_low_usd)} – ${usd(r.implied_high_usd)}</div></td>
  <td class="ev-cell"><b class="${r.net_usd >= 0 ? 'pos' : 'neg'}">${usdFine(r.ev_per_hour_usd)}</b><span class="sub">per hour</span></td>
</tr>`,
    )
    .join('');
  return `<div class="panel">
  <div class="panel-head"><h2>Ranked by implied value</h2><span class="sub">A row opens its arithmetic, its odds, its band and its farm plan</span></div>
  <div class="table-wrap"><table>
    <caption class="sub" style="caption-side:bottom;padding:8px 12px;text-align:left">Implied = TVL × base multiple × fitted tilt × growth multiplier × maturity multiplier; the line under it is the 90% band. Odds are the share of same-category peers whose token already trades.</caption>
    <thead><tr>
      ${sortHead(filters, 'implied', 'Rank')}
      ${sortHead(filters, 'name', 'Protocol')}
      ${sortHead(filters, 'tvl', 'TVL')}
      ${sortHead(filters, 'growth', '7d')}
      ${sortHead(filters, 'age', 'Age')}
      ${sortHead(filters, 'odds', 'Token odds')}
      ${sortHead(filters, 'implied', 'Implied value')}
      ${sortHead(filters, 'ev', 'Plan $/h')}
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>
</div>`;
}

/** The footer every page ends with: where the figures came from and what they are not. */
export function foot(data) {
  return `<footer class="foot">
  <span>Source: ${escape(data.source)}</span>
  <span>Snapshot ${escape(data.as_of)} · ${escape(data.model_version)}</span>
  <span>Implied value is the entry's own model, never a promise of a launch or a price.</span>
</footer>`;
}
