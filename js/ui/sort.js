/**
 * To sort: one row per merchant. The AI's guess is the first chip; tapping any
 * chip sorts every row of that merchant and learns a rule.
 */

import { state, spending } from '../state.js';
import { toSort } from '../piles.js';
import { getOllamaSettings } from '../ollama.js';
import { esc, f0, dateRange } from './kit.js';

const PAGE = 40;

/** Categories, most used first, so the likely ones are within thumb reach. */
export function categoriesByUse() {
  const uses = {};
  for (const tx of spending()) if (tx.source && tx.source !== 'ai') uses[tx.category] = (uses[tx.category] || 0) + 1;
  return [...state.categories].filter(c => c !== 'Other').sort((a, b) => (uses[b] || 0) - (uses[a] || 0) || a.localeCompare(b)).concat('Other');
}

export function sortScreen(ui) {
  let groups = toSort();
  if (ui.sortFilter) groups = groups.filter(g => g.aiCategory === ui.sortFilter);
  if (!groups.length) {
    return `<section class="card" style="display:grid;gap:10px;text-align:center">
      <div class="h2">${ui.sortFilter ? 'Reviewed' : 'All sorted'}</div>
      <p class="sub">Rules sort these merchants by themselves from now on.</p>
      <button class="btn" data-go="${ui.sortFrom || 'home'}">${ui.sortFrom === 'pay' ? 'Back to pay' : 'Home'}</button>
    </section>`;
  }

  const guessed = groups.filter(g => g.aiCategory);
  const unguessed = groups.length - guessed.length;
  const ai = getOllamaSettings();
  const cats = categoriesByUse();
  const shown = groups.slice(0, ui.sortLimit || PAGE);

  const aiBlock = ui.aiProgress
    ? `<div class="hint ai" style="display:grid;gap:8px"><span>🤖 ${esc(ui.aiProgress.text)}</span><div class="progress"><i style="width:${ui.aiProgress.pct}%"></i></div><button class="btn small ghost" data-act="aiStop">Stop</button></div>`
    : unguessed && !ui.sortFilter
      ? ai.model
        ? `<button class="btn ai" data-act="aiGuess">🤖 Let ${esc(ai.model)} guess ${unguessed} merchant${unguessed > 1 ? 's' : ''}</button>`
        : `<div class="hint ai"><span>🤖 A local AI can pre-pick categories for you.</span><button class="btn small ghost" data-go="ai">Set up</button></div>`
      : '';

  return `
    ${aiBlock}
    ${guessed.length ? `<button class="btn" data-act="acceptAll">Confirm all ${guessed.length} 🤖 pick${guessed.length > 1 ? 's' : ''}</button>` : ''}
    <div class="list">${shown.map(g => `
      <div class="mrow">
        <div class="top">
          <b>${esc(g.description)} <span class="num" style="color:var(--muted);font-weight:500">×${g.txs.length}</span></b>
          <span class="num">${f0(g.total)}</span>
        </div>
        <div class="top">
          <span class="sub" style="margin:0;font-size:13px">${[g.location, dateRange(g.dates)].filter(Boolean).map(esc).join(' · ')}</span>
          <button class="linkbtn" data-exclude="${esc(g.key)}">Not an expense</button>
        </div>
        <div class="hscroll">
          ${g.aiCategory ? `<button class="chip aichip" data-sort="${esc(g.key)}" data-cat="${esc(g.aiCategory)}">🤖 ${esc(g.aiCategory)}</button>` : ''}
          ${cats.filter(c => c !== g.aiCategory).map(c => `<button class="chip" data-sort="${esc(g.key)}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
      </div>`).join('')}
    </div>
    ${groups.length > shown.length ? `<button class="btn ghost" data-act="sortMore">Show ${Math.min(PAGE, groups.length - shown.length)} more</button>` : ''}`;
}
