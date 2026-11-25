// The board verifier: a second pair of eyes on the ranking before main.ts writes anything.
//
// The gate refuses a board for reasons that are all visible here, and a run that fails at 3am should
// say which row is wrong, not hand in a file the scorer will reject. Every check below is derived from
// the snapshot the entry was handed: the watchlist, the protocol slugs and the row shape.
//
// verifyBoard throws a BoardError naming the first problem, with the row's slug and rank where there
// is one. main.ts calls it after buildRadar and before mkdir(out): nothing is written for a bad board.

import type { BoardRow, Snapshot } from './model.ts';

/** Why a board is not shippable, with the row that caused it. */
export class BoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardError';
  }
}

/** What a shippable board looks like, for the run's one-line summary. */
export interface BoardReport {
  rows: number;
  watchlist: number;
  early: number;
  leader: string;
  leader_value: number;
}

/** A positive whole number of dollars, at most the gate's ceiling. */
function isPositiveWhole(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
}

/**
 * Verify one board against the snapshot it came from. Throws BoardError on the first problem:
 * a missing watchlist slug, a rank that is not 1..N once each, a rank order that rises, a duplicate
 * slug, a slug the snapshot does not list, an implied value off the gate's shape, or a farm plan
 * outside the 3..12 steps and 20..600 characters the gate reads.
 */
export function verifyBoard(board: BoardRow[], snapshot: Snapshot): BoardReport {
  if (board.length < 100) {
    throw new BoardError(`the board holds ${board.length} rows; the gate wants at least 100`);
  }

  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!known.has(row.slug)) {
      throw new BoardError(`row ${row.rank} names ${row.slug}, which the snapshot does not list`);
    }
    if (seen.has(row.slug)) {
      throw new BoardError(`row ${row.rank} repeats ${row.slug}`);
    }
    seen.add(row.slug);
    if (typeof row.name !== 'string' || row.name.length === 0) {
      throw new BoardError(`row ${row.rank} (${row.slug}) has no name`);
    }
    if (!isPositiveWhole(row.rank)) {
      throw new BoardError(`row ${row.slug} has rank ${String(row.rank)}`);
    }
    if (!isPositiveWhole(row.implied_value_usd) || row.implied_value_usd > 100_000_000_000_000) {
      throw new BoardError(`row ${row.rank} (${row.slug}) has implied value ${String(row.implied_value_usd)}`);
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      throw new BoardError(`row ${row.rank} (${row.slug}) has ${row.farm_steps?.length ?? 0} farm steps`);
    }
    for (const step of row.farm_steps) {
      const trimmed = typeof step === 'string' ? step.trim() : '';
      if (trimmed.length < 20 || trimmed.length > 600) {
        throw new BoardError(`row ${row.rank} (${row.slug}) has a farm step of ${trimmed.length} characters`);
      }
    }
  }

  // Ranks are exactly 1..N once each: the board's order is its own claim, not the array's order.
  const sortedRanks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== i + 1) {
      throw new BoardError(`rank ${i + 1} is ${String(sortedRanks[i])}: ranks must be 1..${board.length} once each`);
    }
  }

  // Implied value never rises as rank ascends: rank 1 is the strongest call.
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      throw new BoardError(`row ${i + 1} (${board[i]!.slug}) outranks row ${i} on implied value`);
    }
  }

  // A board whose rows all share one value ranks nothing by value, and the gate refuses it.
  if (board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    throw new BoardError(`all ${board.length} rows share implied value ${board[0]!.implied_value_usd}`);
  }

  // Every watchlist slug is on the board: the coverage row is 1.0, never a gamble.
  const missing = snapshot.watchlist.filter((slug) => !seen.has(slug));
  if (missing.length > 0) {
    throw new BoardError(`the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`);
  }

  const covered = board.filter((row) => row.watchlisted).length;
  const leader = board[0]!;
  return {
    rows: board.length,
    watchlist: covered,
    early: board.length - covered,
    leader: leader.name,
    leader_value: leader.implied_value_usd,
  };
}
