#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'shared/options/options.html'), 'utf8');
for (const target of ['chromium', 'firefox']) {
  const manifest = require(path.join(root, target, 'manifest.json'));
  assert.deepStrictEqual(manifest.options_ui, { page: 'options/options.html', open_in_tab: true });
}
for (const id of ['receiver-input', 'receiver-token-input', 'language-select', 'passive-activity-enabled', 'passive-activity-exclusions', 'save-settings']) {
  assert.ok(html.includes(`id="${id}"`), `options page missing ${id}`);
}

class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.disabled = false;
    this.listeners = {};
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { this.listeners.click?.(); }
  change() { this.listeners.change?.({ target: this }); }
}

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
const initialState = {
  settings: {
    receiverUrl: 'http://127.0.0.1:47731/api/browser-inbox/v1/captures',
    receiverToken: 'persisted-token',
    language: 'system',
    passiveActivityEnabled: false,
    passiveActivityExcludedDomains: ['youtube.com'],
  },
};
const catalogs = {
  en: require(path.join(root, 'shared/locales/en.json')),
  ru: require(path.join(root, 'shared/locales/ru.json')),
};
let savedSettings = null;
let savedLanguage = null;
let nextRequestError = null;
const warnings = [];
const browser = {
  runtime: {
    getURL(relativePath) { return `extension://${relativePath}`; },
    sendMessage(message) {
      if (nextRequestError) {
        const error = nextRequestError;
        nextRequestError = null;
        return Promise.reject(new Error(error));
      }
      if (message.action === 'saveSettings') {
        savedSettings = message.settings;
        return Promise.resolve({ settings: message.settings });
      }
      if (message.action === 'saveLanguage') {
        savedLanguage = message.language;
        return Promise.resolve({ settings: { ...initialState.settings, language: message.language } });
      }
      return Promise.resolve(initialState);
    },
  },
  i18n: { getUILanguage() { return 'ru-RU'; } },
};
const document = {
  activeElement: null,
  documentElement: { lang: '' },
  title: '',
  getElementById(id) { return elements[id]; },
};
const context = vm.createContext({
  browser, document, Promise,
  navigator: { language: 'en-US' },
  console: { warn(...args) { warnings.push(args.map(String).join(' ')); } },
  fetch(url) {
    const locale = /\/ru\.json$/.test(url) ? 'ru' : 'en';
    return Promise.resolve({ ok: true, json: () => Promise.resolve(catalogs[locale]) });
  },
});
context.globalThis = context;
for (const file of ['shared/i18n.js', 'shared/options/options.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

async function flush() {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
}

(async () => {
  await flush();
  assert.strictEqual(elements['receiver-input'].value, initialState.settings.receiverUrl);
  assert.strictEqual(elements['receiver-token-input'].value, 'persisted-token');
  assert.strictEqual(elements['passive-activity-exclusions'].value, 'youtube.com');
  assert.strictEqual(elements['language-select'].value, 'system');
  assert.strictEqual(document.documentElement.lang, 'ru');
  assert.strictEqual(elements['options-title'].textContent, 'Настройки Verstak Bridge');

  elements['receiver-input'].value = 'invalid draft URL';
  elements['receiver-token-input'].value = 'draft-token';
  elements['passive-activity-exclusions'].value = 'draft.example';
  elements['language-select'].value = 'en';
  elements['language-select'].change();
  await flush();
  assert.strictEqual(savedLanguage, 'en');
  assert.strictEqual(savedSettings, null, 'language change must not save other settings');
  assert.strictEqual(elements['receiver-input'].value, 'invalid draft URL');
  assert.strictEqual(elements['receiver-token-input'].value, 'draft-token');
  assert.strictEqual(elements['passive-activity-exclusions'].value, 'draft.example');
  assert.strictEqual(document.documentElement.lang, 'en');

  elements['save-settings'].click();
  await flush();
  assert.strictEqual(savedSettings, null, 'invalid receiver URL must not be saved');

  elements['receiver-input'].value = initialState.settings.receiverUrl;
  elements['receiver-token-input'].value = 'new-token';
  elements['passive-activity-enabled'].checked = true;
  elements['passive-activity-exclusions'].value = 'youtube.com\nx.com';
  elements['save-settings'].click();
  await flush();
  assert.strictEqual(savedSettings.receiverToken, 'new-token');
  assert.strictEqual(savedSettings.language, 'en');
  assert.strictEqual(savedSettings.passiveActivityEnabled, true);
  assert.deepStrictEqual(Array.from(savedSettings.passiveActivityExcludedDomains), ['youtube.com', 'x.com']);

  nextRequestError = 'language update failed';
  elements['language-select'].value = 'ru';
  elements['language-select'].change();
  await flush();
  assert.strictEqual(elements['language-select'].value, 'en');
  assert.strictEqual(document.documentElement.lang, 'en');

  nextRequestError = '[plugin] technical failure';
  elements['save-settings'].click();
  await flush();
  assert.strictEqual(elements.status.textContent, 'Could not save settings. Please try again.');
  assert.ok(warnings.some((message) => message.includes('technical failure')));

  console.log('browser extension options page tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
