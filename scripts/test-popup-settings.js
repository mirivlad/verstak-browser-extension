#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.files = [];
    this.listeners = {};
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  click() {
    if (this.listeners.click) this.listeners.click();
  }
}

const elements = {};
[
  'status',
  'receiver-state',
  'receiver-url',
  'receiver-input',
  'receiver-token-input',
  'file-input',
  'pending-count',
  'status-dot',
  'capture-page',
  'capture-file',
  'retry',
  'save-settings',
].forEach((id) => {
  elements[id] = new Element();
});

let savedSettings = null;
const initialState = {
  settings: {
    receiverUrl: 'http://127.0.0.1:47731/api/browser-inbox/v1/captures',
    receiverToken: 'persisted-token',
  },
  pendingCount: 0,
  status: {},
};
const browser = {
  runtime: {
    sendMessage(message) {
      if (message.action === 'getState') return Promise.resolve(initialState);
      if (message.action === 'saveSettings') {
        savedSettings = message.settings;
        return Promise.resolve({ ...initialState, settings: message.settings });
      }
      return Promise.resolve(initialState);
    },
  },
};
const document = {
  activeElement: null,
  getElementById(id) {
    return elements[id];
  },
};
const popupPath = path.join(__dirname, '..', 'shared', 'popup', 'popup.js');
vm.runInNewContext(fs.readFileSync(popupPath, 'utf8'), { browser, console, document, Promise, btoa });

async function flush() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

(async () => {
  await flush();
  assert.strictEqual(elements['receiver-input'].value, initialState.settings.receiverUrl);
  assert.strictEqual(elements['receiver-token-input'].value, initialState.settings.receiverToken);

  elements['receiver-input'].value = 'http://127.0.0.1:47731/api/browser-inbox/v1/captures';
  elements['receiver-token-input'].value = 'new-token';
  elements['save-settings'].click();
  await flush();

  assert.ok(savedSettings);
  assert.strictEqual(savedSettings.receiverUrl, 'http://127.0.0.1:47731/api/browser-inbox/v1/captures');
  assert.strictEqual(savedSettings.receiverToken, 'new-token');
  console.log('browser extension popup settings tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
