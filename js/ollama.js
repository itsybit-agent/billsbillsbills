/**
 * AI classification via a local Ollama model.
 * Only transactions that no rule matched and nobody classified are sent.
 * Suggestions are stored as TransactionClassified with source 'ai' and
 * don't create rules — confirming one (🤖 badge or dropdown) does.
 */

import { EventTypes } from './config.js';
import { EventStore } from './event-store.js';
import { state } from './state.js';

const SETTINGS_KEY = 'billsbillsbills_ollama';
const BATCH_SIZE = 15;
const MAX_EXAMPLES = 60;

export function getOllamaSettings() {
  try {
    return { url: 'http://localhost:11434', model: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { url: 'http://localhost:11434', model: '' };
  }
}

export function saveOllamaSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function baseUrl(url) {
  return url.replace(/\/+$/, '');
}

export async function listModels(url) {
  const res = await fetch(`${baseUrl(url)}/api/tags`);
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const { models } = await res.json();
  // Embedding-only models can't chat
  return models
    .filter(m => !m.capabilities || m.capabilities.includes('completion'))
    .map(m => m.name);
}

/** Transactions still on the 'Other' fallback, grouped by description. */
export function unmatchedGroups() {
  const groups = new Map();
  for (const tx of Object.values(state.transactions)) {
    if (tx.source || tx.excluded) continue;
    const key = tx.description.toLowerCase();
    if (!groups.has(key)) groups.set(key, { description: tx.description, location: tx.location, amount: tx.amount, ids: [] });
    groups.get(key).ids.push(tx.id);
  }
  return [...groups.values()];
}

/** One line per category listing merchants this household already put there. */
function examples() {
  const byCategory = {};
  const add = (category, merchant) => {
    const list = (byCategory[category] ||= new Set());
    if (list.size < MAX_EXAMPLES) list.add(merchant.toLowerCase().replace(/[0-9*]+/g, ' ').replace(/\s+/g, ' ').trim());
  };
  for (const tx of Object.values(state.transactions)) {
    if (tx.source === 'manual') add(tx.category, tx.description);
  }
  for (const [pattern, category] of Object.entries(state.rules)) add(category, pattern);
  return Object.entries(byCategory).map(([category, merchants]) => `${category}: ${[...merchants].join('; ')}`);
}

function buildSystemPrompt(categories) {
  const exampleLines = examples();
  return [
    'You sort card transactions from a Swedish household\'s bank statements into budget categories.',
    `Allowed categories: ${categories.join(', ')}.`,
    'Some categories are people or a business rather than kinds of spending (for example Itsybit, Jocelyn, Fredde). ' +
      'Only use those when the merchant clearly matches one of their examples below.',
    'Common Swedish merchants: ICA/Coop/Willys/Hemköp/Lidl = Grocery, Systembolaget = Alcohol, SL/SJ/Västtrafik/Uber = Transport, ' +
      'Circle K/OKQ8/Preem/Biltema/Däckia/parking (Aimo, Parkman, EasyPark) = Car, Apotek = Health.',
    'Interest (ränta, rente), fees and incoming payments (inbetalning) are not purchases: answer "Other". ' +
      'Also answer "Other" when you really cannot tell.',
    exampleLines.length ? `Merchants this household already classified, by category:\n${exampleLines.join('\n')}` : ''
  ].filter(Boolean).join('\n\n');
}

async function classifyBatch(batch, categories, settings, signal) {
  // Same system prompt for every batch so Ollama can reuse its prompt cache
  const system = buildSystemPrompt(categories);

  const user = 'Classify each transaction:\n' +
    batch.map((g, i) => `${i}. ${g.description}${g.location ? ' | ' + g.location : ''} | ${g.amount} SEK`).join('\n');

  const res = await fetch(`${baseUrl(settings.url)}/api/chat`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      think: false,
      options: { temperature: 0 },
      format: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              // Echoing the merchant keeps the model's answers lined up with the rows
              properties: { i: { type: 'integer' }, merchant: { type: 'string' }, category: { type: 'string', enum: categories } },
              required: ['i', 'merchant', 'category']
            }
          }
        },
        required: ['results']
      },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);
  const { message } = await res.json();
  return JSON.parse(message.content).results || [];
}

/**
 * Classify every unmatched transaction. onProgress(done, total) runs after
 * each batch; returns how many transactions got a category.
 */
export async function suggestCategories({ onProgress, signal } = {}) {
  const settings = getOllamaSettings();
  if (!settings.model) throw new Error('Pick an Ollama model in the Rules tab first');

  const categories = [...state.categories].sort();
  const groups = unmatchedGroups();
  let classified = 0;

  for (let start = 0; start < groups.length; start += BATCH_SIZE) {
    const batch = groups.slice(start, start + BATCH_SIZE);
    const results = await classifyBatch(batch, categories, settings, signal);
    for (const { i, category } of results) {
      const group = batch[i];
      if (!group || category === 'Other' || !categories.includes(category)) continue;
      for (const transactionId of group.ids) {
        EventStore.append(EventTypes.TRANSACTION_CLASSIFIED, { transactionId, category, source: 'ai' });
        classified++;
      }
    }
    onProgress?.(Math.min(start + BATCH_SIZE, groups.length), groups.length);
  }
  return classified;
}

/** Stream a short plain-language summary of the insight facts. */
export async function summarizeInsights(facts, onText, signal) {
  const settings = getOllamaSettings();
  if (!settings.model) throw new Error('Pick an Ollama model in the Rules tab first');
  const res = await fetch(`${baseUrl(settings.url)}/api/chat`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model: settings.model,
      stream: true,
      think: false,
      options: { temperature: 0.3 },
      messages: [
        { role: 'system', content: 'You are a friendly, practical household budget coach. Amounts are SEK. ' +
          'Write 5-7 short bullet points: what stands out, trends, subscriptions worth a look, and one or two concrete ideas to save. ' +
          'Only use the numbers given. Plain text, no headings.' },
        { role: 'user', content: facts }
      ]
    })
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '', text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop();
    for (const line of lines.filter(Boolean)) {
      text += JSON.parse(line).message?.content || '';
      onText(text);
    }
  }
  return text;
}
