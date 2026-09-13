'use strict';

// Integer argument passing cost by arity. The native call path changes with
// the argument count: the Fast API trampolines accept up to 6 integer
// arguments on x86-64, 7 on AArch64 and 3 on Win64, and signatures beyond
// that use the shared-buffer invoker instead.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  args: [1, 2, 3, 4, 5, 6, 7, 8],
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
      fn = functions.identity_i32;
      call = () => fn(1);
      break;
    case 2:
      fn = functions.add_i32;
      call = () => fn(1, 2);
      break;
    case 3:
      fn = functions.sum_3_i32;
      call = () => fn(1, 2, 3);
      break;
    case 4:
      fn = functions.sum_4_i32;
      call = () => fn(1, 2, 3, 4);
      break;
    case 5:
      fn = functions.sum_5_i32;
      call = () => fn(1, 2, 3, 4, 5);
      break;
    case 6:
      fn = functions.sum_6_i32;
      call = () => fn(1, 2, 3, 4, 5, 6);
      break;
    case 7:
      fn = functions.sum_7_i32;
      call = () => fn(1, 2, 3, 4, 5, 6, 7);
      break;
    case 8:
      fn = functions.sum_8_i32;
      call = () => fn(1, 2, 3, 4, 5, 6, 7, 8);
      break;
    default:
      throw new Error(`Unsupported argument count: ${args}`);
  }
  assert.strictEqual(call(), args * (args + 1) / 2);

  bench.start();
  for (let i = 0; i < n; ++i)
    call();
  bench.end(n);

  lib.close();
}
