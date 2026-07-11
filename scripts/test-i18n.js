#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const i18n = require(path.join(root, 'shared', 'i18n.js'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'locales', 'en.json'), 'utf8'));
const ru = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'locales', 'ru.json'), 'utf8'));

assert.strictEqual(i18n.normalizePreference(undefined), 'system');
assert.strictEqual(i18n.normalizePreference('de'), 'system');
assert.strictEqual(i18n.normalizePreference('system'), 'system');
assert.strictEqual(i18n.normalizePreference('en'), 'en');
assert.strictEqual(i18n.normalizePreference('ru'), 'ru');

assert.strictEqual(i18n.resolveLocale('system', 'ru'), 'ru');
assert.strictEqual(i18n.resolveLocale('system', 'ru-RU'), 'ru');
assert.strictEqual(i18n.resolveLocale('system', 'RU-ru'), 'ru');
assert.strictEqual(i18n.resolveLocale('system', 'uk-UA'), 'en');
assert.strictEqual(i18n.resolveLocale('system', 'en-US'), 'en');
assert.strictEqual(i18n.resolveLocale('en', 'ru-RU'), 'en');
assert.strictEqual(i18n.resolveLocale('ru', 'en-US'), 'ru');

assert.deepStrictEqual(Object.keys(ru).sort(), Object.keys(en).sort());
assert.ok(Object.values(en).every((value) => typeof value === 'string'));
assert.ok(Object.values(ru).every((value) => typeof value === 'string'));

const tEn = i18n.createTranslator({ en, ru }, 'en');
const tRu = i18n.createTranslator({ en, ru }, 'ru');
assert.strictEqual(tRu('status.queued'), 'В очереди до запуска Верстака');
assert.strictEqual(tEn('error.value', { error: 'offline' }), 'Error: offline');
assert.strictEqual(tRu('missing', null, 'Fallback'), 'Fallback');
assert.strictEqual(tRu('missing.key'), 'missing.key');

i18n.loadCatalogs((locale) => Promise.resolve(locale === 'ru' ? ru : en))
  .then((catalogs) => {
    assert.strictEqual(catalogs.en, en);
    assert.strictEqual(catalogs.ru, ru);
    console.log('browser extension localization runtime tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
