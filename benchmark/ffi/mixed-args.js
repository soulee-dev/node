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
  const fn = functions.mixed_operation;
  assert.strictEqual(fn(1, 2.5, 3.25, 4), 10.75);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(1, 2.5, 3.25, 4);
  bench.end(n);

  lib.close();
}
