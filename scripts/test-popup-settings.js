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

  change() {
    if (this.listeners.change) this.listeners.change({ target: this });
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
  'activity-pending-count',
  'status-dot',
  'subtitle',
  'receiver-label',
  'pending-label',
  'activity-pending-label',
  'url-label',
  'capture-page',
  'capture-file',
  'retry',
  'file-label',
  'receiver-url-label',
  'receiver-token-label',
  'language-label',
  'language-select',
  'language-system-option',
  'language-en-option',
  'language-ru-option',
  'save-settings',
  'context-menu-hint',
  'passive-activity-enabled',
  'passive-activity-label',
  'passive-activity-disclosure',
  'passive-activity-exclusions-label',
  'passive-activity-exclusions',
].forEach((id) => {
  elements[id] = new Element();
});

let savedSettings = null;
let nextRequestError = null;
const technicalWarnings = [];
const initialState = {
  settings: {
    receiverUrl: 'http://127.0.0.1:47731/api/browser-inbox/v1/captures',
    receiverToken: 'persisted-token',
    language: 'system',
    passiveActivityEnabled: false,
    passiveActivityExcludedDomains: ['youtube.com'],
  },
  pendingCount: 0,
  status: {},
};
const browser = {
  runtime: {
    getURL(relativePath) { return `extension://${relativePath}`; },
    sendMessage(message) {
      if (nextRequestError) {
        const error = nextRequestError;
        nextRequestError = null;
        return Promise.reject(new Error(error));
      }
      if (message.action === 'getState') return Promise.resolve(initialState);
      if (message.action === 'saveSettings') {
        savedSettings = message.settings;
        return Promise.resolve({ ...initialState, settings: message.settings });
      }
      return Promise.resolve(initialState);
    },
  },
  i18n: { getUILanguage() { return 'ru-RU'; } },
};
const document = {
  activeElement: null,
  documentElement: { lang: '' },
  getElementById(id) {
    return elements[id];
  },
};
const catalogs = {
  en: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'locales', 'en.json'), 'utf8')),
  ru: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'locales', 'ru.json'), 'utf8')),
};
function fetchCatalog(url) {
  const locale = /\/ru\.json$/.test(url) ? 'ru' : 'en';
  return Promise.resolve({ ok: true, json: () => Promise.resolve(catalogs[locale]) });
}
const i18nPath = path.join(__dirname, '..', 'shared', 'i18n.js');
const popupPath = path.join(__dirname, '..', 'shared', 'popup', 'popup.js');
const popupSource = fs.readFileSync(popupPath, 'utf8');
assert.equal(/setStatus\(\s*(?:error\b|err\b|String\()/.test(popupSource), false);
const context = vm.createContext({
  browser,
  console: {
    error: console.error,
    log: console.log,
    warn(...args) { technicalWarnings.push(args.map(String).join(' ')); },
  },
  document,
  Promise,
  btoa,
  fetch: fetchCatalog,
  navigator: { language: 'en-US' },
});
context.globalThis = context;
vm.runInContext(fs.readFileSync(i18nPath, 'utf8'), context, { filename: i18nPath });
vm.runInContext(popupSource, context, { filename: popupPath });

async function flush() {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
}

(async () => {
  await flush();
  assert.strictEqual(elements['receiver-input'].value, initialState.settings.receiverUrl);
  assert.strictEqual(elements['receiver-token-input'].value, initialState.settings.receiverToken);
  assert.strictEqual(elements['language-select'].value, 'system');
  assert.strictEqual(elements['passive-activity-enabled'].checked, false);
  assert.strictEqual(elements['passive-activity-exclusions'].value, 'youtube.com');
  assert.strictEqual(elements['capture-page'].textContent, 'Отправить страницу');
  assert.strictEqual(elements['receiver-state'].textContent, 'Неизвестно');
  assert.strictEqual(document.documentElement.lang, 'ru');
  elements['capture-file'].click();
  assert.strictEqual(elements.status.textContent, 'Сначала выберите файл');

  elements['language-select'].value = 'en';
  elements['language-select'].change();
  await flush();

  assert.strictEqual(elements['capture-page'].textContent, 'Send Page');
  assert.strictEqual(elements['receiver-state'].textContent, 'Unknown');
  assert.strictEqual(document.documentElement.lang, 'en');
  assert.ok(savedSettings);
  assert.strictEqual(savedSettings.language, 'en');
  assert.strictEqual(savedSettings.receiverUrl, initialState.settings.receiverUrl);
  assert.strictEqual(savedSettings.receiverToken, initialState.settings.receiverToken);
  assert.strictEqual(savedSettings.passiveActivityEnabled, false);
  assert.deepStrictEqual(Array.from(savedSettings.passiveActivityExcludedDomains), ['youtube.com']);

  elements['receiver-input'].value = 'http://127.0.0.1:47731/api/browser-inbox/v1/captures';
  elements['receiver-token-input'].value = 'new-token';
  elements['passive-activity-enabled'].checked = true;
  elements['passive-activity-exclusions'].value = 'youtube.com\nx.com';
  elements['save-settings'].click();
  await flush();

  assert.ok(savedSettings);
  assert.strictEqual(savedSettings.receiverUrl, 'http://127.0.0.1:47731/api/browser-inbox/v1/captures');
  assert.strictEqual(savedSettings.receiverToken, 'new-token');
  assert.strictEqual(savedSettings.language, 'en');
  assert.strictEqual(savedSettings.passiveActivityEnabled, true);
  assert.deepStrictEqual(Array.from(savedSettings.passiveActivityExcludedDomains), ['youtube.com', 'x.com']);

  nextRequestError = '[plugin:verstak.browser-inbox] captures.create failed: receiver unavailable';
  elements['capture-page'].click();
  await flush();
  assert.strictEqual(elements.status.textContent, 'Could not send the capture. Please try again.');
  assert.equal(elements.status.textContent.includes('[plugin:'), false);
  assert.ok(technicalWarnings.some((message) => message.includes('captures.create failed')));

  console.log('browser extension popup localization/settings tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
