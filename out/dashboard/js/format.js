// Formatting, one job: every figure on the page passes through here, so a dollar reads as a dollar
// everywhere and no view carries its own rounding.

/** A dollar figure in the shortest form that keeps its scale: $436.0M, $2.75B, $940K. */
export function usd(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
}

/** A dollar figure with cents, for a number a reader compares across rows: $2.47 an hour. */
export function usdFine(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1e6) return usd(value);
  if (abs >= 1e3) return `$${Math.round(value).toLocaleString('en-US')}`;
  return `$${value.toFixed(2)}`;
}

/** A percentage with its sign, to two places. */
export function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** A plain percentage with a fixed number of places, no sign: 17.2%. */
export function percentPoint(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(digits)}%`;
}

/** A multiplier as the model states it: x0.2138. */
export function multiple(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `x${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}

/** A multiplier with two places, for a table that compares several side by side. */
export function multiple2(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `x${value.toFixed(2)}`;
}

/** An age in days as a reader says it: 45d, 1.5y. */
export function age(days) {
  if (days === null || days === undefined) return 'unlisted';
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  return `${Math.max(0, Math.round(days))}d`;
}

/** A count with thousands separators. */
export function count(value) {
  return Number(value).toLocaleString('en-US');
}

/** A ledger date as it is: 2025-05-20. */
export function date(value) {
  return value ? String(value) : 'unlisted';
}

/** The sign a change carries, for the class that colours it. */
export function signClass(value) {
  if (value === null || value === undefined) return '';
  return value >= 0 ? 'pos' : 'neg';
}

/** The chains, two of them, for a row's second line. */
export function chainsOf(row) {
  if (!row.chains || row.chains.length === 0) return 'unnamed chain';
  return row.chains.slice(0, 2).join(', ');
}

/** A category, or the word for a record that carries none. */
export function categoryOf(row) {
  return row.category || 'Uncategorised';
}
