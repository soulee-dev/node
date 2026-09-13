'use strict';

const common = require('../common');

if (!common.hasFFI) {
  common.skip('missing FFI');
}

const fs = require('fs');
const { libraryPath } = require('../../benchmark/ffi/_common.js');

if (!fs.existsSync(libraryPath)) {
  common.skip('FFI fixture library is not built (run `make build-ffi-tests`)');
}

const runBenchmark = require('../common/benchmark');

runBenchmark('ffi');
