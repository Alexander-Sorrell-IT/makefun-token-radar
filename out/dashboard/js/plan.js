// The farm plan, read back for the page: main.ts writes each step as one sentence carrying its cost and
// its time, and the detail view shows the three parts as three things. One job, so the split lives here
// rather than in every view that shows a plan.

/**
 * One written step, split into what to do, what it costs and how long it takes. The plan's format is
 * fixed by lib/plan.ts: "<action> Cost: <cost>. Time: <time>." A step that does not carry the markers is
 * shown whole, never dropped.
 */
export function splitStep(text) {
  const at = text.indexOf(' Cost: ');
  if (at < 0) return { action: text.trim(), cost: '', time: '' };
  const action = text.slice(0, at).trim();
  const tail = text.slice(at + 7);
  const timeAt = tail.lastIndexOf('. Time: ');
  if (timeAt < 0) return { action, cost: tail.replace(/\.$/, '').trim(), time: '' };
  const cost = tail.slice(0, timeAt).trim();
  const time = tail.slice(timeAt + 8).replace(/\.$/, '').trim();
  return { action, cost, time };
}

/** A row's whole plan, ready for the detail view's list. */
export function planOf(row) {
  return (row.farm_steps || []).map(splitStep);
}
