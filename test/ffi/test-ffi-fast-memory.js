// Flags: --experimental-ffi --allow-natives-syntax
'use strict';

// The primitive memory helpers have V8 Fast API entrypoints. This verifies
// that optimized calls produce the same values and the same errors as the
// unoptimized slow path.

const common = require('../common');
common.skipIfFFIMissing();

const assert = require('node:assert');
const { test } = require('node:test');
const ffi = require('node:ffi');

function optimize(fn, ...args) {
  eval('%PrepareFunctionForOptimization(fn)');
  fn(...args);
  fn(...args);
  eval('%OptimizeFunctionOnNextCall(fn)');
  fn(...args);
}

const buffer = Buffer.alloc(64);
const pointer = ffi.getRawPointer(buffer);
const maxPointer = process.arch === 'ia32' || process.arch === 'arm' ?
  0xFFFFFFFFn : 0xFFFFFFFFFFFFFFFFn;

test('optimized memory helpers read and write every type', () => {
  const cases = [
    ['Int8', -12, 0],
    ['Uint8', 250, 1],
    ['Int16', -1234, 2],
    ['Uint16', 65000, 4],
    ['Int32', -123456, 8],
    ['Uint32', 3000000000, 12],
    ['Int64', -1234567890123n, 16],
    ['Uint64', 1234567890123n, 24],
    ['Float32', 3.5, 32],
    ['Float64', 7.25, 40],
  ];

  for (const [type, value, offset] of cases) {
    const get = ffi[`get${type}`];
    const set = ffi[`set${type}`];
    function write(p, o, v) { return set(p, o, v); }

    function read(p, o) { return get(p, o); }

    optimize(write, pointer, offset, value);
    optimize(read, pointer, offset);
    assert.strictEqual(read(pointer, offset), value, type);
    // Omitting the offset reads from the start of the block.
    assert.strictEqual(get(pointer), get(pointer, 0), type);
  }
});

test('optimized memory helpers keep the slow path validation', () => {
  function readI32(p, o) { return ffi.getInt32(p, o); }

  function readI8(p, o) { return ffi.getInt8(p, o); }

  function writeI8(p, o, v) { return ffi.setInt8(p, o, v); }

  function writeU8(p, o, v) { return ffi.setUint8(p, o, v); }

  function writeU32(p, o, v) { return ffi.setUint32(p, o, v); }

  function writeI64(p, o, v) { return ffi.setInt64(p, o, v); }

  function writeU64(p, o, v) { return ffi.setUint64(p, o, v); }

  optimize(readI32, pointer, 0);
  optimize(readI8, pointer, 0);
  optimize(writeI8, pointer, 0, 1);
  optimize(writeU8, pointer, 0, 1);
  optimize(writeU32, pointer, 0, 1);
  optimize(writeI64, pointer, 0, 1n);
  optimize(writeU64, pointer, 0, 1n);

  const invalid = { code: 'ERR_INVALID_ARG_VALUE' };

  assert.throws(() => readI32(0n, 0), /Cannot dereference a null pointer/);
  assert.throws(() => readI32(-1n, 0), /The pointer must be a non-negative bigint/);
  assert.throws(() => readI32(1n << 64n, 0), /The pointer must be a non-negative bigint/);
  assert.throws(() => readI32('nope', 0), /The pointer must be a bigint/);
  assert.throws(() => readI32(pointer, 1.5), /The offset must be a non-negative integer/);
  assert.throws(() => readI32(pointer, -1), /The offset must be a non-negative integer/);
  assert.throws(() => readI32(pointer, 'bad'), /The offset must be a number/);
  assert.throws(() => readI8(maxPointer, 8), /pointer and offset exceed the platform address range/);
  assert.throws(() => readI32(maxPointer, 2), /accessed range exceeds the platform address range/);

  assert.throws(() => writeI8(-1n, 0, 1), /The pointer must be a non-negative bigint/);
  assert.throws(() => writeI8(0n, 0, 1), /Cannot dereference a null pointer/);
  assert.throws(() => writeI8(pointer), /Expected an offset argument/);
  assert.throws(() => writeI8(pointer, 0), /Expected a value argument/);
  assert.throws(() => writeI8(pointer, 0, 128), /Value must be an int8/);
  assert.throws(() => writeI8(pointer, 0, 1.5), /Value must be an int8/);
  assert.throws(() => writeU8(pointer, 0, -1), /Value must be a uint8/);
  assert.throws(() => writeU8(pointer, 0, NaN), /Value must be a uint8/);
  assert.throws(() => writeU32(pointer, 0, 2 ** 32), /Value must be a uint32/);
  assert.throws(() => writeI64(pointer, 0, 1n << 63n), /Value must be an int64/);
  assert.throws(() => writeI64(pointer, 0, 1.5), /Value must be an int64/);
  assert.throws(() => writeU64(pointer, 0, -1n), /Value must be a uint64/);
  assert.throws(() => writeU64(pointer, 0, 1n << 64n), /Value must be a uint64/);

  for (const fn of [() => readI32(-1n, 0), () => writeI8(pointer, 0, 128)]) {
    assert.throws(fn, invalid);
  }

  // The slow path still accepts safe-integer Numbers for 64-bit setters.
  writeI64(pointer, 0, -42);
  assert.strictEqual(ffi.getInt64(pointer, 0), -42n);
  writeU64(pointer, 0, 42);
  assert.strictEqual(ffi.getUint64(pointer, 0), 42n);
});

test('memory helpers keep their public names', () => {
  assert.strictEqual(ffi.getInt32.name, 'getInt32');
  assert.strictEqual(ffi.setFloat64.name, 'setFloat64');
});
