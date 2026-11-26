// Charts, hand-drawn as SVG: no library, no canvas, no network.

const PALETTE = { amber: '#f4b740', teal: '#3ed6b8', violet: '#9d8cff', line: '#27333f', grid: '#1b2531', muted: '#7f8d9f' };

/** An axis label in the page's mono at 9px. */
function label(x, y, text, anchor = 'start') {
  return `<text class="label" x="${x}" y="${y}" text-anchor="${anchor}">${escape(text)}</text>`;
}

/** The page's own escaping for text that goes into markup. */
export function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The calibration as a dot chart: a dot per category, sized by its sample count, against the snapshot median. */
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
    label(overall + 4, top + 9, `all x${calibration.overall.multiple.toFixed(2)}`, 'start') +
    marks +
    `</svg>`
  );
}

/** The held-out test as a scatter: fitted multiple across, the multiple the market paid up; the diagonal is a perfect call. */
export function holdoutChart(test, width = 520, height = 300) {
  const points = test && Array.isArray(test.points) ? test.points.filter((p) => p.p > 0 && p.a > 0) : [];
  if (points.length === 0) return '<p class="sub">No held-out points on this snapshot.</p>';
  const logs = points.flatMap((p) => [Math.log10(p.p), Math.log10(p.a)]);
  const lo = Math.min(...logs) - 0.2;
  const hi = Math.max(...logs) + 0.2;
  const left = 44;
  const right = width - 14;
  const top = 12;
  const bottom = height - 34;
  const x = (v) => left + ((Math.log10(v) - lo) / (hi - lo)) * (right - left);
  const y = (v) => bottom - ((Math.log10(v) - lo) / (hi - lo)) * (bottom - top);

  const ticks = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30].filter((v) => Math.log10(v) >= lo && Math.log10(v) <= hi);
  const grid = ticks
    .map(
      (v) =>
        `<line class="grid-line" x1="${x(v).toFixed(1)}" y1="${top}" x2="${x(v).toFixed(1)}" y2="${bottom}" />` +
        `<line class="grid-line" x1="${left}" y1="${y(v).toFixed(1)}" x2="${right}" y2="${y(v).toFixed(1)}" />` +
        label(x(v), bottom + 14, `x${v}`, 'middle') +
        label(left - 6, y(v) + 3, `x${v}`, 'end'),
    )
    .join('');

  const dots = points
    .map((p) => `<circle class="dot" cx="${x(p.p).toFixed(1)}" cy="${y(p.a).toFixed(1)}" r="3" fill-opacity="0.75"><title>fitted x${p.p}, market x${p.a}</title></circle>`)
    .join('');

  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Held-out fitted multiple against the multiple the market paid">` +
    grid +
    `<line x1="${x(10 ** lo).toFixed(1)}" y1="${y(10 ** lo).toFixed(1)}" x2="${x(10 ** hi).toFixed(1)}" y2="${y(10 ** hi).toFixed(1)}" stroke="${PALETTE.teal}" stroke-width="1" stroke-dasharray="4 4" />` +
    dots +
    label(left + 4, top + 10, 'perfect call', 'start') +
    `<text class="label" x="${(left + right) / 2}" y="${height - 4}" text-anchor="middle">fitted multiple, log scale</text>` +
    `</svg>`
  );
}

/** A protocol's peers as horizontal bars, the selected row in teal. */
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
          `<text class="label" x="${w + 6}" y="${y + 12}" fill="${PALETTE.muted}">${escape(name)}</text>`
        );
      })
      .join('') +
    `</svg>`
  );
}
