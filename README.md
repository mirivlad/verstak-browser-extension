# verstak-browser-extension

Verstak Browser Extension captures pages, selected text, and links and sends
them to a local Verstak browser inbox receiver.

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

## Local Receiver Protocol

Default endpoint:

```text
POST http://127.0.0.1:47731/api/browser-inbox/v1/captures
```

Headers:

- `Content-Type: application/json`
- `X-Verstak-Receiver-Token: <token>` optional, once pairing is implemented

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

Expected success response:

```json
{ "status": "accepted", "captureId": "uuid-or-generated-id" }
```
