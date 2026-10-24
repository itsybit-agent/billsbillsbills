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
  // Categories that are a person or the business rather than a kind of
  // spending: paying them is "settling up".
  settleUp: {
    Itsybit: 'Business costs on the shared card',
    Jocelyn: "Jocelyn's own purchases",
    Fredde: "Fredde's own purchases"
  },
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
  CATEGORY_ADDED: 'CategoryAdded',
  PAYMENT_RECORDED: 'PaymentRecorded',
  PAYMENT_UNDONE: 'PaymentUndone',
  MERCHANT_EXCLUDED: 'MerchantExcluded',
  MERCHANT_INCLUDED: 'MerchantIncluded'
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
// Skip non-expense rows by their Type value: "Reserverat" (pending authorizations
// — would double-count once they settle as Köp), "Avbetalning" and "Betalning"
// (card repayments / incoming deposits, the Bank Norwegian analog of SEB's
// Inbetalning — Type "Betalning" covers rows like "Fra …" and "Inbetalning").
// Real purchases are Type "Köp", so matching "Betalning" never touches them.
// Patterns are case-sensitive, so "Betalning" doesn't catch a row whose only
// marker is the text "Inbetalning" — list that too.
export const BANK_NORWEGIAN_MAPPING = {
  name: 'Bank Norwegian',
  headerPattern: 'TransactionDate',
  dateCol: 0,
  descriptionCol: 1,
  locationCol: 7,
  amountCol: 6,
  skipPatterns: ['Reserverat', 'Avbetalning', 'Betalning', 'Inbetalning'],
  expensesOnly: false
};

// Rows that are payments to the card, never spending, whatever bank or
// column layout they came in with. Checked against the description.
export const PAYMENT_DESCRIPTIONS = /^\s*(inbetalning|avbetalning)\b/i;
export const isPaymentRow = description => PAYMENT_DESCRIPTIONS.test(description || '');

// Built-in formats, tried in order during auto-detection.
export const BUILTIN_MAPPINGS = [DEFAULT_MAPPING, BANK_NORWEGIAN_MAPPING];

export function getColumnMapping() {
  const stored = localStorage.getItem(CONFIG.mappingKey);
  return stored ? JSON.parse(stored) : DEFAULT_MAPPING;
}

export function saveColumnMapping(mapping) {
  localStorage.setItem(CONFIG.mappingKey, JSON.stringify(mapping));
}
