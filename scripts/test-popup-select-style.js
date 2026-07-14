const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'popup', 'popup.css'), 'utf8');

assert.match(css, /select\s*\{[^}]*appearance:\s*none/, 'popup select must hide the native arrow');
assert.match(css, /select option\s*\{[^}]*background/, 'popup options must use the extension surface');

console.log('browser extension popup select style test passed');
