'use strict';

// Void-returning functions that take integer arguments. This exercises the
// argument packing path without any return value conversion.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  args: [1, 2, 3, 4, 5, 6, 8],
  n: [1e7],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, args }) {
  const ffi = require('node:ffi');
  const { lib, functions } = openFixture(ffi);

  let fn;
  let call;
  switch (args) {
    case 1:
      fn = functions.store_i32;
      call = () => fn(1);
      break;
    case 2:
      fn = functions.store_sum_2_i32;
      call = () => fn(1, 2);
      break;
    case 3:
      fn = functions.store_sum_3_i32;
      call = () => fn(1, 2, 3);
      break;
    case 4:
      fn = functions.store_sum_4_i32;
      call = () => fn(1, 2, 3, 4);
      break;
    case 5:
      fn = functions.store_sum_5_i32;
      call = () => fn(1, 2, 3, 4, 5);
      break;
    case 6:
      fn = functions.store_sum_6_i32;
      call = () => fn(1, 2, 3, 4, 5, 6);
      break;
    case 8:
      fn = functions.store_sum_8_i32;
      call = () => fn(1, 2, 3, 4, 5, 6, 7, 8);
      break;
    default:
      throw new Error(`Unsupported argument count: ${args}`);
  }
  call();
  assert.strictEqual(functions.get_scratch(), args * (args + 1) / 2);

  bench.start();
  for (let i = 0; i < n; ++i)
    call();
  bench.end(n);

  lib.close();
}
