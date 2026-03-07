/**
 * State projection from events
 */

import { CONFIG, EventTypes } from './config.js';
import { EventStore } from './event-store.js';

export function projectState(events) {
  const state = {
    transactions: {},
    rules: {},
    categories: new Set(CONFIG.defaultCategories)
  };

  for (const event of events) {
    switch (event.type) {
      case EventTypes.TRANSACTION_IMPORTED:
        state.transactions[event.data.id] = {
          ...event.data,
          category: null,
          paid: false
        };
        break;

      case EventTypes.TRANSACTION_CLASSIFIED:
        if (state.transactions[event.data.transactionId]) {
          state.transactions[event.data.transactionId].category = event.data.category;
        }
        break;

      case EventTypes.TRANSACTION_PAID:
        if (state.transactions[event.data.transactionId]) {
          state.transactions[event.data.transactionId].paid = event.data.paid;
        }
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
    }
  }

  // Auto-classify unclassified transactions
  for (const tx of Object.values(state.transactions)) {
    if (!tx.category) {
      tx.category = matchRule(tx.description, state.rules);
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

// Application state singleton
export let state = projectState(EventStore.getAll());
export let filteredTransactionIds = [];

export function setFilteredIds(ids) {
  filteredTransactionIds = ids;
}

export function refresh(renderFn) {
  state = projectState(EventStore.getAll());
  renderFn();
}
