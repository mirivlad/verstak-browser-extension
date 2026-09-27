(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var i18n = globalThis.VerstakBrowserI18n;
  var receiverInputEl = document.getElementById('receiver-input');
  var receiverTokenInputEl = document.getElementById('receiver-token-input');
  var languageSelectEl = document.getElementById('language-select');
  var passiveActivityEnabledEl = document.getElementById('passive-activity-enabled');
  var passiveActivityExclusionsEl = document.getElementById('passive-activity-exclusions');
  var statusEl = document.getElementById('status');
  var catalogs = { en: {}, ru: {} };
  var currentPreference = 'system';
  var persistedPreference = 'system';
  var t = i18n.createTranslator(catalogs, 'en');

  var staticText = {
    'options-title': 'options.title',
    'options-description': 'options.description',
    'connection-title': 'options.connection',
    'activity-title': 'options.activity',
    'receiver-url-label': 'label.receiverUrl',
    'receiver-token-label': 'label.pairingToken',
    'passive-activity-label': 'label.passiveActivity',
    'passive-activity-disclosure': 'hint.passiveActivityDisclosure',
    'passive-activity-exclusions-label': 'label.passiveActivityExclusions',
    'language-label': 'label.language',
    'language-system-option': 'language.system',
    'language-en-option': 'language.en',
    'language-ru-option': 'language.ru',
    'language-hint': 'options.languageHint',
    'save-settings': 'action.save'
  };

  function browserLocale() {
    try {
      if (ext.i18n && ext.i18n.getUILanguage) return ext.i18n.getUILanguage();
    } catch (_) {}
    return typeof navigator !== 'undefined' ? navigator.language : 'en';
  }

  function applyLocale(preference) {
    currentPreference = i18n.normalizePreference(preference);
    var locale = i18n.resolveLocale(currentPreference, browserLocale());
    t = i18n.createTranslator(catalogs, locale);
    document.documentElement.lang = locale;
    languageSelectEl.value = currentPreference;
    Object.keys(staticText).forEach(function (id) {
      var element = document.getElementById(id);
      if (element) {
        if (element.__verstakI18nFallback == null) element.__verstakI18nFallback = element.textContent;
        element.textContent = t(staticText[id], null, element.__verstakI18nFallback);
      }
    });
    document.title = t('options.title', null, 'Verstak Bridge settings');
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function reportError(key, fallback, error) {
    console.warn('[verstak.options] request failed:', error);
    setStatus(t(key, null, fallback));
  }

  function request(message) {
    return Promise.resolve(ext.runtime.sendMessage(message)).then(function (result) {
      if (result && result.error) throw new Error(result.error);
      return result || {};
    });
  }

  function renderSettings(settings) {
    settings = settings || {};
    if (document.activeElement !== receiverInputEl) receiverInputEl.value = settings.receiverUrl || '';
    if (document.activeElement !== receiverTokenInputEl) receiverTokenInputEl.value = settings.receiverToken || '';
    passiveActivityEnabledEl.checked = settings.passiveActivityEnabled === true;
    if (document.activeElement !== passiveActivityExclusionsEl) {
      passiveActivityExclusionsEl.value = Array.isArray(settings.passiveActivityExcludedDomains)
        ? settings.passiveActivityExcludedDomains.join('\n')
        : '';
    }
  }

  function currentSettings() {
    return {
      receiverUrl: receiverInputEl.value.trim(),
      receiverToken: receiverTokenInputEl.value.trim(),
      language: currentPreference,
      passiveActivityEnabled: passiveActivityEnabledEl.checked === true,
      passiveActivityExcludedDomains: passiveActivityExclusionsEl.value.split(/[\n,]/).map(function (value) {
        return value.trim();
      }).filter(Boolean)
    };
  }

  languageSelectEl.addEventListener('change', function () {
    var nextPreference = i18n.normalizePreference(languageSelectEl.value);
    applyLocale(nextPreference);
    languageSelectEl.disabled = true;
    request({ type: 'verstak.capture', action: 'saveLanguage', language: nextPreference }).then(function () {
      persistedPreference = nextPreference;
      setStatus(t('status.saved', null, 'Saved'));
    }).catch(function (error) {
      applyLocale(persistedPreference);
      reportError('error.saveSettings', 'Could not save settings. Please try again.', error);
    }).then(function () {
      languageSelectEl.disabled = false;
    });
  });

  document.getElementById('save-settings').addEventListener('click', function () {
    if (!/^https?:\/\//.test(receiverInputEl.value.trim())) {
      setStatus(t('error.invalidReceiverUrl', null, 'Receiver URL must start with http:// or https://'));
      return;
    }
    request({ type: 'verstak.capture', action: 'saveSettings', settings: currentSettings() }).then(function (state) {
      renderSettings(state.settings);
      setStatus(t('status.saved', null, 'Saved'));
    }).catch(function (error) {
      reportError('error.saveSettings', 'Could not save settings. Please try again.', error);
    });
  });

  i18n.loadCatalogs(function (locale) {
    return fetch(ext.runtime.getURL('locales/' + locale + '.json')).then(function (response) {
      if (!response.ok) throw new Error('catalog load failed: ' + locale);
      return response.json();
    });
  }).catch(function (error) {
    console.warn('[verstak.options] localization catalogs unavailable:', error);
    return { en: {}, ru: {} };
  }).then(function (loadedCatalogs) {
    catalogs = loadedCatalogs;
    applyLocale('system');
    return request({ type: 'verstak.capture', action: 'getState' });
  }).then(function (state) {
    renderSettings(state.settings);
    persistedPreference = i18n.normalizePreference(state.settings && state.settings.language || 'system');
    applyLocale(persistedPreference);
  }).catch(function (error) {
    reportError('error.loadState', 'Could not load the extension state. Please try again.', error);
  });
})();
