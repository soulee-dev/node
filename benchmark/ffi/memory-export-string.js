'use strict';

// Copying JavaScript strings into native memory. This does not need the
// fixture library.

const common = require('../common.js');
const assert = require('node:assert');

const bench = common.createBenchmark(main, {
  encoding: ['utf8', 'utf16le'],
  len: [8, 64, 1024],
  n: [1e6],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, encoding, len }) {
  const ffi = require('node:ffi');
  const string = 'a'.repeat(len);
  const capacity = len * 4 + 2;
  const target = Buffer.alloc(capacity);
  const pointer = ffi.getRawPointer(target);

  ffi.exportString(string, pointer, capacity, encoding);
  const written = Buffer.byteLength(string, encoding);
  assert.strictEqual(target.toString(encoding, 0, written), string);

  bench.start();
  for (let i = 0; i < n; ++i)
    ffi.exportString(string, pointer, capacity, encoding);
  bench.end(n);
}
