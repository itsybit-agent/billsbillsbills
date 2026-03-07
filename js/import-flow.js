/**
 * Import flow - auto-detect SEB format, fallback to column mapping
 */

import { $, escapeHTML } from './utils.js';
import { readFileRows } from './parser.js';
import { CONFIG, getColumnMapping, saveColumnMapping, DEFAULT_MAPPING } from './config.js';
import { EventTypes } from './config.js';
import { EventStore } from './event-store.js';
import { state, refresh } from './state.js';

let pendingFile = null;
let pendingRows = [];
let renderFn = null;

export function setRenderFunction(fn) {
  renderFn = fn;
}

const COLUMN_TYPES = [
  { value: '', label: '— Skip —' },
  { value: 'date', label: '📅 Date' },
  { value: 'description', label: '📝 Description' },
  { value: 'amount', label: '💰 Amount' },
  { value: 'location', label: '📍 Location' }
];

/**
 * Main entry point - try auto-detect first, fallback to mapping UI
 */
export async function startImportFlow(file) {
  pendingFile = file;
  pendingRows = await readFileRows(file);
  
  if (pendingRows.length === 0) {
    alert('No data found in file');
    return;
  }

  // Try SEB format first
  if (isSEBFormat(pendingRows)) {
    await importWithMapping(DEFAULT_MAPPING);
    return;
  }
  
  // Try saved custom mapping
  const savedMapping = getColumnMapping();
  if (savedMapping && savedMapping !== DEFAULT_MAPPING && matchesMapping(pendingRows, savedMapping)) {
    await importWithMapping(savedMapping);
    return;
  }

  // Fallback to manual mapping UI
  showMappingPreview();
}

/**
 * Check if file looks like SEB format
 */
function isSEBFormat(rows) {
  // Look for header row with "Bokförd" in first 5 rows
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row[0] && String(row[0]).includes('Bokförd')) {
      // Check if it has expected SEB columns (at least 5 columns)
      if (row.length >= 5) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if file matches a saved mapping
 */
function matchesMapping(rows, mapping) {
  if (!mapping.headerPattern) return false;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row?.some(c => String(c).toLowerCase().includes(mapping.headerPattern.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

/**
 * Import using a specific column mapping
 */
async function importWithMapping(mapping) {
  const transactions = parseRowsWithMapping(pendingRows, mapping);
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
  
  pendingFile = null;
  pendingRows = [];
  refresh(renderFn);
  alert(`Imported ${imported} new transactions (${transactions.length - imported} duplicates skipped)`);
}

/**
 * Parse rows using column mapping
 */
function parseRowsWithMapping(rows, mapping) {
  // Find header row
  let startRow = 0;
  if (mapping.headerPattern) {
    const headerIdx = rows.findIndex((row, i) => 
      i < 10 && row?.some(c => String(c).includes(mapping.headerPattern))
    );
    startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  }

  const transactions = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[mapping.dateCol]) continue;

    let date = row[mapping.dateCol];
    
    // Handle Excel serial dates
    if (typeof date === 'number') {
      date = excelDateToString(date);
    } else {
      date = String(date).substring(0, 10);
    }
    
    // Skip invalid dates or skip patterns
    if (!date || date.length < 8) continue;
    if (mapping.skipPatterns?.some(p => String(row[mapping.dateCol]).includes(p))) continue;

    // Get amount - try primary column, then fallback
    let amount = parseSwedishNumber(row[mapping.amountCol]);
    if (!amount && mapping.amountFallbackCol != null) {
      amount = parseSwedishNumber(row[mapping.amountFallbackCol]);
    }
    
    // Skip zero amounts
    if (!amount) continue;

    transactions.push({
      id: crypto.randomUUID(),
      date,
      description: String(row[mapping.descriptionCol] || '').trim(),
      location: mapping.locationCol != null ? String(row[mapping.locationCol] || '').trim() : '',
      currency: CONFIG.currency,
      amount: Math.abs(amount)
    });
  }
  return transactions;
}

/**
 * Parse Swedish number format: "1 234,56" or "-1 234,56"
 */
function parseSwedishNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Math.abs(value);
  
  // Remove spaces (thousands sep), replace comma with dot (decimal)
  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(',', '.');
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Convert Excel serial date to YYYY-MM-DD string
 */
function excelDateToString(serial) {
  // Excel dates: days since 1900-01-01 (with leap year bug)
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  const date = new Date(utcValue);
  return date.toISOString().substring(0, 10);
}

function showMappingPreview() {
  const savedMapping = getColumnMapping();
  const previewRows = pendingRows.slice(0, 6);
  const numCols = Math.max(...previewRows.map(r => r?.length || 0));
  
  let html = '<table class="preview-table"><thead><tr>';
  for (let col = 0; col < numCols; col++) {
    const savedType = getColumnType(col, savedMapping);
    html += `<th>
      <select data-col="${col}">
        ${COLUMN_TYPES.map(t => 
          `<option value="${t.value}" ${savedType === t.value ? 'selected' : ''}>${t.label}</option>`
        ).join('')}
      </select>
    </th>`;
  }
  html += '</tr></thead><tbody>';
  
  for (let i = 0; i < previewRows.length; i++) {
    const row = previewRows[i] || [];
    const isHeaderRow = i === 0 && row.some(c => 
      String(c).toLowerCase().match(/datum|date|beskrivning|description|belopp|amount/)
    );
    html += `<tr class="${isHeaderRow ? 'header-row' : ''}">`;
    for (let col = 0; col < numCols; col++) {
      let val = row[col] ?? '';
      // Format Excel dates for display
      if (typeof val === 'number' && val > 40000 && val < 50000) {
        val = excelDateToString(val);
      }
      html += `<td>${escapeHTML(val)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  
  $('#previewTable').innerHTML = html;
  $('#dropZone').style.display = 'none';
  $('#mappingPreview').style.display = 'block';
}

function getColumnType(col, mapping) {
  if (mapping.dateCol === col) return 'date';
  if (mapping.descriptionCol === col) return 'description';
  if (mapping.amountCol === col) return 'amount';
  if (mapping.locationCol === col) return 'location';
  return '';
}

export function cancelImport() {
  pendingFile = null;
  pendingRows = [];
  $('#mappingPreview').style.display = 'none';
  $('#dropZone').style.display = 'block';
}

export async function confirmImport() {
  const selects = $('#previewTable').querySelectorAll('select');
  const mapping = {
    dateCol: null,
    descriptionCol: null,
    amountCol: null,
    locationCol: null,
    headerPattern: '',
    skipPatterns: ['Totalt', 'Valutakurs'],
    expensesOnly: true
  };
  
  selects.forEach(sel => {
    const col = parseInt(sel.dataset.col);
    switch (sel.value) {
      case 'date': mapping.dateCol = col; break;
      case 'description': mapping.descriptionCol = col; break;
      case 'amount': mapping.amountCol = col; break;
      case 'location': mapping.locationCol = col; break;
    }
  });
  
  if (mapping.dateCol === null) {
    alert('Please select a Date column');
    return;
  }
  if (mapping.descriptionCol === null) {
    alert('Please select a Description column');
    return;
  }
  if (mapping.amountCol === null) {
    alert('Please select an Amount column');
    return;
  }
  
  // Detect header pattern from first row
  const firstRow = pendingRows[0] || [];
  if (firstRow[mapping.dateCol]) {
    mapping.headerPattern = String(firstRow[mapping.dateCol]);
  }
  
  if ($('#saveMapping').checked) {
    saveColumnMapping(mapping);
  }
  
  $('#mappingPreview').style.display = 'none';
  $('#dropZone').style.display = 'block';
  
  await importWithMapping(mapping);
}
