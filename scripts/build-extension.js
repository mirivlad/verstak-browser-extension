#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const shared = path.join(root, 'shared');

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(src, dest) {
  mkdir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function concat(files, dest) {
  mkdir(path.dirname(dest));
  fs.writeFileSync(dest, files.map((file) => fs.readFileSync(file, 'utf8')).join('\n\n'), 'utf8');
}

function copyPopup(destRoot) {
  const popupDir = path.join(shared, 'popup');
  for (const name of ['popup.html', 'popup.css', 'popup.js']) {
    copy(path.join(popupDir, name), path.join(destRoot, 'popup', name));
  }
}

function copyIcons(destRoot) {
  const iconsDir = path.join(shared, 'icons');
  for (const name of ['icon16.png', 'icon48.png', 'icon128.png']) {
    copy(path.join(iconsDir, name), path.join(destRoot, 'icons', name));
  }
}

function copyLocalization(destRoot) {
  copy(path.join(shared, 'i18n.js'), path.join(destRoot, 'i18n.js'));
  for (const locale of ['en', 'ru']) {
    copy(path.join(shared, 'locales', `${locale}.json`), path.join(destRoot, 'locales', `${locale}.json`));
  }
}

rm(dist);

const chromiumDist = path.join(dist, 'chromium');
mkdir(chromiumDist);
copy(path.join(root, 'chromium', 'manifest.json'), path.join(chromiumDist, 'manifest.json'));
concat([
  path.join(shared, 'hostname.js'),
  path.join(shared, 'activity-tracker.js'),
  path.join(shared, 'protocol.js'),
  path.join(shared, 'api.js'),
  path.join(shared, 'queue.js'),
  path.join(shared, 'i18n.js'),
  path.join(shared, 'background.js'),
], path.join(chromiumDist, 'background.js'));
copyPopup(chromiumDist);
copyIcons(chromiumDist);
copyLocalization(chromiumDist);

const firefoxDist = path.join(dist, 'firefox');
mkdir(firefoxDist);
copy(path.join(root, 'firefox', 'manifest.json'), path.join(firefoxDist, 'manifest.json'));
for (const name of ['hostname.js', 'activity-tracker.js', 'protocol.js', 'api.js', 'queue.js', 'i18n.js', 'background.js']) {
  copy(path.join(shared, name), path.join(firefoxDist, name));
}
copyPopup(firefoxDist);
copyIcons(firefoxDist);
copyLocalization(firefoxDist);

console.log('built dist/chromium and dist/firefox');
