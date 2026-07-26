(function (root) {
  'use strict';

  function sendCapture(receiverUrl, token, payload, fetchImpl) {
    var protocol = root.VerstakBrowser || {};
    protocol.validateCapture(payload);
    var fetchFn = fetchImpl || root.fetch;
    if (typeof fetchFn !== 'function') return Promise.reject(new Error('fetch unavailable'));
    return fetchFn(receiverUrl || protocol.DEFAULT_RECEIVER_URL, {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json'
      }, token ? { 'X-Verstak-Receiver-Token': token } : {}),
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error('receiver rejected capture: HTTP ' + (response && response.status));
      }
      return response.json ? response.json() : { status: 'accepted', captureId: payload.captureId };
    });
  }

  function activityReceiverURL(captureReceiverURL) {
    var protocol = root.VerstakBrowser || {};
    var receiverURL = String(captureReceiverURL || protocol.DEFAULT_RECEIVER_URL || '').trim();
    var capturePath = '/api/browser-inbox/v1/captures';
    if (receiverURL.slice(-capturePath.length) === capturePath) {
      return receiverURL.slice(0, -capturePath.length) + '/api/browser-activity/v1/batches';
    }
    return protocol.DEFAULT_ACTIVITY_URL;
  }

  function safeActivityBatch(payload) {
    var protocol = root.VerstakBrowser || {};
    if (!payload || payload.schemaVersion !== 1 || !payload.batchId || !payload.createdAt || !payload.source || !Array.isArray(payload.entries) || payload.entries.length === 0) {
      throw new Error('invalid activity batch');
    }
    var entries = payload.entries.map(function (entry) {
      if (!entry || !entry.hostname || !entry.startedAt || !entry.endedAt || !Number.isFinite(Number(entry.durationSeconds)) || Number(entry.durationSeconds) <= 0) {
        throw new Error('invalid activity batch entry');
      }
      var safe = {
        hostname: String(entry.hostname),
        startedAt: String(entry.startedAt),
        endedAt: String(entry.endedAt),
        durationSeconds: Math.floor(Number(entry.durationSeconds))
      };
      // Normalized once more on the way out: whatever is sent is an address
      // with nothing after '#', whoever assembled the batch. An address that
      // does not belong to the site being reported is dropped rather than sent
      // -- the receiver would refuse the whole batch, and a batch that can
      // never be accepted blocks every one behind it.
      var url = protocol.normalizePageURLV1 ? protocol.normalizePageURLV1(entry.url || '') : '';
      if (url && protocol.normalizeURLHostnameV1(url) === safe.hostname) safe.url = url;
      return safe;
    });
    return {
      schemaVersion: 1,
      batchId: String(payload.batchId),
      createdAt: String(payload.createdAt),
      source: String(payload.source),
      entries: entries
    };
  }

  function sendActivityBatch(captureReceiverURL, token, payload, fetchImpl) {
    var batch = safeActivityBatch(payload);
    var fetchFn = fetchImpl || root.fetch;
    if (typeof fetchFn !== 'function') return Promise.reject(new Error('fetch unavailable'));
    return fetchFn(activityReceiverURL(captureReceiverURL), {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json'
      }, token ? { 'X-Verstak-Receiver-Token': token } : {}),
      body: JSON.stringify(batch)
    }).then(function (response) {
      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error('receiver rejected activity batch: HTTP ' + (response && response.status));
      }
      return response.json ? response.json() : { status: 'accepted', batchId: batch.batchId };
    });
  }

  var api = {
    sendCapture: sendCapture,
    sendActivityBatch: sendActivityBatch,
    activityReceiverURL: activityReceiverURL
  };
  root.VerstakBrowser = Object.assign(root.VerstakBrowser || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
