/**
 * Event Store - localStorage-based event storage
 */

import { CONFIG } from './config.js';

export const EventStore = {
  getAll() {
    return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
  },

  append(type, data) {
    const events = this.getAll();
    const event = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now()
    };
    events.push(event);
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(events));
    return event;
  },

  replace(events) {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(events));
  },

  clear() {
    localStorage.setItem(CONFIG.storageKey, '[]');
  }
};
