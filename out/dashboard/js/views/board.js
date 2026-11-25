// The board: the page head, the four measured figures, the controls and the ranked rows. The watchlist
// view is this same page with its rows narrowed to the floor, so one module serves both.

import { age, categoryOf, chainsOf, count, date, multiple, pct, signClass, usd } from '../format.js';
import { escape } from '../charts.js';

/** The page head: what the section is, in one line, with the snapshot's stamp. */
export function head(data, { eyebrow, title, lead }) {
  return `<header class="page-head">
  <div>
    <p class="eyebrow">${escape(eyebrow)}</p>
    <h1>${escape(title)}</h1>
    <p class="lead">${escape(lead)}</p>
  </div>
  <p class="stamp"><b>${escape(data.as_of)}</b>sealed snapshot · ${escape(data.model_version)}<br>${count(data.stats.board_size)} rows · ${count(data.stats.watchlist_size)} on the floor</p>
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

/** The ranked table: the model's call, the figures it was made from, and the plan's door. */
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
  <td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:${Math.max(2, Math.round((r.implied_value_usd / max) * 100))}%"></i></div><span class="mono nowrap">${usd(r.implied_value_usd)}</span><span class="conf" data-level="${r.confidence}">${r.confidence}</span><span class="mono sub nowrap">${multiple(r.multiple)}</span></div></td>
  <td><span class="plan-link">Farm plan →</span></td>
</tr>`,
    )
    .join('');
  return `<div class="panel">
  <div class="panel-head"><h2>Ranked by implied value</h2><span class="sub">A row opens its model, its measured multiple and its farm plan</span></div>
  <div class="table-wrap"><table>
    <caption class="sub" style="caption-side:bottom;padding:8px 12px;text-align:left">Implied value = TVL × the category's measured market-cap multiple × the 7-day growth multiplier × the maturity multiplier.</caption>
    <thead><tr>
      ${sortHead(filters, 'implied', 'Rank')}
      ${sortHead(filters, 'name', 'Protocol')}
      ${sortHead(filters, 'tvl', 'TVL')}
      ${sortHead(filters, 'growth', '7d')}
      ${sortHead(filters, 'age', 'Age')}
      ${sortHead(filters, 'implied', 'Implied value')}
      <th scope="col">Plan</th>
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
