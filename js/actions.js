/**
 * User actions
 */

import { EventTypes } from './config.js';
import { EventStore } from './event-store.js';
import { state, filteredTransactionIds, refresh } from './state.js';
import { parseExcelFile } from './parser.js';
import { $, downloadJSON, downloadFile } from './utils.js';

let renderFn = null;
export function setRenderFunction(fn) {
  renderFn = fn;
}

function doRefresh() {
  refresh(renderFn);
}

// ============================================================
// TRANSACTIONS
// ============================================================

export async function importTransactions(file) {
  const transactions = await parseExcelFile(file);
  const existing = new Set(
    Object.values(state.transactions).map(t => `${t.date}|${t.description}|${t.amount}`)
  );

  let imported = 0;
  for (const tx of transactions) {
    const key = `${tx.date}|${tx.description}|${tx.amount}`;
    if (!existing.has(key)) {
      EventStore.append(EventTypes.TRANSACTION_IMPORTED, tx);
      imported++;
    }
  }

  doRefresh();
  alert(`Imported ${imported} new transactions (${transactions.length - imported} duplicates skipped)`);
}

export function classifyTransaction(transactionId, category) {
  EventStore.append(EventTypes.TRANSACTION_CLASSIFIED, { transactionId, category });

  const tx = state.transactions[transactionId];
  if (tx) {
    const pattern = extractPattern(tx.description);
    if (pattern?.length >= 3) {
      EventStore.append(EventTypes.RULE_CREATED, { pattern, category });
    }
  }

  doRefresh();
}

function extractPattern(description) {
  const cleaned = description.replace(/[0-9]+/g, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 3);
  return words.length > 0 ? words.slice(0, 2).join(' ').toLowerCase() : cleaned.toLowerCase();
}

export function togglePaid(transactionId, paid) {
  EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId, paid });
  doRefresh();
}

export function markFilteredAsPaid() {
  if (!filteredTransactionIds.length) return;
  if (!confirm(`Mark ${filteredTransactionIds.length} transactions as paid?`)) return;

  for (const id of filteredTransactionIds) {
    EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId: id, paid: true });
  }
  doRefresh();
}

// ============================================================
// RULES
// ============================================================

export function deleteRule(pattern) {
  EventStore.append(EventTypes.RULE_DELETED, { pattern });
  doRefresh();
}

export function addManualRule() {
  const pattern = prompt('Pattern to match (case-insensitive):');
  if (!pattern) return;
  const category = prompt('Category:');
  if (!category) return;

  EventStore.append(EventTypes.RULE_CREATED, { pattern: pattern.toLowerCase(), category });
  EventStore.append(EventTypes.CATEGORY_ADDED, { category });
  doRefresh();
}

export function clearRules() {
  if (!confirm('Delete all classification rules?')) return;
  for (const pattern of Object.keys(state.rules)) {
    EventStore.append(EventTypes.RULE_DELETED, { pattern });
  }
  doRefresh();
}

// ============================================================
// DATA MANAGEMENT
// ============================================================

export function clearAllData() {
  if (!confirm('Delete ALL data? This cannot be undone.')) return;
  EventStore.clear();
  doRefresh();
}

export function exportRules() {
  const rules = Object.entries(state.rules).map(([pattern, category]) => ({ pattern, category }));
  downloadJSON(rules, 'classification_rules.json');
}

export function exportTransactions() {
  const transactions = Object.values(state.transactions).sort((a, b) => b.date.localeCompare(a.date));
  const csv = 'Date,Description,Location,Amount,Currency,Category,Paid\n' +
    transactions.map(t =>
      `"${t.date}","${t.description}","${t.location}",${t.amount},"${t.currency}","${t.category || ''}","${t.paid ? 'Yes' : 'No'}"`
    ).join('\n');
  downloadFile(csv, 'transactions.csv', 'text/csv');
}

export function exportEvents() {
  downloadJSON(EventStore.getAll(), 'family_expenses_events.json');
}

export function importRules(file) {
  file.text().then(text => {
    const rules = JSON.parse(text);
    for (const rule of rules) {
      const pattern = (rule.pattern || rule.Specifikation || '').toLowerCase();
      const category = rule.category || rule.Category;
      if (pattern && category) {
        EventStore.append(EventTypes.RULE_CREATED, { pattern, category });
      }
    }
    doRefresh();
    alert(`Imported ${rules.length} rules`);
  });
}

export function importEvents(file) {
  file.text().then(text => {
    const events = JSON.parse(text);
    EventStore.replace(events);
    doRefresh();
    alert(`Imported ${events.length} events`);
  });
}
