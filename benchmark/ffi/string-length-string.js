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
    string_length: { arguments: ['string'], return: 'u64' },
  });
  const fn = functions.string_length;
  assert.strictEqual(fn('hello'), 5n);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn('hello');
  bench.end(n);

  lib.close();
}
