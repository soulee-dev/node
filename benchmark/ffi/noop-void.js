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
  const fn = functions.noop_void;
  assert.strictEqual(fn(), undefined);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn();
  bench.end(n);

  lib.close();
}
