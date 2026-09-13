'use strict';

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  size: [64, 1024, 16384],
  n: [1e6],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, size }) {
  const ffi = require('node:ffi');
  const { lib, functions } = openFixture(ffi);
  const sum = functions.sum_buffer;
  const buf = Buffer.alloc(size, 0x42);
  const ptr = ffi.getRawPointer(buf);
  const len = BigInt(size);
  assert.strictEqual(sum(ptr, len), BigInt(size * 0x42));

  bench.start();
  for (let i = 0; i < n; ++i)
    sum(ptr, len);
  bench.end(n);

  lib.close();
}
