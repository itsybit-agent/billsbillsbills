/**
 * Insights: the last 12 months of spending, compared with the 12 before.
 */

import { state } from './state.js';
import { $, escapeHTML, formatCurrency } from './utils.js';

function monthKey(date) {
  return date.substring(0, 7);
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Bank descriptions carry reference numbers ("SPOTIFY P40EC6B6A2"); drop them to group merchants
function merchantName(description) {
  return description
    .replace(/\*.*$/, '')
    .replace(/\d{3,}/g, ' ')
    .replace(/\b(?=\w*\d)\w{5,}\b/g, '')
    .replace(/(\s\d+)+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase() || description.toUpperCase();
}

// Card repayments and interest aren't spending
const NOT_SPENDING = /^(inbetalning|betalning|ränta|rente)\b/i;

export function computeInsights() {
  const txs = Object.values(state.transactions).filter(t => !t.excluded && !NOT_SPENDING.test(t.description));
  if (!txs.length) return null;

  const allMonths = txs.map(t => monthKey(t.date)).sort();
  const latest = allMonths.at(-1);
  // Last 12 months, but not before the first month there's data for
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(latest, i - 11))
    .filter(m => m >= allMonths[0]);
  const from = months[0];
  const prevFrom = shiftMonth(from, -12);

  const year = txs.filter(t => monthKey(t.date) >= from);
  const prevYear = txs.filter(t => monthKey(t.date) >= prevFrom && monthKey(t.date) < from);

  const sumBy = (list, keyFn) => list.reduce((acc, t) => {
    const k = keyFn(t);
    acc[k] = (acc[k] || 0) + t.amount;
    return acc;
  }, {});

  const total = year.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prevYear.reduce((s, t) => s + t.amount, 0);
  const byMonth = sumBy(year, t => monthKey(t.date));
  const byCategory = sumBy(year, t => t.category || 'Other');
  const prevByCategory = sumBy(prevYear, t => t.category || 'Other');

  const categories = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount, prev: prevByCategory[category] || 0 }))
    .sort((a, b) => b.amount - a.amount);

  const merchants = {};
  for (const t of year) {
    const name = merchantName(t.description);
    const m = (merchants[name] ||= { name, amount: 0, count: 0, months: new Set(), amounts: [], category: t.category });
    m.amount += t.amount;
    m.count++;
    m.months.add(monthKey(t.date));
    m.amounts.push(t.amount);
  }
  const topMerchants = Object.values(merchants).sort((a, b) => b.amount - a.amount).slice(0, 10);

  // Recurring: about once a month for 3+ months at a near-constant price
  const recurring = Object.values(merchants)
    .filter(m => m.months.size >= 3 && m.count <= m.months.size + 1 &&
      Math.max(...m.amounts) <= Math.min(...m.amounts) * 1.5)
    .map(m => ({ ...m, monthly: m.amount / m.months.size }))
    .sort((a, b) => b.monthly - a.monthly);

  const biggest = [...year].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const mostVisited = Object.values(merchants).sort((a, b) => b.count - a.count)[0];

  return {
    from, to: latest, months, total, prevTotal, hasPrev: prevYear.length > 0,
    byMonth, categories, topMerchants, recurring, biggest, mostVisited, count: year.length
  };
}

function change(now, before) {
  if (!before) return '<span class="insight-change">new</span>';
  const pct = Math.round(((now - before) / before) * 100);
  const cls = pct > 10 ? 'insight-change--up' : pct < -10 ? 'insight-change--down' : '';
  return `<span class="insight-change ${cls}">${pct > 0 ? '+' : ''}${pct}%</span>`;
}

export function renderInsights() {
  const data = computeInsights();
  if (!data) {
    $('#insightsView').innerHTML = '<p class="section__description">Import some transactions to see insights.</p>';
    return;
  }

  const maxMonth = Math.max(...data.months.map(m => data.byMonth[m] || 0), 1);
  const avgMonth = data.total / data.months.length;
  const top = data.categories[0];

  const highlights = [
    `You spent <strong>${formatCurrency(Math.round(data.total))}</strong> from ${data.from} to ${data.to}, about ${formatCurrency(Math.round(avgMonth))} a month.`,
    data.hasPrev ? `That is ${change(data.total, data.prevTotal)} compared with the 12 months before.` : '',
    top ? `<strong>${escapeHTML(top.category)}</strong> is the biggest category at ${Math.round(top.amount / data.total * 100)}% of spending.` : '',
    data.recurring.length ? `${data.recurring.length} things look like subscriptions, about ${formatCurrency(Math.round(data.recurring.reduce((s, r) => s + r.monthly, 0)))} a month together.` : ''
  ].filter(Boolean);

  const movers = data.hasPrev
    ? data.categories.filter(c => c.prev > 0 && Math.abs(c.amount - c.prev) > 1000)
        .sort((a, b) => Math.abs(b.amount - b.prev) - Math.abs(a.amount - a.prev)).slice(0, 3)
    : [];
  for (const m of movers) {
    highlights.push(`${escapeHTML(m.category)} went from ${formatCurrency(Math.round(m.prev))} to ${formatCurrency(Math.round(m.amount))} ${change(m.amount, m.prev)}.`);
  }

  $('#insightsView').innerHTML = `
    <div class="section">
      <h3>Highlights</h3>
      <ul class="insight-highlights">${highlights.map(h => `<li>${h}</li>`).join('')}</ul>
      <div class="actions">
        <button class="btn btn--secondary" id="aiInsightsBtn">🤖 Ask the local AI for a summary</button>
      </div>
      <div id="aiInsights" class="insight-ai"></div>
    </div>

    <div class="section">
      <h3>Per month</h3>
      <div class="insight-bars">
        ${data.months.map(m => {
          const v = data.byMonth[m] || 0;
          return `<div class="insight-bar" title="${m}: ${formatCurrency(Math.round(v))}">
            <div class="insight-bar__fill" style="height:${Math.round(v / maxMonth * 100)}%"></div>
            <div class="insight-bar__label">${m.substring(5)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="section">
      <h3>Per category</h3>
      <table class="table">
        <thead><tr><th>Category</th><th class="amount">${data.months.length} months</th><th class="amount">Per month</th>${data.hasPrev ? '<th class="amount">vs year before</th>' : ''}</tr></thead>
        <tbody>
          ${data.categories.map(c => `<tr>
            <td>${escapeHTML(c.category)}</td>
            <td class="amount">${formatCurrency(Math.round(c.amount))}</td>
            <td class="amount">${formatCurrency(Math.round(c.amount / data.months.length))}</td>
            ${data.hasPrev ? `<td class="amount">${change(c.amount, c.prev)}</td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Top merchants</h3>
      <table class="table">
        <tbody>
          ${data.topMerchants.map(m => `<tr>
            <td>${escapeHTML(m.name)}</td><td>${escapeHTML(m.category || '')}</td>
            <td class="amount">${m.count}×</td><td class="amount">${formatCurrency(Math.round(m.amount))}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    ${data.recurring.length ? `<div class="section">
      <h3>Looks recurring</h3>
      <table class="table">
        <tbody>
          ${data.recurring.map(r => `<tr>
            <td>${escapeHTML(r.name)}</td><td>${r.months.size} months</td>
            <td class="amount">~${formatCurrency(Math.round(r.monthly))}/mo</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="section">
      <h3>Biggest purchases</h3>
      <table class="table">
        <tbody>
          ${data.biggest.map(t => `<tr>
            <td>${t.date}</td><td>${escapeHTML(t.description)}</td><td>${escapeHTML(t.category || '')}</td>
            <td class="amount">${formatCurrency(t.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** Plain-text facts for the AI summary — totals only, no raw transactions. */
export function insightsFacts() {
  const d = computeInsights();
  if (!d) return '';
  const r = n => Math.round(n);
  return [
    `Period: ${d.from} to ${d.to}. Total ${r(d.total)} SEK${d.hasPrev ? `, previous 12 months ${r(d.prevTotal)} SEK` : ''}.`,
    `Per month: ${d.months.map(m => `${m} ${r(d.byMonth[m] || 0)}`).join(', ')}.`,
    `Per category (this year / year before): ${d.categories.map(c => `${c.category} ${r(c.amount)}/${r(c.prev)}`).join(', ')}.`,
    `Top merchants: ${d.topMerchants.map(m => `${m.name} ${r(m.amount)} (${m.count}×)`).join(', ')}.`,
    `Recurring: ${d.recurring.map(x => `${x.name} ~${r(x.monthly)}/month`).join(', ') || 'none'}.`
  ].join('\n');
}
