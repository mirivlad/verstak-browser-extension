(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var protocol = globalThis.VerstakBrowser;
  var queue = new protocol.CaptureQueue(protocol.browserStorageAdapter(ext));
  var DEFAULT_SETTINGS = {
    receiverUrl: protocol.DEFAULT_RECEIVER_URL,
    receiverToken: ''
  };

  function getSettings() {
    return ext.storage.local.get('settings').then(function (result) {
      return Object.assign({}, DEFAULT_SETTINGS, result && result.settings || {});
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
      linkText: info.selectionText || ''
    });
  }

  function sendOrQueue(payload) {
    return getSettings().then(function (settings) {
      return protocol.sendCapture(settings.receiverUrl, settings.receiverToken, payload).catch(function () {
        return queue.enqueue(payload).then(function () {
          return { status: 'queued', captureId: payload.captureId };
        });
      });
    });
  }

  function retryPending() {
    return getSettings().then(function (settings) {
      return queue.retry(function (payload) {
        return protocol.sendCapture(settings.receiverUrl, settings.receiverToken, payload);
      });
    });
  }

  function setupContextMenus() {
    if (!ext.contextMenus) return;
    ext.contextMenus.removeAll(function () {
      ext.contextMenus.create({ id: 'verstak-capture-page', title: 'Send page to Verstak', contexts: ['page'] });
      ext.contextMenus.create({ id: 'verstak-capture-selection', title: 'Send selection to Verstak', contexts: ['selection'] });
      ext.contextMenus.create({ id: 'verstak-capture-link', title: 'Send link to Verstak', contexts: ['link'] });
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

  ext.runtime.onMessage.addListener(function (message) {
    if (!message || message.type !== 'verstak.capture') return undefined;
    if (message.action === 'retryPending') {
      return retryPending();
    }
    return activeTab().then(function (tab) {
      return sendOrQueue(captureFromInfo(message.kind || 'page', message, tab));
    });
  });
})();
