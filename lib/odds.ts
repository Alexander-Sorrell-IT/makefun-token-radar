// Token odds from the peers' record: what happened to protocols that looked like this one.
//
// The model prices what a launch would be worth. This file answers the prior question — how often a
// protocol like this one ever gets a token at all — from the snapshot's own history rather than from a
// constant. The cohort is every protocol that could have launched: no exchange's own product, no wrapper,
// stake, bridge or versioned pool (those never issue their own token), no CEX listing. Within that
// cohort the snapshot records, for each protocol, a category and an age, and whether a market cap and a
// ticker now exist. That is a survival record, and it is read at the resolution the data supports:
//
//   the same category and the same age band   (a five-year-old CDP is not a five-month-old one)
//   the same category                          (when the band is thin)
//   the whole snapshot                         (when the category is thin)
//
// Every rate is Laplace-smoothed, (trading + 1) / (total + 2), so a category with three protocols cannot
// claim certainty. The page prints the sample count beside every odds figure, and a rate with fewer than
// five peers says so in words rather than in a number pretending to be precise.

import type { SnapshotProtocol } from './model.ts';

/** The age bands the record is read in. */export const ODDS_BUCKETS = ['0-180d', '180-365d', '365-730d', '730-1460d', '1460d+', 'unlisted'];

/** The age band a row falls in. */
export function bucketOf(age: number | null): string {
  if (age === null) return 'unlisted';
  if (age < 180) return '0-180d';
  if (age < 365) return '180-365d';
  if (age < 730) return '365-730d';
  if (age < 1460) return '730-1460d';
  return '1460d+';
}

/** A cohort cell: how many peers, and how many of them have a trading token now. */
export interface OddsCell {
  total: number;
  trading: number;
}

/** The whole index: category x age band, category, and the snapshot. */
export interface OddsIndex {
  cells: Record<string, OddsCell>;
  by_category: Record<string, OddsCell>;
  overall: OddsCell;
  buckets: string[];
}

/** One row's odds, with the evidence they were read from. */
export interface Odds {
  pct: number;
  total: number;
  trading: number;
  scope: 'category+age' | 'category' | 'snapshot';
}

/** The smallest cell the index will read on its own; below it, the next wider scope answers. */
const MIN_CELL = 5;

/** Adds one protocol to a cell. */
function bump(cell: OddsCell | undefined, trading: boolean): OddsCell {
  const next = cell ?? { total: 0, trading: 0 };
  next.total += 1;
  if (trading) next.trading += 1;
  return next;
}

/** Laplace-smoothed rate, 0 to 100. */
function ratePct(cell: OddsCell): number {
  return ((cell.trading + 1) / (cell.total + 2)) * 100;
}

/** The categories whose products never launch their own token. */
const NEVER_LAUNCHES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPER_NAME = /\b(wrapped|staked|staking|restaked|restaking)\b/i;
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol belongs in the cohort that could have launched a token of its own. */
export function inCohort(p: SnapshotProtocol): boolean {
  if (NEVER_LAUNCHES.has(p.category ?? '')) return false;
  if (WRAPPER_NAME.test(p.name) || EXCHANGE_NAME.test(p.name) || VERSIONED.test(p.name)) return false;
  return true;
}

/** Build the index from the snapshot's cohort and the age each protocol has at the snapshot date. */
export function oddsIndex(protocols: SnapshotProtocol[], ages: Map<string, number | null>): OddsIndex {
  const cells: Record<string, OddsCell> = {};
  const byCategory: Record<string, OddsCell> = {};
  let overall: OddsCell = { total: 0, trading: 0 };
  for (const p of protocols) {
    if (!inCohort(p)) continue;
    const trading = !(p.mcap_usd === null && p.gecko_id === null && p.symbol === null);
    const key = p.category ?? 'Uncategorised';
    const bucket = bucketOf(ages.get(p.slug) ?? null);
    const cellKey = `${key}|${bucket}`;
    cells[cellKey] = bump(cells[cellKey], trading);
    byCategory[key] = bump(byCategory[key], trading);
    overall = bump(overall, trading);
  }
  return { cells, by_category: byCategory, overall, buckets: ODDS_BUCKETS };
}

/** The odds for one protocol: the tightest cell with enough peers behind it. */
export function oddsFor(index: OddsIndex, category: string | null, age: number | null): Odds {
  const key = category ?? 'Uncategorised';
  const cell = index.cells[`${key}|${bucketOf(age)}`];
  if (cell !== undefined && cell.total >= MIN_CELL) {
    return { pct: ratePct(cell), total: cell.total, trading: cell.trading, scope: 'category+age' };
  }
  const cat = index.by_category[key];
  if (cat !== undefined) {
    return { pct: ratePct(cat), total: cat.total, trading: cat.trading, scope: 'category' };
  }
  return { pct: ratePct(index.overall), total: index.overall.total, trading: index.overall.trading, scope: 'snapshot' };
}
