# Browser Extension Localization Design

## Goal

Add English and Russian localization to the Verstak browser extension with a
persisted manual `System / English / Russian` language selector. The extension
remains independent from the desktop application's language preference.

## Scope

The change covers:

- all user-visible popup labels, hints, statuses, validation messages, and
  receiver-state labels;
- the three browser context-menu titles;
- persisted language selection;
- Chromium and Firefox build packaging;
- automated tests for locale resolution, persistence, live popup updates, and
  context-menu localization.

Manifest name and description localization is not part of this milestone. The
existing English manifest values remain the fallback in both browser builds.

## Locale Model

The stored setting is named `language` and accepts only:

- `system` (default);
- `en`;
- `ru`.

`system` resolves the browser UI language through
`browser.i18n.getUILanguage()` / `chrome.i18n.getUILanguage()`. Popup code may
fall back to `navigator.language` when the extension i18n API is unavailable.
`ru` and `ru-*` resolve to Russian; every other value resolves to English.
Invalid or missing stored preferences normalize to `system`.

## Catalogs and Runtime

The extension owns framework-independent JSON catalogs:

```text
shared/locales/en.json
shared/locales/ru.json
```

A small shared runtime provides:

- preference normalization;
- system-locale resolution;
- key lookup with English and literal fallback;
- `{parameter}` interpolation.

The runtime has no dependency on desktop, the plugin SDK, DOM APIs, or external
packages. It is loaded by both popup and background scripts.

Both catalogs must contain identical string-only keys. The build copies them
into `dist/chromium/locales` and `dist/firefox/locales` together with the shared
runtime.

## Popup Behavior

The existing settings section gains a labeled language `<select>` with
`system`, `en`, and `ru` options. Selecting a value:

1. updates all popup chrome immediately without reopening the popup;
2. sends the full settings patch to background storage;
3. preserves receiver URL and pairing token values;
4. shows the localized saved/error state.

The `<html lang>` attribute is updated to the resolved locale. User data,
receiver URLs, tokens, file names, and backend-provided error text are not
translated.

## Background and Context Menus

`DEFAULT_SETTINGS` gains `language: "system"`. Context-menu creation resolves
the effective locale from stored settings and creates localized page,
selection, and link titles.

After a language setting is saved, background recreates the context menus so
the new language applies without reinstalling or reloading the extension.
Failure to access the i18n API falls back to English and must not block capture
or settings operations.

## Error Handling

- Missing catalog keys fall back to English, then to the provided literal/key.
- Invalid stored language values behave as `system`.
- Catalog or browser-language detection failure falls back to English.
- Existing receiver and capture errors continue to be shown; known extension
  validation/status chrome around them is localized.

## Verification

Tests are written before production changes and cover:

- `ru-*` and non-Russian system-language resolution;
- explicit language override and invalid-preference normalization;
- English/Russian catalog parity and interpolation;
- popup language persistence without losing receiver settings;
- live popup translation after selecting Russian/English;
- localized online/offline/unknown and capture status messages;
- localized context-menu creation and recreation after language changes;
- build contents for both Chromium and Firefox.

Final verification commands:

```bash
npm test
npm run build
```

Manual installation or store signing is outside this milestone.
