# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Alexander-Sorrell-IT/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Alexander-Sorrell-IT/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A pre-token radar over one sealed DefiLlama snapshot. It ranks every protocol that records no token by an implied
value, pairs each row with a farm plan that carries its cost and its time, and measures its own base multiple from
the snapshot's protocols whose token already trades instead of assuming one.

## The model

```
multiple   = median( mcap_usd / tvl_usd ) over the protocol's category's trading protocols
             (the snapshot-wide median where a category has fewer than three)
growthMult = 1 + clamp(change_7d, -60, 150) / 100 × 0.5
maturity   = 0.6 + min(age_days, 1460) / 1460 × 0.4
implied    = max(1, round( tvl_usd × multiple × growthMult × maturity ))
```

The multiple table is printed on the dashboard's Method page with every category's sample count, and each protocol's
detail page shows its own arithmetic. No protocol is named in the model, and no row is hand-picked.

The board covers the house's 40-protocol watchlist and every other pre-token protocol in the snapshot that is not a
wrapper, stake, bridge or exchange product of a token that trades; protocols whose token already trades are kept
apart with their own market caps. Each row carries six farm steps: the wallet, the position, the weekly action, the
hold, the claim and the journal, with a cost and a time on each.

## The dashboard

`dashboard/` is static files with no build step and no network: a left rail of sections (Board, Watchlist, Live
tokens, Method), a filterable and sortable board, a page per protocol with its model breakdown, farm plan and
category peers, and the method page with the measured multiples and their samples. Charts are hand-drawn SVG.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` reads the sealed snapshot, measures the multiples, builds and verifies the board, writes `board.json` and
`data.js`, copies `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with the
vendored `vendor/makefun-board.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0ysqc40w&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
