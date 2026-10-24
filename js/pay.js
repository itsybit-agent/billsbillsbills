/**
 * Pay view: unpaid totals per category, one button to mark a category paid.
 */

import { EventTypes } from './config.js';
import { EventStore } from './event-store.js';
import { state } from './state.js';
import { $, escapeHTML, formatCurrency } from './utils.js';

// Last "Paid" click, so it can be undone
let lastPaid = null;

export function renderPay() {
  const unpaid = Object.values(state.transactions).filter(t => !t.paid);
  const byCategory = {};
  for (const tx of unpaid) {
    (byCategory[tx.category || 'Other'] ||= []).push(tx);
  }
  const total = unpaid.reduce((s, t) => s + t.amount, 0);
  const unsure = unpaid.filter(t => !t.source || t.source === 'ai').length;

  const groups = Object.entries(byCategory)
    .map(([category, txs]) => ({ category, txs, sum: txs.reduce((s, t) => s + t.amount, 0) }))
    .sort((a, b) => b.sum - a.sum);

  $('#payView').innerHTML = `
    <div class="pay-header">
      <div>
        <div class="card__title">Left to pay</div>
        <div class="card__value">${formatCurrency(total)}</div>
      </div>
      ${lastPaid ? `<button class="btn btn--secondary" data-action="undo-pay">↩ Undo ${escapeHTML(lastPaid.category)}</button>` : ''}
    </div>
    ${unsure ? `<p class="notice">⚠ ${unsure} unpaid transactions are unclassified or AI-suggested — check them first so you pay the right totals.</p>` : ''}
    ${groups.length ? '' : '<p class="section__description">Everything is paid 🎉</p>'}
    <ul class="pay-list">
      ${groups.map(g => `
        <li class="pay-row">
          <details>
            <summary>
              <span class="pay-row__category">${escapeHTML(g.category)}</span>
              <span class="pay-row__count">${g.txs.length} st</span>
              <span class="pay-row__amount">${formatCurrency(g.sum)}</span>
            </summary>
            <table class="table">
              <tbody>
                ${g.txs.sort((a, b) => b.date.localeCompare(a.date)).map(tx => `
                  <tr><td>${tx.date}</td><td>${escapeHTML(tx.description)}${tx.source === 'ai' ? ' 🤖' : ''}</td>
                  <td class="amount">${formatCurrency(tx.amount)}</td></tr>`).join('')}
              </tbody>
            </table>
          </details>
          <span class="pay-row__actions">
            <button class="btn btn--secondary" data-action="copy-amount" data-amount="${Math.round(g.sum * 100) / 100}" title="Copy amount">📋</button>
            <button class="btn" data-action="pay-category" data-category="${escapeHTML(g.category)}">✓ Paid</button>
          </span>
        </li>`).join('')}
    </ul>
  `;
}

export function payCategory(category) {
  const ids = Object.values(state.transactions)
    .filter(t => !t.paid && (t.category || 'Other') === category)
    .map(t => t.id);
  for (const transactionId of ids) {
    EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId, paid: true });
  }
  lastPaid = { category, ids };
}

export function undoPay() {
  if (!lastPaid) return;
  for (const transactionId of lastPaid.ids) {
    EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId, paid: false });
  }
  lastPaid = null;
}
