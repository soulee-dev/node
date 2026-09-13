'use strict';

// Native code calling back into JavaScript through a registered callback.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  kind: ['void', 'i32', 'i32x2'],
  n: [1e6],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, kind }) {
  const ffi = require('node:ffi');
  const { lib, functions } = openFixture(ffi);

  let callback;
  let call;
  let expected;
  switch (kind) {
    case 'void': {
      callback = lib.registerCallback(() => {});
      const fn = functions.call_void_callback;
      call = () => fn(callback);
      expected = undefined;
      break;
    }
    case 'i32': {
      callback = lib.registerCallback(
        { arguments: ['i32'], return: 'i32' },
        (value) => value * 2,
      );
      const fn = functions.call_int_callback;
      call = () => fn(callback, 21);
      expected = 42;
      break;
    }
    case 'i32x2': {
      callback = lib.registerCallback(
        { arguments: ['i32', 'i32'], return: 'i32' },
        (a, b) => a + b,
      );
      const fn = functions.call_binary_int_callback;
      call = () => fn(callback, 19, 23);
      expected = 42;
      break;
    }
    default:
      throw new Error(`Unsupported callback kind: ${kind}`);
  }
  assert.strictEqual(call(), expected);

  bench.start();
  for (let i = 0; i < n; ++i)
    call();
  bench.end(n);

  lib.unregisterCallback(callback);
  lib.close();
}
