# Browser Extension Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted `System / English / Russian` language selection to the browser extension, localizing popup chrome and context menus in Chromium and Firefox.

**Architecture:** A framework-independent `shared/i18n.js` resolves preferences and loads extension-owned JSON catalogs. Popup and background both consume it; background owns persistence and context-menu recreation, while popup performs immediate DOM translation and sends settings updates.

**Tech Stack:** WebExtension APIs, plain ES5-compatible JavaScript, JSON catalogs, Node `assert`/`vm` tests, existing Node build script.

## Global Constraints

- Store only `system`, `en`, or `ru`; missing/invalid values normalize to `system`.
- `ru` and `ru-*` browser UI locales resolve to Russian; all other system locales resolve to English.
- Keep the extension language independent from desktop settings.
- Add no runtime dependency and no manifest-localization scope.
- Never translate receiver URLs, tokens, file names, user content, or raw receiver error text.
- Preserve receiver URL/token values when language changes.
- Both browser distributions must contain `i18n.js`, `locales/en.json`, and `locales/ru.json`.

---

### Task 1: Shared Locale Runtime and Catalog Contract

**Files:**

- Create: `shared/i18n.js`
- Create: `shared/locales/en.json`
- Create: `shared/locales/ru.json`
- Create: `scripts/test-i18n.js`
- Modify: `package.json`

**Interfaces:**

- Produces: `globalThis.VerstakBrowserI18n.normalizePreference(value)`.
- Produces: `globalThis.VerstakBrowserI18n.resolveLocale(preference, systemLocale)`.
- Produces: `globalThis.VerstakBrowserI18n.loadCatalogs(loadJSON)` returning `Promise<{en,ru}>`.
- Produces: `globalThis.VerstakBrowserI18n.createTranslator(catalogs, locale)` returning `t(key, params, fallback)`.

- [ ] **Step 1: Write the failing runtime/catalog test**

Create `scripts/test-i18n.js` that loads `shared/i18n.js` in `vm`, reads both JSON catalogs, and asserts:

```js
assert.strictEqual(i18n.normalizePreference('de'), 'system');
assert.strictEqual(i18n.resolveLocale('system', 'ru-RU'), 'ru');
assert.strictEqual(i18n.resolveLocale('system', 'uk-UA'), 'en');
assert.strictEqual(i18n.resolveLocale('en', 'ru-RU'), 'en');
assert.deepStrictEqual(Object.keys(ru).sort(), Object.keys(en).sort());
assert.ok(Object.values(en).every((value) => typeof value === 'string'));
assert.ok(Object.values(ru).every((value) => typeof value === 'string'));
assert.strictEqual(i18n.createTranslator({ en, ru }, 'ru')('status.queued'), 'В очереди до запуска Верстака');
assert.strictEqual(i18n.createTranslator({ en, ru }, 'en')('error.value', { error: 'offline' }), 'Error: offline');
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node scripts/test-i18n.js`

Expected: FAIL because `shared/i18n.js` and catalogs do not exist.

- [ ] **Step 3: Implement the minimal shared runtime**

Implement an IIFE exporting the four functions. `loadCatalogs(loadJSON)` must call `loadJSON('en')` and `loadJSON('ru')`; translation lookup order is selected catalog, English catalog, explicit fallback, key. Interpolation replaces `{name}` only when `params` owns that property.

Catalogs must define identical keys for:

```text
popup.subtitle
label.receiver
label.pending
label.url
label.file
label.receiverUrl
label.pairingToken
label.language
action.sendPage
action.sendFile
action.retryPending
action.save
hint.contextMenu
receiver.online
receiver.offline
receiver.unknown
language.system
language.en
language.ru
status.sending
status.queued
status.done
status.readingFile
status.saved
error.chooseFile
error.fileTooLarge
error.invalidReceiverUrl
error.value
context.sendPage
context.sendSelection
context.sendLink
```

- [ ] **Step 4: Add the test to `npm test` and verify GREEN**

Set:

```json
"test": "node scripts/test-protocol.js && node scripts/test-i18n.js && node scripts/test-popup-settings.js"
```

Run: `node scripts/test-i18n.js`

Expected: `browser extension localization runtime tests passed`.

- [ ] **Step 5: Commit the shared contract**

```bash
git add shared/i18n.js shared/locales scripts/test-i18n.js package.json
git commit -m "feat: add browser extension localization runtime"
```

---

### Task 2: Persisted Language and Localized Context Menus

**Files:**

- Modify: `shared/background.js`
- Modify: `chromium/manifest.json`
- Modify: `firefox/manifest.json`
- Create: `scripts/test-background-i18n.js`

**Interfaces:**

- Consumes: `VerstakBrowserI18n.loadCatalogs`, `normalizePreference`, `resolveLocale`, `createTranslator`.
- Produces: persisted `settings.language` and context-menu recreation after `saveSettings`.

- [ ] **Step 1: Write the failing background test**

Load `protocol.js`, `queue.js`, `i18n.js`, and `background.js` into `vm` with fake storage/context-menu APIs. Seed `settings.language = 'ru'`, trigger `runtime.onInstalled`, and assert:

```js
assert.deepStrictEqual(menuTitles, [
  'Отправить страницу в Верстак',
  'Отправить выделение в Верстак',
  'Отправить ссылку в Верстак',
]);
```

Send a `saveSettings` message with `{ receiverUrl, receiverToken, language: 'en' }`, then assert stored receiver fields are unchanged and menu titles become English.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node scripts/test-background-i18n.js`

Expected: FAIL because background defaults contain no language and menu titles are literal English.

- [ ] **Step 3: Implement background localization**

Add `language: 'system'` to `DEFAULT_SETTINGS`. Normalize it in `getSettings`/`saveSettings`. Load catalogs with:

```js
function loadLocaleCatalogs() {
  return localeCatalogs || i18n.loadCatalogs(function (locale) {
    return fetch(ext.runtime.getURL('locales/' + locale + '.json')).then(function (response) {
      if (!response.ok) throw new Error('catalog load failed: ' + locale);
      return response.json();
    });
  });
}
```

Make `setupContextMenus()` resolve settings plus catalogs, choose
`ext.i18n.getUILanguage()` with English fallback, and create the three menu
titles via `t('context.sendPage')`, `t('context.sendSelection')`, and
`t('context.sendLink')`. Call it after language settings are saved.

- [ ] **Step 4: Load `i18n.js` before background code in both manifests**

- Chromium service worker remains bundled by the build concatenation order.
- Firefox `background.scripts` becomes `protocol.js`, `api.js`, `queue.js`, `i18n.js`, `background.js`.

Also append `node scripts/test-background-i18n.js` to the `test` script in
`package.json` now that the test file exists.

- [ ] **Step 5: Verify and commit**

Run: `node scripts/test-background-i18n.js`

Expected: `browser extension background localization tests passed`.

```bash
git add shared/background.js chromium/manifest.json firefox/manifest.json scripts/test-background-i18n.js
git commit -m "feat: localize browser extension context menus"
```

---

### Task 3: Popup Language Selector and Live Translation

**Files:**

- Modify: `shared/popup/popup.html`
- Modify: `shared/popup/popup.js`
- Modify: `shared/popup/popup.css`
- Modify: `scripts/test-popup-settings.js`

**Interfaces:**

- Consumes: state `settings.language` from background and the shared translator.
- Produces: immediate popup translation plus a `saveSettings` message containing receiver URL, token, and language.

- [ ] **Step 1: Extend the popup test and confirm RED**

Add fake elements for every localized ID plus `language-select`, mock catalog fetches, `browser.i18n.getUILanguage()`, and `document.documentElement.lang`. Assert initial `system` with `ru-RU` renders Russian. Change select value to `en`, dispatch `change`, flush promises, then assert:

```js
assert.strictEqual(elements['capture-page'].textContent, 'Send Page');
assert.strictEqual(elements['receiver-state'].textContent, 'Unknown');
assert.strictEqual(document.documentElement.lang, 'en');
assert.strictEqual(savedSettings.language, 'en');
assert.strictEqual(savedSettings.receiverUrl, initialState.settings.receiverUrl);
assert.strictEqual(savedSettings.receiverToken, initialState.settings.receiverToken);
```

- [ ] **Step 2: Add popup markup**

Load `../i18n.js` before `popup.js`, give all static user-visible elements stable IDs, and add:

```html
<label id="language-label" for="language-select">Language</label>
<select id="language-select">
  <option value="system">System</option>
  <option value="en">English</option>
  <option value="ru">Русский</option>
</select>
```

- [ ] **Step 3: Implement asynchronous popup initialization and live switch**

Load both catalogs through `ext.runtime.getURL`, resolve the locale from saved
preference plus browser UI language, and apply all static text through one
`applyLocale(preference)` function. `render(state)` localizes
online/offline/unknown. Known statuses and validations use catalog keys; raw
error messages are wrapped only when needed by `error.value`.

The select `change` handler must call `applyLocale` before awaiting background
storage, then send all three settings fields. The existing Save button also
sends the selected language.

- [ ] **Step 4: Style the select consistently and verify GREEN**

Share the existing input box model/colors with `select` and keep the popup
minimum width unchanged.

Run: `node scripts/test-popup-settings.js`

Expected: `browser extension popup localization/settings tests passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/popup scripts/test-popup-settings.js
git commit -m "feat: add browser extension language selector"
```

---

### Task 4: Distribution Packaging, Documentation, and Full Verification

**Files:**

- Modify: `scripts/build-extension.js`
- Modify: `README.md`
- Test: `scripts/test-i18n.js`
- Test: `scripts/test-background-i18n.js`
- Test: `scripts/test-popup-settings.js`

**Interfaces:**

- Consumes: shared runtime/catalogs and updated manifests.
- Produces: complete `dist/chromium` and `dist/firefox` extension directories.

- [ ] **Step 1: Add failing build-content assertions**

Extend `scripts/test-i18n.js` to run after build when `dist` exists and assert
both targets contain:

```text
i18n.js
locales/en.json
locales/ru.json
```

- [ ] **Step 2: Update the build**

For Chromium, concatenate `shared/i18n.js` before `shared/background.js` and
also copy it as `dist/chromium/i18n.js` for popup use. For Firefox, copy
`shared/i18n.js` beside background scripts. Copy both JSON catalogs to each
target's `locales/` directory.

- [ ] **Step 3: Document the selector**

Add a README section stating that popup settings provide persisted
`System / English / Russian`, that System uses browser UI language, and that
extension/desktop preferences are independent.

- [ ] **Step 4: Run complete verification**

```bash
npm test
npm run build
npm test
git diff --check
```

Expected:

- protocol, runtime, popup, and background tests pass;
- both browser distributions build;
- post-build content assertions pass;
- no whitespace errors.

- [ ] **Step 5: Commit packaging and docs**

```bash
git add scripts/build-extension.js README.md scripts/test-i18n.js
git commit -m "build: package browser extension locale catalogs"
```
