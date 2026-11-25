// Charts, drawn by hand as SVG strings: no library, no canvas, no network. Each builder takes the data
// it needs and returns markup, so a view can put it in place with one assignment.

const PALETTE = { amber: '#f4b740', teal: '#3ed6b8', violet: '#9d8cff', line: '#27333f', grid: '#1b2531', muted: '#7f8d9f' };

/** An axis label in the page's mono at 9px. */
function label(x, y, text, anchor = 'start') {
  return `<text class="label" x="${x}" y="${y}" text-anchor="${anchor}">${escape(text)}</text>`;
}

/** The page's own escaping for text that goes into markup. */
export function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The calibration as a dot chart: one row per category, a dot at the multiple the market paid for a
 * dollar of that category's TVL, sized by how many trading protocols the median was taken from. The
 * dashed line is the snapshot-wide median every thin category falls back to.
 */
export function calibrationChart(calibration, width = 720) {
  const rows = Object.entries(calibration.by_category)
    .map(([category, m]) => ({ category, ...m }))
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, 12);
  if (rows.length === 0) return '<p class="sub">No category in this snapshot carries a trading token.</p>';

  const left = 132;
  const right = width - 56;
  const top = 16;
  const rowHeight = 22;
  const height = top + rows.length * rowHeight + 26;
  const max = Math.max(...rows.map((r) => r.multiple), 0.5) * 1.15;
  const x = (v) => left + (v / max) * (right - left);
  const overall = x(Math.min(calibration.overall.multiple, max));

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const gx = left + f * (right - left);
      return `<line class="grid-line" x1="${gx.toFixed(1)}" y1="${top}" x2="${gx.toFixed(1)}" y2="${height - 26}" />` +
        label(gx, height - 10, `x${(f * max).toFixed(2)}`, 'middle');
    })
    .join('');

  const marks = rows
    .map((r, i) => {
      const cy = top + i * rowHeight + 9;
      const cx = x(r.multiple);
      const size = Math.min(9, 3 + Math.sqrt(r.samples));
      return (
        `<line class="grid-line" x1="${left}" y1="${cy}" x2="${right}" y2="${cy}" />` +
        label(left - 8, cy + 3, r.category.length > 22 ? `${r.category.slice(0, 21)}…` : r.category, 'end') +
        `<circle class="dot" cx="${cx.toFixed(1)}" cy="${cy}" r="${size.toFixed(1)}" fill-opacity="${r.measured ? 0.9 : 0.4}"><title>${escape(r.category)}: ${r.multiple.toFixed(2)} from ${r.samples}</title></circle>`
      );
    })
    .join('');

  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Measured market-cap to TVL multiple by category">` +
    grid +
    `<line x1="${overall.toFixed(1)}" y1="${top}" x2="${overall.toFixed(1)}" y2="${height - 26}" stroke="${PALETTE.teal}" stroke-width="1" stroke-dasharray="4 4" />` +
    label(overall + 4, top + 9, `all ${calibration.overall.multiple.toFixed(2)}`, 'start') +
    marks +
    `</svg>`
  );
}

/**
 * A protocol's peers as horizontal bars: the same category's rows by implied value, the selected row in
 * teal, ten at most. The page uses it on the detail view, where a bar chart is the fastest comparison.
 */
export function peerBars(rows, selectedSlug, width = 420) {
  const shown = rows.slice(0, 8);
  if (shown.length === 0) return '';
  const rowHeight = 20;
  const top = 6;
  const height = top + shown.length * rowHeight + 8;
  const max = Math.max(...shown.map((r) => r.implied_value_usd), 1);
  const left = 0;
  const right = width - 74;
  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Implied value of this protocol's peers">` +
    shown
      .map((r, i) => {
        const y = top + i * rowHeight;
        const w = Math.max(2, (r.implied_value_usd / max) * (right - left));
        const fill = r.slug === selectedSlug ? PALETTE.teal : PALETTE.amber;
        const name = r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name;
        return (
          `<rect class="bar-mark" x="${left}" y="${y + 3}" width="${w.toFixed(1)}" height="9" rx="2" fill="${fill}" fill-opacity="${r.slug === selectedSlug ? 1 : 0.42}" />` +
          label(left, y + 0, '') +
          `<text class="label" x="${w + 6}" y="${y + 12}" fill="${PALETTE.muted}">${escape(name)}</text>`
        );
      })
      .join('') +
    `</svg>`
  );
}
