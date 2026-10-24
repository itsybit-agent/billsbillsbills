/**
 * Home: what needs me now. The To sort and To pay piles, recent payments,
 * import and backup reminders, and the year-in-review teaser.
 */

import { state } from '../state.js';
import { toSort, toPay, payments } from '../piles.js';
import { lastBackup } from '../actions.js';
import { computeInsights } from '../insights.js';
import { esc, f0, dayLabel } from './kit.js';
import { historyRow } from './pay.js';

const DAY = 86400000;

export function home() {
  const sort = toSort();
  const guessed = sort.filter(g => g.aiCategory).length;
  const pay = toPay();
  const open = [...pay.spend, ...pay.settle].sort((a, b) => b.amount - a.amount);
  const recent = payments().slice(0, 3);
  const lastImport = state.imports.at(-1);
  const backup = lastBackup();
  const backupDue = Object.keys(state.transactions).length && (!backup || Date.now() - backup > 30 * DAY);
  const insights = computeInsights();

  if (!Object.keys(state.transactions).length) {
    return `
      <section class="card pile">
        <span class="eyebrow">Welcome</span>
        <div class="h2">Start with a bank export</div>
        <p class="sub">Drop an SEB or Bank Norwegian export (.xlsx). Everything stays in this browser.</p>
        <button class="btn" data-go="import">Add bank export</button>
      </section>
      <button class="btn ghost" data-act="pickEvents">Load a backup file instead</button>`;
  }

  return `
    <section class="card pile">
      <div class="head"><span class="eyebrow">To sort</span>${guessed ? `<span class="flag">🤖 ${guessed} guessed</span>` : ''}</div>
      ${sort.length ? `
        <div>
          <div class="count">${sort.length} merchant${sort.length > 1 ? 's' : ''}</div>
          <p class="sub">${sort.slice(0, 3).map(g => esc(g.description)).join(', ')}${sort.length > 3 ? ` and ${sort.length - 3} more` : ''}</p>
        </div>
        <button class="btn" data-act="sortAll">Sort now</button>`
      : `<div><div class="count">All sorted</div><p class="sub">Your rules sort known merchants on import.</p></div>`}
    </section>

    <section class="card pile">
      <div class="head"><span class="eyebrow">To pay</span><span class="sub" style="margin:0">${pay.count ? `across ${pay.count} categor${pay.count > 1 ? 'ies' : 'y'}` : ''}</span></div>
      <div class="count num">${f0(pay.total)}</div>
      ${open.length ? `
        <div class="mini">${open.slice(0, 4).map(c => `
          <button class="li" data-go="pay">
            <div class="grow">
              <div class="t">${c.settleUp ? `<span class="avatar" style="width:22px;height:22px;font-size:11px;margin-right:6px">${esc(c.category[0])}</span>` : ''}${esc(c.category)}</div>
              ${c.aiMerchants.size ? `<div class="flag">🤖 ${f0(c.aiAmount)} not yet confirmed</div>` : ''}
            </div>
            <span class="amt num">${f0(c.amount)}</span><span aria-hidden="true" style="color:var(--muted)">›</span>
          </button>`).join('')}
        </div>
        <button class="btn ghost" data-go="pay">See all and pay</button>`
      : '<p class="sub">Nothing to pay right now 🎉</p>'}
    </section>

    ${recent.length ? `
      <div class="sect"><span>Recently paid</span><button class="btn small ghost" data-go="paid">All</button></div>
      <div class="list">${recent.map(historyRow).join('')}</div>` : ''}

    ${lastImport ? `<div class="hint"><span>Last import ${dayLabel(lastImport.timestamp)} · ${lastImport.count} rows</span><button class="btn small ghost" data-go="import">Add export</button></div>` : ''}
    ${backupDue ? `<div class="hint warn"><span>${backup ? `Last backup ${Math.floor((Date.now() - backup) / DAY)} days ago` : 'No backup yet'}. Your data only lives in this browser.</span><button class="btn small ghost" data-act="backup">Back up</button></div>` : ''}
    ${insights ? `<button class="story-teaser" data-act="story"><span class="eyebrow">${insights.from} – ${insights.to}</span><b>Your year in bills</b><span style="opacity:.75;font-size:14px">A few cards · 1 minute</span></button>` : ''}`;
}
