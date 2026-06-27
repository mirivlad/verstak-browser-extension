(function (root) {
  'use strict';

  var QUEUE_KEY = 'verstak.pendingCaptures';

  function createMemoryStorage(seed) {
    var state = Object.assign({}, seed || {});
    return {
      get: function (key) {
        return Promise.resolve(Object.prototype.hasOwnProperty.call(state, key) ? state[key] : undefined);
      },
      set: function (key, value) {
        state[key] = value;
        return Promise.resolve();
      }
    };
  }

  function browserStorageAdapter(browserApi) {
    var storage = browserApi && browserApi.storage && browserApi.storage.local;
    if (!storage) return createMemoryStorage();
    return {
      get: function (key) {
        return storage.get(key).then(function (result) { return result && result[key]; });
      },
      set: function (key, value) {
        var patch = {};
        patch[key] = value;
        return storage.set(patch);
      }
    };
  }

  function CaptureQueue(storage) {
    this.storage = storage || createMemoryStorage();
  }

  CaptureQueue.prototype.list = function () {
    return this.storage.get(QUEUE_KEY).then(function (items) {
      return Array.isArray(items) ? items : [];
    });
  };

  CaptureQueue.prototype.enqueue = function (payload) {
    var self = this;
    return this.list().then(function (items) {
      items.push(payload);
      return self.storage.set(QUEUE_KEY, items).then(function () { return items; });
    });
  };

  CaptureQueue.prototype.replace = function (items) {
    return this.storage.set(QUEUE_KEY, Array.isArray(items) ? items : []);
  };

  CaptureQueue.prototype.retry = function (sender) {
    var self = this;
    return this.list().then(function (items) {
      var sent = 0;
      var pending = [];
      return items.reduce(function (chain, item) {
        return chain.then(function () {
          return sender(item).then(function () {
            sent += 1;
          }).catch(function () {
            pending.push(item);
          });
        });
      }, Promise.resolve()).then(function () {
        return self.replace(pending).then(function () {
          return { sent: sent, pending: pending.length };
        });
      });
    });
  };

  var api = {
    QUEUE_KEY: QUEUE_KEY,
    CaptureQueue: CaptureQueue,
    browserStorageAdapter: browserStorageAdapter,
    createMemoryStorage: createMemoryStorage
  };
  root.VerstakBrowser = Object.assign(root.VerstakBrowser || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
