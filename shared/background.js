(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var protocol = globalThis.VerstakBrowser;
  var queue = new protocol.CaptureQueue(protocol.browserStorageAdapter(ext));
  var i18n = globalThis.VerstakBrowserI18n;
  var DEFAULT_SETTINGS = {
    receiverUrl: protocol.DEFAULT_RECEIVER_URL,
    receiverToken: '',
    language: 'system'
  };
  var STATUS_KEY = 'verstak.status';
  var localeCatalogs = null;

  function getSettings() {
    return ext.storage.local.get('settings').then(function (result) {
      var settings = Object.assign({}, DEFAULT_SETTINGS, result && result.settings || {});
      settings.language = i18n.normalizePreference(settings.language);
      return settings;
    });
  }

  function saveSettings(settings) {
    settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    settings.language = i18n.normalizePreference(settings.language);
    return ext.storage.local.set({ settings: settings });
  }

  function loadLocaleCatalogs() {
    if (localeCatalogs) return localeCatalogs;
    localeCatalogs = i18n.loadCatalogs(function (locale) {
      return fetch(ext.runtime.getURL('locales/' + locale + '.json')).then(function (response) {
        if (!response.ok) throw new Error('catalog load failed: ' + locale);
        return response.json();
      });
    }).catch(function (error) {
      console.warn('[verstak] localization catalogs unavailable:', error);
      return { en: {}, ru: {} };
    });
    return localeCatalogs;
  }

  function browserLocale() {
    try {
      return ext.i18n && ext.i18n.getUILanguage ? ext.i18n.getUILanguage() : 'en';
    } catch (_) {
      return 'en';
    }
  }

  function setStatus(patch) {
    return ext.storage.local.get(STATUS_KEY).then(function (result) {
      var status = Object.assign({}, result && result[STATUS_KEY] || {}, patch || {}, {
        updatedAt: new Date().toISOString()
      });
      var update = {};
      update[STATUS_KEY] = status;
      return ext.storage.local.set(update).then(function () {
        return status;
      });
    });
  }

  function activeTab() {
    return ext.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      return tabs && tabs[0] || {};
    });
  }

  function captureFromInfo(kind, info, tab) {
    return protocol.buildCapture({
      kind: kind,
      url: tab && tab.url || info.pageUrl || info.frameUrl || '',
      title: tab && tab.title || '',
      selectionText: info.selectionText || '',
      linkUrl: info.linkUrl || '',
      linkText: info.selectionText || '',
      fileName: info.fileName || '',
      fileMime: info.fileMime || '',
      fileSize: info.fileSize || 0,
      fileText: info.fileText || '',
      fileDataBase64: info.fileDataBase64 || ''
    });
  }

  function sendOrQueue(payload) {
    return getSettings().then(function (settings) {
      return protocol.sendCapture(settings.receiverUrl, settings.receiverToken, payload).catch(function () {
        return queue.enqueue(payload).then(function () {
          return { status: 'queued', captureId: payload.captureId };
        });
      }).then(function (result) {
        return setStatus({
          receiverReachable: result && result.status !== 'queued',
          lastResult: result && result.status || 'accepted',
          lastCaptureId: payload.captureId,
          lastError: ''
        }).then(function () {
          return result;
        });
      });
    });
  }

  function retryPending() {
    return getSettings().then(function (settings) {
      return queue.retry(function (payload) {
        return protocol.sendCapture(settings.receiverUrl, settings.receiverToken, payload);
      }).then(function (result) {
        return setStatus({
          receiverReachable: result.pending === 0,
          lastResult: 'retry',
          lastError: result.pending === 0 ? '' : 'Some captures are still pending'
        }).then(function () {
          return result;
        });
      });
    });
  }

  function getState() {
    return Promise.all([
      getSettings(),
      queue.list(),
      ext.storage.local.get(STATUS_KEY)
    ]).then(function (results) {
      return {
        settings: results[0],
        pendingCount: results[1].length,
        status: results[2] && results[2][STATUS_KEY] || {}
      };
    });
  }

  function setupContextMenus() {
    if (!ext.contextMenus) return Promise.resolve();
    return Promise.all([getSettings(), loadLocaleCatalogs()]).then(function (results) {
      var locale = i18n.resolveLocale(results[0].language, browserLocale());
      var t = i18n.createTranslator(results[1], locale);
      return new Promise(function (resolve) {
        var created = false;
        function createMenus() {
          if (created) return;
          created = true;
          ext.contextMenus.create({ id: 'verstak-capture-page', title: t('context.sendPage', null, 'Send page to Verstak'), contexts: ['page'] });
          ext.contextMenus.create({ id: 'verstak-capture-selection', title: t('context.sendSelection', null, 'Send selection to Verstak'), contexts: ['selection'] });
          ext.contextMenus.create({ id: 'verstak-capture-link', title: t('context.sendLink', null, 'Send link to Verstak'), contexts: ['link'] });
          resolve();
        }
        var removal;
        try {
          removal = ext.contextMenus.removeAll(createMenus);
        } catch (_) {
          removal = ext.contextMenus.removeAll();
        }
        if (removal && typeof removal.then === 'function') removal.then(createMenus, createMenus);
      });
    });
  }

  ext.runtime.onInstalled.addListener(setupContextMenus);
  if (ext.contextMenus && ext.contextMenus.onClicked) {
    ext.contextMenus.onClicked.addListener(function (info, tab) {
      var kind = info.menuItemId === 'verstak-capture-selection' ? 'selection'
        : info.menuItemId === 'verstak-capture-link' ? 'link'
          : 'page';
      sendOrQueue(captureFromInfo(kind, info, tab || {}));
    });
  }

  function handleMessage(message) {
    if (!message || message.type !== 'verstak.capture') return Promise.resolve(undefined);
    if (message.action === 'getState') return getState();
    if (message.action === 'saveSettings') {
      return saveSettings(message.settings).then(function () {
        return setupContextMenus();
      }).then(function () {
        return setStatus({ receiverReachable: null, lastResult: 'settings-saved', lastError: '' });
      }).then(getState);
    }
    if (message.action === 'retryPending') return retryPending().then(getState);
    return activeTab().then(function (tab) {
      return sendOrQueue(captureFromInfo(message.kind || 'page', message, tab));
    }).then(getState);
  }

  ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    handleMessage(message).then(sendResponse).catch(function (err) {
      sendResponse({ error: err && err.message ? err.message : String(err) });
    });
    return true;
  });
})();
