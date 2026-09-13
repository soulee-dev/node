'use strict';

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  n: [1e7],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n }) {
  const ffi = require('node:ffi');
  const { lib, functions } = openFixture(ffi, {
    sum_buffer: { arguments: ['buffer', 'u64'], return: 'u64' },
  });
  const fn = functions.sum_buffer;
  const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const length = BigInt(bytes.length);
  assert.strictEqual(fn(bytes, length), 36n);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(bytes, length);
  bench.end(n);

  lib.close();
}
