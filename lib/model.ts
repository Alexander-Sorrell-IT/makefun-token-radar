// Launchline's model: one sealed DefiLlama snapshot in, one ranked pre-token board out.
//
// A protocol records no token when its record carries no market cap, no CoinGecko id and no symbol.
// The house's watchlist is the floor of the radar, never its ceiling: every other pre-token protocol
// the snapshot carries is ranked too, and the protocols whose token already trades are kept apart
// with the market's own market caps, never mixed into a ranking the model made.
//
// The implied value is one function of three snapshot figures and one fitted table:
//
//   base       = median(mcap_usd / tvl_usd) over the snapshot's protocols in the same category
//                (the snapshot-wide median where the category has fewer than three of them)
//   tilt       = exp( a + b * (log10(tvl) - mean) + c * (change_7d / 100 - mean) )
//                a, b and c fitted by least squares on the snapshot's own trading protocols, and
//                tested on two held-out thirds before the page prints them
//   multiple   = base * tilt, kept inside the model's floor and cap
//   growthMult = 1 + clamp(change_7d, -60, 150) / 100 x 0.5
//   maturity   = 0.6 + min(age_days, 1460) / 1460 x 0.4
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//   interval   = implied x exp(+/- 1.645 x sigma), sigma the fit's own residual spread
//
// So the base multiple is not a constant: it is what this snapshot's market already pays for a dollar
// of TVL in that category, and the tilt is what this snapshot's record says about size and momentum
// within it. The table and the fitted line are on the page with their sample counts and their held-out
// error, and the page recomputes every row from the same figures, so the number on screen and the number
// in board.json are visibly the same arithmetic. No protocol is named in this file and no row is
// hand-picked.

import { calibrate, clamp, median, multipleFor, MULTIPLE_CAP, MULTIPLE_FLOOR, type Calibration } from './calibrate.ts';
import { fitModel, logMultipleSe, medianTable, multipleAt, zScores, type Fit } from './fit.ts';
import { oddsFor, oddsIndex, type Odds, type OddsIndex } from './odds.ts';
import { capitalFor, economicsFor, farmPlan, holdDaysFor, PLAN_ASSUMPTIONS, stepText } from './plan.ts';

/** One protocol, exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated on the page and changeable in one place. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  interval_z: number;
  pool_share: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 150,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1460,
  unknown_age_days: 365,
  multiple_floor: MULTIPLE_FLOOR,
  multiple_cap: MULTIPLE_CAP,
  interval_z: 1.645,
  pool_share: PLAN_ASSUMPTIONS.pool_share,
};

/** The model's version label: the page names it and every row's maths is checked against it. */
export const MODEL_VERSION = 'launchline-4';

/** A row's confidence in its own number, from the category's sample count and the protocol's record. */
export type Confidence = 'high' | 'medium' | 'low';

/** What one protocol is priced at, with the pieces the page prints. */
export interface Price {
  implied: number;
  low: number;
  high: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  base: number;
  tilt: number;
  multiple: number;
  samples: number;
  source: 'category' | 'snapshot';
}

/** Everything impliedValue needs, gathered once per run. */
export interface PricingContext {
  as_of: string;
  calibration: Calibration;
  fit: Fit;
  medians: Record<string, number>;
  model: ModelConstants;
}

/** One row of board.json: the ranked board's row, with the model's own inputs beside it. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlisted: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  multiple: number;
  multiple_base: number;
  multiple_tilt: number;
  multiple_samples: number;
  multiple_source: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  token_odds_pct: number;
  token_odds_samples: number;
  token_odds_scope: string;
  capital_usd: number;
  hold_days: number;
  pool_value_usd: number;
  expected_value_usd: number;
  gas_usd: number;
  hours: number;
  net_usd: number;
  ev_per_hour_usd: number;
  break_even_implied_usd: number;
  min_capital_usd: number;
  plan_verdict: string;
  confidence: Confidence;
  farm_steps: string[];
}

/** The dashboard's compact row: the same figures, with the plan rebuilt in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  multiple: number;
  multiple_base: number;
  multiple_tilt: number;
  multiple_samples: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  token_odds_pct: number;
  token_odds_samples: number;
  watchlisted: boolean;
  capital_usd: number;
  hold_days: number;
  pool_value_usd: number;
  expected_value_usd: number;
  gas_usd: number;
  hours: number;
  net_usd: number;
  ev_per_hour_usd: number;
  break_even_implied_usd: number;
  min_capital_usd: number;
  plan_verdict: string;
  confidence: Confidence;
  farm_steps: string[];
}

/** A protocol whose token already trades: its market cap is a fact, not a model's claim. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** The board's own summary figures, computed once and shown on the page. */
export interface RadarStats {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  median_implied_usd: number;
  total_implied_usd: number;
  watchlist_coverage: number;
  categories: number;
  newest_days: number | null;
  growth_median_pct: number;
  median_odds_pct: number;
  plans_clearing_gas: number;
}

/** One category's odds, as the method page prints them. */
export interface CategoryOdds {
  pct: number;
  total: number;
  trading: number;
}

/** Everything the dashboard needs: the ranked board, the calibration, the fit, the odds and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  fit: Fit;
  odds_by_category: Record<string, CategoryOdds>;
  odds_overall: CategoryOdds;
  plan_assumptions: typeof PLAN_ASSUMPTIONS;
  stats: RadarStats;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The three multipliers, the fitted multiple and its 90% band for one protocol. */
export function impliedValue(protocol: SnapshotProtocol, ctx: PricingContext): Price {
  const { model } = ctx;
  const age = ageDays(ctx.as_of, protocol.listed_at);
  const growthPct = clamp(model.growth_floor, model.growth_cap, finite(protocol.change_7d, 0));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const key = protocol.category ?? 'Uncategorised';
  const base = ctx.medians[key] ?? ctx.calibration.overall.multiple;
  const multiple = multipleAt(ctx.fit, ctx.medians, key, protocol.tvl_usd, protocol.change_7d);
  const tilt = base > 0 ? multiple / base : 1;
  const [z1, z2] = zScores(ctx.fit, protocol.tvl_usd, protocol.change_7d);
  const band = Math.exp(ctx.fit.interval_z * logMultipleSe(ctx.fit, z1, z2));
  const centre = protocol.tvl_usd * multiple * growthMult * maturityMult;
  return {
    implied: Math.max(1, Math.round(centre)),
    low: Math.max(1, Math.round(centre / band)),
    high: Math.max(1, Math.round(centre * band)),
    growthPct,
    growthMult,
    maturityMult,
    age,
    base: round4(base),
    tilt: round4(tilt),
    multiple: round4(multiple),
    samples: multipleFor(ctx.calibration, protocol.category).samples,
    source: multipleFor(ctx.calibration, protocol.category).measured ? 'category' : 'snapshot',
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The categories whose products are a wrapper, a stake or a bridge of a token that already trades. */
const NOT_A_LAUNCH = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name that says the product wraps, stakes or restakes something that already trades. */
const WRAPPED_NAME = /\b(wrapped|staked|staking|restaked|restaking)\b/i;

/** A name that opens with an exchange's own brand: its product, not a protocol's launch. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Whether a protocol is one the radar ranks: it records no token, and it is not the wrapper, stake or
 * bridge of a token that already trades, an exchange's own product, or a versioned pool of a protocol.
 * These are the house's own watchlist rules, applied to the whole snapshot rather than to the floor, so
 * the board's extra rows are the same kind of subject as the floor's, only smaller.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (NOT_A_LAUNCH.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_NAME.test(p.name)) return false;
  if (EXCHANGE_NAME.test(p.name)) return false;
  return true;
}

/** A confidence label from the two things that decide the estimate's steadiness. */
export function confidenceFor(age: number | null, tvl: number, samples: number): Confidence {
  if (samples >= 5 && age !== null && age >= 730 && tvl >= 100_000_000) return 'high';
  if (samples >= 3 && ((age !== null && age >= 365) || tvl >= 1_000_000_000)) return 'medium';
  return 'low';
}

/** Every protocol's age at the snapshot date, once, for the odds index and the rows. */
export function ageIndex(snapshot: Snapshot): Map<string, number | null> {
  const ages = new Map<string, number | null>();
  for (const p of snapshot.protocols) ages.set(p.slug, ageDays(snapshot.as_of, p.listed_at));
  return ages;
}

/** The protocols the board ranks: the whole watchlist, then every other rankable pre-token protocol. */
export function buildBoard(
  snapshot: Snapshot,
  calibration: Calibration = calibrate(snapshot.protocols),
  fit: Fit = fitModel(snapshot.protocols, calibration),
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor and is covered whole, whatever the rest of the rules say about a name.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The ceiling: every other pre-token protocol the snapshot carries, so the radar is not the floor.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const ctx: PricingContext = {
    as_of: snapshot.as_of,
    calibration,
    fit,
    medians: medianTable(calibration),
    model,
  };
  const ages = ageIndex(snapshot);
  const odds = oddsIndex(snapshot.protocols, ages);

  const scored = [...chosen.values()].map((p) => {
    const price = impliedValue(p, ctx);
    const capital = capitalFor(p.tvl_usd);
    const hold = holdDaysFor(price.age);
    const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
    const economics = economicsFor(price.implied, p.tvl_usd, capital, hold, chain);
    const oddsRow: Odds = oddsFor(odds, p.category, price.age);
    return { p, price, capital, hold, economics, oddsRow };
  });
  scored.sort((a, b) => b.price.implied - a.price.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlisted: watchlist.has(s.p.slug),
    age_days: s.price.age,
    implied_value_usd: s.price.implied,
    implied_low_usd: s.price.low,
    implied_high_usd: s.price.high,
    multiple: s.price.multiple,
    multiple_base: s.price.base,
    multiple_tilt: s.price.tilt,
    multiple_samples: s.price.samples,
    multiple_source: s.price.source,
    growth_multiplier: round4(s.price.growthMult),
    maturity_multiplier: round4(s.price.maturityMult),
    token_odds_pct: Math.round(s.oddsRow.pct * 10) / 10,
    token_odds_samples: s.oddsRow.total,
    token_odds_scope: s.oddsRow.scope,
    capital_usd: s.capital,
    hold_days: s.hold,
    pool_value_usd: s.economics.pool_value_usd,
    expected_value_usd: s.economics.expected_value_usd,
    gas_usd: s.economics.gas_usd,
    hours: s.economics.hours,
    net_usd: s.economics.net_usd,
    ev_per_hour_usd: s.economics.ev_per_hour_usd,
    break_even_implied_usd: s.economics.break_even_implied_usd,
    min_capital_usd: s.economics.min_capital_usd,
    plan_verdict: s.economics.verdict,
    confidence: confidenceFor(s.price.age, s.p.tvl_usd, s.price.samples),
    farm_steps: farmPlan(s.p, s.price.age, s.price.implied, s.economics).map(stepText),
  }));
}

/** The protocols whose token already trades, by market cap, with the ratio the table is measured from. */
export function liveRows(snapshot: Snapshot, limit = 24): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && (p.mcap_usd ?? 0) > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    multiple: row.multiple,
    multiple_base: row.multiple_base,
    multiple_tilt: row.multiple_tilt,
    multiple_samples: row.multiple_samples,
    multiple_source: row.multiple_source,
    growth_multiplier: row.growth_multiplier,
    maturity_multiplier: row.maturity_multiplier,
    token_odds_pct: row.token_odds_pct,
    token_odds_samples: row.token_odds_samples,
    token_odds_scope: row.token_odds_scope,
    watchlisted: row.watchlisted,
    capital_usd: row.capital_usd,
    hold_days: row.hold_days,
    pool_value_usd: row.pool_value_usd,
    expected_value_usd: row.expected_value_usd,
    gas_usd: row.gas_usd,
    hours: row.hours,
    net_usd: row.net_usd,
    ev_per_hour_usd: row.ev_per_hour_usd,
    break_even_implied_usd: row.break_even_implied_usd,
    min_capital_usd: row.min_capital_usd,
    plan_verdict: row.plan_verdict,
    confidence: row.confidence,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  calibration: Calibration = calibrate(snapshot.protocols),
  fit: Fit = fitModel(snapshot.protocols, calibration),
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, calibration, fit, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const covered = snapshot.watchlist.filter((slug) => board.some((r) => r.slug === slug)).length;
  const ages = board.map((r) => r.age_days).filter((d): d is number => d !== null);
  const growths = board.map((r) => r.change_7d).filter((g): g is number => g !== null);
  const categories = new Set(board.map((r) => r.category ?? 'Uncategorised'));
  const odds = oddsIndex(snapshot.protocols, ageIndex(snapshot));
  const oddsByCategory: Record<string, CategoryOdds> = {};
  for (const [key, cell] of Object.entries(odds.by_category)) {
    oddsByCategory[key] = { pct: ((cell.trading + 1) / (cell.total + 2)) * 100, total: cell.total, trading: cell.trading };
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    fit,
    odds_by_category: oddsByCategory,
    odds_overall: { pct: ((odds.overall.trading + 1) / (odds.overall.total + 2)) * 100, total: odds.overall.total, trading: odds.overall.trading },
    plan_assumptions: PLAN_ASSUMPTIONS,
    stats: {
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: board.filter((r) => !watchlist.has(r.slug)).length,
      live_size: live.length,
      median_implied_usd: Math.round(median(board.map((r) => r.implied_value_usd))),
      total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
      watchlist_coverage: snapshot.watchlist.length === 0 ? 1 : covered / snapshot.watchlist.length,
      categories: categories.size,
      newest_days: ages.length > 0 ? Math.min(...ages) : null,
      growth_median_pct: Math.round(median(growths) * 100) / 100,
      median_odds_pct: Math.round(median(board.map((r) => r.token_odds_pct)) * 10) / 10,
      plans_clearing_gas: board.filter((r) => r.plan_verdict === 'clears its gas').length,
    },
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, interval, odds and steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (!(r.implied_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.implied_high_usd)) {
      return `${r.slug} has an interval that does not contain its own value`;
    }
    if (!(r.token_odds_pct > 0 && r.token_odds_pct <= 100)) return `${r.slug} has token odds ${r.token_odds_pct}`;
    if (!Number.isFinite(r.ev_per_hour_usd) || !Number.isFinite(r.net_usd)) return `${r.slug} has a plan ledger that does not add up`;
    if (!(r.break_even_implied_usd > 0) || !(r.min_capital_usd > 0)) return `${r.slug} has no break-even`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
