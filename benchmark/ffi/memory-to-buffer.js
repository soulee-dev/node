'use strict';

// Wrapping native memory as a Buffer or ArrayBuffer, either by copying or as
// a zero-copy view. This does not need the fixture library.

const common = require('../common.js');
const assert = require('node:assert');

const bench = common.createBenchmark(main, {
  fn: ['toBuffer', 'toArrayBuffer'],
  copy: [1, 0],
  len: [16, 1024, 65536],
  n: [1e5],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, fn, copy, len }) {
  const ffi = require('node:ffi');
  const wrap = ffi[fn];
  const source = Buffer.alloc(len, 0x42);
  const pointer = ffi.getRawPointer(source);
  const shouldCopy = copy === 1;

  const first = wrap(pointer, len, shouldCopy);
  assert.strictEqual(first.byteLength, len);
  assert.strictEqual(new Uint8Array(first.buffer ?? first)[0], 0x42);

  bench.start();
  for (let i = 0; i < n; ++i)
    wrap(pointer, len, shouldCopy);
  bench.end(n);
}
