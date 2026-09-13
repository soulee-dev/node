'use strict';

// Extracting a raw address from JavaScript-managed memory. This does not
// need the fixture library.

const common = require('../common.js');
const assert = require('node:assert');

const bench = common.createBenchmark(main, {
  type: ['buffer', 'arraybuffer', 'uint8array', 'dataview'],
  n: [1e7],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, type }) {
  const ffi = require('node:ffi');
  const arrayBuffer = new ArrayBuffer(64);
  let source;
  switch (type) {
    case 'buffer':
      source = Buffer.from(arrayBuffer, 8, 16);
      break;
    case 'arraybuffer':
      source = arrayBuffer;
      break;
    case 'uint8array':
      source = new Uint8Array(arrayBuffer, 8, 16);
      break;
    case 'dataview':
      source = new DataView(arrayBuffer, 8, 16);
      break;
    default:
      throw new Error(`Unsupported source type: ${type}`);
  }
  const base = ffi.getRawPointer(arrayBuffer);
  const expected = type === 'arraybuffer' ? base : base + 8n;
  assert.strictEqual(ffi.getRawPointer(source), expected);

  bench.start();
  for (let i = 0; i < n; ++i)
    ffi.getRawPointer(source);
  bench.end(n);
}
