/**
 * BillsBillsBills - Main application entry point
 */

import { $, $$ } from './utils.js';
import { render, renderTransactions, renderSummary } from './render.js';
import { setRenderFunction } from './actions.js';
import { setRenderFunction as setImportRenderFn, startImportFlow, cancelImport, confirmImport } from './import-flow.js';
import { initDebug } from './debug.js';
import * as actions from './actions.js';
import { state } from './state.js';
import { getOllamaSettings, saveOllamaSettings, listModels, suggestCategories, unmatchedGroups, summarizeInsights } from './ollama.js';
import { payCategory, undoPay } from './pay.js';
import { insightsFacts } from './insights.js';

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
    case 'confirm-ai':
      actions.classifyTransaction(target.dataset.id, state.transactions[target.dataset.id].category);
      break;
    case 'pay-category':
      payCategory(target.dataset.category);
      actions.refreshView();
      break;
    case 'undo-pay':
      undoPay();
      actions.refreshView();
      break;
    case 'copy-amount': {
      // Bank forms want "1234,50": no thousands separator, decimal comma
      const amount = String(target.dataset.amount).replace('.', ',');
      navigator.clipboard?.writeText(amount).then(() => {
        target.textContent = '✓';
        setTimeout(() => { target.textContent = '📋'; }, 1200);
      });
      break;
    }
    case 'delete-rule':
      actions.deleteRule(target.dataset.pattern);
      break;
    case 'delete-transaction':
      if (confirm('Remove this transaction?')) {
        actions.deleteTransaction(target.dataset.id);
      }
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
  $('#filterSearch').addEventListener('input', renderTransactions);
  $('#filterUnclassified').addEventListener('change', renderTransactions);
  $('#filterUnpaid').addEventListener('change', renderTransactions);
  $('#filterAiSuggested').addEventListener('change', renderTransactions);
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

  initOllama();

  // Initial render
  render();
  
  // Debug console (if ?debug in URL)
  initDebug(render);
}

// ============================================================
// AI CLASSIFICATION (Ollama)
// ============================================================

function initOllama() {
  const settings = getOllamaSettings();
  $('#ollamaUrl').value = settings.url;

  async function connect() {
    const url = $('#ollamaUrl').value.trim() || 'http://localhost:11434';
    $('#ollamaStatus').textContent = 'Connecting…';
    try {
      const models = await listModels(url);
      const current = getOllamaSettings().model;
      $('#ollamaModel').innerHTML = models.map(m =>
        `<option value="${m}" ${m === current ? 'selected' : ''}>${m}</option>`).join('');
      saveOllamaSettings({ url, model: $('#ollamaModel').value });
      $('#ollamaStatus').textContent = `✓ ${models.length} models`;
    } catch {
      $('#ollamaStatus').textContent =
        `✗ Can't reach Ollama at ${url}. Is it running, with OLLAMA_ORIGINS allowing ${location.origin}?`;
    }
  }

  $('#ollamaConnectBtn').addEventListener('click', connect);
  $('#ollamaModel').addEventListener('change', () =>
    saveOllamaSettings({ ...getOllamaSettings(), model: $('#ollamaModel').value }));
  if (settings.model) {
    $('#ollamaModel').innerHTML = `<option value="${settings.model}">${settings.model}</option>`;
  }

  // Insights view is re-rendered on every refresh, so delegate the click
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#aiInsightsBtn')) return;
    const out = $('#aiInsights');
    out.textContent = '🤖 Thinking…';
    try {
      await summarizeInsights(insightsFacts(), text => { out.textContent = text; });
    } catch (err) {
      out.textContent = `✗ ${err.message}`;
    }
  });

  let controller = null;
  $('#aiClassifyBtn').addEventListener('click', async () => {
    // Second click while running stops it; finished batches are kept
    if (controller) { controller.abort(); return; }
    const total = unmatchedGroups().length;
    if (!total) { $('#aiStatus').textContent = 'Nothing left to classify 🎉'; return; }

    controller = new AbortController();
    $('#aiClassifyBtn').textContent = '⏹ Stop';
    $('#aiStatus').textContent = `Asking the model about ${total} merchants…`;
    try {
      const count = await suggestCategories({
        signal: controller.signal,
        onProgress: (done, all) => {
          $('#aiStatus').textContent = `🤖 ${done}/${all} merchants…`;
          actions.refreshView();
        }
      });
      $('#aiStatus').textContent = `🤖 Suggested ${count} categories. Tick "To review" to check them.`;
    } catch (err) {
      $('#aiStatus').textContent = err.name === 'AbortError' ? 'Stopped.' : `✗ ${err.message}`;
    } finally {
      controller = null;
      $('#aiClassifyBtn').textContent = '🤖 Suggest categories';
      actions.refreshView();
    }
  });
}

init();
