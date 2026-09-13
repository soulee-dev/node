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
  const { lib, functions } = openFixture(ffi);
  const fn = functions.add_i32;
  assert.strictEqual(fn(20, 22), 42);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(20, 22);
  bench.end(n);

  lib.close();
}
