// The farm plan: what a reader does about a protocol, what it costs, and what it is worth an hour.
//
// Two halves, both derived from the protocol's own record (category, chains, TVL, age) and the model's
// implied value for it:
//
//   the steps   — wallet, position, weekly action, hold, claim, journal, ledger
//   the ledger  — the plan's expected value, its gas, its hours, its dollars an hour and the implied
//                 value at which it breaks even
//
// The ledger is deliberately conservative. A launch pool is assumed to be 8% of the implied value (a
// low end of what a token distribution puts in users' hands), and a reader's share of it is exactly their
// deposit's share of the protocol's TVL — no multiplier for points, volume or loyalty. Gas is the chain's
// own posted cost class: Ethereum mainnet pays mainnet gas, every other chain the L2 rate. Hours are
// counted, not guessed: three quarters of an hour to open, a quarter hour a week to keep the position
// alive, an hour to read the docs and claim. So a plan that says $4.20 an hour is a plan whose arithmetic
// a reader can redo with their own numbers, and a plan that says below break-even says so out loud.

import type { SnapshotProtocol } from './model.ts';

/** One step: the action, what it costs, how long it takes. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

/** The assumptions every plan shares, printed on the method page. */
export const PLAN_ASSUMPTIONS = {
  pool_share: 0.08,
  gas_open_ethereum: 12,
  gas_week_ethereum: 4,
  gas_close_ethereum: 4,
  gas_open_other: 1.5,
  gas_week_other: 0.4,
  gas_close_other: 1,
  hours_open: 0.75,
  hours_week: 0.25,
  hours_research_and_claim: 1,
};

/** The plan's economics: what it returns, what it costs, and its break-even. */
export interface PlanEconomics {
  pool_value_usd: number;
  share_pct: number;
  expected_value_usd: number;
  gas_usd: number;
  hours: number;
  net_usd: number;
  ev_per_hour_usd: number;
  break_even_implied_usd: number;
  min_capital_usd: number;
  verdict: string;
}

const CATEGORY_ACTIONS: { match: RegExp; verb: (name: string, chain: string, capital: number) => string }[] = [
  { match: /lend|cdp|collateral/i, verb: (n, c, k) => `Supply $${k} of USDC to ${n} on ${c} and keep the supply position open.` },
  { match: /dex|yield|leveraged/i, verb: (n, c, k) => `Provide $${k} of liquidity to ${n}'s deepest pool on ${c} and leave it in place.` },
  { match: /bridge/i, verb: (n, c, k) => `Bridge $${k} of USDC to ${c} through ${n} and use the funds inside its own app.` },
  { match: /staking|restak/i, verb: (n, c, k) => `Stake $${k} of ${c}'s staking asset through ${n} and keep the receipt token.` },
  { match: /perpetual|derivative/i, verb: (n, c, k) => `Deposit $${k} of USDC as margin on ${n} and open one small hedge.` },
  { match: /prediction/i, verb: (n, c, k) => `Fund $${k} on ${n} and take one market position you understand.` },
  { match: /curator|allocator/i, verb: (n, c, k) => `Deposit $${k} into a ${n} vault on ${c} and keep the vault shares.` },
  { match: /stable/i, verb: (n, c, k) => `Mint or deposit $${k} of the stable asset through ${n} on ${c}.` },
  { match: /rwa/i, verb: (n, c, k) => `Mint $${k} of ${n}'s yield asset on ${c} and hold it in the same wallet.` },
  { match: /insurance/i, verb: (n, c, k) => `Buy $${k} of cover from ${n} on ${c} and keep the policy receipt.` },
  { match: /liquid staking|lsd/i, verb: (n, c, k) => `Stake $${k} of ${c}'s asset through ${n} and hold the liquid receipt.` },
];

/** The protocol's first chain, or a phrase that reads in a sentence. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Whether the plan pays mainnet gas rather than an L2's. */
export function isMainnetGas(chain: string): boolean {
  return chain === 'Ethereum';
}

/**
 * The plan's working capital: a tenth of a percent of the protocol's TVL, stepped to $50, held between
 * $100 and $5,000. A position has to be sized against the pool it is farming, or the ledger compares a
 * $50 deposit with a billion-dollar protocol and finds a number that means nothing.
 */
export function capitalFor(tvl: number): number {
  const stepped = Math.round((tvl * 0.001) / 50) * 50;
  return Math.max(100, Math.min(5_000, stepped));
}

/** How long to hold: younger protocols get a longer window so the activity spans a snapshot. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A compact dollar figure for a sentence: $1.2K, $940, $3.40. */
function money(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  if (abs >= 10) return `$${Math.round(value)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * The plan's ledger: a 2% pool on the implied value, the reader's slice of it by capital share of TVL,
 * the chain's gas over the hold, counted hours, and the implied value at which the plan pays for itself.
 */
export function economicsFor(implied: number, tvl: number, capital: number, holdDays: number, chain: string): PlanEconomics {
  const weeks = Math.max(1, Math.ceil(holdDays / 7));
  const mainnet = isMainnetGas(chain);
  const gas =
    (mainnet ? PLAN_ASSUMPTIONS.gas_open_ethereum : PLAN_ASSUMPTIONS.gas_open_other) +
    (mainnet ? PLAN_ASSUMPTIONS.gas_week_ethereum : PLAN_ASSUMPTIONS.gas_week_other) * weeks +
    (mainnet ? PLAN_ASSUMPTIONS.gas_close_ethereum : PLAN_ASSUMPTIONS.gas_close_other);
  const share = tvl > 0 ? capital / tvl : 0;
  const pool = implied * PLAN_ASSUMPTIONS.pool_share;
  const expected = pool * share;
  const hours = PLAN_ASSUMPTIONS.hours_open + PLAN_ASSUMPTIONS.hours_week * weeks + PLAN_ASSUMPTIONS.hours_research_and_claim;
  const net = expected - gas;
  const round = (n: number): number => Math.round(n * 100) / 100;
  return {
    pool_value_usd: Math.round(pool),
    share_pct: share * 100,
    expected_value_usd: round(expected),
    gas_usd: round(gas),
    hours: round(hours),
    net_usd: round(net),
    ev_per_hour_usd: round(net / hours),
    break_even_implied_usd: Math.round(share > 0 ? gas / (PLAN_ASSUMPTIONS.pool_share * share) : 0),
    min_capital_usd: Math.round(implied > 0 ? (gas * tvl) / (PLAN_ASSUMPTIONS.pool_share * implied) : 0),
    verdict: net >= 1 ? 'clears its gas' : 'below break-even',
  };
}

/** The category's own action, or the neutral deposit when the category says nothing. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const rule = CATEGORY_ACTIONS.find((r) => r.match.test(p.category ?? ''));
  if (rule) return rule.verb(p.name, chain, capital);
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** The seven steps: wallet, position, repeat action, hold, claim, journal, ledger. */
export function farmPlan(p: SnapshotProtocol, age: number | null, implied: number, economics: PlanEconomics): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const gas = Math.max(1, Math.round(economics.gas_usd));
  const share = economics.share_pct < 0.001 ? '<0.001%' : `${economics.share_pct.toFixed(3)}%`;
  return [
    {
      action: `Fund a fresh wallet with $${capital} of USDC plus gas, and keep the seed phrase offline.`,
      cost: `$${capital} of capital and under $3 of gas for the first transaction`,
      time: '10 minutes',
    },
    {
      action: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas over the whole plan`,
      time: '15 minutes to open',
    },
    {
      action: `Repeat one qualifying action on ${p.name} every week: a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      action: `Hold the position for ${hold} days so the activity spans more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      action: `Check ${p.name}'s own documentation and points page before claiming, and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay a third party to claim',
      time: '15 minutes',
    },
    {
      action: `Record the wallet, the dates and every transaction, so the position can be repeated or unwound.`,
      cost: 'nothing but the journal entry',
      time: '5 minutes a week',
    },
    {
      action:
        `The plan's ledger: a ${PLAN_ASSUMPTIONS.pool_share * 100}% launch pool on the ${money(implied)} implied value is ${money(economics.pool_value_usd)}, ` +
        `this $${capital} position is ${share} of the protocol's TVL, so ${money(economics.expected_value_usd)} expected against $${gas} of gas ` +
        `over ${economics.hours} counted hours is ${money(economics.ev_per_hour_usd)} an hour. ` +
        `It ${economics.verdict} here; break-even needs a ${money(economics.break_even_implied_usd)} implied value at this position size.`,
      cost: `${money(economics.gas_usd)} of gas, already counted in the ledger`,
      time: `${economics.hours} hours of your own time`,
    },
  ];
}

/** A step as the board's own string: action, then cost, then time, inside the gate's 20 to 600 characters. */
export function stepText(step: FarmStep): string {
  let text = `${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Check the protocol's own documentation before you act.`;
  return text;
}
