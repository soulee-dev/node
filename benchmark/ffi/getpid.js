'use strict';

const common = require('../common.js');
const assert = require('node:assert');

const bench = common.createBenchmark(main, {
  n: [1e7],
}, {
  flags: ['--experimental-ffi'],
});

function main({ n }) {
  const ffi = require('node:ffi');
  const { lib, functions } = ffi.dlopen(null, {
    uv_os_getpid: { return: 'i32', arguments: [] },
  });
  const getpid = functions.uv_os_getpid;
  assert.strictEqual(getpid(), process.pid);

  bench.start();
  for (let i = 0; i < n; ++i)
    getpid();
  bench.end(n);

  lib.close();
}
