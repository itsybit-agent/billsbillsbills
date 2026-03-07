/**
 * BillsBillsBills - Main application entry point
 */

import { $, $$ } from './utils.js';
import { render, renderTransactions, renderSummary } from './render.js';
import { setRenderFunction } from './actions.js';
import { setRenderFunction as setImportRenderFn, startImportFlow, cancelImport, confirmImport } from './import-flow.js';
import { initDebug } from './debug.js';
import * as actions from './actions.js';

// Connect actions to render function
setRenderFunction(render);
setImportRenderFn(render);

// ============================================================
// EVENT HANDLERS
// ============================================================

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  switch (target.dataset.action) {
    case 'toggle-paid':
      actions.togglePaid(target.dataset.id, target.checked);
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
      actions.deleteRule(target.dataset.pattern);
      break;
  }
});

document.addEventListener('change', (e) => {
  const target = e.target.closest('[data-action]');
  if (target?.dataset.action === 'classify') {
    actions.classifyTransaction(target.dataset.id, target.value);
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

  // Drop zone - now opens preview flow
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) startImportFlow(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { 
    if (fileInput.files[0]) startImportFlow(fileInput.files[0]);
    fileInput.value = ''; // Reset so same file can be selected again
  });

  // Import flow buttons
  $('#confirmImportBtn').addEventListener('click', confirmImport);
  $('#cancelImportBtn').addEventListener('click', cancelImport);

  // Filters
  $('#filterCategory').addEventListener('change', renderTransactions);
  $('#filterMonth').addEventListener('change', renderTransactions);
  $('#filterUnclassified').addEventListener('change', renderTransactions);
  $('#filterUnpaid').addEventListener('change', renderTransactions);
  $('#summaryMonth').addEventListener('change', renderSummary);
  $('#summaryCategory').addEventListener('change', renderSummary);

  // Buttons
  $('#markPaidBtn').addEventListener('click', actions.markFilteredAsPaid);
  $('#clearFiltersBtn').addEventListener('click', () => {
    $('#summaryMonth').value = '';
    $('#summaryCategory').value = '';
    $('#categoryDetail').style.display = 'none';
    renderSummary();
  });
  $('#addRuleBtn').addEventListener('click', actions.addManualRule);
  $('#clearRulesBtn').addEventListener('click', actions.clearRules);
  $('#exportRulesBtn').addEventListener('click', actions.exportRules);
  $('#exportTransactionsBtn').addEventListener('click', actions.exportTransactions);
  $('#exportEventsBtn').addEventListener('click', actions.exportEvents);
  $('#importRulesBtn').addEventListener('click', () => $('#importRulesInput').click());
  $('#importEventsBtn').addEventListener('click', () => $('#importEventsInput').click());
  $('#importRulesInput').addEventListener('change', (e) => { 
    if (e.target.files[0]) actions.importRules(e.target.files[0]); 
  });
  $('#importEventsInput').addEventListener('change', (e) => { 
    if (e.target.files[0]) actions.importEvents(e.target.files[0]); 
  });
  $('#clearDataBtn').addEventListener('click', actions.clearAllData);

  // Notice link to export tab
  $('#goToExport').addEventListener('click', (e) => {
    e.preventDefault();
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    $('[data-tab="data"]').classList.add('active');
    $('#data').classList.add('active');
  });

  // Initial render
  render();
  
  // Debug console (if ?debug in URL)
  initDebug(render);
}

init();
