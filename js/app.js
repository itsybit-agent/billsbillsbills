/**
 * BillsBillsBills - Main application entry point.
 * Home shows two running piles (To sort, To pay); everything else is a
 * screen behind the menu. Screens are plain functions returning HTML; this
 * file routes between them and handles every click.
 */

import { $ } from './utils.js';
import { state, refresh } from './state.js';
import * as actions from './actions.js';
import { setRenderFunction as setImportRenderFn, setImportedHandler, startImportFlow, cancelImport, confirmImport } from './import-flow.js';
import { initDebug } from './debug.js';
import { toSort, confirmMerchant, excludeMerchant, payCategory, undoPayment, isSettleUp, reclassifyRow } from './piles.js';
import { getOllamaSettings, saveOllamaSettings, listModels, suggestCategories, summarizeInsights } from './ollama.js';
import { renderInsights, insightsFacts } from './insights.js';
import { wireTrendTooltips, chartImage, toggleTrendCategory, MAX_COMPARE } from './ui/trends.js';
import { EventStore } from './event-store.js';
import { EventTypes } from './config.js';
import { esc, f0, toast } from './ui/kit.js';
import { home } from './ui/home.js';
import { sortScreen } from './ui/sort.js';
import { payScreen, paidScreen, paymentScreen, paymentRows, paymentText, paymentCsv, openPaid } from './ui/pay.js';
import { downloadFile } from './utils.js';
import { importScreen, allScreen, rulesScreen, importsScreen, dataScreen, aiScreen, lookScreen, insightsScreen } from './ui/more.js';
import { storyOverlay, slideCount } from './ui/story.js';

// UI-only state (everything else is projected from events)
const ui = {
  screen: 'home', sortFilter: null, sortFrom: 'home', sortLimit: 0,
  menu: false, story: -1, lastImport: null, search: '', allLimit: 0,
  aiProgress: null, aiStatus: '', models: null,
  paySelected: new Set(), // categories ticked to pay together in one transfer
  openRows: new Set(),    // To pay categories whose row list is expanded
  payMonth: '',           // 'YYYY-MM' to pay only that month's rows, '' for all
  paymentId: null         // payment whose row list is open
};

const SCREENS = {
  home: { title: 'BillsBillsBills', render: home },
  sort: { title: () => ui.sortFilter ? `Review ${esc(ui.sortFilter)} guesses` : 'To sort', back: () => ui.sortFrom, render: sortScreen },
  pay: { title: 'To pay', back: 'home', render: payScreen },
  paid: { title: 'Paid history', back: 'home', render: paidScreen },
  payment: { title: () => esc(state.payments[ui.paymentId]?.category || 'Payment'), back: 'paid', render: paymentScreen },
  import: { title: 'Add bank export', back: 'home', render: importScreen },
  all: { title: 'All transactions', back: 'home', render: allScreen },
  rules: { title: 'Rules', back: 'home', render: rulesScreen },
  imports: { title: 'Imports', back: 'home', render: importsScreen },
  data: { title: 'Backup and export', back: 'home', render: dataScreen },
  ai: { title: 'AI helper', back: 'home', render: aiScreen },
  look: { title: 'Look', back: 'home', render: lookScreen },
  insights: { title: 'Insights', back: 'home', render: insightsScreen }
};

const MENU = [
  ['home', '🏠', 'Home'], ['pay', '💳', 'To pay'], ['paid', '🧾', 'Paid history'],
  ['all', '🔎', 'All transactions'], ['story', '✨', 'Year in review'], ['insights', '📊', 'Insights tables'],
  ['rules', '🧠', 'Rules'], ['imports', '⇪', 'Imports'], ['ai', '🤖', 'AI helper'],
  ['look', '🎨', 'Look'], ['data', '💾', 'Backup and export']
];

const val = v => typeof v === 'function' ? v() : v;

// ============================================================
// RENDER
// ============================================================

/** Note which row lists are open right now (the toggle event can lag a fresh tap). */
function rememberOpenLists() {
  for (const d of document.querySelectorAll('#screen details[data-rows]')) {
    if (d.open) ui.openRows.add(d.dataset.rows); else ui.openRows.delete(d.dataset.rows);
  }
  for (const d of document.querySelectorAll('#screen details[data-paidrows]')) {
    if (d.open) openPaid.add(d.dataset.paidrows); else openPaid.delete(d.dataset.paidrows);
  }
}

function render() {
  const screen = SCREENS[ui.screen] || SCREENS.home;
  const back = val(screen.back);
  $('#bar').innerHTML = `
    ${back ? `<button class="icon" data-go="${back}" aria-label="Back">←</button>` : '<span class="icon" aria-hidden="true">🐱</span>'}
    <h1>${val(screen.title)}</h1>
    ${back ? '' : '<button class="addbtn" data-act="pickFile">+ Bank export</button>'}
    <button class="icon" data-act="menu" aria-label="Menu">☰</button>`;
  // Insights gets the desk width; lists and checklists read better narrow
  document.querySelector('.app').classList.toggle('app--wide', ui.screen === 'insights');
  $('#screen').innerHTML = screen.render(ui);
  renderOverlay();
  if (ui.screen === 'insights') { renderInsights(); wireTrendTooltips(ui); }
  if (ui.screen === 'import') wireDropZone();
}

function renderOverlay() {
  const o = $('#overlay');
  if (ui.menu) {
    o.innerHTML = `<div class="scrim" data-act="closeMenu"><div class="sheet" role="dialog" aria-label="Menu">
      <span class="grab"></span>
      ${MENU.map(([go, icon, label]) => `<button class="li" ${go === 'story' ? 'data-act="story"' : `data-go="${go}"`}><span aria-hidden="true">${icon}</span><span class="grow t">${label}</span></button>`).join('')}
      <a class="li" href="about.html"><span aria-hidden="true">🐱</span><span class="grow t">About</span></a>
    </div></div>`;
  } else if (ui.story >= 0) {
    o.innerHTML = storyOverlay(ui.story);
  } else {
    o.innerHTML = '';
  }
}

function go(screen) {
  ui.menu = false;
  ui.story = -1;
  if (screen !== 'import') ui.lastImport = null;
  if (screen !== 'sort') { ui.sortFilter = null; ui.sortLimit = 0; }
  if (screen !== 'pay') ui.paySelected.clear();
  ui.screen = screen;
  render();
  window.scrollTo({ top: 0 });
}

function rerender() {
  refresh();
  render();
}

function wireDropZone() {
  const zone = $('#dropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) startImportFlow(e.dataTransfer.files[0]);
  });
}

// ============================================================
// COMMANDS
// ============================================================

function sortMerchant(key, category) {
  const group = toSort().find(g => g.key === key);
  if (!group) return;
  const { pattern, undo } = confirmMerchant(group, category);
  rerender();
  toast(`${esc(group.description)} → ${esc(category)}${pattern ? ` · learned "${esc(pattern)}"` : ''}`, () => { undo(); rerender(); });
}

function exclude(key) {
  const group = toSort().find(g => g.key === key);
  if (!group) return;
  const { pattern, undo } = excludeMerchant(group);
  rerender();
  toast(`"${esc(pattern)}" isn't counted as an expense from now on`, () => { undo(); rerender(); });
}

function acceptAll() {
  let groups = toSort().filter(g => g.aiCategory);
  if (ui.sortFilter) groups = groups.filter(g => g.aiCategory === ui.sortFilter);
  const undos = groups.map(g => confirmMerchant(g, g.aiCategory).undo);
  rerender();
  toast(`Confirmed ${groups.length} 🤖 pick${groups.length > 1 ? 's' : ''}`, () => { undos.forEach(u => u()); rerender(); });
}

/** Pay one category, or several ticked ones as a single transfer. */
function pay(categories) {
  const result = payCategory(categories, ui.payMonth);
  if (!result) return;
  ui.paySelected.clear();
  const verb = [].concat(categories).every(isSettleUp) ? 'Settled' : 'Paid';
  // Settling up (Itsybit, …) opens the row list, to check off what's expensed
  if ([].concat(categories).some(isSettleUp)) {
    refresh();
    ui.paymentId = result.paymentId;
    go('payment');
  } else {
    rerender();
  }
  toast(`${verb}: ${esc(result.label)} ${f0(result.amount)}`, () => { result.undo(); refresh(); go('pay'); });
}

/** Re-render without jumping the page back to the top. */
function keepScroll(fn) {
  const y = window.scrollY;
  fn();
  window.scrollTo({ top: y });
}

// Charts are drawn at their real width: redraw Insights when the window is resized
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (ui.screen === 'insights') keepScroll(render); }, 150);
});

// Remember which To pay row lists are open, so a re-render keeps them open
document.addEventListener('toggle', (e) => {
  const set = e.target.dataset?.rows ? ui.openRows : e.target.dataset?.paidrows ? openPaid : null;
  if (!set) return;
  const key = e.target.dataset.rows || e.target.dataset.paidrows;
  if (e.target.open) set.add(key); else set.delete(key);
}, true);

/** Share the trend chart as an image: share sheet on phones, download elsewhere. */
async function shareChart() {
  try {
    const file = await chartImage(ui);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    toast('Chart saved as an image');
  } catch (err) {
    if (err.name !== 'AbortError') toast(`Couldn't make the image: ${esc(err.message)}`);
  }
}

function savePaymentFile(kind) {
  const p = state.payments[ui.paymentId];
  if (!p) return;
  const name = `${p.category.replace(/[^\w]+/g, '-').toLowerCase()}-${new Date(p.timestamp).toISOString().slice(0, 10)}.csv`;
  if (kind === 'csv') { downloadFile(paymentCsv(p), name, 'text/csv'); return; }
  navigator.clipboard?.writeText(paymentText(p))
    .then(() => toast('List copied. Paste it into a sheet or your expense tool.'))
    .catch(() => toast("Couldn't copy here. Try Download CSV."));
}

let aiController = null;
async function aiGuess() {
  aiController = new AbortController();
  ui.aiProgress = { text: 'Asking the model…', pct: 3 };
  render();
  try {
    const count = await suggestCategories({
      signal: aiController.signal,
      onProgress: (done, total) => {
        ui.aiProgress = { text: `${done} of ${total} merchants…`, pct: Math.round(done / total * 100) };
        rerender();
      }
    });
    toast(`🤖 guessed ${count} row${count === 1 ? '' : 's'}. Check the picks, then confirm.`);
  } catch (err) {
    toast(err.name === 'AbortError' ? 'Stopped. Guesses so far are kept.' : `🤖 ${esc(err.message)}`);
  } finally {
    aiController = null;
    ui.aiProgress = null;
    rerender();
  }
}

async function aiConnect() {
  const url = $('#ollamaUrl').value.trim() || 'http://localhost:11434';
  ui.aiStatus = 'Connecting…';
  render();
  try {
    ui.models = await listModels(url);
    const current = getOllamaSettings().model;
    const model = ui.models.includes(current) ? current : (ui.models.find(m => /2\dB|3\dB|7\dB/i.test(m)) || ui.models[0] || '');
    saveOllamaSettings({ url, model });
    ui.aiStatus = `Connected · ${ui.models.length} models`;
  } catch {
    ui.aiStatus = `Can't reach Ollama at ${url}. Is it running, and does OLLAMA_ORIGINS allow ${location.origin}?`;
  }
  render();
}

function setLook(change) {
  const root = document.documentElement;
  if (change.skin) root.dataset.skin = change.skin;
  if (change.theme) {
    if (change.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = change.theme;
  }
  try {
    localStorage.setItem('billsbillsbills_look', JSON.stringify({ skin: root.dataset.skin, theme: root.dataset.theme }));
  } catch {}
  render();
}

// ============================================================
// EVENTS
// ============================================================

document.addEventListener('click', async (e) => {
  rememberOpenLists();
  if (e.target.closest('#aiInsightsBtn')) {
    const out = $('#aiInsights');
    out.textContent = '🤖 Thinking…';
    try { await summarizeInsights(insightsFacts(), text => { out.textContent = text; }); }
    catch (err) { out.textContent = `✗ ${err.message}`; }
    return;
  }
  if (e.target.closest('#confirmImportBtn')) { confirmImport(); return; }
  if (e.target.closest('#cancelImportBtn')) { cancelImport(); return; }

  const el = e.target.closest('[data-act],[data-go],[data-sort],[data-exclude],[data-include],[data-delrule],[data-pay],[data-copy],[data-review],[data-undo],[data-openpay],[data-paidrow],[data-trend],[data-setskin],[data-themeset],[data-delete]');
  if (!el) return;
  const d = el.dataset;
  // Clicks inside the menu sheet shouldn't close it via the scrim
  if (d.act === 'closeMenu' && e.target !== el) return;

  if (d.go) { go(d.go); return; }
  if (d.sort) { sortMerchant(d.sort, d.cat); return; }
  if (d.exclude) { exclude(d.exclude); return; }
  if (d.include) { EventStore.append(EventTypes.MERCHANT_INCLUDED, { pattern: d.include }); rerender(); return; }
  if (d.delrule) { actions.deleteRule(d.delrule); return; }
  if (d.pay) { pay(d.pay); return; }
  if (d.review) { ui.sortFrom = 'pay'; go('sort'); ui.sortFilter = d.review; render(); return; }
  if (d.undo) {
    undoPayment(d.undo);
    refresh();
    if (d.back) go(d.back); else render();
    toast('Undone: back in To pay');
    return;
  }
  if (d.openpay) { ui.paymentId = d.openpay; go('payment'); return; }
  if (d.trend) {
    // From the small multiples further down, bring the chart into view
    const fromGrid = !!el.closest('.tr-grid-list');
    if (!toggleTrendCategory(ui, d.trend)) { toast(`Compare up to ${MAX_COMPARE} categories at a time`); return; }
    keepScroll(render);
    if (fromGrid) document.querySelector('.trends')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (d.paidrow) {
    // Paid outside the app (or already settled): just this row leaves To pay
    const tx = state.transactions[d.paidrow];
    EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId: d.paidrow, paid: true });
    keepScroll(rerender);
    toast(`${esc(tx.description)} marked as already paid`, () => {
      EventStore.append(EventTypes.TRANSACTION_PAID, { transactionId: d.paidrow, paid: false });
      keepScroll(rerender);
    });
    return;
  }
  if (d.setskin) { setLook({ skin: d.setskin }); return; }
  if (d.themeset) { setLook({ theme: d.themeset }); return; }
  if (d.delete) { if (confirm('Remove this transaction?')) actions.deleteTransaction(d.delete); render(); return; }
  if (d.copy) {
    try { await navigator.clipboard.writeText(d.copy); toast(`Copied ${d.copy}. Paste it in the bank app.`); }
    catch { toast(`Amount: ${d.copy}`); }
    return;
  }

  switch (d.act) {
    case 'menu': ui.menu = true; renderOverlay(); break;
    case 'closeMenu': ui.menu = false; renderOverlay(); break;
    case 'pickFile': go('import'); $('#fileInput').click(); break;
    case 'sortAll': ui.sortFrom = ui.screen === 'pay' ? 'pay' : 'home'; go('sort'); break;
    case 'sortMore': ui.sortLimit = (ui.sortLimit || 40) + 40; render(); break;
    case 'allMore': ui.allLimit = (ui.allLimit || 100) + 100; render(); break;
    case 'acceptAll': acceptAll(); break;
    case 'paySelected': pay([...ui.paySelected]); break;
    case 'clearSelection': ui.paySelected.clear(); render(); break;
    case 'copyPayment': savePaymentFile('text'); break;
    case 'shareChart': shareChart(); break;
    case 'trendTotal': ui.trendSel?.clear(); keepScroll(render); break;
    case 'csvPayment': savePaymentFile('csv'); break;
    case 'fileAll': {
      const p = state.payments[ui.paymentId];
      for (const t of paymentRows(p)) {
        if (isSettleUp(t.category) && !t.filed) EventStore.append(EventTypes.EXPENSE_FILED, { transactionId: t.id, filed: true });
      }
      rerender();
      break;
    }
    case 'aiGuess': aiGuess(); break;
    case 'aiStop': aiController?.abort(); break;
    case 'aiConnect': aiConnect(); break;
    case 'backup': actions.exportEvents(); toast('Backup saved to your downloads'); render(); break;
    case 'pickEvents': $('#importEventsInput').click(); break;
    case 'pickRules': $('#importRulesInput').click(); break;
    case 'exportRules': actions.exportRules(); break;
    case 'exportCsv': actions.exportTransactions(); break;
    case 'clearAll': actions.clearAllData(); go('home'); break;
    case 'addRule': actions.addManualRule(); break;
    case 'story': ui.menu = false; ui.story = 0; renderOverlay(); break;
    case 'closeStory': ui.story = -1; renderOverlay(); break;
    case 'storyNext': ui.story = ui.story < slideCount() - 1 ? ui.story + 1 : -1; renderOverlay(); break;
    case 'storyPrev': ui.story = Math.max(0, ui.story - 1); renderOverlay(); break;
    case 'tables': go('insights'); break;
  }
});

document.addEventListener('change', (e) => {
  rememberOpenLists();
  const t = e.target;
  if (t.id === 'payMonth') { ui.payMonth = t.value; ui.paySelected.clear(); render(); return; }
  if (t.dataset.reclass) {
    const tx = state.transactions[t.dataset.reclass];
    const from = tx.category;
    const { pattern, undo } = reclassifyRow(tx, t.value);
    ui.openRows.add(t.value);
    keepScroll(rerender);
    toast(`${esc(tx.description)}: ${esc(from)} → ${esc(t.value)}${pattern ? ` · learned "${esc(pattern)}"` : ''}`, () => { undo(); keepScroll(rerender); });
    return;
  }
  if (t.dataset.filed) {
    EventStore.append(EventTypes.EXPENSE_FILED, { transactionId: t.dataset.filed, filed: t.checked });
    const y = window.scrollY;
    rerender();
    window.scrollTo({ top: y });
    return;
  }
  if (t.dataset.select) {
    if (t.checked) ui.paySelected.add(t.dataset.select);
    else ui.paySelected.delete(t.dataset.select);
    const y = window.scrollY;
    render();
    window.scrollTo({ top: y });
    return;
  }
  if (t.dataset.classify) { actions.classifyTransaction(t.dataset.classify, t.value); return; }
  if (t.dataset.paid) { actions.togglePaid(t.dataset.paid, t.checked); return; }
  if (t.id === 'ollamaModel') { saveOllamaSettings({ ...getOllamaSettings(), model: t.value }); return; }
  if (t.id === 'fileInput' && t.files[0]) { startImportFlow(t.files[0]); t.value = ''; return; }
  if (t.id === 'importRulesInput' && t.files[0]) { actions.importRules(t.files[0]); t.value = ''; return; }
  if (t.id === 'importEventsInput' && t.files[0]) { actions.importEvents(t.files[0]); t.value = ''; }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'search') return;
  ui.search = e.target.value;
  ui.allLimit = 0;
  render();
  const input = $('#search');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  ui.menu = false;
  ui.story = -1;
  renderOverlay();
});

// ============================================================
// INITIALIZATION
// ============================================================

actions.setRenderFunction(render);
setImportRenderFn(render);
setImportedHandler(summary => {
  ui.lastImport = summary;
  ui.screen = 'import';
});

render();
initDebug(rerender);
