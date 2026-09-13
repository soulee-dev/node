'use strict';

// Primitive memory access helpers. These do not need the fixture library.

const common = require('../common.js');
const assert = require('node:assert');

const types = {
  Int8: [42, 42],
  Uint8: [42, 42],
  Int16: [42, 42],
  Uint16: [42, 42],
  Int32: [42, 42],
  Uint32: [42, 42],
  Int64: [42n, 42n],
  Uint64: [42n, 42n],
  Float32: [42.5, 42.5],
  Float64: [42.5, 42.5],
};

const bench = common.createBenchmark(main, {
  type: Object.keys(types),
  op: ['get', 'set'],
  n: [1e7],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, type, op }) {
  const ffi = require('node:ffi');
  const [value, expected] = types[type];
  const get = ffi[`get${type}`];
  const set = ffi[`set${type}`];
  const buffer = Buffer.allocUnsafeSlow(64);
  const pointer = ffi.getRawPointer(buffer);

  set(pointer, 8, value);
  assert.strictEqual(get(pointer, 8), expected);

  if (op === 'get') {
    bench.start();
    for (let i = 0; i < n; ++i)
      get(pointer, 8);
    bench.end(n);
  } else {
    bench.start();
    for (let i = 0; i < n; ++i)
      set(pointer, 8, value);
    bench.end(n);
  }
}
