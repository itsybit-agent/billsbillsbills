/**
 * Year in review: a few tap-through cards built from the insights numbers.
 */

import { computeInsights } from '../insights.js';
import { payments, isSettleUp } from '../piles.js';
import { esc, f0 } from './kit.js';

const monthName = m => new Date(`${m}-01`).toLocaleString('en-GB', { month: 'long' });

export function slides() {
  const d = computeInsights();
  if (!d) return [];
  const list = [];
  const values = d.months.map(m => d.byMonth[m] || 0);
  const max = Math.max(...values, 1);
  const maxMonth = d.months[values.indexOf(max)];
  const avg = d.total / d.months.length;

  list.push(`<span class="k">${d.from} – ${d.to}</span>
    <div class="huge num">${f0(Math.round(d.total))}</div>
    <div class="line">went through the card in ${d.count} transactions, about ${f0(Math.round(avg))} a month.</div>
    ${d.hasPrev ? `<div class="callout">${d.total > d.prevTotal ? 'Up' : 'Down'} ${f0(Math.abs(Math.round(d.total - d.prevTotal)))} on the year before.</div>` : ''}`);

  list.push(`<span class="k">Biggest month</span>
    <div class="huge">${monthName(maxMonth)}</div>
    <div class="bars">${d.months.map((m, i) => `<div class="${m === maxMonth ? 'max' : ''}"><span class="b" style="height:${values[i] / max * 100}%"></span>${monthName(m)[0]}</div>`).join('')}</div>
    <div class="line">${f0(Math.round(max))}: ${f0(Math.round(max - avg))} more than a usual month.</div>`);

  const top = d.categories.filter(c => !isSettleUp(c.category))[0];
  if (top) {
    list.push(`<span class="k">Biggest category</span>
      <div class="huge">${esc(top.category)}</div>
      <div class="line">${f0(Math.round(top.amount))}, ${Math.round(top.amount / d.total * 100)}% of everything.</div>
      <div class="callout">Next: ${d.categories.filter(c => !isSettleUp(c.category)).slice(1, 4).map(c => `${esc(c.category)} ${f0(Math.round(c.amount))}`).join(' · ')}</div>`);
  }

  if (d.mostVisited && d.mostVisited.count >= 5) {
    const m = d.mostVisited;
    list.push(`<span class="k">Most visited</span>
      <div class="huge">${esc(m.name)}</div>
      <div class="line">${m.count} visits, ${f0(Math.round(m.amount))} in total. That's about ${f0(Math.round(m.amount / m.count))} a visit.</div>`);
  }

  if (d.recurring.length) {
    const monthly = d.recurring.reduce((s, r) => s + r.monthly, 0);
    list.push(`<span class="k">Recurring</span>
      <div class="huge num">${f0(Math.round(monthly))}/mo</div>
      <div class="line">${d.recurring.length} things charge about once a month, ${f0(Math.round(monthly * 12))} a year.</div>
      <div class="callout">${d.recurring.slice(0, 5).map(r => `${esc(r.name)} ~${f0(Math.round(r.monthly))}`).join(' · ')}</div>`);
  }

  const paid = payments().filter(p => !p.undone && new Date(p.timestamp).toISOString().substring(0, 7) >= d.from);
  if (paid.length >= 3) {
    list.push(`<span class="k">How you pay</span>
      <div class="huge num">${paid.length} payments</div>
      <div class="line">${f0(Math.round(paid.reduce((s, p) => s + p.amount, 0)))} paid off in this app.</div>`);
  }

  const settled = d.categories.filter(c => isSettleUp(c.category));
  list.push(`${settled.length ? `<span class="k">Settle up</span>
      <div class="line" style="display:grid;gap:10px">${settled.map(c => `<span>${esc(c.category)} · <b class="num">${f0(Math.round(c.amount))}</b></span>`).join('')}</div>`
    : '<span class="k">That\'s the year</span>'}
    <button class="btn" data-act="tables">See the full tables</button>`);

  return list;
}

export function storyOverlay(index) {
  const all = slides();
  if (!all.length) return '';
  const i = Math.min(index, all.length - 1);
  return `<div class="story" role="dialog" aria-label="Year in review"><div class="inner">
    <div class="segs">${all.map((_, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</div>
    <button class="close" data-act="closeStory" aria-label="Close">×</button>
    <div class="tapzones"><button data-act="storyPrev" aria-label="Previous"></button><button data-act="storyNext" aria-label="Next"></button></div>
    <div class="slide">${all[i]}</div>
    <div class="storynav"><span>Tap left to go back</span><span>${i + 1} / ${all.length}</span></div>
  </div></div>`;
}

export const slideCount = () => slides().length;
