/**
 * Small UI helpers shared by the screens.
 */

import { escapeHTML } from '../utils.js';

const kr0 = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const kr2 = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2 });

export const esc = escapeHTML;
export const f0 = n => kr0.format(n);
export const f2 = n => kr2.format(n);
/** "1286,40" — what a Swedish bank's amount field accepts */
export const plain = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "Today", "Yesterday" or "12 Oct" for a timestamp */
export function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return shortDate.format(d);
}

/** "2–9 Oct" for sorted YYYY-MM-DD dates */
export function dateRange(dates) {
  const a = new Date(dates[0]), b = new Date(dates.at(-1));
  if (dates[0] === dates.at(-1)) return shortDate.format(a);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${shortDate.format(b)}`;
  return `${shortDate.format(a)} – ${shortDate.format(b)}`;
}

let toastTimer;
export function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${msg}</span>${undo ? '<button>Undo</button>' : ''}`;
  document.body.appendChild(el);
  if (undo) el.querySelector('button').onclick = () => { undo(); el.remove(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), undo ? 5000 : 3000);
}
