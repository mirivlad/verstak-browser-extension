# verstak-browser-extension

Verstak Browser Extension captures pages, selected text, links, and selected
files and sends them to a local Verstak browser inbox receiver.

The extension does not know Notes, Files, Activity, or Journal internals. It
only sends capture events through the public local receiver protocol. If the
receiver is offline, captures stay in the extension pending queue.

## Build

```bash
npm ci
npm test
npm run build
```

Build output:

- `dist/chromium`
- `dist/firefox`

## Firefox Release

Firefox signing uses `web-ext` and AMO credentials from an env file. The script
requires `WEB_EXT_API_PROXY`; AMO upload and approval polling run through that
proxy.

```bash
VERSTAK_BROWSER_ENV=/home/mirivlad/git/verstak/.env npm run release:firefox
```

Release output:

- `release/firefox/verstak-firefox-<version>.xpi`
- `release/firefox/updates.json`

The XPI is signed as an unlisted/self-distributed Firefox extension. Build and
release artifacts are local outputs and are not committed.

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
