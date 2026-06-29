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
    if (file.size > MAX_FILE_TEXT_LENGTH) {
      setStatus('File is too large for text capture');
      return;
    }
    setStatus('Reading file...');
    file.text().then(function (content) {
      send({
        type: 'verstak.capture',
        kind: 'file',
        fileName: file.name,
        fileMime: file.type || 'text/plain',
        fileSize: file.size,
        fileText: content
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
