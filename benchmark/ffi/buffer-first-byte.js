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
    first_byte: { arguments: ['buffer'], return: 'u8' },
  });
  const fn = functions.first_byte;
  const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(fn(bytes), 1);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(bytes);
  bench.end(n);

  lib.close();
}
