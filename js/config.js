/**
 * Configuration and constants
 */

export const CONFIG = {
  storageKey: 'family_expenses_events',
  mappingKey: 'family_expenses_column_mapping',
  defaultCategories: [
    'Grocery', 'Alcohol', 'Restaurant', 'Streaming', 'Transport',
    'Car', 'Health', 'Itsybit', 'Clothes', 'Leisure', 'Home',
    'Travel', 'Christmas', 'Birthday', 'Jocelyn', 'Fredde', 'Other'
  ],
  locale: 'sv-SE',
  currency: 'SEK'
};

export const EventTypes = {
  TRANSACTION_IMPORTED: 'TransactionImported',
  TRANSACTION_CLASSIFIED: 'TransactionClassified',
  TRANSACTION_PAID: 'TransactionPaid',
  TRANSACTION_DELETED: 'TransactionDeleted',
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
  amountCol: 6,
  amountFallbackCol: 5,
  skipPatterns: ['Totalt', 'Valutakurs', 'Inbetalning', 'Faktureringsavgift'],
  expensesOnly: false
};

// Bank Norwegian format. Columns: 0 TransactionDate (Excel serial), 1 Text,
// 2 Type, 6 Amount (already in SEK; negative for purchases), 7 Merchant Area.
// Skip non-expense rows: "Reserverat" (pending authorizations — would double-count
// once they settle as Köp) and "Avbetalning" (card repayments, the Bank Norwegian
// analog of SEB's Inbetalning).
export const BANK_NORWEGIAN_MAPPING = {
  name: 'Bank Norwegian',
  headerPattern: 'TransactionDate',
  dateCol: 0,
  descriptionCol: 1,
  locationCol: 7,
  amountCol: 6,
  skipPatterns: ['Reserverat', 'Avbetalning'],
  expensesOnly: false
};

// Built-in formats, tried in order during auto-detection.
export const BUILTIN_MAPPINGS = [DEFAULT_MAPPING, BANK_NORWEGIAN_MAPPING];

export function getColumnMapping() {
  const stored = localStorage.getItem(CONFIG.mappingKey);
  return stored ? JSON.parse(stored) : DEFAULT_MAPPING;
}

export function saveColumnMapping(mapping) {
  localStorage.setItem(CONFIG.mappingKey, JSON.stringify(mapping));
}
