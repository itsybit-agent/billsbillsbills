/**
 * Debug console - enabled with ?debug URL parameter
 */

import { $ } from './utils.js';
import { EventStore } from './event-store.js';
import { CONFIG } from './config.js';
import { state, refresh } from './state.js';

let renderFn = null;

export function initDebug(render) {
  renderFn = render;
  
  // Check for ?debug param
  if (!new URLSearchParams(window.location.search).has('debug')) {
    return;
  }
  
  $('#debugConsole').style.display = 'block';
  
  const input = $('#debugInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      runCommand(input.value.trim());
      input.value = '';
    }
  });
  
  console.log('🐱 Debug mode enabled. Commands: /clear, /rules, /events, /tx, /help');
}

function runCommand(cmd) {
  const [name, ...args] = cmd.split(' ');
  
  switch (name.toLowerCase()) {
    case '/clear':
      EventStore.clear();
      refresh(renderFn);
      log('✓ All data cleared');
      break;
      
    case '/rules':
      console.table(Object.entries(state.rules).map(([p, c]) => ({ pattern: p, category: c })));
      log(`${Object.keys(state.rules).length} rules`);
      break;
      
    case '/events':
      const events = EventStore.getAll();
      console.table(events.slice(-20).map(e => ({ type: e.type, data: JSON.stringify(e.data).slice(0, 50) })));
      log(`${events.length} events (showing last 20 in console)`);
      break;
      
    case '/tx':
      const txs = Object.values(state.transactions);
      console.table(txs.slice(0, 20).map(t => ({ date: t.date, desc: t.description.slice(0, 30), amount: t.amount, cat: t.category })));
      log(`${txs.length} transactions (showing first 20 in console)`);
      break;
      
    case '/mapping':
      const mapping = localStorage.getItem(CONFIG.mappingKey);
      console.log(mapping ? JSON.parse(mapping) : 'No custom mapping saved');
      log('Mapping shown in console');
      break;
      
    case '/clearmapping':
      localStorage.removeItem(CONFIG.mappingKey);
      log('✓ Custom mapping cleared (back to SEB default)');
      break;
      
    case '/help':
      log('/clear - Clear all data | /rules - List rules | /events - List events | /tx - List transactions | /mapping - Show mapping | /clearmapping - Reset mapping');
      break;
      
    default:
      log(`Unknown command: ${name}. Try /help`);
  }
}

function log(msg) {
  console.log(`🐱 ${msg}`);
  // Brief visual feedback
  const input = $('#debugInput');
  input.placeholder = msg;
  setTimeout(() => { input.placeholder = '/clear, /rules, /events, /help'; }, 2000);
}
