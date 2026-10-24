/**
 * The two running piles on Home: To sort (merchants waiting for a category)
 * and To pay (unpaid amounts per category). Plus the commands that move
 * things between them. Every command returns an undo function.
 */

import { CONFIG, EventTypes } from './config.js';
import { EventStore } from './event-store.js';
import { state, spending } from './state.js';

/**
 * Rule pattern for a bank description: the merchant name without reference
 * numbers or payment-processor suffixes. "SPOTIFY P40EC6B6A2" → "spotify",
 * "AMAZONMKTPLC*S870V7FQ5" → "amazonmktplc", "ICA SUPERMARKET KAPPALA" → "ica supermarket".
 */
export function extractPattern(description) {
  // Rules match by substring, so the pattern must be a literal slice of the
  // description: up to two adjacent name words, never skipping one in between.
  let base = description.split('*')[0];
  if (base.trim().length < 3) base = description;
  const words = [...base.matchAll(/[^\s*]+/g)];
  const isName = w => w[0].length >= 3 && !/\d/.test(w[0]);
  const start = words.findIndex(isName);
  if (start < 0) return base.replace(/\d+/g, '').trim().toLowerCase();
  let end = start;
  if (words[start + 1] && isName(words[start + 1])) end = start + 1;
  return base.slice(words[start].index, words[end].index + words[end][0].length).toLowerCase();
}

// ============================================================
// TO SORT
// ============================================================

/** Merchants with rows no rule matched, or rows only the AI has guessed. */
export function toSort() {
  const groups = new Map();
  for (const tx of spending()) {
    if (tx.source && tx.source !== 'ai') continue;
    const key = tx.description.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { key, description: tx.description, location: tx.location, txs: [], total: 0, aiCategory: null });
    }
    const g = groups.get(key);
    g.txs.push(tx);
    g.total += tx.amount;
    if (tx.source === 'ai') g.aiCategory = tx.category;
  }
  return [...groups.values()]
    .map(g => ({ ...g, dates: g.txs.map(t => t.date).sort() }))
    .sort((a, b) => b.total - a.total);
}

/** Put every row of a merchant in a category and learn a rule for it. */
export function confirmMerchant(group, category) {
  const before = group.txs.map(t => ({ id: t.id, category: t.source ? t.category : null, source: t.source }));
  for (const tx of group.txs) {
    EventStore.append(EventTypes.TRANSACTION_CLASSIFIED, { transactionId: tx.id, category });
  }
  const pattern = extractPattern(group.description);
  const hadRule = pattern in state.rules;
  if (pattern.length >= 3 && !hadRule) {
    EventStore.append(EventTypes.RULE_CREATED, { pattern, category });
  }
  return {
    pattern,
    undo() {
      for (const b of before) {
        EventStore.append(EventTypes.TRANSACTION_CLASSIFIED, { transactionId: b.id, category: b.category, source: b.source });
      }
      if (pattern.length >= 3 && !hadRule) EventStore.append(EventTypes.RULE_DELETED, { pattern });
    }
  };
}

/** Mark a merchant as "not an expense": its rows leave both piles and insights, now and on later imports. */
export function excludeMerchant(group) {
  const pattern = extractPattern(group.description) || group.key;
  EventStore.append(EventTypes.MERCHANT_EXCLUDED, { pattern });
  return { pattern, undo: () => EventStore.append(EventTypes.MERCHANT_INCLUDED, { pattern }) };
}

// ============================================================
// TO PAY
// ============================================================

export const isSettleUp = category => category in CONFIG.settleUp;

/**
 * Unpaid amount per category. Rows no rule matched aren't in any amount yet;
 * rows the AI guessed are, flagged so the UI can say so.
 */
export function toPay() {
  const byCategory = {};
  for (const tx of spending()) {
    if (tx.paid || !tx.source) continue;
    const c = (byCategory[tx.category] ||= { category: tx.category, amount: 0, txs: [], aiAmount: 0, aiMerchants: new Set() });
    c.amount += tx.amount;
    c.txs.push(tx);
    if (tx.source === 'ai') {
      c.aiAmount += tx.amount;
      c.aiMerchants.add(tx.description.toLowerCase());
    }
  }
  const all = Object.values(byCategory).map(c => ({ ...c, settleUp: isSettleUp(c.category) }));
  return {
    spend: all.filter(c => !c.settleUp).sort((a, b) => b.amount - a.amount),
    settle: all.filter(c => c.settleUp).sort((a, b) => b.amount - a.amount),
    total: all.reduce((s, c) => s + c.amount, 0),
    count: all.length
  };
}

/** Rows that aren't in any To pay amount because nothing sorted them yet. */
export function unknownRows() {
  const txs = spending().filter(t => !t.source && !t.paid);
  return { count: txs.length, amount: txs.reduce((s, t) => s + t.amount, 0) };
}

/** Pay one category, or several together as one bank transfer. */
export function payCategory(categories) {
  categories = [].concat(categories);
  const pay = toPay();
  const groups = [...pay.spend, ...pay.settle].filter(c => categories.includes(c.category) && c.txs.length);
  if (!groups.length) return null;
  const amount = groups.reduce((s, g) => s + g.amount, 0);
  const paymentId = crypto.randomUUID();
  EventStore.append(EventTypes.PAYMENT_RECORDED, {
    paymentId,
    category: groups.map(g => g.category).join(' + '),
    categories: groups.map(g => g.category),
    amount: Math.round(amount * 100) / 100,
    transactionIds: groups.flatMap(g => g.txs.map(t => t.id))
  });
  return { paymentId, amount, label: groups.map(g => g.category).join(' + '), undo: () => undoPayment(paymentId) };
}

/** Combined unpaid amount of the given categories. */
export function amountFor(categories) {
  const pay = toPay();
  return [...pay.spend, ...pay.settle].filter(c => categories.includes(c.category)).reduce((s, c) => s + c.amount, 0);
}

export function undoPayment(paymentId) {
  EventStore.append(EventTypes.PAYMENT_UNDONE, { paymentId });
}

/** Payments newest first. */
export function payments() {
  return Object.values(state.payments).sort((a, b) => b.timestamp - a.timestamp);
}
