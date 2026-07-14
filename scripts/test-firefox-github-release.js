#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const release = require('./firefox-github-release');
const packageManifest = require('../package.json');
const chromiumManifest = require('../chromium/manifest.json');
const firefoxManifest = require('../firefox/manifest.json');

const version = '2.0.5';
const asset = 'verstak-firefox-2.0.5.xpi';

assert.equal(packageManifest.version, version);
assert.equal(chromiumManifest.version, version);
assert.equal(firefoxManifest.version, version);
assert.equal(release.releaseTag(version), 'v2.0.5');
assert.equal(
  release.releaseAssetURL(version, asset),
  'https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.5/verstak-firefox-2.0.5.xpi',
);
assert.deepEqual(release.updateManifest('verstak-bridge@verstak.app', version, asset), {
  addons: {
    'verstak-bridge@verstak.app': {
      updates: [{
        version: '2.0.5',
        update_link: 'https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.5/verstak-firefox-2.0.5.xpi',
      }],
    },
  },
});

assert.equal(firefoxManifest.homepage_url, 'https://github.com/mirivlad/verstak-browser-extension');
assert.equal(
  firefoxManifest.browser_specific_settings.gecko.update_url,
  'https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json',
);

const publisher = fs.readFileSync('scripts/publish-firefox-github-release.sh', 'utf8');
assert.match(publisher, /auth status/);
assert.match(publisher, /branch --show-current/);
assert.match(publisher, /tag -a/);
assert.match(publisher, /push origin/);
assert.match(publisher, /release create/);
assert.match(publisher, /release upload/);
assert.match(publisher, /--clobber/);
assert.match(publisher, /--latest/);
assert.match(publisher, /--notes-file/);
assert.match(publisher, /--generate-notes/);
assert.match(publisher, /--notes-start-tag/);

const genericPublisher = fs.readFileSync('scripts/publish-github-release.sh', 'utf8');
assert.match(genericPublisher, /publish-firefox-github-release\.sh/);

console.log('Firefox GitHub release metadata tests passed');
