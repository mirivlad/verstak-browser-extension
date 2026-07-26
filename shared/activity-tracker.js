(function (root) {
  'use strict';

  var ACTIVITY_STATE_KEY = 'verstak.domainActivity.v1';
  var MAX_CHECKPOINT_GAP_MS = 10 * 60 * 1000;
  var ACK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_ACKNOWLEDGED_IDS = 1000;

  function createMemoryActivityStorage(seed) {
    var state = Object.assign({}, seed || {});
    return {
      get: function (key) {
        return Promise.resolve(state[key]);
      },
      set: function (key, value) {
        state[key] = value;
        return Promise.resolve();
      }
    };
  }

  function browserActivityStorageAdapter(browserApi) {
    var storage = browserApi && browserApi.storage && browserApi.storage.local;
    if (!storage) return createMemoryActivityStorage();
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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function initialState() {
    return {
      activeAccumulator: {},
      pendingBatches: [],
      acknowledgedIds: []
    };
  }

  function normalizedState(value) {
    var state = value && typeof value === 'object' ? value : {};
    return {
      activeAccumulator: state.activeAccumulator && typeof state.activeAccumulator === 'object' ? state.activeAccumulator : {},
      pendingBatches: Array.isArray(state.pendingBatches) ? state.pendingBatches : [],
      acknowledgedIds: Array.isArray(state.acknowledgedIds) ? state.acknowledgedIds : []
    };
  }

  function batchId(now) {
    var cryptoObj = root.crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return 'activity-' + String(now) + '-' + Math.random().toString(36).slice(2);
  }

  function toISOString(time) {
    return new Date(time).toISOString();
  }

  // Keyed by address, and by site for state written before addresses were
  // recorded, so time already accounted for is not thrown away on upgrade.
  function accumulatorKey(page) {
    return page.url || page.hostname;
  }

  function normalizedPage(page) {
    if (!page) return null;
    if (typeof page === 'string') return page ? { url: '', hostname: page } : null;
    var url = typeof page.url === 'string' ? page.url : '';
    var host = typeof page.hostname === 'string' ? page.hostname : '';
    if (!url && !host) return null;
    return { url: url, hostname: host };
  }

  function isExcludedHostname(hostname, excludedDomains) {
    var normalizer = root.VerstakBrowser && root.VerstakBrowser.normalizeHostnameV1;
    var canonicalHostname = typeof normalizer === 'function' ? normalizer(hostname) : '';
    if (!canonicalHostname) return true;
    return (Array.isArray(excludedDomains) ? excludedDomains : []).some(function (value) {
      var excluded = typeof normalizer === 'function' ? normalizer(value) : '';
      return excluded && (canonicalHostname === excluded || canonicalHostname.slice(-(excluded.length + 1)) === '.' + excluded);
    });
  }

  function DomainActivityTracker(storage, sender, options) {
    options = options || {};
    this.storage = storage || createMemoryActivityStorage();
    this.sender = typeof sender === 'function' ? sender : function () { return Promise.reject(new Error('activity sender unavailable')); };
    this.maxCheckpointGapMs = isFiniteNumber(options.maxCheckpointGapMs) ? options.maxCheckpointGapMs : MAX_CHECKPOINT_GAP_MS;
    this.now = typeof options.now === 'function' ? options.now : function () { return Date.now(); };
    this.state = initialState();
    this.enabled = false;
    this.activePage = null;
    this.serial = Promise.resolve();
  }

  DomainActivityTracker.prototype.enqueue = function (operation) {
    var next = this.serial.then(operation, operation);
    this.serial = next.catch(function () {});
    return next;
  };

  DomainActivityTracker.prototype.initialize = function () {
    var self = this;
    return this.enqueue(function () {
      return self.storage.get(ACTIVITY_STATE_KEY).then(function (value) {
        self.state = normalizedState(value);
        self.pruneAcknowledged(self.now());
        return self.persist().then(function () { return self.getStateUnsafe(); });
      });
    });
  };

  DomainActivityTracker.prototype.getState = function () {
    var self = this;
    return this.enqueue(function () { return self.getStateUnsafe(); });
  };

  DomainActivityTracker.prototype.getStateUnsafe = function () {
    return clone(this.state);
  };

  DomainActivityTracker.prototype.persist = function () {
    return this.storage.set(ACTIVITY_STATE_KEY, clone(this.state));
  };

  DomainActivityTracker.prototype.setEnabled = function (enabled) {
    var self = this;
    return this.enqueue(function () {
      self.enabled = enabled === true;
      if (!self.enabled) {
        self.activePage = null;
        self.state.activeAccumulator = {};
        self.state.pendingBatches = [];
      }
      return self.persist().then(function () { return self.getStateUnsafe(); });
    });
  };

  // A page, not a site: time is accounted against the address being looked at,
  // because a domain alone cannot tell configuring a site in its dashboard from
  // reading its public pages, and telling those apart is the reason to record
  // any of this.
  DomainActivityTracker.prototype.setActivePage = function (page, active, observedAt) {
    var self = this;
    var now = isFiniteNumber(observedAt) ? observedAt : this.now();
    var next = normalizedPage(page);
    return this.enqueue(function () {
      self.checkpointUnsafe(now);
      if (!self.enabled || !active || !next) {
        self.activePage = null;
        return self.persist().then(function () { return self.getStateUnsafe(); });
      }
      self.activePage = next;
      self.ensureAccumulator(next, now);
      return self.persist().then(function () { return self.getStateUnsafe(); });
    });
  };

  DomainActivityTracker.prototype.checkpoint = function (observedAt) {
    var self = this;
    var now = isFiniteNumber(observedAt) ? observedAt : this.now();
    return this.enqueue(function () {
      self.checkpointUnsafe(now);
      return self.persist().then(function () { return self.getStateUnsafe(); });
    });
  };

  DomainActivityTracker.prototype.ensureAccumulator = function (page, now) {
    var key = accumulatorKey(page);
    if (!this.state.activeAccumulator[key]) {
      this.state.activeAccumulator[key] = {
        url: page.url,
        hostname: page.hostname,
        startedAt: now,
        lastCheckpointAt: now,
        durationMs: 0
      };
    }
    return this.state.activeAccumulator[key];
  };

  DomainActivityTracker.prototype.checkpointUnsafe = function (now) {
    if (!this.enabled || !this.activePage) return;
    var accumulator = this.ensureAccumulator(this.activePage, now);
    var previous = accumulator.lastCheckpointAt;
    var delta = now - previous;
    if (!isFiniteNumber(previous) || delta < 0 || delta > this.maxCheckpointGapMs) {
      accumulator.startedAt = now;
      accumulator.lastCheckpointAt = now;
      accumulator.durationMs = 0;
      return;
    }
    if (delta === 0) return;
    accumulator.durationMs += delta;
    accumulator.lastCheckpointAt = now;
  };

  DomainActivityTracker.prototype.flush = function (observedAt) {
    var self = this;
    var now = isFiniteNumber(observedAt) ? observedAt : this.now();
    return this.enqueue(function () {
      if (!self.enabled) return self.getStateUnsafe();
      self.checkpointUnsafe(now);
      var entries = [];
      Object.keys(self.state.activeAccumulator).forEach(function (key) {
        var accumulator = self.state.activeAccumulator[key];
        var durationSeconds = Math.floor(Number(accumulator.durationMs || 0) / 1000);
        if (durationSeconds < 1) return;
        var entry = {
          hostname: accumulator.hostname,
          startedAt: toISOString(accumulator.startedAt),
          endedAt: toISOString(accumulator.lastCheckpointAt),
          durationSeconds: durationSeconds
        };
        // Time accumulated by an older version of the extension knows only the
        // site. It is still time the user spent, so it is still sent.
        if (accumulator.url) entry.url = accumulator.url;
        entries.push(entry);
      });
      if (entries.length) {
        self.state.pendingBatches.push({
          schemaVersion: 1,
          batchId: batchId(now),
          createdAt: toISOString(now),
          source: 'verstak-browser-extension',
          entries: entries
        });
        self.state.activeAccumulator = {};
        if (self.activePage) self.ensureAccumulator(self.activePage, now);
      }
      return self.persist().then(function () {
        return self.deliverPendingUnsafe(now);
      });
    });
  };

  DomainActivityTracker.prototype.retryPending = function () {
    var self = this;
    return this.enqueue(function () {
      if (!self.enabled) return self.getStateUnsafe();
      return self.deliverPendingUnsafe(self.now());
    });
  };

  DomainActivityTracker.prototype.deliverPendingUnsafe = function (now) {
    var self = this;
    var pending = this.state.pendingBatches.slice();
    return pending.reduce(function (chain, batch) {
      return chain.then(function () {
        if (!self.hasPendingBatch(batch.batchId)) return undefined;
        var immutableBatch = clone(batch);
        return self.sender(immutableBatch).then(function (result) {
          if (result && result.batchId && result.batchId !== batch.batchId) {
            throw new Error('receiver acknowledged a different activity batch');
          }
          self.state.pendingBatches = self.state.pendingBatches.filter(function (item) { return item.batchId !== batch.batchId; });
          self.state.acknowledgedIds.push({ id: batch.batchId, acknowledgedAt: toISOString(now) });
          self.pruneAcknowledged(now);
          return self.persist();
        });
      });
    }, Promise.resolve()).then(function () {
      return self.getStateUnsafe();
    }).catch(function () {
      return self.persist().then(function () { return self.getStateUnsafe(); });
    });
  };

  DomainActivityTracker.prototype.hasPendingBatch = function (batchID) {
    return this.state.pendingBatches.some(function (batch) { return batch.batchId === batchID; });
  };

  DomainActivityTracker.prototype.pruneAcknowledged = function (now) {
    var cutoff = now - ACK_RETENTION_MS;
    var seen = {};
    this.state.acknowledgedIds = this.state.acknowledgedIds.filter(function (entry) {
      var timestamp = Date.parse(entry && entry.acknowledgedAt);
      if (!entry || !entry.id || !Number.isFinite(timestamp) || timestamp < cutoff || seen[entry.id]) return false;
      seen[entry.id] = true;
      return true;
    }).slice(-MAX_ACKNOWLEDGED_IDS);
  };

  var api = {
    ACTIVITY_STATE_KEY: ACTIVITY_STATE_KEY,
    MAX_CHECKPOINT_GAP_MS: MAX_CHECKPOINT_GAP_MS,
    createMemoryActivityStorage: createMemoryActivityStorage,
    browserActivityStorageAdapter: browserActivityStorageAdapter,
    DomainActivityTracker: DomainActivityTracker,
    isExcludedHostname: isExcludedHostname
  };

  root.VerstakBrowser = Object.assign(root.VerstakBrowser || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
