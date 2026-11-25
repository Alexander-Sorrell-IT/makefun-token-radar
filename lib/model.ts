// Launchline's model: one sealed DefiLlama snapshot in, one ranked pre-token board out.
//
// A protocol records no token when its record carries no market cap, no CoinGecko id and no symbol.
// The house's watchlist is the floor of the radar, never its ceiling: every other pre-token protocol
// the snapshot carries is ranked too, and the protocols whose token already trades are kept apart
// with the market's own market caps, never mixed into a ranking the model made.
//
// The implied value is one function of three snapshot figures and one measured table:
//
//   multiple   = median(mcap_usd / tvl_usd) over the snapshot's protocols in the same category
//                (the snapshot-wide median where the category has fewer than three of them)
//   growthMult = 1 + clamp(change_7d, -60, 150) / 100 x 0.5
//   maturity   = 0.6 + min(age_days, 1460) / 1460 x 0.4
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// So the base multiple is not a constant: it is what this snapshot's market already pays for a dollar
// of TVL in that category. The table is on the page, with each category's sample count, and the page
// recomputes every row from the same figures, so the number on screen and the number in board.json are
// visibly the same arithmetic. No protocol is named in this file and no row is hand-picked.

import { calibrate, clamp, median, multipleFor, MULTIPLE_CAP, MULTIPLE_FLOOR, type Calibration } from './calibrate.ts';
import { capitalFor, farmPlan, holdDaysFor, stepText } from './plan.ts';

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
};

/** The model's version label: the page names it and every row's maths is checked against it. */
export const MODEL_VERSION = 'launchline-3';

/** A row's confidence in its own number, from the category's sample count and the protocol's record. */
export type Confidence = 'high' | 'medium' | 'low';

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
  multiple: number;
  multiple_samples: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  capital_usd: number;
  hold_days: number;
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
  multiple: number;
  multiple_samples: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  watchlisted: boolean;
  capital_usd: number;
  hold_days: number;
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
}

/** Everything the dashboard needs: the ranked board, the calibration, the live set and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
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

/** The three multipliers and the implied value one protocol gets under the measured table. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; multiple: number; samples: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(model.growth_floor, model.growth_cap, finite(protocol.change_7d, 0));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const measured = multipleFor(calibration, protocol.category);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * measured.multiple * growthMult * maturityMult));
  return {
    implied,
    growthPct,
    growthMult,
    maturityMult,
    age,
    multiple: measured.multiple,
    samples: measured.samples,
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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks: the whole watchlist, then every other rankable pre-token protocol. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration = calibrate(snapshot.protocols), model: ModelConstants = MODEL): BoardRow[] {
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

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, calibration, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

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
    age_days: s.age,
    implied_value_usd: s.implied,
    multiple: round4(s.multiple),
    multiple_samples: s.samples,
    growth_multiplier: round4(s.growthMult),
    maturity_multiplier: round4(s.maturityMult),
    capital_usd: capitalFor(s.p.tvl_usd),
    hold_days: holdDaysFor(s.age),
    confidence: confidenceFor(s.age, s.p.tvl_usd, s.samples),
    farm_steps: farmPlan(s.p, s.age).map(stepText),
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
    multiple: row.multiple,
    multiple_samples: row.multiple_samples,
    growth_multiplier: row.growth_multiplier,
    maturity_multiplier: row.maturity_multiplier,
    watchlisted: row.watchlisted,
    capital_usd: row.capital_usd,
    hold_days: row.hold_days,
    confidence: row.confidence,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  calibration: Calibration = calibrate(snapshot.protocols),
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const covered = snapshot.watchlist.filter((slug) => board.some((r) => r.slug === slug)).length;
  const ages = board.map((r) => r.age_days).filter((d): d is number => d !== null);
  const growths = board.map((r) => r.change_7d).filter((g): g is number => g !== null);
  const categories = new Set(board.map((r) => r.category ?? 'Uncategorised'));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
