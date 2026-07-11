#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Element {
  constructor(text) {
    this.value = '';
    this.textContent = text || '';
    this.className = '';
    this.files = [];
    this.listeners = {};
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
}

const ids = [
  'status', 'receiver-state', 'receiver-url', 'receiver-input', 'receiver-token-input',
  'language-select', 'file-input', 'pending-count', 'status-dot', 'subtitle',
  'receiver-label', 'pending-label', 'url-label', 'file-label', 'receiver-url-label',
  'receiver-token-label', 'language-label', 'capture-page', 'capture-file', 'retry',
  'save-settings', 'context-menu-hint', 'language-system-option', 'language-en-option',
  'language-ru-option',
];
const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
elements['capture-page'].textContent = 'Send Page';

const browser = {
  runtime: {
    getURL(relativePath) { return `extension://${relativePath}`; },
    sendMessage() {
      return Promise.resolve({
        settings: { receiverUrl: 'http://127.0.0.1/', receiverToken: '', language: 'system' },
        pendingCount: 0,
        status: {},
      });
    },
  },
  i18n: { getUILanguage() { return 'en-US'; } },
};
const document = {
  activeElement: null,
  documentElement: { lang: '' },
  getElementById(id) { return elements[id]; },
};
const context = vm.createContext({
  browser,
  document,
  navigator: { language: 'en-US' },
  console: { warn() {}, error: console.error },
  Promise,
  fetch() { return Promise.reject(new Error('catalog unavailable')); },
});
context.globalThis = context;

const root = path.resolve(__dirname, '..');
for (const file of ['shared/i18n.js', 'shared/popup/popup.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

(async () => {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  assert.strictEqual(elements['capture-page'].textContent, 'Send Page');
  assert.strictEqual(elements['receiver-state'].textContent, 'Unknown');
  assert.strictEqual(document.documentElement.lang, 'en');
  console.log('browser extension popup catalog fallback tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
