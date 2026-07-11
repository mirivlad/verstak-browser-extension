#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const catalogs = {
  en: JSON.parse(fs.readFileSync(path.join(root, 'shared', 'locales', 'en.json'), 'utf8')),
  ru: JSON.parse(fs.readFileSync(path.join(root, 'shared', 'locales', 'ru.json'), 'utf8')),
};
const state = {
  settings: {
    receiverUrl: 'http://127.0.0.1:47731/api/browser-inbox/v1/captures',
    receiverToken: 'paired-token',
    language: 'ru',
  },
};
let menuTitles = [];
let installedListener;
let messageListener;

const browser = {
  storage: {
    local: {
      get(key) {
        if (typeof key === 'string') return Promise.resolve({ [key]: state[key] });
        return Promise.resolve({ ...state });
      },
      set(patch) {
        Object.assign(state, patch || {});
        return Promise.resolve();
      },
    },
  },
  contextMenus: {
    removeAll() {
      menuTitles = [];
      return Promise.resolve();
    },
    create(item) {
      menuTitles.push(item.title);
    },
    onClicked: { addListener() {} },
  },
  runtime: {
    getURL(relativePath) { return `extension://${relativePath}`; },
    onInstalled: { addListener(listener) { installedListener = listener; } },
    onMessage: { addListener(listener) { messageListener = listener; } },
  },
  i18n: { getUILanguage() { return 'en-US'; } },
  tabs: { query() { return Promise.resolve([]); } },
};

function fetchCatalog(url) {
  const locale = /\/ru\.json$/.test(url) ? 'ru' : 'en';
  return Promise.resolve({ ok: true, json: () => Promise.resolve(catalogs[locale]) });
}

const context = vm.createContext({
  browser,
  console,
  Date,
  Math,
  Promise,
  URL,
  fetch: fetchCatalog,
  setTimeout,
  clearTimeout,
});
context.globalThis = context;
for (const file of ['protocol.js', 'api.js', 'queue.js', 'i18n.js', 'background.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'shared', file), 'utf8'), context, { filename: file });
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function sendMessage(message) {
  return new Promise((resolve) => {
    messageListener(message, {}, resolve);
  });
}

(async () => {
  installedListener();
  await flush();
  assert.deepStrictEqual(menuTitles, [
    'Отправить страницу в Верстак',
    'Отправить выделение в Верстак',
    'Отправить ссылку в Верстак',
  ]);

  const nextState = await sendMessage({
    type: 'verstak.capture',
    action: 'saveSettings',
    settings: {
      receiverUrl: state.settings.receiverUrl,
      receiverToken: state.settings.receiverToken,
      language: 'en',
    },
  });
  await flush();

  assert.strictEqual(state.settings.receiverUrl, 'http://127.0.0.1:47731/api/browser-inbox/v1/captures');
  assert.strictEqual(state.settings.receiverToken, 'paired-token');
  assert.strictEqual(state.settings.language, 'en');
  assert.strictEqual(nextState.settings.language, 'en');
  assert.deepStrictEqual(menuTitles, [
    'Send page to Verstak',
    'Send selection to Verstak',
    'Send link to Verstak',
  ]);
  console.log('browser extension background localization tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
