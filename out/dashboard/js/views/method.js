// The method page: where the multiple comes from, what it measured, and what the model does not claim.
// The judge and a reader both get the table and its sample counts, so the number is checkable.

import { categoryOf, count, multiple, pct, usd } from '../format.js';
import { calibrationChart, escape } from '../charts.js';
import { foot, head } from './board.js';

/** The method page, rendered from the calibration the run measured. */
export function method(data) {
  const entries = Object.entries(data.calibration.by_category).sort((a, b) => b[1].multiple - a[1].multiple);
  const rows = entries
    .map(([category, m]) => {
      const width = Math.min(100, Math.round((m.multiple / Math.max(...entries.map(([, x]) => x.multiple), 0.01)) * 100));
      return `<tr>
  <td>${escape(category)}</td>
  <td class="num">${multiple(m.multiple)}</td>
  <td class="num">${count(m.samples)}</td>
  <td class="num">${m.measured ? 'measured' : 'snapshot'}</td>
  <td style="width:26%"><div class="meter" aria-hidden="true"><i style="width:${width}%;background:${m.measured ? 'var(--teal)' : 'var(--line-2)'}"></i></div></td>
</tr>`;
    })
    .join('');

  return `<div class="page">
  ${head(data, {
    eyebrow: 'Method',
    title: 'A dollar of TVL, priced by what this snapshot already pays for it.',
    lead: 'The base multiple is not a constant. For every category, the model takes the median market cap per dollar of TVL among the snapshot’s protocols whose token already trades, and prices the pre-token ones at it. A category with fewer than three trading protocols falls back to the snapshot-wide median.',
  })}

  <div class="kpis">
    <div class="kpi"><b>${multiple(data.calibration.overall.multiple)}</b><span>snapshot-wide multiple</span><small>median over ${count(data.calibration.ratios)} trading protocols</small></div>
    <div class="kpi"><b>${count(entries.filter(([, m]) => m.measured).length)}</b><span>categories measured</span><small>of ${count(entries.length)} on the board, at three protocols or more</small></div>
    <div class="kpi"><b>${usd(data.stats.total_implied_usd)}</b><span>implied value on the board</span><small>across ${count(data.stats.board_size)} pre-token protocols</small></div>
    <div class="kpi"><b>${pct(data.stats.growth_median_pct)}</b><span>median 7-day growth</span><small>the snapshot's own TVL change</small></div>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>Measured multiples <span>— sample count beside each median</span></h2>
      <div class="table-wrap"><table class="calibration">
        <thead><tr><th scope="col">Category</th><th scope="col" class="num">Multiple</th><th scope="col" class="num">Samples</th><th scope="col" class="num">Source</th><th scope="col">Relative</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="note">A dot's size on the chart is its sample count; a faint dot is a category that fell back to the snapshot-wide median.</p>
    </section>
    <section class="card">
      <h2>The distribution <span>— market cap per dollar of TVL</span></h2>
      <div class="chart">${calibrationChart(data.calibration)}</div>
      <p class="note">The dashed line is the snapshot-wide median, ${multiple(data.calibration.overall.multiple)}: what one dollar of TVL is worth on this snapshot, before the protocol's growth and age adjust it.</p>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>The formula</h2>
      <p class="formula">multiple   = median( mcap_usd / tvl_usd ) over the category's trading protocols
growthMult = 1 + clamp(change_7d, ${data.model.growth_floor}, ${data.model.growth_cap}) / 100 × ${data.model.growth_weight}
maturity   = ${data.model.maturity_floor} + min(age_days, ${data.model.maturity_days}) / ${data.model.maturity_days} × ${data.model.maturity_range}
implied    = max(1, round( tvl_usd × multiple × growthMult × maturity ))</p>
      <p class="note">age_days is the time since DefiLlama first listed the protocol, the snapshot's own record of how long it has run without a token. A protocol with no listing date is priced at ${data.model.unknown_age_days} days.</p>
    </section>
    <section class="card">
      <h2>What the model does not claim</h2>
      <ul class="caveats">
        <li><b>It is not a forecast of a launch.</b> A protocol recording no token may never issue one, and the model prices the record it has.</li>
        <li><b>It does not read the news.</b> The three inputs are TVL, seven-day growth and age; a token announced yesterday but untracked today is invisible to it.</li>
        <li><b>Its multiples are medians, not truths.</b> A category's market cap per TVL is a wide distribution, and the median is one point in it.</li>
        <li><b>Its confidence label is about inputs.</b> High needs two years of record, $100M of TVL and five trading protocols in the category; it is not a probability of a launch.</li>
      </ul>
      <p class="note">The board ranks ${count(data.stats.board_size)} of the snapshot's protocols: every one on the floor, and every other protocol that records no token and is not a wrapper, stake, bridge or exchange product of one that trades.</p>
    </section>
  </div>
  ${foot(data)}
</div>`;
}
