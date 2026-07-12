# Verstak Browser Extension

Verstak Browser Extension captures pages, selected text, links, and selected
files and sends them to a local Verstak browser inbox receiver.

The extension does not know Notes, Files, Activity, or Journal internals. It
only sends capture events through the public local receiver protocol. If the
receiver is offline, captures stay in the extension pending queue.

> **Alpha software.** Use with a matching Verstak Desktop alpha release.

## Build

```bash
npm ci
npm test
npm run build
```

Build output:

- `dist/chromium`
- `dist/firefox`

Load `dist/chromium` as an unpacked extension in Chromium-based browsers, or
load `dist/firefox` temporarily in Firefox during development.

## Passive domain activity

Passive tracking is **off by default**. On first use the extension explains
what it records; the user must explicitly enable it in extension settings.

When enabled, it observes only the focused browser's active tab and sends
bounded aggregate intervals as a canonical domain name plus duration. It never
sends URL paths, page titles, page text, selected text, keystrokes, navigation
history or inactive-tab time. The settings screen has an exclusion list for
domains such as `youtube.com` or `x.com`.

Manual “Send page”, selection, link and file actions are separate. They create
Browser Inbox captures; they do not create a workspace or a journal entry.

## Firefox download and updates

The signed XPI is published on the [GitHub Releases page](https://github.com/mirivlad/verstak-browser-extension/releases).
Download the Firefox asset named `verstak-firefox-<version>.xpi` from the latest
release and open it in Firefox to install it.

After the first public release, installed copies check GitHub Releases for
updates through the release's `updates.json` asset. During the alpha phase each
published release is the current update channel.

## Firefox release publishing

Firefox signing uses `web-ext` and AMO credentials from an env file. The script
requires `WEB_EXT_API_PROXY`; AMO upload and approval polling run through that
proxy.

Create the signed XPI locally, without publishing it:

```bash
VERSTAK_BROWSER_ENV=/path/to/.env npm run release:firefox
```

Publish the signed XPI and `updates.json` as the current GitHub Release:

```bash
VERSTAK_BROWSER_ENV=/path/to/.env npm run publish:github
```

The publisher reads the version from `package.json`. It requires an
authenticated GitHub CLI, a clean local `main` equal to `origin/main`, and a
tag pointing at that commit. It creates and pushes the tag if needed, then
creates or updates the GitHub Release. Re-running it for the same tag replaces
the XPI and `updates.json` assets. `npm run publish:firefox` remains as a
compatible alias for the same Firefox publishing flow.

For an explicit version check, pass the current tag after `--`:

```bash
VERSTAK_BROWSER_ENV=/path/to/.env npm run publish:github -- v2.0.3
```

Release output:

- `release/firefox/verstak-firefox-<version>.xpi`
- `release/firefox/updates.json`

The XPI is signed as an unlisted/self-distributed Firefox extension; GitHub
Releases distribute that signed file. Build and release artifacts are local
outputs and are not committed.

## Reproducible local package

```bash
npm run release:package -- v0.1.0-alpha.1
```

This runs the tests and build, then writes unsigned Chromium and Firefox source
packages to `release/` with a `SHA256SUMS` file. Use `release:firefox` above
when an AMO-signed XPI is required.

## Manual Check

1. Start Verstak desktop with the `verstak.browser-inbox` plugin installed.
2. Open the `Browser Inbox` workspace item so it subscribes to capture events.
3. Install/load `dist/firefox` or the signed XPI in Firefox.
4. Use the popup `Send Page` or `Send File` actions, or use page context menu
   actions for selection/link captures.

## Local Receiver Protocol

Default endpoint:

```text
POST http://127.0.0.1:47731/api/browser-inbox/v1/captures
```

Headers:

- `Content-Type: application/json`
- `X-Verstak-Receiver-Token: <token>` required when the desktop receiver is in paired mode

## Pairing

1. In Verstak Desktop, open the Browser Inbox settings panel.
2. Copy the Receiver URL and Pairing Token.
3. Paste both values into the extension popup settings and select Save.

Rotating the token in Desktop invalidates the value stored by the extension.

## Language

The popup settings provide a persisted `System / English / Russian` language
selector. `System` follows the browser UI language: Russian browser locales use
Russian, and all other locales use English.

The extension and desktop application store their language choices
independently. Changing one does not change the other.

Payload:

```json
{
  "schemaVersion": 1,
  "captureId": "uuid-or-generated-id",
  "capturedAt": "2026-06-27T00:00:00.000Z",
  "source": "verstak-browser-extension",
  "kind": "page",
  "page": {
    "url": "https://example.com/article",
    "title": "Example Article",
    "domain": "example.com"
  },
  "browser": {
    "name": ""
  }
}
```

Supported `kind` values:

- `page`
- `selection`, with `selection.text`
- `link`, with `link.url` and optional `link.text`
- `file`, with `file.name` and either `file.dataBase64` for selected files up to
  8 MB or `file.text` for text-compatible captures

Expected success response:

```json
{ "status": "accepted", "captureId": "uuid-or-generated-id" }
```

## License

Copyright © 2026 Verstak contributors. Licensed under
[GNU AGPLv3 or later](LICENSE).
