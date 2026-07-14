#!/usr/bin/env node
const assert = require('assert');

const chromium = require('../chromium/manifest.json');
const firefox = require('../firefox/manifest.json');

assert.equal(chromium.version, firefox.version, 'browser packages must use the same version');
assert.equal(
  firefox.permissions.includes('windows'),
  false,
  'Firefox does not accept the Chromium-only windows permission'
);
assert.equal(chromium.permissions.includes('windows'), true, 'Chromium still needs the windows permission');

console.log('browser manifest compatibility tests passed');
