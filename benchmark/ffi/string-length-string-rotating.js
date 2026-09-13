'use strict';

// `string` arguments are encoded to a NUL-terminated UTF-8 buffer on every
// call unless the same string value is passed again for the same argument
// slot, in which case the previous encoding is reused. `unique=1` measures
// the cached case, higher values force a fresh encoding on every call.

const common = require('../common.js');
const assert = require('node:assert');
const { openFixture } = require('./_common.js');

const bench = common.createBenchmark(main, {
  len: [8, 64, 1024],
  unique: [1, 8],
  n: [1e6],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, len, unique }) {
  const ffi = require('node:ffi');
  const { lib, functions } = openFixture(ffi, {
    string_length: { arguments: ['string'], return: 'u64' },
  });
  const fn = functions.string_length;

  const strings = [];
  for (let i = 0; i < unique; i++) {
    strings.push(String.fromCharCode(0x61 + i).repeat(len));
  }
  const mask = unique - 1;
  assert.strictEqual(fn(strings[0]), BigInt(len));

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(strings[i & mask]);
  bench.end(n);

  lib.close();
}
