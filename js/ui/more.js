/**
 * Screens behind the menu: import, all transactions, rules, imports log,
 * backup, the AI helper, the look, and the full insights tables.
 */

import { state } from '../state.js';
import { lastBackup } from '../actions.js';
import { getOllamaSettings } from '../ollama.js';
import { esc, f0, f2, dayLabel } from './kit.js';
import { categoriesByUse } from './sort.js';
import { trendsSection } from './trends.js';

export function importScreen(ui) {
  const s = ui.lastImport;
  const summary = s ? `
    <section class="card" style="display:grid;gap:12px">
      <div><span class="eyebrow">${esc(s.fileName)} · ${esc(s.bank)}</span><div class="h2">Added ${s.imported} transaction${s.imported === 1 ? '' : 's'}</div></div>
      <div class="funnel">
        <div class="fl"><span>Sorted by your rules → To pay</span><b class="num">${s.byRules}</b></div>
        ${s.excluded ? `<div class="fl"><span>Not an expense (your list)</span><b class="num">${s.excluded}</b></div>` : ''}
        ${s.skipped ? `<div class="fl"><span>Skipped: card payments and pending</span><b class="num">${s.skipped}</b></div>` : ''}
        ${s.duplicates ? `<div class="fl"><span>Already imported</span><b class="num">${s.duplicates}</b></div>` : ''}
        ${s.removed ? `<div class="fl"><span>Removed old non-expense rows</span><b class="num">${s.removed}</b></div>` : ''}
        <div class="fl hi"><span>New merchants → To sort</span><b class="num">${s.newMerchants}</b></div>
      </div>
      <div class="row2"><button class="btn ghost" data-go="home">Home</button>${s.newMerchants ? '<button class="btn" data-act="sortAll">Sort now</button>' : '<button class="btn" data-go="pay">To pay</button>'}</div>
    </section>` : '';

  return `${summary}
    <label class="drop" id="dropZone" for="fileInput">
      <span class="ico" aria-hidden="true">⇪</span>
      <div class="h2" style="font-size:20px">${s ? 'Add another export' : 'Drop a bank export'}</div>
      <span class="sub">SEB or Bank Norwegian (.xlsx). Rows you already have are skipped, so any date range works.</span>
    </label>
    <div id="mappingPreview" class="card mapping-preview" style="display:none">
      <div class="h2" style="font-size:20px">Which column is which?</div>
      <p class="sub">This file isn't a format I know. Pick what each column holds.</p>
      <div id="previewTable" class="preview-table-wrapper"></div>
      <label class="checkbox-label"><input type="checkbox" id="saveMapping" checked> Remember this layout</label>
      <div class="row2"><button class="btn ghost" id="cancelImportBtn">Cancel</button><button class="btn" id="confirmImportBtn">Import</button></div>
    </div>`;
}

export function allScreen(ui) {
  const q = (ui.search || '').trim().toLowerCase();
  let txs = Object.values(state.transactions).sort((a, b) => b.date.localeCompare(a.date));
  if (q) txs = txs.filter(t => `${t.description} ${t.location} ${t.category} ${t.date}`.toLowerCase().includes(q));
  const shown = txs.slice(0, ui.allLimit || 100);
  const cats = categoriesByUse();
  return `
    <input class="input" type="search" id="search" placeholder="Search ${Object.keys(state.transactions).length} transactions" value="${esc(ui.search || '')}" aria-label="Search">
    <p class="sub" style="margin:0">${txs.length} match${txs.length === 1 ? '' : 'es'} · ${f0(txs.filter(t => !t.excluded).reduce((s, t) => s + t.amount, 0))}</p>
    <div class="list">${shown.map(t => `
      <div class="txrow ${t.excluded ? 'excluded' : ''}">
        <span class="d">${esc(t.description)}</span><span class="num">${f2(t.amount)}</span>
        <div class="m">
          <span>${t.date}${t.location ? ' · ' + esc(t.location) : ''}</span>
          ${t.excluded ? '<span>not an expense</span>' : `
          <select class="select" data-classify="${t.id}" aria-label="Category">
            ${t.source ? '' : '<option value="" selected>— sort —</option>'}
            ${cats.map(c => `<option ${t.source && t.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          ${t.source === 'ai' ? '<span class="flag">🤖</span>' : ''}
          <label><input type="checkbox" data-paid="${t.id}" ${t.paid ? 'checked' : ''}> paid</label>`}
          <button class="x" data-delete="${t.id}" title="Remove">✕</button>
        </div>
      </div>`).join('')}
    </div>
    ${txs.length > shown.length ? `<button class="btn ghost" data-act="allMore">Show more</button>` : ''}`;
}

export function rulesScreen() {
  const rules = Object.entries(state.rules).sort((a, b) => a[0].localeCompare(b[0]));
  const excluded = [...state.excluded].sort();
  return `
    <p class="sub">Rules are learned when you sort a merchant. Come here to fix one.</p>
    <div class="row2"><button class="btn ghost small" data-act="addRule">+ Add rule</button><button class="btn ghost small" data-act="exportRules">Export</button><button class="btn ghost small" data-act="pickRules">Import</button></div>
    ${excluded.length ? `<div class="sect"><span>Not an expense · ${excluded.length}</span></div>
      <div class="list">${excluded.map(p => `<div class="li static"><div class="grow"><div class="t">${esc(p)}</div></div><button class="btn small ghost" data-include="${esc(p)}">Count again</button></div>`).join('')}</div>` : ''}
    <div class="sect"><span>All rules · ${rules.length}</span></div>
    <div class="list">${rules.map(([p, c]) => `<div class="li static"><div class="grow"><div class="t">${esc(p)}</div><div class="s">${esc(c)}</div></div><button class="btn small ghost" data-delrule="${esc(p)}" aria-label="Delete rule">✕</button></div>`).join('')}</div>`;
}

export function importsScreen() {
  const list = [...state.imports].reverse();
  return `<p class="sub">So you can see what's already in. Imports don't group or lock anything.</p>
    ${list.length ? `<div class="list">${list.map(i => `<div class="li static"><div class="grow"><div class="t">${dayLabel(i.timestamp)}</div><div class="s">${i.day}</div></div><span class="amt num">${i.count} rows</span></div>`).join('')}</div>` : '<p class="sub">Nothing imported yet.</p>'}
    <button class="btn" data-go="import">Add bank export</button>`;
}

export function dataScreen() {
  const b = lastBackup();
  return `
    <section class="card" style="display:grid;gap:10px">
      <div><b>Backup</b><p class="sub">${b ? `Last backup ${dayLabel(b).toLowerCase()}.` : 'No backup yet.'} Everything lives in this browser only, so save a file now and then. Home reminds you after 30 days.</p></div>
      <button class="btn" data-act="backup">Save backup file</button>
    </section>
    <section class="card" style="display:grid;gap:8px">
      <b>Move to another device</b>
      <p class="sub" style="margin:0">Loading a backup replaces what's in this browser.</p>
      <button class="btn ghost" data-act="pickEvents">Load a backup file</button>
    </section>
    <section class="card" style="display:grid;gap:8px">
      <b>Export</b>
      <div class="row2"><button class="btn ghost small" data-act="exportCsv">Transactions CSV</button><button class="btn ghost small" data-act="exportRules">Rules JSON</button></div>
    </section>
    <section class="card" style="display:grid;gap:8px">
      <b>Danger zone</b>
      <button class="btn ghost" style="color:var(--warn)" data-act="clearAll">Clear all data</button>
    </section>`;
}

export function aiScreen(ui) {
  const s = getOllamaSettings();
  return `
    <section class="card" style="display:grid;gap:12px">
      <div>
        <b>🤖 Local AI (Ollama)</b>
        <p class="sub">Guesses categories for merchants your rules don't know, using a model on your own computer. Nothing leaves your machine. Bigger models (20B+) guess much better; 8B models mostly guess wrong.</p>
      </div>
      <input class="input" id="ollamaUrl" value="${esc(s.url)}" placeholder="http://localhost:11434" aria-label="Ollama address">
      <div class="row2">
        <select class="select" id="ollamaModel" aria-label="Model">${(ui.models || (s.model ? [s.model] : [])).map(m => `<option ${m === s.model ? 'selected' : ''}>${esc(m)}</option>`).join('') || '<option value="">— connect first —</option>'}</select>
        <button class="btn small" data-act="aiConnect">Connect</button>
      </div>
      ${ui.aiStatus ? `<p class="sub" style="margin:0">${esc(ui.aiStatus)}</p>` : ''}
    </section>
    <p class="sub">On the hosted site Ollama must allow this page: set <code>OLLAMA_ORIGINS=${esc(location.origin)}</code> for the Ollama service. Chrome may also ask to allow access to devices on your local network.</p>`;
}

const SKINS = [
  { id: 'kvitto', name: 'Kvitto', about: 'Receipt paper, mono numbers', sw: ['#fbfbf8', '#1e2126', '#2448c8', '#c3303b'] },
  { id: 'mjau', name: 'Mjau', about: 'Sticker book, tangerine cat', sw: ['#f1ecfa', '#2e1a3d', '#e8603f', '#ffe9b0'] },
  { id: 'sparbank', name: 'Sparbanksbok', about: 'Passbook green and brass', sw: ['#e3ebe5', '#12302a', '#8e6a18', '#23698a'] }
];

export function lookScreen() {
  const skin = document.documentElement.dataset.skin || 'kvitto';
  const theme = document.documentElement.dataset.theme || 'auto';
  return `
    <div class="skins">${SKINS.map(s => `
      <button class="skin" data-setskin="${s.id}" aria-pressed="${s.id === skin}">
        <span class="sw">${s.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>
        <span><b>${s.name}</b><span class="sub" style="display:block;margin:0">${s.about}</span></span>
      </button>`).join('')}
    </div>
    <div class="seg" role="group" aria-label="Light or dark">
      ${['auto', 'light', 'dark'].map(t => `<button data-themeset="${t}" aria-pressed="${t === theme}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>`;
}

export function insightsScreen(ui) {
  return `${trendsSection(ui)}<div id="insightsView"></div>`;
}
