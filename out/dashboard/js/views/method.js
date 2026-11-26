// The method page: the base multiple, the fitted tilt and its two held-out tests, the odds' source,
// the plan's assumptions, and what the model does not claim. Every figure on the board is checkable here.

import { count, multiple2, percentPoint, pct, usd } from '../format.js';
import { calibrationChart, escape, holdoutChart } from '../charts.js';
import { foot, head } from './board.js';

/** The method page, rendered from the calibration and the fit the run measured. */
export function method(data) {
  const fit = data.fit;
  const tests = fit.tests || [];
  const entries = Object.entries(data.calibration.by_category).sort((a, b) => b[1].multiple - a[1].multiple);
  const widest = Math.max(...entries.map(([, x]) => x.multiple), 0.01);
  const rows = entries
    .map(([category, m]) => {
      const odds = data.odds_by_category[category];
      const width = Math.min(100, Math.round((m.multiple / widest) * 100));
      return `<tr><td>${escape(category)}</td><td class="num">${multiple2(m.multiple)}</td><td class="num">${count(m.samples)}</td><td class="num">${odds ? percentPoint(odds.pct, 0) : 'n/a'}</td><td class="num">${odds ? count(odds.total) : '0'}</td><td style="width:20%"><div class="meter"><i style="width:${width}%;background:${m.measured ? 'var(--teal)' : 'var(--line-2)'}"></i></div></td></tr>`;
    })
    .join('');

  const testRows = tests
    .map((t) => `<tr><td>${escape(t.name)}</td><td class="num">${t.ic.toFixed(2)}</td><td class="num">${t.median_abs_pct.toFixed(0)}%</td><td class="num">${t.baseline_median_abs_pct.toFixed(0)}%</td><td class="num">${t.beats_pct.toFixed(0)}%</td></tr>`)
    .join('');

  return `<div class="page">
  ${head(data, {
    eyebrow: 'Method',
    title: 'A dollar of TVL, priced by what this snapshot already pays for it — then tilted and tested.',
    lead: 'The base is the category’s measured market-cap multiple. On top of it the model applies a tilt fitted on the same snapshot’s record, with its held-out error shown before a row is priced.',
  })}

  <div class="kpis">
    <div class="kpi"><b>${multiple2(data.calibration.overall.multiple)}</b><span>snapshot-wide multiple</span><small>median over ${count(data.calibration.ratios)} trading protocols</small></div>
    <div class="kpi"><b>${fit.lambda}</b><span>ridge penalty</span><small>five-fold CV chose the grid's unpenalised end, error ${fit.cv_mae_log.toFixed(2)} log</small></div>
    <div class="kpi"><b>${tests.length > 0 ? tests[0].ic.toFixed(2) : 'n/a'}</b><span>held-out rank IC</span><small>${tests.length > 1 ? `${tests[1].ic.toFixed(2)} on the reversed split` : 'one split'} · ${count(fit.samples)} fitted</small></div>
    <div class="kpi"><b>${count(data.stats.plans_clearing_gas)}</b><span>plans that clear their gas</span><small>of ${count(data.stats.board_size)} · dollars an hour, not promises</small></div>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>The fitted tilt <span>— size and momentum, on this snapshot's record</span></h2>
      <div class="equation">
        <div><span>intercept a — typical log deviation from a category median</span><b>${fit.intercept.toFixed(3)}</b></div>
        <div><span>b — per log10 of TVL</span><b>${fit.tvl.toFixed(3)}</b></div>
        <div><span>c — per 100% of seven-day growth</span><b>${fit.growth.toFixed(3)}</b></div>
        <div><span>R² on the fitted protocols</span><b>${fit.r2.toFixed(3)}</b></div>
        <div><span>residual spread, log points</span><b>${fit.residual_sd.toFixed(2)}</b></div>
        <div><span>trading protocols fitted</span><b>${count(fit.samples)}</b></div>
      </div>
      <p class="note">ln(market cap / TVL ÷ the category median) on centred log TVL and growth. Negative b says the snapshot pays less per dollar of TVL at the large end; negative c says TVL that arrived this week was paid for lower than TVL already there. Both are printouts of the data; the tests beside them are what they are worth.</p>
    </section>
    <section class="card">
      <h2>Held out twice <span>— the fit against the median it replaces</span></h2>
      <div class="table-wrap"><table class="calibration">
        <thead><tr><th scope="col">Split</th><th scope="col" class="num">IC</th><th scope="col" class="num">Fit err</th><th scope="col" class="num">Median err</th><th scope="col" class="num">Closer</th></tr></thead>
        <tbody>${testRows}</tbody>
      </table></div>
      <p class="note">Each row is a fit that never saw its test set. “Fit err” and “median err” are median absolute percentage errors; “Closer” is the share of held-out protocols the tilt prices closer than the flat median. Where the tilt loses, the page says so.</p>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>The held-out scatter <span>— ${tests.length > 0 ? escape(tests[0].name) : 'no split'}</span></h2>
      <div class="chart">${tests.length > 0 ? holdoutChart(tests[0]) : '<p class="sub">No held-out split on this snapshot.</p>'}</div>
      <p class="note">A dot is a trading protocol the fit never saw: fitted multiple across, the market's multiple up. The dashed line is a perfect call; the spread is why every row carries a band.</p>
    </section>
    <section class="card">
      <h2>The distribution <span>— market cap per dollar of TVL</span></h2>
      <div class="chart">${calibrationChart(data.calibration)}</div>
      <p class="note">The dashed line is the snapshot-wide median, ${multiple2(data.calibration.overall.multiple)}. A faint dot is a category that fell back to it; a dot's size is its sample count.</p>
    </section>
  </div>

  <section class="card">
    <h2>Measured multiples <span>— sample count and token odds beside each median</span></h2>
    <div class="table-wrap"><table class="calibration">
      <thead><tr><th scope="col">Category</th><th scope="col" class="num">Multiple</th><th scope="col" class="num">Trading peers</th><th scope="col" class="num">Has a token</th><th scope="col" class="num">Peers</th><th scope="col">Relative</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note">“Has a token” is the share of that category's cohort — every protocol that could have launched, no wrappers, stakes, bridges or exchange products — whose ticker now trades, Laplace-smoothed. It is the prior printed beside each row.</p>
  </section>

  <div class="grid-2">
    <section class="card">
      <h2>The formula</h2>
      <p class="formula">base      = median( mcap_usd / tvl_usd ) over the category's trading protocols
z1        = log10(tvl) − mean(log10 tvl)
z2        = clamp(change_7d, ${data.model.growth_floor}, ${data.model.growth_cap}) / 100 − mean
multiple  = clamp( ${data.model.multiple_floor}, ${data.model.multiple_cap}, base × exp(a + b·z1 + c·z2) )
growth    = 1 + clamp(change_7d, ${data.model.growth_floor}, ${data.model.growth_cap}) / 100 × ${data.model.growth_weight}
maturity  = ${data.model.maturity_floor} + min(age_days, ${data.model.maturity_days}) / ${data.model.maturity_days} × ${data.model.maturity_range}
implied   = max(1, round( tvl_usd × multiple × growth × maturity ))
band      = implied × exp( ± ${fit.interval_z} × se(multiple) )</p>
      <p class="note">age_days is the time since DefiLlama first listed the protocol; a record with no date is priced at ${data.model.unknown_age_days} days. se(multiple) is the fit's standard error at that size and growth: the rows are priced, and so is their uncertainty.</p>
    </section>
    <section class="card">
      <h2>The plan's ledger, priced</h2>
      <div class="equation">
        <div><span>launch pool against the implied value</span><b>${(data.plan_assumptions.pool_share * 100).toFixed(0)}%</b></div>
        <div><span>position size, as a share of TVL</span><b>0.10%</b></div>
        <div><span>position floor and ceiling</span><b>$100 – $5,000</b></div>
        <div><span>Ethereum gas, open + weekly + close</span><b>$${data.plan_assumptions.gas_open_ethereum} + $${data.plan_assumptions.gas_week_ethereum}/wk + $${data.plan_assumptions.gas_close_ethereum}</b></div>
        <div><span>other chains, open + weekly + close</span><b>$${data.plan_assumptions.gas_open_other} + $${data.plan_assumptions.gas_week_other}/wk + $${data.plan_assumptions.gas_close_other}</b></div>
        <div><span>counted hours, open + weekly + read and claim</span><b>${data.plan_assumptions.hours_open} + ${data.plan_assumptions.hours_week}/wk + ${data.plan_assumptions.hours_research_and_claim}</b></div>
      </div>
      <p class="note">Every row carries these into its own ledger, so a reader can redo the arithmetic at their own size. A plan that does not pay for its gas says “below break-even” on its own row rather than hiding the verdict.</p>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>What the model does not claim</h2>
      <ul class="caveats">
        <li><b>It is not a forecast of a launch.</b> The odds are the peers' record; the value is what a launch would be worth if the record held.</li>
        <li><b>It does not read the news.</b> The inputs are TVL, seven-day growth and age; a token announced yesterday but untracked today is invisible.</li>
        <li><b>Its multiples are medians, not truths.</b> A category's market cap per TVL is a wide distribution, and the median is one point in it.</li>
        <li><b>Its tilt is small.</b> R² is ${fit.r2.toFixed(2)}: most of a protocol's multiple is not explained by size or momentum, which is why the band is wider than the tilt.</li>
      </ul>
    </section>
    <section class="card">
      <h2>What the board covers</h2>
      <p class="note">${count(data.stats.board_size)} rows: every one of the ${count(data.stats.watchlist_size)} protocols on the floor, plus every other snapshot protocol with no token that is not a wrapper, stake, bridge or exchange product. ${count(data.stats.early_size)} rows sit below the floor and are ranked anyway. The ${count(data.stats.live_size)} protocols whose token trades are on their own page, because a fact should not be ranked against a claim.</p>
      <p class="note">Median implied value ${usd(data.stats.median_implied_usd)} · median seven-day growth ${pct(data.stats.growth_median_pct)} · median token odds ${percentPoint(data.stats.median_odds_pct, 0)}.</p>
    </section>
  </div>
  ${foot(data)}
</div>`;
}
