#!/usr/bin/env node
const assert = require('assert');
const release = require('./firefox-github-release');

const version = '2.0.2';
const asset = 'verstak-firefox-2.0.2.xpi';

assert.equal(release.releaseTag(version), 'v2.0.2');
assert.equal(
  release.releaseAssetURL(version, asset),
  'https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.2/verstak-firefox-2.0.2.xpi',
);
assert.deepEqual(release.updateManifest('verstak-bridge@verstak.app', version, asset), {
  addons: {
    'verstak-bridge@verstak.app': {
      updates: [{
        version: '2.0.2',
        update_link: 'https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.2/verstak-firefox-2.0.2.xpi',
      }],
    },
  },
});

const firefoxManifest = require('../firefox/manifest.json');
assert.equal(firefoxManifest.homepage_url, 'https://github.com/mirivlad/verstak-browser-extension');
assert.equal(
  firefoxManifest.browser_specific_settings.gecko.update_url,
  'https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json',
);

console.log('Firefox GitHub release metadata tests passed');
