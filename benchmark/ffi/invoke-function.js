'use strict';

const assert = require('node:assert');
const { endianness } = require('node:os');
const common = require('../common.js');
const { libraryPath, ensureFixtureLibrary } = require('./common.js');

// Exercise normal dispatch using call shapes that target different paths.
// These are regression scenarios, not a same-signature comparison of invokers.
const bench = common.createBenchmark(main, {
  n: [1e7],
  scenario: [
    'fast-api-candidate',
    'shared-buffer-function',
    'shared-buffer-many-args',
    'generic-buffer',
  ],
}, {
  flags: ['--no-warnings'],
});

function main({ n, scenario }) {
  // SharedBuffer is disabled on big-endian hosts. Do not report generic calls
  // under a SharedBuffer label there.
  if (scenario.startsWith('shared-buffer-') && endianness() === 'BE') {
    console.log(`Skipping: scenario=${scenario} requires a little-endian host`);
    return;
  }

  ensureFixtureLibrary();
  const { DynamicLibrary } = require('node:ffi');
  const lib = new DynamicLibrary(libraryPath);

  try {
    let run;
    let expected;
    if (scenario === 'fast-api-candidate') {
      // Eligible on supported Fast API platforms. Actual routing still depends
      // on executable memory availability and V8 optimization of the call site.
      const fn = lib.getFunction('add_i32', {
        return: 'i32', arguments: ['i32', 'i32'],
      });
      expected = 42;
      run = (count) => {
        let result;
        for (let i = 0; i < count; ++i)
          result = fn(20, 22);
        return result;
      };
    } else if (scenario === 'shared-buffer-function') {
      // 'function' excludes Fast API, but is pointer-shaped for SharedBuffer.
      // A null BigInt takes the packing path and the C target returns early.
      const fn = lib.getFunction('call_int_callback', {
        return: 'i32', arguments: ['function', 'i32'],
      });
      expected = -1;
      run = (count) => {
        let result;
        for (let i = 0; i < count; ++i)
          result = fn(0n, 21);
        return result;
      };
    } else if (scenario === 'shared-buffer-many-args') {
      // Eight integer arguments exceed the current Fast API GP register caps.
      // On x86-64 SysV, libffi passes six in registers and two on the stack.
      const fn = lib.getFunction('sum_8_i32', {
        return: 'i32', arguments: Array(8).fill('i32'),
      });
      expected = 42;
      run = (count) => {
        let result;
        for (let i = 0; i < count; ++i)
          result = fn(1, 2, 3, 4, 5, 6, 7, 14);
        return result;
      };
    } else {
      assert.strictEqual(scenario, 'generic-buffer');
      // 'function' excludes Fast API. A Buffer pointer argument sends the
      // SharedBuffer wrapper to InvokeFunction for native argument conversion.
      // On big-endian hosts the generic invoker is selected directly instead.
      // The null callback keeps native work minimal and never enters JS.
      const fn = lib.getFunction('call_string_callback', {
        return: 'void', arguments: ['function', 'pointer'],
      });
      const buffer = Buffer.from('hello\0');
      run = (count) => {
        for (let i = 0; i < count; ++i)
          fn(0n, buffer);
      };
    }

    // Warm the same fixed-arity call site outside the measured loop. This does
    // not force or verify V8 optimization, especially in the Fast API candidate.
    assert.strictEqual(run(1e4), expected);

    bench.start();
    const result = run(n);
    bench.end(n);

    assert.strictEqual(result, expected);
  } finally {
    lib.close();
  }
}
