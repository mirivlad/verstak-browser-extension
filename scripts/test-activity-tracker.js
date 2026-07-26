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

  const dashboard = { url: 'https://example.com/admin/settings', hostname: 'example.com' };
  const article = { url: 'https://example.com/blog/post', hostname: 'example.com' };

  await tracker.initialize();
  await tracker.setEnabled(true);
  await tracker.setActivePage(dashboard, true, 0);
  await tracker.checkpoint(600000);
  await tracker.flush(600000);

  let state = await tracker.getState();
  assert.equal(state.pendingBatches.length, 1);
  assert.equal(state.pendingBatches[0].entries[0].durationSeconds, 600);
  assert.equal(state.pendingBatches[0].entries[0].url, dashboard.url, 'the address, not just the site, is what was recorded');
  assert.equal(state.pendingBatches[0].entries[0].hostname, 'example.com');
  const immutableFirstBatch = JSON.stringify(sent[0]);

  await tracker.setActivePage(dashboard, true, 900000);
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

  // Two pages of one site are two accounts. Reading the blog is not the same
  // work as configuring the site, and the whole point of recording addresses is
  // to be able to tell them apart afterwards.
  const perPage = new trackerApi.DomainActivityTracker(trackerApi.createMemoryActivityStorage(), async () => ({ status: 'accepted' }));
  await perPage.initialize();
  await perPage.setEnabled(true);
  await perPage.setActivePage(dashboard, true, 0);
  await perPage.checkpoint(120000);
  await perPage.setActivePage(article, true, 120000);
  await perPage.checkpoint(180000);
  state = await perPage.getState();
  assert.equal(state.activeAccumulator[dashboard.url].durationMs, 120000);
  assert.equal(state.activeAccumulator[article.url].durationMs, 60000);

  const clockTracker = new trackerApi.DomainActivityTracker(trackerApi.createMemoryActivityStorage(), async () => ({ status: 'accepted' }));
  await clockTracker.initialize();
  await clockTracker.setEnabled(true);
  await clockTracker.setActivePage(dashboard, true, 0);
  await clockTracker.checkpoint(8 * 60 * 60 * 1000);
  state = await clockTracker.getState();
  assert.equal(state.activeAccumulator[dashboard.url].durationMs, 0, 'sleep-sized gap must be discarded');
  await clockTracker.checkpoint(8 * 60 * 60 * 1000 + 5 * 60 * 1000);
  state = await clockTracker.getState();
  assert.equal(state.activeAccumulator[dashboard.url].durationMs, 300000);
  await clockTracker.checkpoint(1000000);
  state = await clockTracker.getState();
  assert.equal(state.activeAccumulator[dashboard.url].durationMs, 0, 'clock rollback must reset the ambiguous interval');

  // Time accounted by an older version of the extension knows only the site.
  // It is still time the user spent, so it is still delivered.
  const legacySent = [];
  const legacy = new trackerApi.DomainActivityTracker(trackerApi.createMemoryActivityStorage({
    [trackerApi.ACTIVITY_STATE_KEY]: {
      activeAccumulator: {
        'example.com': { hostname: 'example.com', startedAt: 0, lastCheckpointAt: 300000, durationMs: 300000 }
      },
      pendingBatches: [],
      acknowledgedIds: []
    }
  }), async (batch) => {
    legacySent.push(JSON.parse(JSON.stringify(batch)));
    return { status: 'accepted', batchId: batch.batchId };
  });
  await legacy.initialize();
  await legacy.setEnabled(true);
  await legacy.flush(300000);
  assert.equal(legacySent.length, 1, 'time recorded before addresses were kept must still be delivered');
  const legacyEntry = legacySent[0].entries[0];
  assert.equal(legacyEntry.hostname, 'example.com');
  assert.equal(legacyEntry.durationSeconds, 300);
  assert.equal(Object.prototype.hasOwnProperty.call(legacyEntry, 'url'), false, 'an address must not be invented for state that never had one');

  assert.equal(trackerApi.isExcludedHostname('video.youtube.com', ['youtube.com']), true);
  assert.equal(trackerApi.isExcludedHostname('youtube.com.evil.test', ['youtube.com']), false);
  assert.equal(trackerApi.isExcludedHostname(hostname.normalizeHostnameV1('пример.рф'), ['пример.рф']), true);

  // Addresses are recorded now, deliberately and with the user warned when they
  // turn tracking on. What is never recorded is the fragment: where inside one
  // page the reader was.
  const fragmentTracker = new trackerApi.DomainActivityTracker(trackerApi.createMemoryActivityStorage(), async () => ({ status: 'accepted' }));
  await fragmentTracker.initialize();
  await fragmentTracker.setEnabled(true);
  await fragmentTracker.setActivePage({
    url: hostname.normalizePageURLV1('https://example.com/manual?p=2#private-note'),
    hostname: 'example.com'
  }, true, 0);
  await fragmentTracker.checkpoint(60000);
  state = await fragmentTracker.getState();
  assert.equal(JSON.stringify(state).includes('#'), false, 'nothing after a fragment marker may be stored');
  assert.ok(JSON.stringify(state).includes('https://example.com/manual?p=2'));

  await tracker.setEnabled(false);
  state = await tracker.getState();
  assert.deepEqual(state.activeAccumulator, {});
  assert.deepEqual(state.pendingBatches, []);
  console.log('browser activity tracker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
