/**
 * Monthly trend per category: one big column chart for the chosen category
 * (or everything), small multiples for every category, and a PNG of the big
 * chart to share. Single series, so one colour (the look's accent), no legend.
 */

import { computeInsights, spendingRows } from '../insights.js';
import { esc, f0 } from './kit.js';

export const ALL = '__all';
export const NO_ITSYBIT = '__noItsy';
const BUSINESS = 'Itsybit';

const shortMonth = m => new Date(`${m}-01`).toLocaleString('en-GB', { month: 'short' });
const longMonth = m => new Date(`${m}-01`).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
/** 0 / 950 / 1.2K / 17K */
const compact = n => n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}K` : String(Math.round(n));

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

/** The series for the filter value: a category, everything, or everything but the business. */
export function seriesFor(data, which) {
  if (which !== ALL && which !== NO_ITSYBIT) {
    return data.series.find(s => s.category === which) || { category: which, values: data.months.map(() => 0), total: 0 };
  }
  const parts = data.series.filter(s => which === ALL || s.category !== BUSINESS);
  const values = data.months.map((_, i) => parts.reduce((s, p) => s + p.values[i], 0));
  return { category: which === ALL ? 'Everything' : 'Everything except Itsybit', values, total: values.reduce((a, b) => a + b, 0) };
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(f => f * step).find(x => x >= v);
}

/** Column with a 4px rounded data end, square at the baseline. */
function column(x, y, w, base, r = 4) {
  const h = base - y;
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${base}Z`;
}

/** SVG column chart. mini = small multiple (no axes or labels). */
export function chartSVG(months, values, { mini = false } = {}) {
  const W = mini ? 160 : 340, H = mini ? 48 : 210;
  const pad = mini ? { l: 2, r: 2, t: 4, b: 2 } : { l: 34, r: 8, t: 22, b: 22 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b, base = pad.t + ph;
  const max = mini ? Math.max(...values, 1) : niceMax(Math.max(...values));
  const band = pw / months.length;
  const bw = Math.min(mini ? 10 : 24, band - 2);
  const y = v => base - (v / max) * ph;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const peak = values.indexOf(Math.max(...values));
  const last = values.length - 1;

  const cols = values.map((v, i) => {
    const x = pad.l + band * i + (band - bw) / 2;
    return `<path class="tr-col${i === peak && !mini ? ' tr-col--peak' : ''}" d="${column(x, y(v), bw, base, mini ? 2 : 4)}"/>`;
  }).join('');

  if (mini) {
    return `<svg class="tr-svg tr-svg--mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line class="tr-base" x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}"/>${cols}</svg>`;
  }

  const ticks = [0, max / 2, max];
  const cap = (i, text) => {
    const x = pad.l + band * i + band / 2;
    return `<text class="tr-cap" x="${x}" y="${y(values[i]) - 6}" text-anchor="middle">${text}</text>`;
  };
  return `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly spend, ${months.length} months">
    ${ticks.map(t => `<line class="tr-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Math.round(y(t)) + .5}" y2="${Math.round(y(t)) + .5}"/>
      <text class="tr-tick" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('')}
    ${avg > 0 ? `<line class="tr-avg" x1="${pad.l}" x2="${W - pad.r}" y1="${Math.round(y(avg)) + .5}" y2="${Math.round(y(avg)) + .5}"/>` : ''}
    ${cols}
    ${values[peak] > 0 ? cap(peak, compact(values[peak])) : ''}
    ${last !== peak && values[last] > 0 ? cap(last, compact(values[last])) : ''}
    ${months.map((m, i) => `<text class="tr-tick" x="${pad.l + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${shortMonth(m)[0]}</text>`).join('')}
    ${months.map((m, i) => `<rect class="tr-hit" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ph}" data-i="${i}" tabindex="0"><title>${longMonth(m)}: ${f0(values[i])}</title></rect>`).join('')}
  </svg>`;
}

export function trendsSection(ui) {
  const data = trendData();
  if (!data) return '';
  const which = ui.trendCat || NO_ITSYBIT;
  const s = seriesFor(data, which);
  const avg = s.total / data.months.length;
  const options = [[NO_ITSYBIT, 'Everything except Itsybit'], [ALL, 'Everything'], ...data.series.map(x => [x.category, x.category])];

  return `
    <section class="card trends" style="display:grid;gap:10px">
      <div class="trend-filters">
        <select class="select" id="trendCat" aria-label="Category">
          ${options.map(([v, label]) => `<option value="${esc(v)}" ${v === which ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
        <button class="btn small" data-act="shareChart">Share image</button>
      </div>
      <div>
        <div class="h2" style="font-size:20px">${esc(s.category)}</div>
        <p class="sub" style="margin:2px 0 0">${f0(Math.round(s.total))} from ${shortMonth(data.months[0])} to ${longMonth(data.months.at(-1))} · avg ${f0(Math.round(avg))}/month, shown as the line</p>
      </div>
      <div class="tr-chart" data-trend-values="${s.values.map(v => Math.round(v)).join(',')}" data-trend-months="${data.months.join(',')}">
        ${chartSVG(data.months, s.values)}
        <div class="tr-tip" hidden></div>
      </div>
      <details class="tr-table">
        <summary>Show numbers</summary>
        <table class="table">${data.months.map((m, i) => `<tr><td>${longMonth(m)}</td><td class="amount">${f0(Math.round(s.values[i]))}</td></tr>`).join('')}</table>
      </details>
    </section>
    <div class="sect"><span>Every category</span><span style="font-weight:500">tap one to look closer</span></div>
    <div class="tr-grid-list">
      ${data.series.map(x => `
        <button class="tr-mini ${x.category === which ? 'on' : ''}" data-trend="${esc(x.category)}">
          <span class="tr-mini__head"><b>${esc(x.category)}</b><span class="num">${f0(Math.round(x.total / data.months.length))}/mo</span></span>
          ${chartSVG(data.months, x.values, { mini: true })}
        </button>`).join('')}
    </div>`;
}

/** Tap/hover a column: show its month and amount. */
export function wireTrendTooltips() {
  const chart = document.querySelector('.tr-chart');
  if (!chart) return;
  const tip = chart.querySelector('.tr-tip');
  const values = chart.dataset.trendValues.split(',').map(Number);
  const months = chart.dataset.trendMonths.split(',');
  const show = (rect) => {
    const i = Number(rect.dataset.i);
    tip.textContent = `${longMonth(months[i])}: ${f0(values[i])}`;
    tip.hidden = false;
    const box = rect.getBoundingClientRect(), outer = chart.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(box.left - outer.left + box.width / 2, 70), outer.width - 70)}px`;
    chart.querySelectorAll('.tr-col').forEach((c, n) => c.classList.toggle('tr-col--hover', n === i));
  };
  const hide = () => { tip.hidden = true; chart.querySelectorAll('.tr-col--hover').forEach(c => c.classList.remove('tr-col--hover')); };
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
  const s = seriesFor(data, ui.trendCat || NO_ITSYBIT);
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  const col = { surface: v('--surface') || '#fff', ink: v('--ink') || '#111', muted: v('--muted') || '#666', line: v('--line') || '#ddd', accent: v('--accent') || '#2448c8' };
  const body = v('--f-body') || 'system-ui, sans-serif';
  const display = v('--f-display') || body;
  await document.fonts?.ready;

  const S = 1080, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = col.surface;
  g.fillRect(0, 0, S, S);

  const avg = s.total / data.months.length;
  g.fillStyle = col.ink;
  g.font = `700 64px ${display}`;
  g.fillText(s.category, 72, 140);
  g.fillStyle = col.muted;
  g.font = `400 34px ${body}`;
  g.fillText(`Monthly spend · ${shortMonth(data.months[0])}–${longMonth(data.months.at(-1))}`, 72, 196);
  g.fillText(`${f0(Math.round(s.total))} in total · avg ${f0(Math.round(avg))}/month (grey line)`, 72, 244);

  const pad = { l: 150, r: 72, t: 340, b: 150 };
  const pw = S - pad.l - pad.r, ph = S - pad.t - pad.b, base = pad.t + ph;
  const max = niceMax(Math.max(...s.values));
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
  if (avg > 0) {
    g.strokeStyle = col.muted; g.setLineDash([]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(pad.l, y(avg)); g.lineTo(S - pad.r, y(avg)); g.stroke();
  }

  const peak = s.values.indexOf(Math.max(...s.values));
  const last = s.values.length - 1;
  s.values.forEach((val, i) => {
    const x = pad.l + band * i + (band - bw) / 2, top = y(val), r = Math.min(10, base - top, bw / 2);
    if (base - top > 0) {
      g.fillStyle = col.accent;
      g.beginPath();
      g.moveTo(x, base); g.lineTo(x, top + r); g.quadraticCurveTo(x, top, x + r, top);
      g.lineTo(x + bw - r, top); g.quadraticCurveTo(x + bw, top, x + bw, top + r); g.lineTo(x + bw, base);
      g.closePath(); g.fill();
    }
    g.textAlign = 'center';
    g.fillStyle = col.muted;
    g.font = `400 28px ${body}`;
    g.fillText(shortMonth(data.months[i]), x + bw / 2, base + 48);
    if ((i === peak || i === last) && val > 0) {
      g.fillStyle = col.ink;
      g.font = `700 30px ${body}`;
      g.fillText(compact(val), x + bw / 2, top - 16);
    }
  });

  g.textAlign = 'left';
  g.fillStyle = col.muted;
  g.font = `400 28px ${body}`;
  g.fillText('BillsBillsBills', 72, S - 32);

  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const name = `${s.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-monthly.png`;
  return new File([blob], name, { type: 'image/png' });
}
