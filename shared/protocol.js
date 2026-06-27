(function (root) {
  'use strict';

  var CAPTURE_SCHEMA_VERSION = 1;
  var DEFAULT_RECEIVER_URL = 'http://127.0.0.1:47731/api/browser-inbox/v1/captures';

  function nowIso() {
    return new Date().toISOString();
  }

  function randomId() {
    var cryptoObj = root.crypto || (root.require && root.require('crypto'));
    if (cryptoObj && cryptoObj.randomUUID) return cryptoObj.randomUUID();
    return 'cap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function cleanString(value, maxLength) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (maxLength && text.length > maxLength) return text.slice(0, maxLength);
    return text;
  }

  function hostname(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return '';
    }
  }

  function buildCapture(input) {
    input = input || {};
    var kind = input.kind || 'page';
    var pageURL = cleanString(input.url || input.pageUrl || '', 4096);
    var payload = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      captureId: input.captureId || randomId(),
      capturedAt: input.capturedAt || nowIso(),
      source: 'verstak-browser-extension',
      kind: kind,
      page: {
        url: pageURL,
        title: cleanString(input.title || '', 512),
        domain: hostname(pageURL)
      },
      browser: {
        name: cleanString(input.browserName || '', 64)
      }
    };

    if (kind === 'selection') {
      payload.selection = {
        text: cleanString(input.selectionText || input.text || '', 20000)
      };
    }
    if (kind === 'link') {
      payload.link = {
        url: cleanString(input.linkUrl || '', 4096),
        text: cleanString(input.linkText || input.selectionText || '', 512)
      };
    }
    if (input.context) payload.context = input.context;
    return payload;
  }

  function validateCapture(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('payload must be an object');
    if (payload.schemaVersion !== CAPTURE_SCHEMA_VERSION) throw new Error('unsupported schemaVersion');
    if (!payload.captureId) throw new Error('captureId is required');
    if (!payload.capturedAt) throw new Error('capturedAt is required');
    if (['page', 'selection', 'link'].indexOf(payload.kind) === -1) throw new Error('unsupported kind');
    if (!payload.page || !payload.page.url) throw new Error('page.url is required');
    if (payload.kind === 'selection' && (!payload.selection || !payload.selection.text)) throw new Error('selection.text is required');
    if (payload.kind === 'link' && (!payload.link || !payload.link.url)) throw new Error('link.url is required');
    return true;
  }

  var api = {
    CAPTURE_SCHEMA_VERSION: CAPTURE_SCHEMA_VERSION,
    DEFAULT_RECEIVER_URL: DEFAULT_RECEIVER_URL,
    buildCapture: buildCapture,
    validateCapture: validateCapture
  };

  root.VerstakBrowser = Object.assign(root.VerstakBrowser || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
