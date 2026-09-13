'use strict';

// Cost of creating and releasing a native callback trampoline.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  signature: ['default', 'i32'],
  n: [1e5],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, signature }) {
  const ffi = require('node:ffi');
  const { lib } = openFixture(ffi);
  const callback = () => 0;
  const sig = { arguments: ['i32'], return: 'i32' };

  let register;
  if (signature === 'default') {
    register = () => lib.registerCallback(callback);
  } else {
    register = () => lib.registerCallback(sig, callback);
  }
  assert.strictEqual(typeof register(), 'bigint');

  bench.start();
  for (let i = 0; i < n; ++i)
    lib.unregisterCallback(register());
  bench.end(n);

  lib.close();
}
