#!/usr/bin/env node
const assert = require('assert');

const hostname = require('../shared/hostname');
const trackerApi = require('../shared/activity-tracker');

async function main() {
  const storage = trackerApi.createMemoryActivityStorage();
  const sent = [];
  let failSends = true;
  const tracker = new trackerApi.DomainActivityTracker(storage, async (batch) => {
    sent.push(JSON.parse(JSON.stringify(batch)));
    if (failSends) throw new Error('offline');
    return { status: 'accepted', batchId: batch.batchId };
  });

  await tracker.initialize();
  await tracker.setEnabled(true);
  await tracker.setActiveHostname('example.com', true, 0);
  await tracker.checkpoint(600000);
  await tracker.flush(600000);

  let state = await tracker.getState();
  assert.equal(state.pendingBatches.length, 1);
  assert.equal(state.pendingBatches[0].entries[0].durationSeconds, 600);
  const immutableFirstBatch = JSON.stringify(sent[0]);

  await tracker.setActiveHostname('example.com', true, 900000);
  await tracker.flush(900000);
  state = await tracker.getState();
  assert.equal(state.pendingBatches.length, 2, 'new activity must not mutate sent batch A');
  assert.equal(state.pendingBatches[1].entries[0].durationSeconds, 300);

  failSends = false;
  await tracker.retryPending();
  state = await tracker.getState();
  assert.equal(state.pendingBatches.length, 0);
  assert.ok(state.acknowledgedIds.length >= 2);
  assert.equal(JSON.stringify(sent[1]), immutableFirstBatch, 'retry must resend an immutable batch A payload');

  const clockTracker = new trackerApi.DomainActivityTracker(trackerApi.createMemoryActivityStorage(), async () => ({ status: 'accepted' }));
  await clockTracker.initialize();
  await clockTracker.setEnabled(true);
  await clockTracker.setActiveHostname('example.com', true, 0);
  await clockTracker.checkpoint(8 * 60 * 60 * 1000);
  state = await clockTracker.getState();
  assert.equal(state.activeAccumulator['example.com'].durationMs, 0, 'sleep-sized gap must be discarded');
  await clockTracker.checkpoint(8 * 60 * 60 * 1000 + 5 * 60 * 1000);
  state = await clockTracker.getState();
  assert.equal(state.activeAccumulator['example.com'].durationMs, 300000);
  await clockTracker.checkpoint(1000000);
  state = await clockTracker.getState();
  assert.equal(state.activeAccumulator['example.com'].durationMs, 0, 'clock rollback must reset the ambiguous interval');

  assert.equal(trackerApi.isExcludedHostname('video.youtube.com', ['youtube.com']), true);
  assert.equal(trackerApi.isExcludedHostname('youtube.com.evil.test', ['youtube.com']), false);
  assert.equal(trackerApi.isExcludedHostname(hostname.normalizeHostnameV1('пример.рф'), ['пример.рф']), true);

  await tracker.setEnabled(false);
  state = await tracker.getState();
  assert.deepEqual(state.activeAccumulator, {});
  assert.deepEqual(state.pendingBatches, []);
  assert.equal(JSON.stringify(state).includes('https://'), false);
  console.log('browser activity tracker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
