(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var i18n = globalThis.VerstakBrowserI18n;
  var statusEl = document.getElementById('status');
  var receiverStateEl = document.getElementById('receiver-state');
  var receiverUrlEl = document.getElementById('receiver-url');
  var receiverInputEl = document.getElementById('receiver-input');
  var receiverTokenInputEl = document.getElementById('receiver-token-input');
  var languageSelectEl = document.getElementById('language-select');
  var fileInputEl = document.getElementById('file-input');
  var pendingCountEl = document.getElementById('pending-count');
  var statusDotEl = document.getElementById('status-dot');
  var MAX_FILE_TEXT_LENGTH = 2 * 1024 * 1024;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;
  var catalogs = { en: {}, ru: {} };
  var currentPreference = 'system';
  var currentState = {};
  var t = i18n.createTranslator(catalogs, 'en');

  var staticText = {
    subtitle: 'popup.subtitle',
    'receiver-label': 'label.receiver',
    'pending-label': 'label.pending',
    'url-label': 'label.url',
    'file-label': 'label.file',
    'receiver-url-label': 'label.receiverUrl',
    'receiver-token-label': 'label.pairingToken',
    'language-label': 'label.language',
    'capture-page': 'action.sendPage',
    'capture-file': 'action.sendFile',
    retry: 'action.retryPending',
    'save-settings': 'action.save',
    'context-menu-hint': 'hint.contextMenu',
    'language-system-option': 'language.system',
    'language-en-option': 'language.en',
    'language-ru-option': 'language.ru'
  };

  function browserLocale() {
    try {
      if (ext.i18n && ext.i18n.getUILanguage) return ext.i18n.getUILanguage();
    } catch (_) {}
    return typeof navigator !== 'undefined' ? navigator.language : 'en';
  }

  function loadCatalogs() {
    return i18n.loadCatalogs(function (locale) {
      return fetch(ext.runtime.getURL('locales/' + locale + '.json')).then(function (response) {
        if (!response.ok) throw new Error('catalog load failed: ' + locale);
        return response.json();
      });
    }).catch(function (error) {
      console.warn('[verstak] localization catalogs unavailable:', error);
      return { en: {}, ru: {} };
    });
  }

  function applyReceiverState(state) {
    var reachable = state && state.status && state.status.receiverReachable;
    if (reachable === true) {
      receiverStateEl.textContent = t('receiver.online', null, 'Online');
      receiverStateEl.className = 'online';
      statusDotEl.className = 'dot online';
    } else if (reachable === false) {
      receiverStateEl.textContent = t('receiver.offline', null, 'Offline');
      receiverStateEl.className = 'offline';
      statusDotEl.className = 'dot offline';
    } else {
      receiverStateEl.textContent = t('receiver.unknown', null, 'Unknown');
      receiverStateEl.className = '';
      statusDotEl.className = 'dot unknown';
    }
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
    applyReceiverState(currentState);
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunkSize) {
      var chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function readOptionalText(file) {
    if (file.size > MAX_FILE_TEXT_LENGTH) return Promise.resolve('');
    if (file.type && file.type.indexOf('text/') !== 0 && file.type !== 'application/json') return Promise.resolve('');
    return file.text().catch(function () { return ''; });
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function request(message) {
    return Promise.resolve(ext.runtime.sendMessage(message)).then(function (result) {
      if (result && result.error) throw new Error(result.error);
      return result || {};
    });
  }

  function render(state) {
    currentState = state || {};
    var settings = currentState.settings || {};
    pendingCountEl.textContent = String(currentState.pendingCount || 0);
    receiverUrlEl.textContent = settings.receiverUrl || '';
    if (document.activeElement !== receiverInputEl) receiverInputEl.value = settings.receiverUrl || '';
    if (document.activeElement !== receiverTokenInputEl) receiverTokenInputEl.value = settings.receiverToken || '';
    applyReceiverState(currentState);
  }

  function refresh() {
    return request({ type: 'verstak.capture', action: 'getState' }).then(function (state) {
      render(state);
      applyLocale(state.settings && state.settings.language || 'system');
      return state;
    }).catch(function (error) {
      setStatus(error && error.message ? error.message : String(error));
    });
  }

  function currentSettings() {
    return {
      receiverUrl: receiverInputEl.value.trim(),
      receiverToken: receiverTokenInputEl.value.trim(),
      language: currentPreference
    };
  }

  function saveCurrentSettings(successMessage) {
    return request({
      type: 'verstak.capture',
      action: 'saveSettings',
      settings: currentSettings()
    }).then(function (state) {
      render(state);
      if (successMessage) setStatus(t('status.saved', null, 'Saved'));
      return state;
    }).catch(function (error) {
      setStatus(error && error.message ? error.message : String(error));
    });
  }

  function send(message) {
    setStatus(t('status.sending', null, 'Sending...'));
    request(message).then(function (state) {
      render(state);
      if (state.status && state.status.lastResult === 'queued') {
        setStatus(t('status.queued', null, 'Queued until Verstak is available'));
      } else {
        setStatus(t('status.done', null, 'Done'));
      }
    }).catch(function (error) {
      setStatus(error && error.message ? error.message : String(error));
    });
  }

  document.getElementById('capture-page').addEventListener('click', function () {
    send({ type: 'verstak.capture', kind: 'page' });
  });

  document.getElementById('capture-file').addEventListener('click', function () {
    var file = fileInputEl.files && fileInputEl.files[0];
    if (!file) {
      setStatus(t('error.chooseFile', null, 'Choose a file first'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus(t('error.fileTooLarge', null, 'File is too large for browser capture'));
      return;
    }
    setStatus(t('status.readingFile', null, 'Reading file...'));
    Promise.all([file.arrayBuffer(), readOptionalText(file)]).then(function (results) {
      send({
        type: 'verstak.capture',
        kind: 'file',
        fileName: file.name,
        fileMime: file.type || '',
        fileSize: file.size,
        fileText: results[1] || '',
        fileDataBase64: arrayBufferToBase64(results[0])
      });
    }).catch(function (error) {
      setStatus(error && error.message ? error.message : String(error));
    });
  });

  document.getElementById('retry').addEventListener('click', function () {
    send({ type: 'verstak.capture', action: 'retryPending' });
  });

  languageSelectEl.addEventListener('change', function () {
    applyLocale(languageSelectEl.value);
    saveCurrentSettings(true);
  });

  document.getElementById('save-settings').addEventListener('click', function () {
    if (!/^https?:\/\//.test(receiverInputEl.value.trim())) {
      setStatus(t('error.invalidReceiverUrl', null, 'Receiver URL must start with http:// or https://'));
      return;
    }
    saveCurrentSettings(true);
  });

  loadCatalogs().then(function (loadedCatalogs) {
    catalogs = loadedCatalogs;
    applyLocale('system');
    return refresh();
  });
})();
