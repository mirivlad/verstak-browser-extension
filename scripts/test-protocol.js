#!/usr/bin/env node
const assert = require('assert');

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

globalThis.VerstakBrowser.sendCapture('http://127.0.0.1:47731/api/browser-inbox/v1/captures', 'token', page, fetchOk)
  .then((result) => {
    assert.equal(result.status, 'accepted');
    assert.equal(request.url, 'http://127.0.0.1:47731/api/browser-inbox/v1/captures');
    assert.equal(request.options.headers['X-Verstak-Receiver-Token'], 'token');
    assert.equal(JSON.parse(request.options.body).captureId, 'test-capture-id');
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
