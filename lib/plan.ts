// The farm plan: what a reader does about a protocol, in steps that carry a cost and a time.
//
// Every sentence is derived from the protocol's own record (category, chains, TVL, age): the action
// follows the category, the capital follows the TVL, the hold follows how long it has run without a
// token. No protocol is named in this file, so two protocols in one category get the same shape of
// plan and their own numbers in it.

import type { SnapshotProtocol } from './model.ts';

/** One step: the action, what it costs, how long it takes. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
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

/** The plan's working capital: a share of what the protocol already holds, capped for a reader. */
export function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

/** How long to hold: younger protocols get a longer window so the activity spans a snapshot. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's own action, or the neutral deposit when the category says nothing. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const rule = CATEGORY_ACTIONS.find((r) => r.match.test(p.category ?? ''));
  if (rule) return rule.verb(p.name, chain, capital);
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** The six steps: wallet, position, repeat action, hold, claim, journal. */
export function farmPlan(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      action: `Fund a fresh wallet with $${capital} of USDC plus gas, and keep the seed phrase offline.`,
      cost: `$${capital} of capital and under $3 of gas for the first transaction`,
      time: '10 minutes',
    },
    {
      action: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
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
  ];
}

/** A step as the board's own string: action, then cost, then time, inside the gate's 20 to 600 characters. */
export function stepText(step: FarmStep): string {
  let text = `${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Check the protocol's own documentation before you act.`;
  return text;
}
