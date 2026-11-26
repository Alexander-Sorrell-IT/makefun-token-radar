// The fitted tilt, and the two held-out tests that decide whether to trust it.
//
// The category median says what a dollar of TVL is worth in that category. It does not say whether a
// particular protocol is worth more or less than its category's median. Two snapshot figures do: how
// much TVL it holds (a $5M protocol and a $5B one are not priced alike) and how fast that TVL moved in
// seven days. So the model fits
//
//   ln( ratio / categoryMedian ) = a + b * z(log10 tvl) + c * z(change_7d) + ridge penalty
//
// by least squares over the snapshot's own trading protocols, where ratio = mcap_usd / tvl_usd. The two
// inputs are centred at their means, so `a` is the typical log deviation and `b`, `c` the tilt per unit.
//
// An unpenalised fit on 128 protocols with one weak signal is not a model, it is a way to price a small
// protocol 13x its category median on noise. The penalty is chosen by five-fold cross-validation inside
// the data: five candidate values, each fitted on four folds and scored on the fifth, and the one with
// the lowest out-of-sample log error is used. The chosen value is printed on the method page with the
// cross-validation error beside it.
//
// The fit is only worth printing if it survives data it was not fitted on. This file therefore runs two
// tests after the fit: it splits the trading protocols by a hash of their slug into roughly 70/30, fits
// on the 70, and scores the 30 against two numbers — the fit, and the category median that would have
// been used without it. It runs the split twice, the second time reversed, and reports the out-of-sample
// rank correlation (Spearman IC), the median absolute percentage error and the share of held-out
// protocols the fit prices closer than the median does.

import { median, clamp, MULTIPLE_CAP, MULTIPLE_FLOOR, type Calibration } from './calibrate.ts';
import type { SnapshotProtocol } from './model.ts';

/** The 90% band the model puts on every row's multiple. */
export const INTERVAL_Z = 1.645;

/** The smallest number of trading protocols a category needs before its own median stands alone. */
const MIN_MEDIAN_SAMPLES = 3;

/** The penalty grid the cross-validation chooses from; the penalty is scaled by the sample count. */
export const RIDGE_GRID = [0, 0.25, 1, 4, 16];

/** One trading protocol, as the fit reads it. */
interface Point {
  slug: string;
  key: string;
  ratio: number;
  logTvl: number;
  growth: number;
}

/** The fitted line, its regularised inverse, and its error. */
interface Core {
  intercept: number;
  tvl: number;
  growth: number;
  mean_log_tvl: number;
  mean_growth: number;
  residual_sd: number;
  r2: number;
  samples: number;
  lambda: number;
  xtx_inv: number[][];
}

/** One held-out test's numbers: the fit against the median it would have replaced. */
export interface FitTest {
  name: string;
  train: number;
  test: number;
  mae_log: number;
  baseline_mae_log: number;
  median_abs_pct: number;
  baseline_median_abs_pct: number;
  ic: number;
  baseline_ic: number;
  beats_pct: number;
  points: { p: number; a: number }[];
}

/** Everything the page prints about the fit: its line, its penalty, its error, and both tests. */
export interface Fit {
  intercept: number;
  tvl: number;
  growth: number;
  mean_log_tvl: number;
  mean_growth: number;
  residual_sd: number;
  r2: number;
  samples: number;
  interval_z: number;
  lambda: number;
  cv_mae_log: number;
  /** The regularised inverse of the normal equations: the per-row band is computed from it. */
  xtx_inv: number[][];
  tests: FitTest[];
}

/** A finite number, else the fallback. */
function finite(value: number | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A protocol's market cap per dollar of TVL, or null when the record cannot give one. */
export function ratioOf(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  const ratio = p.mcap_usd / p.tvl_usd;
  return Number.isFinite(ratio) ? ratio : null;
}

/** FNV-1a over the slug: a split that is stable between runs and knows no protocol by name. */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The trading protocols as fit points. */
function pointsOf(protocols: SnapshotProtocol[]): Point[] {
  const points: Point[] = [];
  for (const p of protocols) {
    const ratio = ratioOf(p);
    if (ratio === null) continue;
    points.push({
      slug: p.slug,
      key: p.category ?? 'Uncategorised',
      ratio,
      logTvl: Math.log10(p.tvl_usd),
      growth: clamp(-60, 150, finite(p.change_7d)),
    });
  }
  return points;
}

/** Category medians over one set of points: the median the fit is measured against, and the fallback. */
function mediansOf(points: Point[]): Record<string, number> {
  const groups: Record<string, number[]> = {};
  for (const p of points) (groups[p.key] ??= []).push(p.ratio);
  const overallRaw = median(points.map((p) => p.ratio));
  const overall = clamp(MULTIPLE_FLOOR, MULTIPLE_CAP, overallRaw);
  const out: Record<string, number> = { __overall: overall };
  for (const [key, values] of Object.entries(groups)) {
    out[key] = clamp(MULTIPLE_FLOOR, MULTIPLE_CAP, values.length >= MIN_MEDIAN_SAMPLES ? median(values) : overallRaw);
  }
  return out;
}

/** The median a point's category is priced at, else the set's overall median. */
function medianFor(medians: Record<string, number>, key: string): number {
  return medians[key] ?? medians.__overall ?? 1;
}

/** Solve a 3x3 system by Gaussian elimination with partial pivoting. */
function solve3(matrix: number[][], vector: number[]): [number, number, number] {
  const a = matrix.map((row, i) => [...row, vector[i] ?? 0]);
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(a[r]![i]!) > Math.abs(a[pivot]![i]!)) pivot = r;
    if (pivot !== i) {
      const swapped = a[i]!;
      a[i] = a[pivot]!;
      a[pivot] = swapped;
    }
    const pivotValue = a[i]![i]!;
    if (Math.abs(pivotValue) < 1e-12) return [0, 0, 0];
    for (let c = i; c < 4; c++) a[i]![c] = a[i]![c]! / pivotValue;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const factor = a[r]![i]!;
      if (factor === 0) continue;
      for (let c = i; c < 4; c++) a[r]![c] = a[r]![c]! - factor * a[i]![c]!;
    }
  }
  return [a[0]![3]!, a[1]![3]!, a[2]![3]!];
}

/** The inverse of a 3x3 matrix, by solving it against the identity; null when it is singular. */
function inverse3(matrix: number[][]): number[][] | null {
  const out: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let c = 0; c < 3; c++) {
    const unit = [0, 0, 0];
    unit[c] = 1;
    const column = solve3(matrix, unit);
    for (let r = 0; r < 3; r++) out[r]![c] = column[r]!;
  }
  return out.every((row) => row.every((v) => Number.isFinite(v))) ? out : null;
}

/** The normal equations for one set of points, with the penalty already applied to the slopes. */
function normalEquations(points: Point[], medians: Record<string, number>, lambda: number): { xtx: number[][]; xty: number[]; design: number[][]; target: number[]; meanLogTvl: number; meanGrowth: number } {
  const meanLogTvl = points.reduce((s, p) => s + p.logTvl, 0) / Math.max(1, points.length);
  const meanGrowth = points.reduce((s, p) => s + p.growth / 100, 0) / Math.max(1, points.length);
  const design = points.map((p) => [1, p.logTvl - meanLogTvl, p.growth / 100 - meanGrowth]);
  const target = points.map((p) => Math.log(clamp(0.01, 100, p.ratio) / medianFor(medians, p.key)));
  const xtx = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const xty = [0, 0, 0];
  for (let i = 0; i < design.length; i++) {
    const row = design[i]!;
    for (let j = 0; j < 3; j++) {
      xty[j] += row[j]! * target[i]!;
      for (let k = 0; k < 3; k++) xtx[j]![k] += row[j]! * row[k]!;
    }
  }
  const penalty = lambda * Math.max(1, points.length);
  for (let j = 1; j < 3; j++) xtx[j]![j] += penalty;
  return { xtx, xty, design, target, meanLogTvl, meanGrowth };
}

/** Ordinary least squares with a ridge penalty on the two slopes: the fitted line and its own error. */
function fitOn(points: Point[], medians: Record<string, number>, lambda: number): Core {
  if (points.length < 8) {
    return {
      intercept: 0,
      tvl: 0,
      growth: 0,
      mean_log_tvl: 0,
      mean_growth: 0,
      residual_sd: 0.5,
      r2: 0,
      samples: points.length,
      lambda,
      xtx_inv: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    };
  }
  const { xtx, xty, design, target, meanLogTvl, meanGrowth } = normalEquations(points, medians, lambda);
  const [intercept, tvl, growth] = solve3(xtx, xty);
  let sse = 0;
  let sst = 0;
  const meanY = target.reduce((s, y) => s + y, 0) / target.length;
  for (let i = 0; i < design.length; i++) {
    const row = design[i]!;
    const pred = intercept + tvl * row[1]! + growth * row[2]!;
    sse += (target[i]! - pred) ** 2;
    sst += (target[i]! - meanY) ** 2;
  }
  const dof = Math.max(1, points.length - 3);
  return {
    intercept,
    tvl,
    growth,
    mean_log_tvl: meanLogTvl,
    mean_growth: meanGrowth,
    residual_sd: Math.sqrt(sse / dof),
    r2: sst > 0 ? 1 - sse / sst : 0,
    samples: points.length,
    lambda,
    xtx_inv: inverse3(xtx) ?? [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  };
}

/** The multiple a fitted line gives one protocol: its category's median, tilted by its size and growth. */
export function multipleAt(core: Core, medians: Record<string, number>, key: string, tvl: number, growth: number | null): number {
  const base = medianFor(medians, key);
  const z1 = (tvl > 0 ? Math.log10(tvl) : 0) - core.mean_log_tvl;
  const z2 = clamp(-60, 150, finite(growth)) / 100 - core.mean_growth;
  const tilt = Math.exp(core.intercept + core.tvl * z1 + core.growth * z2);
  return clamp(MULTIPLE_FLOOR, MULTIPLE_CAP, base * tilt);
}

/** The standard error of the fitted log-multiple at one protocol, from the regularised inverse. */
export function logMultipleSe(fit: Fit, z1: number, z2: number): number {
  const m = fit.xtx_inv;
  if (m === undefined) return 0.3;
  const x = [1, z1, z2];
  let quad = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) quad += x[i]! * m[i]![j]! * x[j]!;
  return Math.max(1e-4, fit.residual_sd * Math.sqrt(Math.max(0, quad)));
}

/** The z-scores the fit reads for one protocol. */
export function zScores(fit: Fit, tvl: number, growth: number | null): [number, number] {
  return [(tvl > 0 ? Math.log10(tvl) : 0) - fit.mean_log_tvl, clamp(-60, 150, finite(growth)) / 100 - fit.mean_growth];
}

/** Mean absolute log error of a fitted line on a set of points. */
function maeOf(core: Core, medians: Record<string, number>, points: Point[]): number {
  let sum = 0;
  for (const p of points) {
    const pred = multipleAt(core, medians, p.key, 10 ** p.logTvl, p.growth);
    sum += Math.abs(Math.log(Math.max(1e-9, pred) / Math.max(1e-9, p.ratio)));
  }
  return sum / Math.max(1, points.length);
}

/** Five-fold cross-validation over the penalty grid: the penalty with the lowest held-fold error. */
function crossValidate(points: Point[], medians: Record<string, number>): { lambda: number; mae: number } {
  const folds = Array.from({ length: 5 }, () => [] as Point[]);
  for (const p of points) folds[hashOf(p.slug) % 5]!.push(p);
  let best = { lambda: 0, mae: Infinity };
  for (const lambda of RIDGE_GRID) {
    let total = 0;
    let counted = 0;
    for (let f = 0; f < folds.length; f++) {
      const train = folds.filter((_, i) => i !== f).flat();
      const test = folds[f]!;
      if (train.length < 8 || test.length === 0) continue;
      const core = fitOn(train, medians, lambda);
      total += maeOf(core, medians, test) * test.length;
      counted += test.length;
    }
    const mae = counted === 0 ? Infinity : total / counted;
    if (mae < best.mae) best = { lambda, mae };
  }
  return { lambda: best.lambda, mae: Number.isFinite(best.mae) ? best.mae : 0 };
}

/** Ranks with ties averaged, for the rank correlation. */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]!.i] = rank;
    i = j + 1;
  }
  return out;
}

/** Pearson correlation of two lists, zero when either has no spread. */
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Spearman's rank correlation: does the fit put the protocols in the right order? */
export function spearman(a: number[], b: number[]): number {
  return pearson(ranks(a), ranks(b));
}

/** Score one held-out set: the fitted multiple against the category median it replaces. */
function testOn(name: string, core: Core, medians: Record<string, number>, test: Point[]): FitTest {
  const predicted = test.map((p) => multipleAt(core, medians, p.key, 10 ** p.logTvl, p.growth));
  const baseline = test.map((p) => medianFor(medians, p.key));
  const actual = test.map((p) => p.ratio);
  const logErr = (values: number[]): number =>
    values.reduce((sum, v, i) => sum + Math.abs(Math.log(Math.max(1e-9, v) / Math.max(1e-9, actual[i]!))), 0) / Math.max(1, values.length);
  const absPct = (values: number[]): number => median(values.map((v, i) => Math.abs(v / Math.max(1e-9, actual[i]!) - 1))) * 100;
  let beats = 0;
  let counted = 0;
  for (let i = 0; i < test.length; i++) {
    const fitErr = Math.abs(predicted[i]! - actual[i]!);
    const baseErr = Math.abs(baseline[i]! - actual[i]!);
    if (fitErr === baseErr) continue;
    counted += 1;
    if (fitErr < baseErr) beats += 1;
  }
  const stride = Math.max(1, Math.ceil(test.length / 60));
  const points: { p: number; a: number }[] = [];
  for (let i = 0; i < test.length; i += stride) {
    points.push({ p: Math.round(predicted[i]! * 1e4) / 1e4, a: Math.round(actual[i]! * 1e4) / 1e4 });
  }
  return {
    name,
    train: core.samples,
    test: test.length,
    mae_log: logErr(predicted),
    baseline_mae_log: logErr(baseline),
    median_abs_pct: absPct(predicted),
    baseline_median_abs_pct: absPct(baseline),
    ic: spearman(predicted, actual),
    baseline_ic: 0,
    beats_pct: counted === 0 ? 0 : (beats / counted) * 100,
    points,
  };
}

/** The fit on every trading protocol, plus two held-out tests that were not part of it. */
export function fitModel(protocols: SnapshotProtocol[], calibration: Calibration): Fit {
  const points = pointsOf(protocols);
  const medians = mediansOf(points);
  medians.__overall = calibration.overall.multiple;
  for (const [key, entry] of Object.entries(calibration.by_category)) medians[key] = entry.multiple;
  const cv = crossValidate(points, medians);
  const core = fitOn(points, medians, cv.lambda);

  const splitA = { train: points.filter((p) => hashOf(p.slug) % 10 < 7), test: points.filter((p) => hashOf(p.slug) % 10 >= 7) };
  const splitB = { train: points.filter((p) => hashOf(p.slug) % 10 >= 3), test: points.filter((p) => hashOf(p.slug) % 10 < 3) };

  const tests: FitTest[] = [];
  for (const [name, split] of [
    ['A · fit 70%, test 30%', splitA],
    ['B · the reversed split', splitB],
  ] as const) {
    if (split.train.length < 8 || split.test.length < 3) continue;
    const trainMedians = mediansOf(split.train);
    const trainCore = fitOn(split.train, trainMedians, cv.lambda);
    const result = testOn(name, trainCore, trainMedians, split.test);
    result.train = split.train.length;
    tests.push(result);
  }

  return {
    intercept: core.intercept,
    tvl: core.tvl,
    growth: core.growth,
    mean_log_tvl: core.mean_log_tvl,
    mean_growth: core.mean_growth,
    residual_sd: core.residual_sd,
    r2: core.r2,
    samples: core.samples,
    interval_z: INTERVAL_Z,
    lambda: cv.lambda,
    cv_mae_log: cv.mae,
    xtx_inv: core.xtx_inv,
    tests,
  };
}

/** The medians the model prices against: the calibration table, plus its snapshot-wide fallback. */
export function medianTable(calibration: Calibration): Record<string, number> {
  const table: Record<string, number> = { __overall: calibration.overall.multiple };
  for (const [key, entry] of Object.entries(calibration.by_category)) table[key] = entry.multiple;
  return table;
}
