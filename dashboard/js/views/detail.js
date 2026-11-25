// One protocol: the call, the arithmetic that produced it, the plan a reader acts on, and the peers it
// is competing with inside its own category.

import { age, categoryOf, chainsOf, date, multiple, pct, signClass, usd } from '../format.js';
import { escape, peerBars } from '../charts.js';
import { planOf } from '../plan.js';
import { foot } from './board.js';

/** The detail page for one row, or the not-found page when the address names no row. */
export function detail(data, row, peers) {
  if (!row) {
    return `<div class="page"><header class="page-head"><div><p class="eyebrow">Not found</p><h1>No such protocol on this board</h1><p class="lead">The address names a protocol the sealed snapshot does not carry, or one the radar does not rank. The board lists every protocol it scores.</p></div></header><p><a class="button primary" href="#/board">Back to the board</a></p></div>`;
  }

  const plan = planOf(row);
  const steps = plan
    .map((s) => `<li><div><b>${escape(s.action)}</b>${s.cost ? `<div class="meta">cost: ${escape(s.cost)} · time: ${escape(s.time)}</div>` : ''}</div></li>`)
    .join('');
  const peersInCategory = peers.filter((p) => p.slug !== row.slug).slice(0, 8);

  return `<div class="page">
  <div class="detail-head">
    <div>
      <p class="eyebrow"><a href="#/board" style="color:inherit">← Board</a> · rank #${row.rank} of ${data.stats.board_size}</p>
      <h1>${escape(row.name)}</h1>
      <p class="sub">${escape(categoryOf(row))} on ${escape(chainsOf(row))} · listed ${escape(date(row.listed_at))} · ${row.watchlisted ? 'on the watchlist floor' : 'below the floor, still ranked'}</p>
    </div>
    <div class="call"><b>${usd(row.implied_value_usd)}</b><span>implied value · ${row.confidence} confidence</span></div>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>The arithmetic <span>— every input is the snapshot's own</span></h2>
      <div class="stat-row">
        <div class="stat"><span>TVL</span><b>${usd(row.tvl_usd)}</b></div>
        <div class="stat"><span>7-day change</span><b class="${signClass(row.change_7d)}">${pct(row.change_7d)}</b></div>
        <div class="stat"><span>Age, no token</span><b>${age(row.age_days)}</b></div>
      </div>
      <div class="equation" style="margin-top:12px">
        <div><span>TVL</span><b>${row.tvl_usd.toLocaleString('en-US')}</b></div>
        <div><span>${escape(categoryOf(row))} multiple, measured on ${row.multiple_samples} trading ${row.multiple_samples === 1 ? 'protocol' : 'protocols'}</span><b>${multiple(row.multiple)}</b></div>
        <div><span>7-day growth multiplier</span><b>${multiple(row.growth_multiplier)}</b></div>
        <div><span>maturity multiplier</span><b>${multiple(row.maturity_multiplier)}</b></div>
        <div><span>implied value</span><b>${usd(row.implied_value_usd)}</b></div>
      </div>
      <p class="formula">implied = round( ${row.tvl_usd.toLocaleString('en-US')} × ${row.multiple} × ${row.growth_multiplier} × ${row.maturity_multiplier} )</p>
      <p class="note">The multiple is the median market cap per dollar of TVL among this snapshot's ${escape(categoryOf(row))} protocols whose token already trades (${row.multiple_samples} ${row.multiple_samples === 1 ? 'protocol' : 'protocols'}). A category with fewer than three falls back to the snapshot-wide median. This is an estimate of what a launch would be worth if the record stayed as it is, not a forecast that one comes.</p>
    </section>

    <section class="card">
      <h2>Farm plan <span>— $${row.capital_usd} and ${row.hold_days} days</span></h2>
      <ol class="steps">${steps}</ol>
      <p class="note">Derived from the protocol's category, chain, TVL and age: the action follows the category, the capital the TVL, the hold its age. Check the protocol's own documentation before moving funds; this is not financial advice.</p>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>Peers in ${escape(categoryOf(row))} <span>— by implied value</span></h2>
      <div class="chart">${peerBars([row, ...peersInCategory], row.slug)}</div>
      <p class="note">${peersInCategory.length} other ${escape(categoryOf(row))} ${peersInCategory.length === 1 ? 'protocol is' : 'protocols are'} ranked on the board; the bar in teal is this one.</p>
    </section>
    <section class="card">
      <h2>What this row does not say</h2>
      <ul class="caveats">
        <li><b>No launch date.</b> A protocol recording no token today may never issue one; the model prices the record, not a promise.</li>
        <li><b>No live data.</b> Every figure here is the sealed snapshot of ${escape(data.as_of)}; TVL moves after it.</li>
        <li><b>No advice.</b> The plan's costs are the chain's gas at the snapshot's date, and a position can lose its capital.</li>
      </ul>
    </section>
  </div>
  ${foot(data)}
</div>`;
}
