/**
 * State projection from events
 */

import { CONFIG, EventTypes } from './config.js';
import { EventStore } from './event-store.js';

export function projectState(events) {
  const state = {
    transactions: {},
    rules: {},
    categories: new Set(CONFIG.defaultCategories),
    excluded: new Set(),   // merchant patterns marked "not an expense"
    payments: {},          // paymentId → { id, category, amount, transactionIds, timestamp, undone }
    imports: []            // one entry per day something was imported
  };

  for (const event of events) {
    switch (event.type) {
      case EventTypes.TRANSACTION_IMPORTED: {
        state.transactions[event.data.id] = {
          ...event.data,
          category: null,
          source: null, // 'manual' | 'ai' | 'rule' | null (no rule matched)
          paid: false,
          excluded: false
        };
        const day = new Date(event.timestamp).toISOString().substring(0, 10);
        const last = state.imports.at(-1);
        if (last?.day === day) last.count++;
        else state.imports.push({ day, count: 1, timestamp: event.timestamp });
        break;
      }

      case EventTypes.TRANSACTION_CLASSIFIED: {
        const tx = state.transactions[event.data.transactionId];
        if (tx) {
          // A null category undoes an earlier classification
          tx.category = event.data.category;
          tx.source = event.data.category ? (event.data.source || 'manual') : null;
        }
        break;
      }

      case EventTypes.TRANSACTION_PAID:
        if (state.transactions[event.data.transactionId]) {
          state.transactions[event.data.transactionId].paid = event.data.paid;
        }
        break;

      case EventTypes.PAYMENT_RECORDED:
        state.payments[event.data.paymentId] = {
          id: event.data.paymentId,
          category: event.data.category,
          categories: event.data.categories || [event.data.category],
          amount: event.data.amount,
          transactionIds: event.data.transactionIds,
          timestamp: event.timestamp,
          undone: false
        };
        for (const id of event.data.transactionIds) {
          if (state.transactions[id]) state.transactions[id].paid = true;
        }
        break;

      case EventTypes.PAYMENT_UNDONE: {
        const payment = state.payments[event.data.paymentId];
        if (payment) {
          payment.undone = true;
          for (const id of payment.transactionIds) {
            if (state.transactions[id]) state.transactions[id].paid = false;
          }
        }
        break;
      }

      case EventTypes.TRANSACTION_DELETED:
        delete state.transactions[event.data.transactionId];
        break;

      case EventTypes.RULE_CREATED:
        state.rules[event.data.pattern.toLowerCase()] = event.data.category;
        state.categories.add(event.data.category);
        break;

      case EventTypes.RULE_DELETED:
        delete state.rules[event.data.pattern.toLowerCase()];
        break;

      case EventTypes.CATEGORY_ADDED:
        state.categories.add(event.data.category);
        break;

      case EventTypes.MERCHANT_EXCLUDED:
        state.excluded.add(event.data.pattern.toLowerCase());
        break;

      case EventTypes.MERCHANT_INCLUDED:
        state.excluded.delete(event.data.pattern.toLowerCase());
        break;
    }
  }

  for (const tx of Object.values(state.transactions)) {
    const desc = tx.description.toLowerCase();
    tx.excluded = [...state.excluded].some(p => desc.includes(p));
    // Auto-classify unclassified transactions
    if (!tx.category) {
      const category = matchRule(tx.description, state.rules);
      tx.category = category || 'Other';
      tx.source = category ? 'rule' : null;
    }
  }

  return state;
}

function matchRule(description, rules) {
  const desc = description.toLowerCase();
  for (const [pattern, category] of Object.entries(rules)) {
    if (desc.includes(pattern)) return category;
  }
  return null;
}

/** Transactions that count as spending (not marked "not an expense"). */
export function spending() {
  return Object.values(state.transactions).filter(t => !t.excluded);
}

// Application state singleton
export let state = projectState(EventStore.getAll());
export let filteredTransactionIds = [];

export function setFilteredIds(ids) {
  filteredTransactionIds = ids;
}

export function refresh(renderFn) {
  state = projectState(EventStore.getAll());
  renderFn?.();
}
