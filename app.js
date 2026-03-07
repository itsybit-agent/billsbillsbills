/**
 * BillsBillsBills - Event-Sourced Family Expense Tracker
 * 
 * Architecture:
 * - Events are stored in localStorage as the source of truth
 * - State is projected from events on each refresh
 * - UI renders from projected state
 */

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  storageKey: 'family_expenses_events',
  defaultCategories: [
    'Grocery', 'Alcohol', 'Restaurant', 'Streaming', 'Transport',
    'Car', 'Health', 'Itsybit', 'Clothes', 'Leisure', 'Home',
    'Travel', 'Christmas', 'Birthday', 'Jocelyn', 'Fredde'
  ],
  locale: 'sv-SE',
  currency: 'SEK'
};

const EventTypes = {
  TRANSACTION_IMPORTED: 'TransactionImported',
  TRANSACTION_CLASSIFIED: 'TransactionClassified',
  TRANSACTION_PAID: 'TransactionPaid',
  RULE_CREATED: 'RuleCreated',
  RULE_DELETED: 'RuleDeleted',
  CATEGORY_ADDED: 'CategoryAdded'
};

// ============================================================
// UTILITIES
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' 
  }[c]));
}

function formatCurrency(amount) {
  return amount.toLocaleString(CONFIG.locale) + ' ' + CONFIG.currency;
}

// ============================================================
// EVENT STORE
// ============================================================

const EventStore = {
  getAll() {
    return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
  },

  append(type, data) {
    const events = this.getAll();
    const event = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now()
    };
    events.push(event);
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(events));
    return event;
  },

  replace(events) {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(events));
  },

  clear() {
    localStorage.setItem(CONFIG.storageKey, '[]');
  }
};

// ============================================================
// STATE PROJECTION
// ============================================================

function projectState(events) {
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

  // Auto-classify unclassified transactions using rules
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

// ============================================================
// APPLICATION STATE
// ============================================================

let state = projectState(EventStore.getAll());
let filteredTransactionIds = [];

function refresh() {
  state = projectState(EventStore.getAll());
  render();
}

// ============================================================
// EXCEL PARSER
// ============================================================

async function parseExcelFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Find header row
      let startRow = rows.findIndex((row, i) => 
        i < 10 && row?.some(c => String(c).includes('Datum'))
      );
      startRow = startRow >= 0 ? startRow + 1 : 0;

      const transactions = [];
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row?.[0]) continue;

        let date = row[0];
        if (typeof date === 'number') {
          date = XLSX.SSF.format('yyyy-mm-dd', date);
        }
        if (String(date).match(/Totalt|Valutakurs/)) continue;

        const amount = parseFloat(row[6]) || parseFloat(row[5]) || 0;
        if (amount <= 0) continue;

        transactions.push({
          id: crypto.randomUUID(),
          date: String(date).substring(0, 10),
          description: String(row[2] || '').trim(),
          location: String(row[3] || '').trim(),
          currency: String(row[4] || CONFIG.currency),
          amount
        });
      }
      resolve(transactions);
    };
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// ACTIONS
// ============================================================

async function importTransactions(file) {
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

  refresh();
  alert(`Imported ${imported} new transactions (${transactions.length - imported} duplicates skipped)`);
}

function classifyTransaction(transactionId, category) {
  EventStore.append(EventTypes.TRANSACTION_CLASSIFIED, { transactionId, category });

  // Learn rule from classification
  const tx = state.transactions[transactionId];
  if (tx) {
    const pattern = extractPattern(tx.description);
    if (pattern?.length >= 3) {
      EventStore.append(EventTypes.RULE_CREATED, { pattern, category });
    }
  }

  refresh();
}

function extractPattern(description) {
  const cleaned = description.replace(/[0-9]+/g, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 3);
  return words.length > 0 ? words.slice(0, 2).join(' ').toLowerCase() : cleaned.toLowerCase();
}

function togglePaid(transactionId, paid) {
  EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId, paid });
  refresh();
}

function markFilteredAsPaid() {
  if (!filteredTransactionIds.length) return;
  if (!confirm(`Mark ${filteredTransactionIds.length} transactions as paid?`)) return;

  for (const id of filteredTransactionIds) {
    EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId: id, paid: true });
  }
  refresh();
}

function deleteRule(pattern) {
  EventStore.append(EventTypes.RULE_DELETED, { pattern });
  refresh();
}

function addManualRule() {
  const pattern = prompt('Pattern to match (case-insensitive):');
  if (!pattern) return;
  const category = prompt('Category:');
  if (!category) return;

  EventStore.append(EventTypes.RULE_CREATED, { pattern: pattern.toLowerCase(), category });
  EventStore.append(EventTypes.CATEGORY_ADDED, { category });
  refresh();
}

function clearRules() {
  if (!confirm('Delete all classification rules?')) return;
  for (const pattern of Object.keys(state.rules)) {
    EventStore.append(EventTypes.RULE_DELETED, { pattern });
  }
  refresh();
}

function clearAllData() {
  if (!confirm('Delete ALL data? This cannot be undone.')) return;
  EventStore.clear();
  refresh();
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

function exportRules() {
  const rules = Object.entries(state.rules).map(([pattern, category]) => ({ pattern, category }));
  downloadJSON(rules, 'classification_rules.json');
}

function exportTransactions() {
  const transactions = Object.values(state.transactions).sort((a, b) => b.date.localeCompare(a.date));
  const csv = 'Date,Description,Location,Amount,Currency,Category,Paid\n' +
    transactions.map(t =>
      `"${t.date}","${t.description}","${t.location}",${t.amount},"${t.currency}","${t.category || ''}","${t.paid ? 'Yes' : 'No'}"`
    ).join('\n');
  downloadFile(csv, 'transactions.csv', 'text/csv');
}

function exportEvents() {
  downloadJSON(EventStore.getAll(), 'family_expenses_events.json');
}

function importRules(file) {
  file.text().then(text => {
    const rules = JSON.parse(text);
    for (const rule of rules) {
      const pattern = (rule.pattern || rule.Specifikation || '').toLowerCase();
      const category = rule.category || rule.Category;
      if (pattern && category) {
        EventStore.append(EventTypes.RULE_CREATED, { pattern, category });
      }
    }
    refresh();
    alert(`Imported ${rules.length} rules`);
  });
}

function importEvents(file) {
  file.text().then(text => {
    const events = JSON.parse(text);
    EventStore.replace(events);
    refresh();
    alert(`Imported ${events.length} events`);
  });
}

function downloadJSON(data, filename) {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// RENDERING
// ============================================================

function render() {
  renderTransactions();
  renderSummary();
  renderRules();
  renderFilters();
}

function renderTransactions() {
  const filters = {
    category: $('#filterCategory').value,
    month: $('#filterMonth').value,
    unclassified: $('#filterUnclassified').checked,
    unpaid: $('#filterUnpaid').checked
  };

  let transactions = Object.values(state.transactions)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (filters.category) transactions = transactions.filter(t => t.category === filters.category);
  if (filters.month) transactions = transactions.filter(t => t.date.startsWith(filters.month));
  if (filters.unclassified) transactions = transactions.filter(t => !t.category);
  if (filters.unpaid) transactions = transactions.filter(t => !t.paid);

  filteredTransactionIds = transactions.map(t => t.id);

  const unpaidTotal = transactions.filter(t => !t.paid).reduce((sum, t) => sum + t.amount, 0);
  $('#transactionStats').textContent = 
    `${transactions.length} transactions | Unpaid: ${formatCurrency(unpaidTotal)}`;

  const categories = [...state.categories].sort();

  $('#transactionsTable tbody').innerHTML = transactions.map(tx => `
    <tr class="${tx.paid ? 'row-paid' : ''}">
      <td><input type="checkbox" class="checkbox" ${tx.paid ? 'checked' : ''} data-action="toggle-paid" data-id="${tx.id}"></td>
      <td>${tx.date}</td>
      <td>${escapeHTML(tx.description)}</td>
      <td>${escapeHTML(tx.location)}</td>
      <td class="amount">${formatCurrency(tx.amount)}</td>
      <td>
        <select class="select ${tx.category ? '' : 'highlight'}" data-action="classify" data-id="${tx.id}">
          <option value="">-- Select --</option>
          ${categories.map(cat => `<option value="${cat}" ${tx.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

function renderSummary() {
  const filters = {
    month: $('#summaryMonth').value,
    category: $('#summaryCategory').value
  };

  let transactions = Object.values(state.transactions);
  if (filters.month) transactions = transactions.filter(t => t.date.startsWith(filters.month));

  // Aggregate by category
  const byCategory = {};
  let total = 0, totalPaid = 0, totalUnpaid = 0;

  for (const tx of transactions) {
    const cat = tx.category || 'Unclassified';
    byCategory[cat] = byCategory[cat] || { total: 0, paid: 0, unpaid: 0 };
    byCategory[cat].total += tx.amount;
    
    if (tx.paid) {
      byCategory[cat].paid += tx.amount;
      totalPaid += tx.amount;
    } else {
      byCategory[cat].unpaid += tx.amount;
      totalUnpaid += tx.amount;
    }
    total += tx.amount;
  }

  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].unpaid - a[1].unpaid);

  $('#summaryGrid').innerHTML = `
    <div class="card card--success" data-action="clear-filters">
      <div class="card__title">Total</div>
      <div class="card__value">${formatCurrency(total)}</div>
      <div class="card__subtitle card__subtitle--success">✓ ${formatCurrency(totalPaid)} paid</div>
    </div>
    <div class="card ${totalUnpaid === 0 ? 'card--success' : ''}">
      <div class="card__title">Unpaid</div>
      <div class="card__value">${formatCurrency(totalUnpaid)}</div>
    </div>
    ${sortedCategories.map(([cat, data]) => `
      <div class="card ${filters.category === cat ? 'card--selected' : ''} ${data.unpaid === 0 ? 'card--faded' : ''}"
           data-action="select-category" data-category="${escapeHTML(cat)}">
        <div class="card__title">${cat}</div>
        <div class="card__value">${formatCurrency(data.total)}</div>
        <div class="card__subtitle ${data.unpaid > 0 ? 'card__subtitle--warning' : 'card__subtitle--success'}">
          ${data.unpaid > 0 ? `⚠ ${formatCurrency(data.unpaid)} unpaid` : '✓ All paid'}
        </div>
      </div>
    `).join('')}
  `;

  // Category detail
  if (filters.category) {
    renderCategoryDetail(filters.category, transactions);
  } else {
    $('#categoryDetail').style.display = 'none';
  }

  // Monthly breakdown
  renderMonthlyBreakdown(transactions, filters.month);
}

function renderCategoryDetail(category, transactions) {
  const filtered = transactions
    .filter(t => (t.category || 'Unclassified') === category)
    .sort((a, b) => b.date.localeCompare(a.date));

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const unpaid = filtered.filter(t => !t.paid).reduce((s, t) => s + t.amount, 0);

  $('#categoryDetailTitle').textContent = 
    `${category}: ${formatCurrency(total)} (${unpaid > 0 ? formatCurrency(unpaid) + ' unpaid' : 'all paid'})`;

  $('#categoryDetailTable tbody').innerHTML = filtered.map(tx => `
    <tr class="${tx.paid ? 'row-paid' : ''}">
      <td>${tx.date}</td>
      <td>${escapeHTML(tx.description)}</td>
      <td class="amount">${formatCurrency(tx.amount)}</td>
      <td>${tx.paid ? '✓' : ''}</td>
    </tr>
  `).join('');

  $('#categoryDetail').style.display = 'block';
}

function renderMonthlyBreakdown(transactions, selectedMonth) {
  const byMonth = {};
  
  for (const tx of transactions) {
    const month = tx.date.substring(0, 7);
    byMonth[month] = byMonth[month] || { total: 0, unpaid: 0, byCategory: {} };
    byMonth[month].total += tx.amount;
    if (!tx.paid) byMonth[month].unpaid += tx.amount;
    
    const cat = tx.category || 'Unclassified';
    byMonth[month].byCategory[cat] = (byMonth[month].byCategory[cat] || 0) + tx.amount;
  }

  $('#monthlyTable tbody').innerHTML = Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, data]) => `
      <tr data-clickable data-action="select-month" data-month="${month}">
        <td>${month}</td>
        <td class="amount">${formatCurrency(data.total)}</td>
        <td class="amount" style="color: var(${data.unpaid > 0 ? '--color-primary' : '--color-success'})">
          ${data.unpaid > 0 ? formatCurrency(data.unpaid) : '✓'}
        </td>
      </tr>
    `).join('');

  // Category breakdown for selected month
  if (selectedMonth && byMonth[selectedMonth]) {
    const monthData = byMonth[selectedMonth];
    $('#monthlyBreakdown').innerHTML = `
      <h3>${selectedMonth} by Category</h3>
      <table class="table">
        <thead><tr><th>Category</th><th class="amount">Amount</th></tr></thead>
        <tbody>
          ${Object.entries(monthData.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amount]) => `
              <tr data-clickable data-action="select-category" data-category="${escapeHTML(cat)}">
                <td>${cat}</td>
                <td class="amount">${formatCurrency(amount)}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    `;
  } else {
    $('#monthlyBreakdown').innerHTML = '';
  }
}

function renderRules() {
  const rules = Object.entries(state.rules).sort((a, b) => a[0].localeCompare(b[0]));

  $('#rulesList').innerHTML = rules.map(([pattern, category]) => `
    <li>
      <span class="pattern">${escapeHTML(pattern)}</span>
      <span>
        <span class="badge">${category}</span>
        <button class="delete-btn" data-action="delete-rule" data-pattern="${escapeHTML(pattern)}">×</button>
      </span>
    </li>
  `).join('');
}

function renderFilters() {
  const months = [...new Set(Object.values(state.transactions).map(t => t.date.substring(0, 7)))].sort().reverse();
  const usedCategories = new Set(Object.values(state.transactions).map(t => t.category).filter(Boolean));
  const allCategories = [...new Set([...state.categories, ...usedCategories])].sort();

  const monthOptions = `<option value="">All months</option>` + months.map(m => `<option value="${m}">${m}</option>`).join('');
  const categoryOptions = `<option value="">All categories</option>` + allCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  $('#filterCategory').innerHTML = categoryOptions;
  $('#filterMonth').innerHTML = monthOptions;
  $('#summaryMonth').innerHTML = `<option value="">All time</option>` + months.map(m => `<option value="${m}">${m}</option>`).join('');
  $('#summaryCategory').innerHTML = categoryOptions;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'toggle-paid':
      togglePaid(target.dataset.id, target.checked);
      break;
    case 'select-category':
      $('#summaryCategory').value = target.dataset.category;
      renderSummary();
      break;
    case 'select-month':
      $('#summaryMonth').value = target.dataset.month;
      renderSummary();
      break;
    case 'clear-filters':
      $('#summaryMonth').value = '';
      $('#summaryCategory').value = '';
      $('#categoryDetail').style.display = 'none';
      renderSummary();
      break;
    case 'delete-rule':
      deleteRule(target.dataset.pattern);
      break;
  }
});

document.addEventListener('change', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  if (target.dataset.action === 'classify') {
    classifyTransaction(target.dataset.id, target.value);
  }
});

// ============================================================
// INITIALIZATION
// ============================================================

function init() {
  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $('#' + tab.dataset.tab).classList.add('active');
    });
  });

  // Drop zone
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) importTransactions(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) importTransactions(fileInput.files[0]); });

  // Filters
  $('#filterCategory').addEventListener('change', renderTransactions);
  $('#filterMonth').addEventListener('change', renderTransactions);
  $('#filterUnclassified').addEventListener('change', renderTransactions);
  $('#filterUnpaid').addEventListener('change', renderTransactions);
  $('#summaryMonth').addEventListener('change', renderSummary);
  $('#summaryCategory').addEventListener('change', renderSummary);

  // Buttons
  $('#markPaidBtn').addEventListener('click', markFilteredAsPaid);
  $('#clearFiltersBtn').addEventListener('click', () => {
    $('#summaryMonth').value = '';
    $('#summaryCategory').value = '';
    $('#categoryDetail').style.display = 'none';
    renderSummary();
  });
  $('#addRuleBtn').addEventListener('click', addManualRule);
  $('#clearRulesBtn').addEventListener('click', clearRules);
  $('#exportRulesBtn').addEventListener('click', exportRules);
  $('#exportTransactionsBtn').addEventListener('click', exportTransactions);
  $('#exportEventsBtn').addEventListener('click', exportEvents);
  $('#importRulesBtn').addEventListener('click', () => $('#importRulesInput').click());
  $('#importEventsBtn').addEventListener('click', () => $('#importEventsInput').click());
  $('#importRulesInput').addEventListener('change', (e) => { if (e.target.files[0]) importRules(e.target.files[0]); });
  $('#importEventsInput').addEventListener('change', (e) => { if (e.target.files[0]) importEvents(e.target.files[0]); });
  $('#clearDataBtn').addEventListener('click', clearAllData);

  // Initial render
  render();
}

// Start the app
init();
