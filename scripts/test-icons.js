#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared', 'icons', 'verstak.svg'), 'utf8');

assert.match(source, /fill="#1c2f4a"/i, 'icon source must define the Verstak navy');
assert.match(source, /fill="#72d2b3"/i, 'icon source must define the Verstak mint');

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function pngColors(file) {
  const png = fs.readFileSync(file);
  assert.deepStrictEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${file} must be PNG`);

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let palette;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    }
  }

  assert.equal(bitDepth, 8, `${file} must use 8-bit samples`);
  assert.ok([2, 3, 6].includes(colorType), `${file} must use RGB, palette, or RGBA pixels`);
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const rowSize = width * bytesPerPixel;
  const decoded = zlib.inflateSync(Buffer.concat(idat));
  const colors = new Set();
  let readOffset = 0;
  let previous = Buffer.alloc(rowSize);

  for (let y = 0; y < height; y += 1) {
    const filter = decoded[readOffset++];
    const encoded = decoded.subarray(readOffset, readOffset + rowSize);
    readOffset += rowSize;
    const row = Buffer.alloc(rowSize);
    for (let x = 0; x < rowSize; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 0) row[x] = encoded[x];
      else if (filter === 1) row[x] = (encoded[x] + left) & 255;
      else if (filter === 2) row[x] = (encoded[x] + up) & 255;
      else if (filter === 3) row[x] = (encoded[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (encoded[x] + paeth(left, up, upperLeft)) & 255;
      else assert.fail(`${file} has unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      if (colorType === 3) {
        const paletteOffset = row[x] * 3;
        colors.add(palette.subarray(paletteOffset, paletteOffset + 3).toString('hex'));
      } else {
        const pixelOffset = x * bytesPerPixel;
        colors.add(row.subarray(pixelOffset, pixelOffset + 3).toString('hex'));
      }
    }
    previous = row;
  }
  return { width, height, colors };
}

for (const [name, size, needsMint] of [
  ['icon16.png', 16, false],
  ['icon48.png', 48, true],
  ['icon128.png', 128, true],
]) {
  const icon = pngColors(path.join(root, 'shared', 'icons', name));
  assert.equal(icon.width, size, `${name} width`);
  assert.equal(icon.height, size, `${name} height`);
  assert.ok(icon.colors.has('1c2f4a'), `${name} must contain the Verstak navy`);
  if (needsMint) assert.ok(icon.colors.has('72d2b3'), `${name} must contain the Verstak mint`);
}

console.log('browser extension icon tests passed');
