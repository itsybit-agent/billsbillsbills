/**
 * Rendering functions
 */

import { state, setFilteredIds } from './state.js';
import { $, escapeHTML, formatCurrency } from './utils.js';

export function render() {
  renderTransactions();
  renderSummary();
  renderRules();
  renderFilters();
}

export function renderTransactions() {
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

  setFilteredIds(transactions.map(t => t.id));

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

export function renderSummary() {
  const filters = {
    month: $('#summaryMonth').value,
    category: $('#summaryCategory').value
  };

  let transactions = Object.values(state.transactions);
  if (filters.month) transactions = transactions.filter(t => t.date.startsWith(filters.month));

  const byCategory = {};
  let total = 0, totalPaid = 0, totalUnpaid = 0;

  for (const tx of transactions) {
    const cat = tx.category || 'Other';
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

  if (filters.category) {
    renderCategoryDetail(filters.category, transactions);
  } else {
    $('#categoryDetail').style.display = 'none';
  }

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
    
    const cat = tx.category || 'Other';
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

export function renderRules() {
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

export function renderFilters() {
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
