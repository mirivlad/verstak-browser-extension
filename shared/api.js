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

  var api = { sendCapture: sendCapture };
  root.VerstakBrowser = Object.assign(root.VerstakBrowser || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
