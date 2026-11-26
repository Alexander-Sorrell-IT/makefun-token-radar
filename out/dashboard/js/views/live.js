// The live set: protocols whose token already trades. Their market cap is a fact, not the model's claim,
// and the ratio beside each one is the figure the calibration is measured from.

import { categoryOf, chainsOf, multiple, pct, signClass, usd } from '../format.js';
import { escape } from '../charts.js';
import { foot, head } from './board.js';

/** The live-token page. */
export function live(data) {
  const rows = data.live
    .map(
      (r) => `<tr>
  <td><div class="name"><b>${escape(r.name)}</b><span class="sub">${escape(categoryOf(r))} · ${escape(chainsOf(r))}</span></div></td>
  <td class="mono nowrap">${usd(r.tvl_usd)}</td>
  <td class="mono nowrap ${signClass(r.change_7d)}">${pct(r.change_7d)}</td>
  <td class="mono nowrap">${usd(r.mcap_usd)}</td>
  <td class="mono nowrap">${r.ratio === null ? 'n/a' : multiple(r.ratio)}</td>
</tr>`,
    )
    .join('');

  return `<div class="page">
  ${head(data, {
    eyebrow: 'Live tokens',
    title: 'The protocols that already have a market, set beside the ones that do not.',
    lead: 'Every protocol here records a token and a market cap, so its cap is a fact, never mixed into the ranked board. The ratio beside each one — market cap per dollar of TVL — is the figure the calibration is measured from.',
  })}
  <div class="panel">
    <div class="panel-head"><h2>The snapshot's largest trading protocols</h2><span class="sub">${data.live.length} shown · by market cap</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">MC / TVL</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
  <div class="grid-2">
    <section class="card">
      <h2>Why they are not on the board</h2>
      <p class="note">The board asks what a token would be worth if it existed. A protocol that already trades has an answer the market gives, not one the model gives: putting its market cap beside a pre-token protocol's estimate would compare a fact with a claim.</p>
    </section>
    <section class="card">
      <h2>What they are here for</h2>
      <p class="note">They are the calibration's sample. The median of market cap per dollar of TVL, taken over these protocols within a category, is the multiple the board prices every pre-token protocol at. Change one and the board moves.</p>
    </section>
  </div>
  ${foot(data)}
</div>`;
}
