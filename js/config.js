/**
 * Configuration and constants
 */

export const CONFIG = {
  storageKey: 'family_expenses_events',
  defaultCategories: [
    'Grocery', 'Alcohol', 'Restaurant', 'Streaming', 'Transport',
    'Car', 'Health', 'Itsybit', 'Clothes', 'Leisure', 'Home',
    'Travel', 'Christmas', 'Birthday', 'Jocelyn', 'Fredde'
  ],
  locale: 'sv-SE',
  currency: 'SEK'
};

export const EventTypes = {
  TRANSACTION_IMPORTED: 'TransactionImported',
  TRANSACTION_CLASSIFIED: 'TransactionClassified',
  TRANSACTION_PAID: 'TransactionPaid',
  RULE_CREATED: 'RuleCreated',
  RULE_DELETED: 'RuleDeleted',
  CATEGORY_ADDED: 'CategoryAdded'
};
