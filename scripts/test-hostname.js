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

assert.ok(vectors.page.length > 0, 'page vectors are missing');
for (const vector of vectors.page) {
  assert.equal(hostname.normalizePageURLV1(vector.input), vector.output, vector.input);
}

// An address longer than the limit loses its query rather than being cut in the
// middle, because a cut address names a page that does not exist.
const longQuery = 'https://example.com/report?data=' + 'a'.repeat(hostname.MAX_PAGE_URL_LENGTH);
assert.equal(hostname.normalizePageURLV1(longQuery), 'https://example.com/report');
const longPath = 'https://example.com/' + 'b'.repeat(hostname.MAX_PAGE_URL_LENGTH);
assert.equal(hostname.normalizePageURLV1(longPath), 'https://example.com/');

console.log('browser hostname normalization tests passed');
