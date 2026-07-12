# GitHub Releases for Firefox Updates

## Decision

Firefox XPI releases are published as ordinary public GitHub Releases in
`mirivlad/verstak-browser-extension`. During the alpha phase every such release
is marked as the repository's latest release, including alpha versions. There
are no other Verstak users whose automatic updates need a separate stable
channel yet.

## Update protocol

The Firefox manifest uses this stable endpoint:

```text
https://github.com/mirivlad/verstak-browser-extension/releases/latest/download/updates.json
```

Each release uploads two assets:

- `verstak-firefox-<version>.xpi`, signed by Mozilla as an unlisted addon;
- `updates.json`, whose `update_link` points to that same release tag's XPI
  asset.

For version `2.0.2`, the versioned link is:

```text
https://github.com/mirivlad/verstak-browser-extension/releases/download/v2.0.2/verstak-firefox-2.0.2.xpi
```

The stable `latest/download` endpoint lets already installed extensions discover
the next version without changing the manifest on each release.

## Release commands

`npm run release:firefox` remains the local sign-and-package command. A new
explicit `npm run publish:firefox` command runs it, verifies `gh`
authentication, creates or reuses the `v<manifest-version>` GitHub Release,
and uploads the XPI plus `updates.json`. Re-running the command replaces only
those two assets, so a failed network upload can be retried safely.

Publishing requires the existing AMO credentials used for signing and a
GitHub-authenticated `gh` CLI. It does not use the invalid `mirv.top` update
endpoint.

## Documentation

The README links users to the GitHub Releases page for downloading the signed
Firefox XPI and documents that releases are currently the auto-update channel.

## Verification

- add a focused script test for versioned GitHub URLs and generated
  `updates.json`;
- run the existing extension test suite and build;
- run shell syntax validation for the publish script;
- verify a published release's assets and `latest/download/updates.json` with
  unauthenticated HTTPS requests.
