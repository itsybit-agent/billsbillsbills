/**
 * Monthly trend: the total (everything except Itsybit), one category, or up to
 * six categories stacked to compare. Small multiples for every category, and a
 * PNG of the big chart to share.
 *
 * Colour follows the category: a category takes the lowest free palette slot
 * when it's selected and keeps it until it's removed, so adding or removing
 * others never repaints it. The total (nothing selected) uses the look's accent.
 * Palette: the dataviz reference's first six categorical slots, validated
 * against every look's chart surface (light and dark) — see styles.css.
 */

import { computeInsights, spendingRows } from '../insights.js';
import { esc, f0 } from './kit.js';

export const MAX_COMPARE = 6;
const BUSINESS = 'Itsybit';
const GAP = 2; // surface gap between stacked segments

const shortMonth = m => new Date(`${m}-01`).toLocaleString('en-GB', { month: 'short' });
const longMonth = m => new Date(`${m}-01`).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
/** 0 / 950 / 1.2K / 12.5K / 120K */
const compact = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}K` : String(Math.round(n));

export function trendData() {
  const insights = computeInsights();
  if (!insights) return null;
  const rows = spendingRows();
  // A first month that only has its last few days in the data isn't a real month: leave it out
  const first = rows.map(t => t.date).sort()[0];
  const months = insights.months.filter(m => !(m === first?.substring(0, 7) && Number(first.substring(8, 10)) > 10 && insights.months.length > 1));
  const byCat = {};
  for (const t of rows) {
    const m = t.date.substring(0, 7);
    if (!months.includes(m)) continue;
    const c = (byCat[t.category] ||= Object.fromEntries(months.map(x => [x, 0])));
    c[m] += t.amount;
  }
  const series = Object.entries(byCat)
    .map(([category, byMonth]) => ({ category, values: months.map(m => byMonth[m]), total: months.reduce((s, m) => s + byMonth[m], 0) }))
    .sort((a, b) => b.total - a.total);
  return { months, series };
}

/**
 * Add or remove a category from the comparison (ui.trendSel: category → slot).
 * Returns false when it's already at the maximum.
 */
export function toggleTrendCategory(ui, category) {
  const sel = (ui.trendSel ||= new Map());
  if (sel.has(category)) { sel.delete(category); return true; }
  if (sel.size >= MAX_COMPARE) return false;
  const used = new Set(sel.values());
  let slot = 0;
  while (used.has(slot)) slot++;
  sel.set(category, slot);
  return true;
}

/** What the big chart shows right now: title and one or more series (bottom of the stack first). */
export function trendView(data, ui) {
  const sel = ui.trendSel || new Map();
  const zero = () => data.months.map(() => 0);
  let series;
  if (!sel.size) {
    const parts = data.series.filter(s => s.category !== BUSINESS);
    series = [{ category: 'Everything except Itsybit', slot: null, values: data.months.map((_, i) => parts.reduce((s, p) => s + p.values[i], 0)) }];
  } else {
    series = [...sel.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([category, slot]) => ({ category, slot, values: (data.series.find(s => s.category === category) || { values: zero() }).values }));
  }
  for (const s of series) s.total = s.values.reduce((a, b) => a + b, 0);
  const totals = data.months.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const total = totals.reduce((a, b) => a + b, 0);
  return { title: series.map(s => s.category).join(' + '), series, totals, total, avg: total / data.months.length };
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(f => f * step).find(x => x >= v);
}

/** Column (or top segment) with a 4px rounded data end, square at the bottom. */
function column(x, y, w, bottom, r = 4) {
  const h = bottom - y;
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${bottom}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${bottom}Z`;
}

/**
 * Stack layout for one month: a {top, bottom, rounded} box per series in
 * stack order, with a surface gap between segments and only the top rounded.
 */
function stackBoxes(series, i, y) {
  let cum = 0;
  const lastPositive = series.map(s => s.values[i] > 0).lastIndexOf(true);
  return series.map((s, k) => {
    const v = s.values[i];
    if (!(v > 0)) return null;
    const bottom = y(cum) - (cum > 0 ? GAP : 0);
    cum += v;
    const top = y(cum);
    return bottom - top >= 0.5 ? { top, bottom, rounded: k === lastPositive } : null;
  });
}

const fillClass = s => s.slot === null || s.slot === undefined ? 'tr-col' : `tr-col tr-s${s.slot + 1}`;

/** SVG column chart for one or more stacked series. mini = small multiple (no axes or labels). */
export function chartSVG(months, series, { mini = false, width = 340 } = {}) {
  // Drawn at its real pixel width so text and columns keep their size on a wide desk screen
  const W = mini ? 160 : width, H = mini ? 48 : (W > 600 ? 300 : 210);
  const pad = mini ? { l: 2, r: 2, t: 4, b: 2 } : { l: 34, r: 8, t: 22, b: 22 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b, base = pad.t + ph;
  const totals = months.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = mini ? Math.max(...totals, 1) : niceMax(Math.max(...totals));
  const band = pw / months.length;
  const bw = Math.min(mini ? 10 : 24, band - 2);
  const y = v => base - (v / max) * ph;
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const peak = totals.indexOf(Math.max(...totals));
  const last = totals.length - 1;

  const cols = months.map((_, i) => {
    const x = pad.l + band * i + (band - bw) / 2;
    return stackBoxes(series, i, y).map((b, k) => !b ? '' :
      `<path class="${fillClass(series[k])}" data-i="${i}" d="${b.rounded ? column(x, b.top, bw, b.bottom, mini ? 2 : 4) : `M${x},${b.bottom}V${b.top}H${x + bw}V${b.bottom}Z`}"/>`).join('');
  }).join('');

  if (mini) {
    return `<svg class="tr-svg tr-svg--mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line class="tr-base" x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}"/>${cols}</svg>`;
  }

  const cap = i => `<text class="tr-cap" x="${pad.l + band * i + band / 2}" y="${y(totals[i]) - 6}" text-anchor="middle">${compact(totals[i])}</text>`;
  return `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly spend, ${months.length} months">
    ${[0, max / 2, max].map(t => `<line class="tr-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Math.round(y(t)) + .5}" y2="${Math.round(y(t)) + .5}"/>
      <text class="tr-tick" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('')}
    ${avg > 0 ? `<line class="tr-avg" x1="${pad.l}" x2="${W - pad.r}" y1="${Math.round(y(avg)) + .5}" y2="${Math.round(y(avg)) + .5}"/>` : ''}
    ${cols}
    ${totals[peak] > 0 ? cap(peak) : ''}
    ${last !== peak && totals[last] > 0 ? cap(last) : ''}
    ${months.map((m, i) => `<text class="tr-tick" x="${pad.l + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${W > 600 ? shortMonth(m) : shortMonth(m)[0]}</text>`).join('')}
    ${months.map((m, i) => `<rect class="tr-hit" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ph}" data-i="${i}" tabindex="0" aria-label="${longMonth(m)}: ${f0(Math.round(totals[i]))}"></rect>`).join('')}
  </svg>`;
}

const swatch = s => `<i class="tr-swatch ${s.slot === null ? '' : `tr-s${s.slot + 1}`}"></i>`;

export function trendsSection(ui) {
  const data = trendData();
  if (!data) return '';
  const view = trendView(data, ui);
  const sel = ui.trendSel || new Map();
  const stacked = view.series.length > 1;
  const avgOf = s => s.total / data.months.length;
  // Card padding + border is 34px; the chart is drawn at the width it gets
  const width = Math.round(Math.min(Math.max((document.querySelector('#screen')?.clientWidth || 374) - 34, 300), 1100));

  return `
    <section class="card trends" style="display:grid;gap:10px">
      <div class="trend-filters">
        <span class="sub" style="margin:0">${sel.size ? `Comparing ${sel.size} of up to ${MAX_COMPARE}` : 'Tap categories to compare them'}</span>
        <button class="btn small" data-act="shareChart">Share image</button>
      </div>
      <div class="tr-chips" role="group" aria-label="Categories">
        <button class="chip ${sel.size ? '' : 'on'}" data-act="trendTotal" aria-pressed="${!sel.size}">Total</button>
        ${data.series.map(x => {
          const slot = sel.get(x.category);
          return `<button class="chip ${slot !== undefined ? 'on' : ''}" data-trend="${esc(x.category)}" aria-pressed="${slot !== undefined}">${slot !== undefined ? swatch({ slot }) : ''}${esc(x.category)}</button>`;
        }).join('')}
      </div>
      <div>
        <div class="h2" style="font-size:20px">${esc(view.title)}</div>
        <p class="sub" style="margin:2px 0 0">${f0(Math.round(view.total))} from ${shortMonth(data.months[0])} to ${longMonth(data.months.at(-1))} · avg ${f0(Math.round(view.avg))}/month, shown as the line</p>
      </div>
      ${stacked ? `<div class="tr-legend">${view.series.map(s => `<span>${swatch(s)}${esc(s.category)} <b class="num">${f0(Math.round(avgOf(s)))}/mo</b> · ${f0(Math.round(s.total))} total</span>`).join('')}</div>` : ''}
      <div class="tr-chart">
        ${chartSVG(data.months, view.series, { width })}
        <div class="tr-tip" hidden></div>
      </div>
      <details class="tr-table">
        <summary>Show numbers</summary>
        <div class="preview-table-wrapper"><table class="table">
          ${stacked ? `<tr><th></th>${view.series.map(s => `<th class="amount">${esc(s.category)}</th>`).join('')}<th class="amount">Total</th></tr>` : ''}
          ${data.months.map((m, i) => `<tr><td>${longMonth(m)}</td>${stacked ? view.series.map(s => `<td class="amount">${f0(Math.round(s.values[i]))}</td>`).join('') : ''}<td class="amount">${f0(Math.round(view.totals[i]))}</td></tr>`).join('')}
        </table></div>
      </details>
    </section>
    <div class="sect"><span>Every category</span><span style="font-weight:500">tap to add or remove</span></div>
    <div class="tr-grid-list">
      ${data.series.map(x => {
        const slot = sel.get(x.category);
        return `<button class="tr-mini ${slot !== undefined ? 'on' : ''}" data-trend="${esc(x.category)}" aria-pressed="${slot !== undefined}">
          <span class="tr-mini__head"><b>${slot !== undefined ? swatch({ slot }) : ''}${esc(x.category)}</b><span class="num">${f0(Math.round(x.total / data.months.length))}/mo</span></span>
          ${chartSVG(data.months, [{ values: x.values, slot: null }], { mini: true })}
        </button>`;
      }).join('')}
    </div>`;
}

/** Tap/hover a column: the month, every series in it and the total. */
export function wireTrendTooltips(ui) {
  const chart = document.querySelector('.tr-chart');
  if (!chart) return;
  const data = trendData();
  const view = trendView(data, ui);
  const tip = chart.querySelector('.tr-tip');
  const show = (rect) => {
    const i = Number(rect.dataset.i);
    // Category names come from the user's data: build with textContent
    tip.replaceChildren();
    const head = document.createElement('b');
    head.textContent = longMonth(data.months[i]);
    tip.append(head);
    const line = (label, value, slot) => {
      const row = document.createElement('div');
      if (slot !== undefined && slot !== null) {
        const sw = document.createElement('i');
        sw.className = `tr-swatch tr-s${slot + 1}`;
        row.append(sw);
      }
      row.append(`${label} ${f0(Math.round(value))}`);
      tip.append(row);
    };
    if (view.series.length > 1) {
      [...view.series].reverse().forEach(s => line(s.category, s.values[i], s.slot));
      line('Total', view.totals[i]);
    } else {
      line('', view.totals[i]);
    }
    tip.hidden = false;
    const box = rect.getBoundingClientRect(), outer = chart.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(box.left - outer.left + box.width / 2, 80), outer.width - 80)}px`;
    chart.classList.add('hovering');
    chart.querySelectorAll('.tr-col').forEach(c => c.classList.toggle('tr-col--hover', c.dataset.i === String(i)));
  };
  const hide = () => { tip.hidden = true; chart.classList.remove('hovering'); chart.querySelectorAll('.tr-col--hover').forEach(c => c.classList.remove('tr-col--hover')); };
  chart.querySelectorAll('.tr-hit').forEach(r => {
    r.addEventListener('pointerenter', () => show(r));
    r.addEventListener('pointerdown', () => show(r));
    r.addEventListener('focus', () => show(r));
  });
  chart.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
}

/** Draw the big chart as a 1080×1080 PNG in the current look's colours. */
export async function chartImage(ui) {
  const data = trendData();
  const view = trendView(data, ui);
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  const col = { surface: v('--surface') || '#fff', ink: v('--ink') || '#111', muted: v('--muted') || '#666', line: v('--line') || '#ddd', accent: v('--accent') || '#2448c8' };
  const fill = s => s.slot === null ? col.accent : v(`--s${s.slot + 1}`);
  const body = v('--f-body') || 'system-ui, sans-serif';
  const display = v('--f-display') || body;
  await document.fonts?.ready;

  const S = 1080, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = col.surface;
  g.fillRect(0, 0, S, S);

  // Title shrinks to fit when several categories are compared
  let size = 64;
  g.font = `700 ${size}px ${display}`;
  while (g.measureText(view.title).width > S - 144 && size > 36) g.font = `700 ${--size}px ${display}`;
  g.fillStyle = col.ink;
  g.fillText(view.title, 72, 140);
  g.fillStyle = col.muted;
  g.font = `400 34px ${body}`;
  g.fillText(`Monthly spend · ${shortMonth(data.months[0])}–${longMonth(data.months.at(-1))}`, 72, 196);
  g.fillText(`${f0(Math.round(view.total))} in total · avg ${f0(Math.round(view.avg))}/month (grey line)`, 72, 244);

  // Legend: swatch + name + total, wrapping onto a second row if needed
  let top = 340;
  if (view.series.length > 1) {
    g.font = `400 28px ${body}`;
    let x = 72, row = 300;
    for (const s of view.series) {
      const label = `${s.category} ${f0(Math.round(s.total / data.months.length))}/mo · ${f0(Math.round(s.total))} total`;
      const w = 34 + g.measureText(label).width + 36;
      if (x + w > S - 72) { x = 72; row += 44; }
      g.fillStyle = fill(s);
      g.beginPath(); g.roundRect ? g.roundRect(x, row - 22, 24, 24, 5) : g.rect(x, row - 22, 24, 24); g.fill();
      g.fillStyle = col.ink;
      g.fillText(label, x + 34, row);
      x += w;
    }
    top = row + 60;
  }

  const pad = { l: 150, r: 72, t: top, b: 150 };
  const pw = S - pad.l - pad.r, ph = S - pad.t - pad.b, base = pad.t + ph;
  const max = niceMax(Math.max(...view.totals));
  const y = val => base - (val / max) * ph;
  const band = pw / data.months.length;
  const bw = Math.min(64, band - 8);

  g.lineWidth = 2;
  g.font = `400 28px ${body}`;
  g.textAlign = 'right';
  for (const t of [0, max / 2, max]) {
    g.strokeStyle = col.line;
    g.beginPath(); g.moveTo(pad.l, Math.round(y(t)) + .5); g.lineTo(S - pad.r, Math.round(y(t)) + .5); g.stroke();
    g.fillStyle = col.muted;
    g.fillText(compact(t), pad.l - 18, y(t) + 10);
  }
  if (view.avg > 0) {
    g.strokeStyle = col.muted;
    g.beginPath(); g.moveTo(pad.l, y(view.avg)); g.lineTo(S - pad.r, y(view.avg)); g.stroke();
  }

  const peak = view.totals.indexOf(Math.max(...view.totals));
  const last = view.totals.length - 1;
  const gapY = GAP * (ph / 170); // keep the surface gap proportional at image scale
  data.months.forEach((m, i) => {
    const x = pad.l + band * i + (band - bw) / 2;
    let cum = 0;
    const lastPositive = view.series.map(s => s.values[i] > 0).lastIndexOf(true);
    view.series.forEach((s, k) => {
      const val = s.values[i];
      if (!(val > 0)) return;
      const bottom = y(cum) - (cum > 0 ? gapY : 0);
      cum += val;
      const t = y(cum);
      if (bottom - t < 1) return;
      g.fillStyle = fill(s);
      g.beginPath();
      if (k === lastPositive) {
        const r = Math.min(10, bottom - t, bw / 2);
        g.moveTo(x, bottom); g.lineTo(x, t + r); g.quadraticCurveTo(x, t, x + r, t);
        g.lineTo(x + bw - r, t); g.quadraticCurveTo(x + bw, t, x + bw, t + r); g.lineTo(x + bw, bottom);
      } else {
        g.rect(x, t, bw, bottom - t);
      }
      g.closePath(); g.fill();
    });
    g.textAlign = 'center';
    g.fillStyle = col.muted;
    g.font = `400 28px ${body}`;
    g.fillText(shortMonth(m), x + bw / 2, base + 48);
    if ((i === peak || i === last) && view.totals[i] > 0) {
      g.fillStyle = col.ink;
      g.font = `700 30px ${body}`;
      g.fillText(compact(view.totals[i]), x + bw / 2, y(view.totals[i]) - 16);
    }
  });

  g.textAlign = 'left';
  g.fillStyle = col.muted;
  g.font = `400 28px ${body}`;
  g.fillText('BillsBillsBills', 72, S - 32);

  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const slug = view.series.length > 1 ? view.series.map(s => s.category).join('-') : view.series[0].category;
  return new File([blob], `${slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-monthly.png`, { type: 'image/png' });
}
