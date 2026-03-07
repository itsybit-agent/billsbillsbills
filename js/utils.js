/**
 * Utility functions
 */

import { CONFIG } from './config.js';

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' 
  }[c]));
}

export function formatCurrency(amount) {
  return amount.toLocaleString(CONFIG.locale) + ' ' + CONFIG.currency;
}

export function downloadJSON(data, filename) {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

export function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
