# Launchline

A pre-token radar. One sealed DefiLlama snapshot in, one ranked board out: every protocol that records
no token, priced by what this snapshot's market already pays for a dollar of TVL in its category, tilted
by a line fitted on the snapshot's own trading record, banded at 90%, given the odds its peers' history
implies, and handed a farm plan whose expected value, gas, hours and break-even are written into it.

The board is 197 rows on the 2026-11-14 snapshot: the 40-protocol watchlist covered whole, plus 157 other
pre-token protocols the snapshot carries. The 24 protocols whose token already trades are kept on their
own page, with the market's own caps beside them.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../.makefun/radar-kit/token-radar-01-kit/input/snapshot.json
```

Node 22, standard library only, no dependencies, no network at run time. The run writes `board.json`,
`data.js`, copies `dashboard/` and `screenshots/`, and writes `dossier.json` with the vendored make.fun
library. Two runs on the same snapshot are byte-identical.

## The model

```
base      = median(mcap_usd / tvl_usd) over the category's trading protocols (snapshot median if < 3)
z1        = log10(tvl) − mean(log10 tvl)          z2 = clamp(change_7d, -60, 150)/100 − mean
multiple  = clamp(0.02, 6, base × exp(a + b·z1 + c·z2))
growth    = 1 + clamp(change_7d, -60, 150)/100 × 0.5
maturity  = 0.6 + min(age_days, 1460)/1460 × 0.4
implied   = max(1, round(tvl_usd × multiple × growth × maturity))
band      = implied × exp(±1.645 × se(multiple))
```

`a`, `b`, `c` are fitted by ridge least squares on the 128 trading protocols, with the penalty chosen by
five-fold cross-validation (it chose λ = 0; CV error 1.53 log points). `se(multiple)` is the fit's own
standard error at that row's size and growth, from the regularised inverse of the normal equations.

The fit is not taken on faith: `lib/fit.ts` splits the trading protocols by a hash of their slug 70/30,
fits on the 70, scores the 30, then reverses the split. On this snapshot the held-out rank IC is 0.28 and
0.35, and the tilted multiple prices 48% and 62% of held-out protocols closer than the flat category
median would. Both numbers are printed on the method page, including where the tilt loses.

## The odds

`lib/odds.ts` answers the prior question — does a protocol like this ever get a token — from the
snapshot's survival record. The cohort is every protocol that could have launched (no wrappers, stakes,
bridges, exchange products or versioned pools); rates are read per category and age band, falling back to
the category and then the snapshot, and Laplace-smoothed so three peers cannot claim certainty. The whole
cohort is 439 protocols at 55.1%; the board's median is 42.9%.

## The plan's ledger

Each row's plan assumes an 8% launch pool against the implied value, a position of 0.1% of TVL (floor
$100, ceiling $5,000), Ethereum or L2 gas over the hold, and counted hours (0.75 to open, 0.25 a week,
1 to read and claim). Expected value, gas, net, dollars an hour, break-even implied value and the
position size that would clear gas are all in the row. 176 of 197 plans clear their gas on this
snapshot; the rest say "below break-even" on their own row.

## The dashboard

A static page, no framework and no network: a rail, a KPI strip, a criteria strip, a sortable and
filterable board (198 rows, search, category, confidence), a page per protocol with its arithmetic, its
band, its ledger, its odds and its peers, a method page with the fitted line, both held-out tests, the
held-out scatter and the measured table, and a live-token page. Source is 63.4 KB across 12 files.

Screenshots are 1280×800: the board, a watchlist protocol, the filtered floor and the method page.

## Files

- `main.ts` — entrypoint, verification, output, dossier.
- `lib/model.ts` — the pricing, the board, the snapshot parser, the gate's shape checks.
- `lib/calibrate.ts` — the category multiples measured on the snapshot.
- `lib/fit.ts` — ridge fit, cross-validated penalty, two held-out tests, per-row standard error.
- `lib/odds.ts` — the peers' survival record.
- `lib/plan.ts` — the six actions plus the ledger, and the gas/hour assumptions.
- `lib/verify.ts` — the board verifier: coverage, ranks, order, steps.
- `dashboard/` — the page; `vendor/makefun-board.ts` — the dossier builder.
