(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var protocol = globalThis.VerstakBrowser;
  var queue = new protocol.CaptureQueue(protocol.browserStorageAdapter(ext));
  var activityTracker = new protocol.DomainActivityTracker(
    protocol.browserActivityStorageAdapter(ext),
    function (batch) {
      return getSettings().then(function (settings) {
        return protocol.sendActivityBatch(settings.receiverUrl, settings.receiverToken, batch);
      });
    }
  );
  var i18n = globalThis.VerstakBrowserI18n;
  var DEFAULT_SETTINGS = {
    receiverUrl: protocol.DEFAULT_RECEIVER_URL,
    receiverToken: '',
    language: 'system',
    passiveActivityEnabled: false,
    passiveActivityExcludedDomains: []
  };
  var STATUS_KEY = 'verstak.status';
  var ACTIVITY_FLUSH_ALARM = 'verstak-domain-activity-flush';
  var localeCatalogs = null;
  var focusedWindowID = null;
  var activeTabID = null;

  function getSettings() {
    return ext.storage.local.get('settings').then(function (result) {
      var settings = Object.assign({}, DEFAULT_SETTINGS, result && result.settings || {});
      settings.language = i18n.normalizePreference(settings.language);
      settings.passiveActivityEnabled = settings.passiveActivityEnabled === true;
      settings.passiveActivityExcludedDomains = normalizeExcludedDomains(settings.passiveActivityExcludedDomains);
      return settings;
    });
  }

  function saveSettings(settings) {
    settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    settings.language = i18n.normalizePreference(settings.language);
    settings.passiveActivityEnabled = settings.passiveActivityEnabled === true;
    settings.passiveActivityExcludedDomains = normalizeExcludedDomains(settings.passiveActivityExcludedDomains);
    return ext.storage.local.set({ settings: settings });
  }

  function normalizeExcludedDomains(value) {
    var values = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
    var seen = {};
    return values.map(function (item) {
      return protocol.normalizeHostnameV1(String(item || '').trim());
    }).filter(function (item) {
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
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

  function isFocusedWindow(windowID) {
    return focusedWindowID == null || focusedWindowID === windowID;
  }

  function trackTab(tab, settings) {
    if (!settings.passiveActivityEnabled || !tab || !isFocusedWindow(tab.windowId)) {
      return activityTracker.setActiveHostname('', false);
    }
    activeTabID = tab.id == null ? activeTabID : tab.id;
    var hostname = protocol.normalizeURLHostnameV1(tab.url || '');
    if (!hostname || protocol.isExcludedHostname(hostname, settings.passiveActivityExcludedDomains)) {
      return activityTracker.setActiveHostname('', false);
    }
    return activityTracker.setActiveHostname(hostname, true);
  }

  function refreshFocusedTab(settings) {
    return activeTab().then(function (tab) {
      return trackTab(tab, settings);
    }).catch(function () {
      return activityTracker.setActiveHostname('', false);
    });
  }

  function configurePassiveActivity(settings) {
    return activityTracker.setEnabled(settings.passiveActivityEnabled).then(function () {
      if (!settings.passiveActivityEnabled) return undefined;
      return refreshFocusedTab(settings);
    });
  }

  function flushPassiveActivity() {
    return getSettings().then(function (settings) {
      if (!settings.passiveActivityEnabled) return activityTracker.setEnabled(false);
      return activityTracker.setEnabled(true).then(function () {
        return refreshFocusedTab(settings);
      }).then(function () {
        return activityTracker.flush();
      });
    });
  }

  function setupPassiveActivity() {
    if (ext.alarms && ext.alarms.create) {
      ext.alarms.create(ACTIVITY_FLUSH_ALARM, { periodInMinutes: 5 });
    }
    if (ext.idle && ext.idle.setDetectionInterval) {
      ext.idle.setDetectionInterval(60);
    }
    return getSettings().then(configurePassiveActivity);
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
      ext.storage.local.get(STATUS_KEY),
      activityTracker.getState()
    ]).then(function (results) {
      return {
        settings: results[0],
        pendingCount: results[1].length,
        pendingActivityCount: results[3].pendingBatches.length,
        activityState: results[3],
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
    return ready.then(function () {
      if (!message || message.type !== 'verstak.capture') return undefined;
      if (message.action === 'getState') return getState();
      if (message.action === 'saveSettings') {
        return saveSettings(message.settings).then(function () {
          return setupContextMenus();
        }).then(function () {
          return getSettings().then(configurePassiveActivity);
        }).then(function () {
          return setStatus({ receiverReachable: null, lastResult: 'settings-saved', lastError: '' });
        }).then(getState);
      }
      if (message.action === 'retryPending') return retryPending().then(getState);
      if (message.action === 'retryPendingActivity') return activityTracker.retryPending().then(getState);
      return activeTab().then(function (tab) {
        return sendOrQueue(captureFromInfo(message.kind || 'page', message, tab));
      }).then(getState);
    });
  }

  ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    handleMessage(message).then(sendResponse).catch(function (err) {
      sendResponse({ error: err && err.message ? err.message : String(err) });
    });
    return true;
  });

  if (ext.tabs && ext.tabs.onActivated) {
    ext.tabs.onActivated.addListener(function (info) {
      if (!isFocusedWindow(info.windowId) || !ext.tabs.get) return;
      activeTabID = info.tabId;
      ready.then(function () { return getSettings(); }).then(function (settings) {
        return ext.tabs.get(info.tabId).then(function (tab) { return trackTab(tab, settings); });
      }).catch(function () {});
    });
  }

  if (ext.tabs && ext.tabs.onUpdated) {
    ext.tabs.onUpdated.addListener(function (tabID, changeInfo, tab) {
      if (tabID !== activeTabID || (!changeInfo.url && !(tab && tab.url))) return;
      ready.then(function () { return getSettings(); }).then(function (settings) {
        return trackTab(tab || { id: tabID, url: changeInfo.url }, settings);
      }).catch(function () {});
    });
  }

  if (ext.windows && ext.windows.onFocusChanged) {
    ext.windows.onFocusChanged.addListener(function (windowID) {
      focusedWindowID = windowID;
      if (windowID === (ext.windows.WINDOW_ID_NONE == null ? -1 : ext.windows.WINDOW_ID_NONE)) {
        activityTracker.setActiveHostname('', false).catch(function () {});
        return;
      }
      ready.then(function () { return getSettings(); }).then(refreshFocusedTab).catch(function () {});
    });
  }

  if (ext.idle && ext.idle.onStateChanged) {
    ext.idle.onStateChanged.addListener(function (state) {
      if (state === 'active') {
        ready.then(function () { return getSettings(); }).then(refreshFocusedTab).catch(function () {});
        return;
      }
      activityTracker.setActiveHostname('', false).catch(function () {});
    });
  }

  if (ext.alarms && ext.alarms.onAlarm) {
    ext.alarms.onAlarm.addListener(function (alarm) {
      if (alarm && alarm.name === ACTIVITY_FLUSH_ALARM) flushPassiveActivity().catch(function () {});
    });
  }

  if (ext.tabs && ext.tabs.onRemoved) {
    ext.tabs.onRemoved.addListener(function (tabID) {
      if (tabID === activeTabID) {
        activeTabID = null;
        activityTracker.setActiveHostname('', false).catch(function () {});
      }
    });
  }

  var ready = activityTracker.initialize().then(setupPassiveActivity).catch(function (error) {
    console.warn('[verstak] passive activity initialization failed:', error);
  });
})();
