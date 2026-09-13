'use strict';

// Reading NUL-terminated strings out of native memory. This does not need
// the fixture library.

const common = require('../common.js');
const assert = require('node:assert');

const bench = common.createBenchmark(main, {
  type: ['ascii', 'utf8'],
  len: [8, 64, 1024],
  n: [1e6],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, type, len }) {
  const ffi = require('node:ffi');
  const char = type === 'ascii' ? 'a' : 'é';
  const expected = char.repeat(len);
  const source = Buffer.from(`${expected}\0`, 'utf8');
  const pointer = ffi.getRawPointer(source);
  assert.strictEqual(ffi.toString(pointer), expected);

  bench.start();
  for (let i = 0; i < n; ++i)
    ffi.toString(pointer);
  bench.end(n);
}
