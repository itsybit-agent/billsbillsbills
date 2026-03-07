/**
 * Configuration and constants
 */

export const CONFIG = {
  storageKey: 'family_expenses_events',
  mappingKey: 'family_expenses_column_mapping',
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

// Default column mapping (SEB format)
export const DEFAULT_MAPPING = {
  name: 'SEB',
  headerPattern: 'Datum',
  dateCol: 0,
  descriptionCol: 2,
  locationCol: 3,
  currencyCol: 4,
  amountCol: 6,
  amountFallbackCol: 5,
  skipPatterns: ['Totalt', 'Valutakurs'],
  expensesOnly: true  // only import positive amounts (expenses)
};

export function getColumnMapping() {
  const stored = localStorage.getItem(CONFIG.mappingKey);
  return stored ? JSON.parse(stored) : DEFAULT_MAPPING;
}

export function saveColumnMapping(mapping) {
  localStorage.setItem(CONFIG.mappingKey, JSON.stringify(mapping));
}
