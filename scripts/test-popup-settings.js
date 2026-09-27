#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'shared/popup/popup.html'), 'utf8');
assert.match(html, /id="open-settings"/);
assert.doesNotMatch(html, /id="receiver-input"|id="passive-activity-exclusions"|id="save-settings"/);

class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.files = [];
    this.listeners = {};
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { this.listeners.click?.(); }
}

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
const catalogs = {
  en: require(path.join(root, 'shared/locales/en.json')),
  ru: require(path.join(root, 'shared/locales/ru.json')),
};
const state = {
  settings: { receiverUrl: 'http://127.0.0.1:47731/api/browser-inbox/v1/captures', language: 'ru' },
  pendingCount: 2,
  pendingActivityCount: 1,
  status: { receiverReachable: true },
};
let openedOptions = 0;
let failToOpen = false;
let sentPage = 0;
let nextRequestError = null;
const warnings = [];
const browser = {
  runtime: {
    getURL(relativePath) { return `extension://${relativePath}`; },
    openOptionsPage() {
      openedOptions += 1;
      return failToOpen ? Promise.reject(new Error('options unavailable')) : Promise.resolve();
    },
    sendMessage(message) {
      if (nextRequestError) {
        const error = nextRequestError;
        nextRequestError = null;
        return Promise.reject(new Error(error));
      }
      if (message.kind === 'page') sentPage += 1;
      return Promise.resolve(state);
    },
  },
  i18n: { getUILanguage() { return 'en-US'; } },
};
const document = {
  documentElement: { lang: '' },
  getElementById(id) { return elements[id]; },
};
const context = vm.createContext({
  browser, document, Promise, btoa,
  navigator: { language: 'en-US' },
  console: { warn(...args) { warnings.push(args.map(String).join(' ')); } },
  fetch(url) {
    const locale = /\/ru\.json$/.test(url) ? 'ru' : 'en';
    return Promise.resolve({ ok: true, json: () => Promise.resolve(catalogs[locale]) });
  },
});
context.globalThis = context;
for (const file of ['shared/i18n.js', 'shared/popup/popup.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

async function flush() {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
}

(async () => {
  await flush();
  assert.strictEqual(elements['open-settings'].textContent, 'Настройки');
  assert.strictEqual(elements['receiver-state'].textContent, 'Доступен');
  assert.strictEqual(elements['receiver-url'].textContent, state.settings.receiverUrl);
  assert.strictEqual(elements['pending-count'].textContent, '2');
  assert.strictEqual(document.documentElement.lang, 'ru');

  elements['open-settings'].click();
  await flush();
  assert.strictEqual(openedOptions, 1);

  failToOpen = true;
  elements['open-settings'].click();
  await flush();
  assert.strictEqual(elements.status.textContent, 'Не удалось открыть настройки расширения.');

  elements['capture-page'].click();
  await flush();
  assert.strictEqual(sentPage, 1);

  nextRequestError = '[plugin:verstak.browser-inbox] captures.create failed';
  elements['capture-page'].click();
  await flush();
  assert.strictEqual(elements.status.textContent, 'Не удалось отправить материал. Повторите попытку.');
  assert.ok(warnings.some((message) => message.includes('captures.create failed')));
  console.log('browser extension popup quick actions tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
