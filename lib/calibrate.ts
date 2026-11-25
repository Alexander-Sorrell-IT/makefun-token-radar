// The base multiple, measured from the snapshot itself.
//
// A pre-token protocol's TVL is only worth something relative to what the market pays for TVL in the
// same category. The snapshot carries both sides of that ratio for the protocols whose token already
// trades: mcap_usd / tvl_usd. So the model does not carry a constant 0.3; it carries a table measured
// on this snapshot, one median per category (with at least three trading protocols to its name), and a
// median over the whole snapshot where a category is too thin to speak for itself.
//
// Only the snapshot's own records are read. Nothing here knows a protocol by name, and the same
// function on another snapshot returns another table.

import type { SnapshotProtocol } from './model.ts';

/** One category's measured multiple: what the market paid for a dollar of TVL. */
export interface Multiple {
  multiple: number;
  samples: number;
  measured: boolean;
}

/** The whole measured table: one entry per category, plus the snapshot-wide fallback. */
export interface Calibration {
  by_category: Record<string, Multiple>;
  overall: Multiple;
  ratios: number;
  protocols_with_token: number;
}

/** Ratios are clamped before they are averaged: a $1 TVL with a $1B cap is noise, not a multiple. */
const RATIO_FLOOR = 0.02;
const RATIO_CAP = 10;

/** The model's own bounds: whatever the table says, a dollar of TVL is worth between these. */
export const MULTIPLE_FLOOR = 0.05;
export const MULTIPLE_CAP = 4;

/** The smallest number of trading protocols a category needs before its own median is used. */
const MIN_SAMPLES = 3;

/** The middle of a list of numbers, averaging the two middles of an even one. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol's record carries a trading token and both figures the ratio needs. */
function hasRatio(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** One protocol's measured multiple, clamped, or null when its record cannot give one. */
export function protocolMultiple(p: SnapshotProtocol): number | null {
  if (!hasRatio(p)) return null;
  const ratio = p.mcap_usd! / p.tvl_usd;
  if (!Number.isFinite(ratio)) return null;
  return Math.min(RATIO_CAP, Math.max(RATIO_FLOOR, ratio));
}

/** The measured table: medians per category, and the snapshot-wide median they fall back to. */
export function calibrate(protocols: SnapshotProtocol[]): Calibration {
  const byCategory: Record<string, number[]> = {};
  const all: number[] = [];
  for (const p of protocols) {
    const multiple = protocolMultiple(p);
    if (multiple === null) continue;
    all.push(multiple);
    const key = p.category ?? 'Uncategorised';
    (byCategory[key] ??= []).push(multiple);
  }

  const overallRaw = median(all);
  const overall: Multiple = {
    multiple: clamp(MULTIPLE_FLOOR, MULTIPLE_CAP, overallRaw),
    samples: all.length,
    measured: all.length > 0,
  };

  const table: Record<string, Multiple> = {};
  for (const [key, values] of Object.entries(byCategory)) {
    const own = values.length >= MIN_SAMPLES;
    table[key] = {
      multiple: clamp(MULTIPLE_FLOOR, MULTIPLE_CAP, own ? median(values) : overallRaw),
      samples: values.length,
      measured: own,
    };
  }

  return { by_category: table, overall, ratios: all.length, protocols_with_token: all.length };
}

/** A number kept inside [low, high]. */
export function clamp(low: number, high: number, value: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/** The multiple a protocol is priced at: its category's measured median, else the snapshot's. */
export function multipleFor(calibration: Calibration, category: string | null): Multiple {
  const key = category ?? 'Uncategorised';
  return calibration.by_category[key] ?? calibration.overall;
}
