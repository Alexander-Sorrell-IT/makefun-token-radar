// One protocol: the call and its band, the arithmetic, the plan and its ledger, the odds, the peers,
// and what the row does not say.

import { age, categoryOf, chainsOf, count, date, multiple, multiple2, percentPoint, pct, signClass, usd, usdFine } from '../format.js';
import { escape, peerBars } from '../charts.js';
import { planOf } from '../plan.js';
import { foot } from './board.js';

const SCOPE = {
  'category+age': 'the same category and age band',
  category: 'the same category',
  snapshot: 'the whole snapshot',
};

/** The detail page for one row, or the not-found page when the address names no row. */
export function detail(data, row, peers) {
  if (!row) {
    return `<div class="page"><header class="page-head"><div><p class="eyebrow">Not found</p><h1>No such protocol on this board</h1><p class="lead">The address names a protocol the sealed snapshot does not carry, or one the radar does not rank. The board lists every protocol it scores.</p></div></header><p><a class="button primary" href="#/board">Back to the board</a></p></div>`;
  }

  const steps = planOf(row)
    .map((s) => `<li><div><b>${escape(s.action)}</b>${s.cost ? `<div class="meta">cost: ${escape(s.cost)} · time: ${escape(s.time)}</div>` : ''}</div></li>`)
    .join('');
  const peersInCategory = peers.filter((p) => p.slug !== row.slug).slice(0, 8);
  const share = row.tvl_usd > 0 ? (row.capital_usd / row.tvl_usd) * 100 : 0;
  const verdict = row.plan_verdict === 'clears its gas' ? 'pos' : 'neg';
  const scope = SCOPE[row.token_odds_scope] || 'the same category';
  const baseLabel = row.multiple_source === 'category' ? `${escape(categoryOf(row))} median` : 'snapshot-wide median, thin category';

  return `<div class="page">
  <div class="detail-head">
    <div>
      <p class="eyebrow"><a href="#/board" style="color:inherit">← Board</a> · rank #${row.rank} of ${data.stats.board_size}</p>
      <h1>${escape(row.name)}</h1>
      <p class="sub">${escape(categoryOf(row))} on ${escape(chainsOf(row))} · listed ${escape(date(row.listed_at))} · ${row.watchlisted ? 'on the watchlist floor' : 'below the floor, still ranked'}</p>
    </div>
    <div class="call"><b>${usd(row.implied_value_usd)}</b><span>implied value · ${row.confidence} confidence</span><span class="band mono">90% band ${usd(row.implied_low_usd)} – ${usd(row.implied_high_usd)}</span></div>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>The arithmetic <span>— the base, the fitted tilt, the band</span></h2>
      <div class="stat-row">
        <div class="stat"><span>TVL</span><b>${usd(row.tvl_usd)}</b></div>
        <div class="stat"><span>7-day change</span><b class="${signClass(row.change_7d)}">${pct(row.change_7d)}</b></div>
        <div class="stat"><span>Age, no token</span><b>${age(row.age_days)}</b></div>
      </div>
      <div class="equation" style="margin-top:12px">
        <div><span>base — ${baseLabel}, ${count(row.multiple_samples)} trading peers</span><b>${multiple2(row.multiple_base)}</b></div>
        <div><span>fitted tilt — size and 7-day growth against the fit</span><b>${multiple2(row.multiple_tilt)}</b></div>
        <div><span>multiple = base × tilt</span><b>${multiple2(row.multiple)}</b></div>
        <div><span>7-day growth multiplier</span><b>${multiple(row.growth_multiplier)}</b></div>
        <div><span>maturity multiplier</span><b>${multiple(row.maturity_multiplier)}</b></div>
        <div><span>implied value</span><b>${usd(row.implied_value_usd)}</b></div>
        <div><span>90% band</span><b>${usd(row.implied_low_usd)} – ${usd(row.implied_high_usd)}</b></div>
      </div>
      <p class="formula">implied = round( ${row.tvl_usd.toLocaleString('en-US')} × ${row.multiple} × ${row.growth_multiplier} × ${row.maturity_multiplier} )
band    = implied × exp( ± ${data.fit.interval_z} × se )</p>
      <p class="note">The base is this category's median market cap per dollar of TVL, or the snapshot-wide median where the category is thin. The tilt is the fitted line at this protocol's size and growth. The band is the fit's uncertainty here, not a forecast of a launch.</p>
    </section>

    <section class="card">
      <h2>Farm plan <span>— $${row.capital_usd} and ${row.hold_days} days</span></h2>
      <ol class="steps">${steps}</ol>
      <p class="note">Derived from the category, chain, TVL and age: the action follows the category, the capital the TVL, the hold its age. Check the protocol's own documentation before moving funds; this is not financial advice.</p>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>The plan's ledger <span>— what it returns, what it costs</span></h2>
      <div class="ledger">
        <div><span>launch pool, ${(data.plan_assumptions.pool_share * 100).toFixed(0)}% of implied</span><b>${usd(row.pool_value_usd)}</b></div>
        <div><span>position's share of TVL</span><b class="mono">${share < 0.001 ? '<0.001' : share.toFixed(3)}%</b></div>
        <div><span>expected value</span><b>${usdFine(row.expected_value_usd)}</b></div>
        <div><span>gas, ${row.chains && row.chains[0] === 'Ethereum' ? 'mainnet' : 'L2'} rates</span><b>${usdFine(row.gas_usd)}</b></div>
        <div><span>counted hours</span><b class="mono">${row.hours} h</b></div>
        <div><span>net</span><b class="${verdict}">${usdFine(row.net_usd)}</b></div>
        <div><span>per hour of your time</span><b class="${verdict}">${usdFine(row.ev_per_hour_usd)}</b></div>
        <div><span>break-even implied value</span><b>${usd(row.break_even_implied_usd)}</b></div>
      </div>
      <p class="verdict-line"><span class="verdict ${verdict}">${escape(row.plan_verdict)}</span> a $${row.min_capital_usd.toLocaleString('en-US')} position would clear its gas at this implied value; this plan uses $${row.capital_usd.toLocaleString('en-US')}.</p>
      <p class="note">A ${(data.plan_assumptions.pool_share * 100).toFixed(0)}% launch pool against the implied value, with the reader's share exactly the deposit's share of TVL — no points or loyalty multiplier. Gas is the chain's rate; hours are counted.</p>
    </section>

    <section class="card">
      <h2>The odds <span>— the peers' own record</span></h2>
      <p class="odds-big">${percentPoint(row.token_odds_pct, 0)}<span class="sub">of ${count(row.token_odds_samples)} peers in ${escape(scope)} have a token now</span></p>
      <p class="note">Read from the snapshot's survival record: every protocol that could have launched, grouped by category and age band, counted by whether its ticker now trades. Rates are Laplace-smoothed, so three peers cannot claim certainty. This is a prior on whether a launch comes, not on what it would be worth.</p>
      <p class="note">Median odds across the board: ${percentPoint(data.stats.median_odds_pct, 0)} over ${count(data.odds_overall.total)} snapshot protocols.</p>
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
        <li><b>No launch date.</b> A protocol recording no token may never issue one; the model prices the record and the odds price the history, not a promise.</li>
        <li><b>No live data.</b> Every figure is the sealed snapshot of ${escape(data.as_of)}; TVL moves after it.</li>
        <li><b>No advice.</b> The plan's costs are the chain's gas at the snapshot's date, and a position can lose its capital.</li>
      </ul>
    </section>
  </div>
  ${foot(data)}
</div>`;
}
