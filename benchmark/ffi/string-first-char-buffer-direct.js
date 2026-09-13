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
  const fn = functions.string_first_char;
  const string = Buffer.from('hello\0');
  const pointer = ffi.getRawPointer(string);
  assert.strictEqual(fn(pointer), 'h'.charCodeAt(0));

  bench.start();
  for (let i = 0; i < n; ++i)
    fn(pointer);
  bench.end(n);

  lib.close();
}
