(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var statusEl = document.getElementById('status');
  var receiverStateEl = document.getElementById('receiver-state');
  var receiverUrlEl = document.getElementById('receiver-url');
  var receiverInputEl = document.getElementById('receiver-input');
  var fileInputEl = document.getElementById('file-input');
  var pendingCountEl = document.getElementById('pending-count');
  var statusDotEl = document.getElementById('status-dot');
  var MAX_FILE_TEXT_LENGTH = 2 * 1024 * 1024;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;

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
    state = state || {};
    var settings = state.settings || {};
    var status = state.status || {};
    var reachable = status.receiverReachable;
    pendingCountEl.textContent = String(state.pendingCount || 0);
    receiverUrlEl.textContent = settings.receiverUrl || '';
    if (document.activeElement !== receiverInputEl) {
      receiverInputEl.value = settings.receiverUrl || '';
    }

    if (reachable === true) {
      receiverStateEl.textContent = 'Online';
      receiverStateEl.className = 'online';
      statusDotEl.className = 'dot online';
    } else if (reachable === false) {
      receiverStateEl.textContent = 'Offline';
      receiverStateEl.className = 'offline';
      statusDotEl.className = 'dot offline';
    } else {
      receiverStateEl.textContent = 'Unknown';
      receiverStateEl.className = '';
      statusDotEl.className = 'dot unknown';
    }
  }

  function refresh() {
    return request({ type: 'verstak.capture', action: 'getState' }).then(render).catch(function (err) {
      setStatus(err && err.message ? err.message : String(err));
    });
  }

  function send(message) {
    setStatus('Sending...');
    request(message).then(function (state) {
      render(state);
      if (state.status && state.status.lastResult === 'queued') setStatus('Queued until Verstak is available');
      else setStatus('Done');
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : String(err));
    });
  }

  document.getElementById('capture-page').addEventListener('click', function () {
    send({ type: 'verstak.capture', kind: 'page' });
  });

  document.getElementById('capture-file').addEventListener('click', function () {
    var file = fileInputEl.files && fileInputEl.files[0];
    if (!file) {
      setStatus('Choose a text file first');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus('File is too large for browser capture');
      return;
    }
    setStatus('Reading file...');
    Promise.all([file.arrayBuffer(), readOptionalText(file)]).then(function (results) {
      var content = results[1] || '';
      send({
        type: 'verstak.capture',
        kind: 'file',
        fileName: file.name,
        fileMime: file.type || '',
        fileSize: file.size,
        fileText: content,
        fileDataBase64: arrayBufferToBase64(results[0])
      });
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : String(err));
    });
  });

  document.getElementById('retry').addEventListener('click', function () {
    send({ type: 'verstak.capture', action: 'retryPending' });
  });

  document.getElementById('save-settings').addEventListener('click', function () {
    var receiverUrl = receiverInputEl.value.trim();
    if (!/^https?:\/\//.test(receiverUrl)) {
      setStatus('Receiver URL must start with http:// or https://');
      return;
    }
    request({
      type: 'verstak.capture',
      action: 'saveSettings',
      settings: { receiverUrl: receiverUrl, receiverToken: '' }
    }).then(function (state) {
      render(state);
      setStatus('Saved');
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : String(err));
    });
  });

  refresh();
})();
