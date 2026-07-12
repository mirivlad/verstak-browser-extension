const fs = require('fs');

const REPOSITORY = 'mirivlad/verstak-browser-extension';

function releaseTag(version) {
  return `v${version}`;
}

function releaseAssetURL(version, assetName) {
  return `https://github.com/${REPOSITORY}/releases/download/${releaseTag(version)}/${assetName}`;
}

function updateManifest(addonID, version, assetName) {
  return {
    addons: {
      [addonID]: {
        updates: [{
          version,
          update_link: releaseAssetURL(version, assetName),
        }],
      },
    },
  };
}

function writeUpdates(addonID, version, assetName, outputPath) {
  fs.writeFileSync(outputPath, `${JSON.stringify(updateManifest(addonID, version, assetName), null, 2)}\n`);
}

if (require.main === module) {
  const [, , command, addonID, version, assetName, outputPath] = process.argv;
  if (command !== 'write-updates' || !addonID || !version || !assetName || !outputPath) {
    console.error('usage: node scripts/firefox-github-release.js write-updates <addon-id> <version> <asset-name> <output-path>');
    process.exitCode = 2;
  } else {
    writeUpdates(addonID, version, assetName, outputPath);
  }
}

module.exports = { REPOSITORY, releaseTag, releaseAssetURL, updateManifest, writeUpdates };
