#!/usr/bin/env node
const assert = require('assert');

require('../shared/hostname');
const protocol = require('../shared/protocol');
require('../shared/api');
const queueApi = require('../shared/queue');

const page = protocol.buildCapture({
  kind: 'page',
  captureId: 'test-capture-id',
  url: 'https://example.com/docs',
  title: 'Example Docs'
});
assert.equal(page.schemaVersion, 1);
assert.equal(page.captureId, 'test-capture-id');
assert.equal(page.page.domain, 'example.com');
assert.equal(protocol.validateCapture(page), true);

const selection = protocol.buildCapture({
  kind: 'selection',
  url: 'https://example.com/docs',
  title: 'Example Docs',
  selectionText: ' selected text '
});
assert.equal(selection.selection.text, 'selected text');
assert.equal(protocol.validateCapture(selection), true);

const file = protocol.buildCapture({
  kind: 'file',
  url: 'https://example.com/docs',
  title: 'Example Docs',
  fileName: 'notes.txt',
  fileMime: 'text/plain',
  fileSize: 12,
  fileText: 'hello file',
  fileDataBase64: 'aGVsbG8gZmlsZQ=='
});
assert.equal(file.file.name, 'notes.txt');
assert.equal(file.file.mime, 'text/plain');
assert.equal(file.file.size, 12);
assert.equal(file.file.text, 'hello file');
assert.equal(file.file.dataBase64, 'aGVsbG8gZmlsZQ==');
assert.equal(protocol.validateCapture(file), true);

assert.throws(() => protocol.validateCapture({ schemaVersion: 1, kind: 'link', captureId: 'x', capturedAt: 'now', page: { url: 'https://example.com' } }), /link.url/);
assert.throws(() => protocol.validateCapture({ schemaVersion: 1, kind: 'file', captureId: 'x', capturedAt: 'now', page: { url: 'https://example.com' }, file: { name: 'notes.txt' } }), /file.text or file.dataBase64/);

let request;
const fetchOk = (url, options) => {
  request = { url, options };
  return Promise.resolve({ status: 202, json: () => Promise.resolve({ status: 'accepted' }) });
};

const activityBatch = {
  schemaVersion: 1,
  batchId: 'activity-batch-id',
  createdAt: '2026-07-12T10:05:00.000Z',
  source: 'verstak-browser-extension',
  entries: [{
    hostname: 'example.com',
    startedAt: '2026-07-12T10:00:00.000Z',
    endedAt: '2026-07-12T10:05:00.000Z',
    durationSeconds: 300,
    url: 'https://example.com/admin/settings?tab=billing#note-to-self'
  }, {
    hostname: 'example.com',
    startedAt: '2026-07-12T11:00:00.000Z',
    endedAt: '2026-07-12T11:05:00.000Z',
    durationSeconds: 300,
    url: 'https://somewhere-else.example/page'
  }]
};

globalThis.VerstakBrowser.sendCapture('http://127.0.0.1:47731/api/browser-inbox/v1/captures', 'token', page, fetchOk)
  .then((result) => {
    assert.equal(result.status, 'accepted');
    assert.equal(request.url, 'http://127.0.0.1:47731/api/browser-inbox/v1/captures');
    assert.equal(request.options.headers['X-Verstak-Receiver-Token'], 'token');
    assert.equal(JSON.parse(request.options.body).captureId, 'test-capture-id');
  })
  .then(() => {
    return globalThis.VerstakBrowser.sendActivityBatch('http://127.0.0.1:47731/api/browser-inbox/v1/captures', 'token', activityBatch, fetchOk)
      .then((result) => {
        assert.equal(result.status, 'accepted');
        assert.equal(request.url, 'http://127.0.0.1:47731/api/browser-activity/v1/batches');
        const body = JSON.parse(request.options.body);
        assert.equal(body.batchId, 'activity-batch-id');
        assert.equal(body.entries[0].hostname, 'example.com');
        // The address is sent; what follows '#' never is.
        assert.equal(body.entries[0].url, 'https://example.com/admin/settings?tab=billing');
        // An address that contradicts the site it is reported under is dropped
        // rather than sent: the receiver would refuse the whole batch, and a
        // batch that can never be accepted blocks every one behind it.
        assert.equal(Object.prototype.hasOwnProperty.call(body.entries[1], 'url'), false);
      });
  })
  .then(() => {
    const queue = new queueApi.CaptureQueue(queueApi.createMemoryStorage());
    return queue.enqueue(page)
      .then(() => queue.enqueue(selection))
      .then(() => queue.retry((payload) => {
        if (payload.kind === 'page') return Promise.resolve();
        return Promise.reject(new Error('offline'));
      }))
      .then((result) => {
        assert.deepEqual(result, { sent: 1, pending: 1 });
        return queue.list();
      })
      .then((items) => {
        assert.equal(items.length, 1);
        assert.equal(items[0].kind, 'selection');
      });
  })
  .then(() => {
    console.log('browser extension protocol tests passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
