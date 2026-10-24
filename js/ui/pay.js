/**
 * To pay: a checklist made to sit next to the bank app. Any category can be
 * paid at any time; AI-guessed rows are counted but flagged.
 */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { toPay, unknownRows, payments, isSettleUp, amountFor } from '../piles.js';
import { esc, f0, f2, plain, dayLabel } from './kit.js';

export function historyRow(p) {
  const filed = expenseProgress(p);
  return `<div class="hrow ${p.undone ? 'undone' : ''}">
    <span class="tick" aria-hidden="true">✓</span>
    <button class="grow linkrow" data-openpay="${p.id}">
      <div style="font-weight:600">${esc(p.category)}</div>
      <div class="sub" style="margin:0;font-size:13px">${isSettleUp(p.category) ? 'Settled' : 'Paid'}${p.categories?.length > 1 ? ' together' : ''} ${dayLabel(p.timestamp).toLowerCase()} · ${p.transactionIds.length} rows${filed ? ` · ${filed.done}/${filed.total} expensed` : ''} ›</div>
    </button>
    <span class="num" style="font-weight:600">${f0(p.amount)}</span>
    ${p.undone ? '' : `<button class="btn small ghost" data-undo="${p.id}">Undo</button>`}
  </div>`;
}

/** Rows of a payment that still exist, newest first. */
export function paymentRows(p) {
  return p.transactionIds.map(id => state.transactions[id]).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

/** For payments that settle up (Itsybit, …): how many rows are ticked as expensed. */
function expenseProgress(p) {
  if (!p.categories.some(isSettleUp)) return null;
  const rows = paymentRows(p).filter(t => isSettleUp(t.category));
  return { done: rows.filter(t => t.filed).length, total: rows.length };
}

/** The list behind one payment, to check off against the business books. */
export function paymentScreen(ui) {
  const p = state.payments[ui.paymentId];
  if (!p) return '<p class="sub">That payment is gone.</p>';
  const rows = paymentRows(p);
  const filed = expenseProgress(p);
  const groups = p.categories.map(c => ({ category: c, rows: rows.filter(t => t.category === c) }));
  // Rows re-sorted to another category after paying stay with the payment
  const moved = rows.filter(t => !p.categories.includes(t.category));
  if (moved.length) groups.push({ category: 'Moved since', rows: moved });

  return `
    <section class="card" style="display:grid;gap:6px">
      <span class="eyebrow">${p.undone ? 'Undone' : isSettleUp(p.category) ? 'Settled' : 'Paid'} ${dayLabel(p.timestamp).toLowerCase()}</span>
      <div class="pile"><div class="count num">${f2(p.amount)}</div></div>
      <p class="sub" style="margin:0">${rows.length} row${rows.length === 1 ? '' : 's'}${filed ? ` · <b>${filed.done} of ${filed.total} expensed</b>` : ''}</p>
    </section>
    <div class="row2">
      <button class="btn ghost small" data-act="copyPayment">Copy list</button>
      <button class="btn ghost small" data-act="csvPayment">Download CSV</button>
      ${filed && filed.done < filed.total ? '<button class="btn ghost small" data-act="fileAll">Tick all</button>' : ''}
    </div>
    ${groups.filter(g => g.rows.length).map(g => {
      const tickable = isSettleUp(g.category);
      return `<div class="sect"><span>${esc(g.category)}</span><span class="num" style="font-weight:500">${f2(g.rows.reduce((s, t) => s + t.amount, 0))}</span></div>
      <div class="list">${g.rows.map(t => `
        <label class="li ${tickable ? '' : 'static'} ${t.filed ? 'filed' : ''}">
          ${tickable ? `<input type="checkbox" class="pick" data-filed="${t.id}" ${t.filed ? 'checked' : ''} aria-label="Expensed">` : ''}
          <div class="grow"><div class="t">${esc(t.description)}</div><div class="s">${t.date}${t.location ? ' · ' + esc(t.location) : ''}</div></div>
          <span class="amt num">${f2(t.amount)}</span>
        </label>`).join('')}
      </div>`;
    }).join('')}
    ${filed ? '<p class="sub">Tick each row once it\'s expensed in the business books. Ticks are saved.</p>' : ''}
    ${p.undone ? '' : `<button class="btn ghost" data-undo="${p.id}" data-back="pay">Undo this payment</button>`}`;
}

/** Tab-separated, so it pastes straight into a spreadsheet. */
export function paymentText(p) {
  const rows = paymentRows(p);
  return [`${p.category} · ${dayLabel(p.timestamp)} · ${plain(p.amount)}`,
    ...rows.map(t => [t.date, t.description, t.category, plain(t.amount)].join('\t'))].join('\n');
}

export function paymentCsv(p) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  return 'Date,Description,Location,Category,Amount,Expensed\n' + paymentRows(p)
    .map(t => [t.date, q(t.description), q(t.location), q(t.category), plain(t.amount), t.filed ? 'Yes' : ''].join(','))
    .join('\n');
}

function payRow(c, selected) {
  const verb = c.settleUp ? 'Settled' : 'Paid';
  return `<div class="payrow ${selected.has(c.category) ? 'selected' : ''}">
    <label class="who">
      <input type="checkbox" class="pick" data-select="${esc(c.category)}" ${selected.has(c.category) ? 'checked' : ''} aria-label="Pay ${esc(c.category)} together with others">
      ${c.settleUp ? `<span class="avatar">${esc(c.category[0])}</span>` : ''}<span>${esc(c.category)}</span>
    </label>
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

export function payScreen(ui) {
  const pay = toPay();
  const open = new Set([...pay.spend, ...pay.settle].map(c => c.category));
  // Drop selections whose category got paid or emptied meanwhile
  for (const c of ui.paySelected) if (!open.has(c)) ui.paySelected.delete(c);
  const selected = ui.paySelected;
  const selectedAmount = amountFor([...selected]);
  const unknown = unknownRows();
  const paidToday = payments()
    .filter(p => !p.undone && dayLabel(p.timestamp) === 'Today')
    .reduce((s, p) => s + p.amount, 0);

  return `
    ${unknown.count ? `<div class="hint"><span>${unknown.count} row${unknown.count > 1 ? 's' : ''} (${f0(unknown.amount)}) still need a category and aren't in any amount yet.</span><button class="btn small ghost" data-act="sortAll">Sort</button></div>` : ''}
    ${pay.count ? '' : '<section class="card"><div class="h2">Nothing to pay right now</div><p class="sub">New imports add to this pile.</p></section>'}
    ${pay.count > 1 && !selected.size ? '<p class="sub" style="margin:0">Paying several in one transfer? Tick them and pay them together.</p>' : ''}
    ${pay.spend.length ? `<div class="sect"><span>Pay to the card</span></div><div class="list">${pay.spend.map(c => payRow(c, selected)).join('')}</div>` : ''}
    ${pay.settle.length ? `<div class="sect"><span>Settle up</span><span style="font-weight:500">people and business</span></div><div class="list">${pay.settle.map(c => payRow(c, selected)).join('')}</div>` : ''}
    ${selected.size ? `
    <div class="sticky">
      <div class="grow">
        <b><span class="num">${f2(selectedAmount)}</span></b>
        <div style="font-size:12px;opacity:.75">${[...selected].map(esc).join(' + ')}</div>
      </div>
      <button class="btn ghost-on-ink" data-act="clearSelection" aria-label="Clear selection">✕</button>
      <button class="btn ghost-on-ink" data-copy="${plain(selectedAmount)}">Copy</button>
      <button class="btn" data-act="paySelected">Paid</button>
    </div>` : `
    <div class="sticky">
      <div class="grow">
        <b><span class="num">${f0(pay.total)}</span> left to pay</b>
        <div style="font-size:12px;opacity:.75">${paidToday ? `${f0(paidToday)} paid today` : 'Pay any category whenever you like'}</div>
      </div>
      <button class="btn" data-go="paid">History</button>
    </div>`}`;
}

export function paidScreen() {
  const all = payments();
  if (!all.length) return '<p class="sub">Nothing paid yet. Tap Paid on the To pay list and it shows up here.</p>';
  const days = [...new Set(all.map(p => dayLabel(p.timestamp)))];
  return `<p class="sub">Tap a payment to see its rows. Undo puts the amount back in To pay.</p>` + days.map(d => {
    const list = all.filter(p => dayLabel(p.timestamp) === d);
    return `<div class="sect"><span>${d}</span><span class="num" style="font-weight:500">${f0(list.filter(p => !p.undone).reduce((s, p) => s + p.amount, 0))}</span></div>
      <div class="list">${list.map(historyRow).join('')}</div>`;
  }).join('');
}
