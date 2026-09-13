'use strict';

// Per-invocation cost of a callback when native code calls it repeatedly
// inside a single FFI call. Rate is reported per callback invocation.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  times: [16, 1024],
  n: [1e4],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, times }) {
  const ffi = require('node:ffi');
  const { lib, functions } = openFixture(ffi);
  const fn = functions.call_callback_multiple_times;

  let sum = 0;
  const callback = lib.registerCallback(
    { arguments: ['i32'], return: 'i32' },
    (value) => {
      sum += value;
      return value;
    },
  );
  fn(callback, times);
  assert.strictEqual(sum, times * (times - 1) / 2);

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(callback, times);
  bench.end(n * times);

  lib.unregisterCallback(callback);
  lib.close();
}
