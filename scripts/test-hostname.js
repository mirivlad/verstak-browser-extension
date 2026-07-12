#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const hostname = require('../shared/hostname');

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, '../shared/hostname-normalization-v1.json'), 'utf8'));

for (const vector of vectors.bare) {
  assert.equal(hostname.normalizeHostnameV1(vector.input), vector.output, vector.input);
}

for (const vector of vectors.url) {
  assert.equal(hostname.normalizeURLHostnameV1(vector.input), vector.output, vector.input);
}

console.log('browser hostname normalization tests passed');
