'use strict';

// Cost of opening a library and creating its function wrappers. The fixture
// library stays mapped between iterations, so this mostly measures symbol
// resolution and per-function setup, including the Fast API trampolines.

const common = require('../common.js');
const assert = require('node:assert');
const { definitions, ensureFixtureLibrary, libraryPath } = require('./_common.js');

const bench = common.createBenchmark(main, {
  functions: [1, 8, 32],
  n: [2e3],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n, functions }) {
  const ffi = require('node:ffi');
  ensureFixtureLibrary();

  const subset = { __proto__: null };
  const names = Object.keys(definitions).slice(0, functions);
  assert.strictEqual(names.length, functions);
  for (const name of names) {
    subset[name] = definitions[name];
  }

  bench.start();
  for (let i = 0; i < n; ++i) {
    const { lib } = ffi.dlopen(libraryPath, subset);
    lib.close();
  }
  bench.end(n);
}
