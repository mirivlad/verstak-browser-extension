# GitHub Firefox Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish signed Firefox XPI releases to GitHub Releases and let installed alpha extensions discover them through a GitHub-hosted update manifest.

**Architecture:** Firefox keeps one immutable `update_url` targeting the current GitHub Release's `updates.json` asset. A small Node helper owns the tag, asset URL and update-manifest formatting so it has focused unit tests. The existing local signing command remains local; an explicit publishing command uploads its two artifacts to the public GitHub release.

**Tech Stack:** Manifest V2 JSON, Node.js CommonJS tests, Bash, `web-ext`, GitHub CLI (`gh`).

## Global Constraints

- Publish repository: `mirivlad/verstak-browser-extension`.
- Firefox addon ID: `verstak-bridge@verstak.app`.
- Initial GitHub release: `v2.0.3`; package and both browser manifests are version `2.0.3`.
- Every alpha GitHub release is ordinary/latest, not a prerelease.
- XPI remains Mozilla-signed as an unlisted/self-distributed addon before upload.
- `npm run release:firefox` remains a local sign-and-package action.
- `npm run publish:firefox` is the only command allowed to create or modify a GitHub Release.
- Generated `release/` output remains untracked.

---

### Task 1: Make GitHub update metadata testable

**Files:**
- Create: `scripts/firefox-github-release.js`
- Create: `scripts/test-firefox-github-release.js`
- Modify: `package.json:8-15`

**Interfaces:**
- Produces `releaseTag(version)`, `releaseAssetURL(version, assetName)`, and `updateManifest(addonID, version, assetName)` from `scripts/firefox-github-release.js`.
- `updateManifest` returns the object written as `updates.json` and uses the fixed GitHub repository.
- Later shell scripts invoke `node scripts/firefox-github-release.js write-updates <addon-id> <version> <asset-name> <output-path>`.

- [ ] **Step 1: Write the failing metadata test**

Create `scripts/test-firefox-github-release.js` with:

```js
const assert = require('assert');
const release = require('./firefox-github-release');

const version = '2.0.3';
const asset = 'verstak-firefox-2.0.3.xpi';
assert.equal(release.releaseTag(version), 'v2.0.3');
assert.equal(
  release.releaseAssetURL(version, asset),
  'https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.3/verstak-firefox-2.0.3.xpi',
);
assert.deepEqual(release.updateManifest('verstak-bridge@verstak.app', version, asset), {
  addons: {
    'verstak-bridge@verstak.app': {
      updates: [{
        version: '2.0.3',
        update_link: 'https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.3/verstak-firefox-2.0.3.xpi',
      }],
    },
  },
});
console.log('Firefox GitHub release metadata tests passed');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node scripts/test-firefox-github-release.js`

Expected: failure because `scripts/firefox-github-release.js` does not yet exist.

- [ ] **Step 3: Implement the metadata helper**

Create `scripts/firefox-github-release.js` with these exact exports and CLI:

```js
const fs = require('fs');
const REPOSITORY = 'mirivlad/verstak-browser-extension';

function releaseTag(version) { return `v${version}`; }
function releaseAssetURL(version, assetName) {
  return `https://github.com/${REPOSITORY}/releases/download/${releaseTag(version)}/${assetName}`;
}
function updateManifest(addonID, version, assetName) {
  return { addons: { [addonID]: { updates: [{ version, update_link: releaseAssetURL(version, assetName) }] } } };
}

if (require.main === module) {
  const [, , command, addonID, version, assetName, outputPath] = process.argv;
  if (command !== 'write-updates' || !addonID || !version || !assetName || !outputPath) process.exitCode = 2;
  else fs.writeFileSync(outputPath, `${JSON.stringify(updateManifest(addonID, version, assetName), null, 2)}\n`);
}

module.exports = { REPOSITORY, releaseTag, releaseAssetURL, updateManifest };
```

- [ ] **Step 4: Register and run the test**

Append `node scripts/test-firefox-github-release.js` to the existing `test`
script in `package.json`, then run:

```bash
npm test
```

Expected: all existing tests and `Firefox GitHub release metadata tests passed`.

- [ ] **Step 5: Commit and push**

```bash
git add package.json scripts/firefox-github-release.js scripts/test-firefox-github-release.js
git commit -m "test: cover Firefox GitHub release metadata"
git push origin main
```

### Task 2: Point Firefox and local release artifacts at GitHub

**Files:**
- Modify: `firefox/manifest.json:8-17`
- Modify: `scripts/release-firefox-xpi.sh:29-70`
- Test: `scripts/test-firefox-github-release.js`

**Interfaces:**
- Firefox reads `https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json`.
- `release-firefox-xpi.sh` invokes the Task 1 helper to write a versioned update manifest.
- It continues producing `release/firefox/verstak-firefox-<version>.xpi` and `release/firefox/updates.json` locally.

- [ ] **Step 1: Extend the failing test with the stable manifest URL**

Add this assertion to `scripts/test-firefox-github-release.js` before its final
success message:

```js
const firefoxManifest = require('../firefox/manifest.json');
assert.equal(
  firefoxManifest.browser_specific_settings.gecko.update_url,
  'https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json',
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node scripts/test-firefox-github-release.js`

Expected: assertion failure because the manifest still uses `mirv.top`.

- [ ] **Step 3: Replace the update endpoint and JSON writer**

In `firefox/manifest.json`, replace only the Gecko `update_url` value with:

```json
"update_url": "https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json"
```

In `scripts/release-firefox-xpi.sh`, remove `UPDATE_BASE_URL` and replace the
heredoc that writes `updates.json` with:

```bash
node scripts/firefox-github-release.js write-updates \
  "$ADDON_ID" "$VERSION" "$RELEASE_XPI" "$RELEASE_DIR/updates.json"
```

- [ ] **Step 4: Run targeted checks**

Run:

```bash
node scripts/test-firefox-github-release.js
bash -n scripts/release-firefox-xpi.sh
npm test
npm run build
```

Expected: all commands succeed; `dist/firefox/manifest.json` contains the
GitHub update URL after the build.

- [ ] **Step 5: Commit and push**

```bash
git add firefox/manifest.json scripts/release-firefox-xpi.sh scripts/test-firefox-github-release.js
git commit -m "feat: host Firefox updates on GitHub Releases"
git push origin main
```

### Task 3: Add explicit GitHub publishing and public instructions

**Files:**
- Create: `scripts/publish-firefox-github-release.sh`
- Modify: `package.json:8-15`
- Modify: `README.md:42-68`
- Test: `scripts/publish-firefox-github-release.sh`

**Interfaces:**
- `npm run publish:firefox` calls `scripts/publish-firefox-github-release.sh`.
- The script runs the existing local release command, then uploads
  `verstak-firefox-<version>.xpi` and `updates.json` to release tag
  `v<version>` in `mirivlad/verstak-browser-extension`.
- A pre-existing tag receives asset replacement through `gh release upload --clobber`.

- [ ] **Step 1: Write the shell-contract test**

Create a Node test that reads the publish script and asserts the mandatory
commands are present:

```js
const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('scripts/publish-firefox-github-release.sh', 'utf8');
assert.match(source, /gh auth status/);
assert.match(source, /gh release create/);
assert.match(source, /gh release upload/);
assert.match(source, /--clobber/);
assert.match(source, /--latest/);
```

Place those assertions in `scripts/test-firefox-github-release.js` and run the
test. Expected: it fails before the publish script exists.

- [ ] **Step 2: Implement an explicit idempotent publisher**

Create `scripts/publish-firefox-github-release.sh` with this behavior:

1. Set `ROOT_DIR`, `cd` to it and run `gh auth status`.
2. Run `./scripts/release-firefox-xpi.sh`.
3. Read `VERSION` from `dist/firefox/manifest.json`, set `TAG="v${VERSION}"`,
   `REPOSITORY="mirivlad/verstak-browser-extension"`, and locate the two local
   release assets by exact names.
4. Run `gh release view "$TAG" --repo "$REPOSITORY"`; when it is absent, run
   `gh release create "$TAG" "$XPI" "$UPDATES" --repo "$REPOSITORY" --title
   "Verstak Browser Extension $VERSION" --generate-notes --latest --target
   "$(git rev-parse HEAD)"`.
5. When the release already exists, run `gh release upload "$TAG" "$XPI"
   "$UPDATES" --repo "$REPOSITORY" --clobber`.
6. Print the GitHub release URL with `gh release view "$TAG" --repo
   "$REPOSITORY" --json url --jq .url`.

- [ ] **Step 3: Register the command and document it**

Add to `package.json`:

```json
"publish:firefox": "./scripts/publish-firefox-github-release.sh"
```

Rewrite the Firefox Release README section so it documents:

- the public [GitHub Releases](https://github.com/mirivlad/verstak-browser-extension/releases) page;
- `VERSTAK_BROWSER_ENV=/path/to/.env npm run publish:firefox`;
- that signing remains unlisted with Mozilla but distribution and automatic
  updates use GitHub Release assets;
- that the first `v2.0.3` publish bootstraps the `latest/download/updates.json`
  endpoint.

- [ ] **Step 4: Run checks without publishing**

Run:

```bash
bash -n scripts/publish-firefox-github-release.sh
node scripts/test-firefox-github-release.js
npm test
npm run build
git diff --check
```

Expected: all commands succeed. Do not invoke `npm run publish:firefox` in this
task; it creates a public GitHub Release and needs available AMO credentials.

- [ ] **Step 5: Commit and push**

```bash
git add README.md package.json scripts/publish-firefox-github-release.sh scripts/test-firefox-github-release.js
git commit -m "feat: publish Firefox releases to GitHub"
git push origin main
```

### Task 4: Bootstrap and verify the first public update release

**Files:**
- Generated: `release/firefox/verstak-firefox-2.0.3.xpi` (untracked)
- Generated: `release/firefox/updates.json` (untracked)

**Interfaces:**
- Consumes the Task 3 `npm run publish:firefox` command and valid AMO signing credentials.
- Produces GitHub Release tag `v2.0.3` and public XPI/update-manifest assets.

- [ ] **Step 1: Verify release credentials before write operations**

Run:

```bash
gh auth status
test -n "${VERSTAK_BROWSER_ENV:-}" || test -f .env
```

Expected: authenticated GitHub CLI and a configured environment file path for
the existing AMO signing command.

- [ ] **Step 2: Publish the first release**

Run:

```bash
npm run publish:firefox
```

Expected: Mozilla signing succeeds, GitHub Release `v2.0.3` is latest, and it
contains `verstak-firefox-2.0.3.xpi` plus `updates.json`.

- [ ] **Step 3: Verify public delivery**

Run:

```bash
gh release view v2.0.3 --repo mirivlad/verstak-browser-extension --json isLatest,url,assets
curl -fsSL https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json
```

Expected: the release is latest and the JSON contains addon ID
`verstak-bridge@verstak.app`, version `2.0.3`, and the versioned GitHub XPI
asset URL.

- [ ] **Step 4: Record release verification without committing assets**

Run:

```bash
git status --short
```

Expected: no generated `release/` assets are staged or committed.
