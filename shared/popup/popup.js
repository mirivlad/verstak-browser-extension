(function () {
  'use strict';

  var ext = typeof browser !== 'undefined' ? browser : chrome;
  var statusEl = document.getElementById('status');

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function send(message) {
    setStatus('Sending...');
    Promise.resolve(ext.runtime.sendMessage(message)).then(function (result) {
      if (result && result.status === 'queued') setStatus('Queued until Verstak is available');
      else setStatus('Sent');
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : String(err));
    });
  }

  document.getElementById('capture-page').addEventListener('click', function () {
    send({ type: 'verstak.capture', kind: 'page' });
  });

  document.getElementById('capture-selection').addEventListener('click', function () {
    send({ type: 'verstak.capture', kind: 'selection' });
  });

  document.getElementById('retry').addEventListener('click', function () {
    send({ type: 'verstak.capture', action: 'retryPending' });
  });
})();
