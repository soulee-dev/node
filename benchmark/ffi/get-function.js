'use strict';

// Cost of creating a function wrapper on an already open library. The 2
// argument signature takes the Fast API path everywhere; the 8 argument
// signature exceeds the integer register limits of the x86-64 and AArch64
// trampolines and takes the shared-buffer path there instead.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const signatures = {
  2: ['add_i32', { arguments: ['i32', 'i32'], return: 'i32' }],
  8: ['sum_8_i32', {
    arguments: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    return: 'i32',
  }],
};

const bench = common.createBenchmark(main, {
  args: [2, 8],
  n: [1e4],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, args }) {
  const ffi = require('node:ffi');
  const { lib } = openFixture(ffi);
  const [name, signature] = signatures[args];
  assert.strictEqual(typeof lib.getFunction(name, signature), 'function');

  bench.start();
  for (let i = 0; i < n; ++i)
    lib.getFunction(name, signature);
  bench.end(n);

  lib.close();
}
