/**
 * Import flow with column mapping preview
 */

import { $, escapeHTML } from './utils.js';
import { readFileRows, parseExcelFile } from './parser.js';
import { getColumnMapping, saveColumnMapping } from './config.js';
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

export async function startImportFlow(file) {
  pendingFile = file;
  pendingRows = await readFileRows(file);
  
  if (pendingRows.length === 0) {
    alert('No data found in file');
    return;
  }

  showMappingPreview();
}

function showMappingPreview() {
  const savedMapping = getColumnMapping();
  const previewRows = pendingRows.slice(0, 6); // Show first 6 rows
  const numCols = Math.max(...previewRows.map(r => r?.length || 0));
  
  // Build header row with dropdowns
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
  
  // Data rows
  for (let i = 0; i < previewRows.length; i++) {
    const row = previewRows[i] || [];
    const isHeaderRow = i === 0 && row.some(c => 
      String(c).toLowerCase().match(/datum|date|beskrivning|description|belopp|amount/)
    );
    html += `<tr class="${isHeaderRow ? 'header-row' : ''}">`;
    for (let col = 0; col < numCols; col++) {
      html += `<td>${escapeHTML(row[col] ?? '')}</td>`;
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
  // Read column selections
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
  
  // Validate required columns
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
  
  // Detect header row
  const firstRow = pendingRows[0] || [];
  if (firstRow.some(c => String(c).toLowerCase().match(/datum|date|beskrivning|description/))) {
    mapping.headerPattern = String(firstRow[mapping.dateCol] || 'Datum');
  }
  
  // Save mapping if checkbox checked
  if ($('#saveMapping').checked) {
    saveColumnMapping(mapping);
  }
  
  // Parse and import
  const transactions = await parseExcelFile(pendingFile, mapping);
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
  
  // Clean up
  cancelImport();
  refresh(renderFn);
  alert(`Imported ${imported} new transactions (${transactions.length - imported} duplicates skipped)`);
}
