/**
 * To pay: a checklist made to sit next to the bank app. Any category can be
 * paid at any time; AI-guessed rows are counted but flagged.
 */

import { CONFIG } from '../config.js';
import { toPay, unknownRows, payments, isSettleUp } from '../piles.js';
import { esc, f0, f2, plain, dayLabel } from './kit.js';

export function historyRow(p) {
  return `<div class="hrow ${p.undone ? 'undone' : ''}">
    <span class="tick" aria-hidden="true">✓</span>
    <div class="grow">
      <div style="font-weight:600">${esc(p.category)}</div>
      <div class="sub" style="margin:0;font-size:13px">${isSettleUp(p.category) ? 'Settled' : 'Paid'} ${dayLabel(p.timestamp).toLowerCase()} · ${p.transactionIds.length} rows</div>
    </div>
    <span class="num" style="font-weight:600">${f0(p.amount)}</span>
    ${p.undone ? '' : `<button class="btn small ghost" data-undo="${p.id}">Undo</button>`}
  </div>`;
}

function payRow(c) {
  const verb = c.settleUp ? 'Settled' : 'Paid';
  return `<div class="payrow">
    <div class="who">${c.settleUp ? `<span class="avatar">${esc(c.category[0])}</span>` : ''}<span>${esc(c.category)}</span></div>
    <div class="pamt num">${f2(c.amount)}</div>
    <div class="meta">
      ${c.settleUp ? `<span class="sub" style="margin:0;font-size:13px">${esc(CONFIG.settleUp[c.category])}</span>` : ''}
      ${c.aiMerchants.size ? `<span class="flag">🤖 includes ${f0(c.aiAmount)} not yet confirmed</span><button class="btn small ghost" data-review="${esc(c.category)}">Review</button>` : ''}
      <span class="acts">
        <button class="btn small ghost" data-copy="${plain(c.amount)}">Copy</button>
        <button class="btn small" data-pay="${esc(c.category)}">${verb}</button>
      </span>
    </div>
    <details>
      <summary>${c.txs.length} row${c.txs.length > 1 ? 's' : ''}</summary>
      ${c.txs.sort((a, b) => b.date.localeCompare(a.date)).map(t =>
        `<div><span>${t.date.substring(5)} · ${esc(t.description)}${t.source === 'ai' ? ' 🤖' : ''}</span><span class="num">${f2(t.amount)}</span></div>`).join('')}
    </details>
  </div>`;
}

export function payScreen() {
  const pay = toPay();
  const unknown = unknownRows();
  const paidToday = payments()
    .filter(p => !p.undone && dayLabel(p.timestamp) === 'Today')
    .reduce((s, p) => s + p.amount, 0);

  return `
    ${unknown.count ? `<div class="hint"><span>${unknown.count} row${unknown.count > 1 ? 's' : ''} (${f0(unknown.amount)}) still need a category and aren't in any amount yet.</span><button class="btn small ghost" data-act="sortAll">Sort</button></div>` : ''}
    ${pay.count ? '' : '<section class="card"><div class="h2">Nothing to pay right now</div><p class="sub">New imports add to this pile.</p></section>'}
    ${pay.spend.length ? `<div class="sect"><span>Pay to the card</span></div><div class="list">${pay.spend.map(payRow).join('')}</div>` : ''}
    ${pay.settle.length ? `<div class="sect"><span>Settle up</span><span style="font-weight:500">people and business</span></div><div class="list">${pay.settle.map(payRow).join('')}</div>` : ''}
    <div class="sticky">
      <div class="grow">
        <b><span class="num">${f0(pay.total)}</span> left to pay</b>
        <div style="font-size:12px;opacity:.75">${paidToday ? `${f0(paidToday)} paid today` : 'Pay any category whenever you like'}</div>
      </div>
      <button class="btn" data-go="paid">History</button>
    </div>`;
}

export function paidScreen() {
  const all = payments();
  if (!all.length) return '<p class="sub">Nothing paid yet. Tap Paid on the To pay list and it shows up here.</p>';
  const days = [...new Set(all.map(p => dayLabel(p.timestamp)))];
  return `<p class="sub">Undo puts the amount back in To pay.</p>` + days.map(d => {
    const list = all.filter(p => dayLabel(p.timestamp) === d);
    return `<div class="sect"><span>${d}</span><span class="num" style="font-weight:500">${f0(list.filter(p => !p.undone).reduce((s, p) => s + p.amount, 0))}</span></div>
      <div class="list">${list.map(historyRow).join('')}</div>`;
  }).join('');
}
