(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var i18n = globalThis.VerstakBrowserI18n;
  var statusEl = document.getElementById('status');
  var receiverStateEl = document.getElementById('receiver-state');
  var receiverUrlEl = document.getElementById('receiver-url');
  var fileInputEl = document.getElementById('file-input');
  var pendingCountEl = document.getElementById('pending-count');
  var pendingActivityCountEl = document.getElementById('activity-pending-count');
  var statusDotEl = document.getElementById('status-dot');
  var MAX_FILE_TEXT_LENGTH = 2 * 1024 * 1024;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;
  var catalogs = { en: {}, ru: {} };
  var currentState = {};
  var t = i18n.createTranslator(catalogs, 'en');

  var staticText = {
    subtitle: 'popup.subtitle',
    'receiver-label': 'label.receiver',
    'pending-label': 'label.pending',
    'activity-pending-label': 'label.activityPending',
    'url-label': 'label.url',
    'file-label': 'label.file',
    'capture-page': 'action.sendPage',
    'capture-file': 'action.sendFile',
    retry: 'action.retryPending',
    'open-settings': 'action.settings',
    'context-menu-hint': 'hint.contextMenu'
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
    var locale = i18n.resolveLocale(i18n.normalizePreference(preference), browserLocale());
    t = i18n.createTranslator(catalogs, locale);
    document.documentElement.lang = locale;
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

  function reportError(key, fallback, error) {
    console.warn('[verstak.popup] request failed:', error);
    setStatus(t(key, null, fallback));
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
    pendingActivityCountEl.textContent = String(currentState.pendingActivityCount || 0);
    receiverUrlEl.textContent = settings.receiverUrl || '';
    applyReceiverState(currentState);
  }

  function refresh() {
    return request({ type: 'verstak.capture', action: 'getState' }).then(function (state) {
      render(state);
      applyLocale(state.settings && state.settings.language || 'system');
      return state;
    }).catch(function (error) {
      reportError('error.loadState', 'Could not load the extension state. Please try again.', error);
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
      reportError('error.sendCapture', 'Could not send the capture. Please try again.', error);
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
      reportError('error.readFile', 'Could not read the file. Choose it again.', error);
    });
  });

  document.getElementById('retry').addEventListener('click', function () {
    send({ type: 'verstak.capture', action: 'retryPending' });
  });

  document.getElementById('open-settings').addEventListener('click', function () {
    Promise.resolve().then(function () {
      return ext.runtime.openOptionsPage();
    }).catch(function (error) {
      reportError('error.openSettings', 'Could not open extension settings.', error);
    });
  });

  loadCatalogs().then(function (loadedCatalogs) {
    catalogs = loadedCatalogs;
    applyLocale('system');
    return refresh();
  });
})();
