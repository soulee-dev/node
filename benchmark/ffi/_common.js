'use strict';

const common = require('../common.js');
const fs = require('node:fs');
const path = require('node:path');

// Cannot use test/ffi/ffi-test-common.js because it requires test/common
// (the test harness module). Construct the path directly.
const libraryPath = path.join(__dirname, '..', '..', 'test', 'ffi',
                              'fixture_library', 'build', common.buildType,
                              process.platform === 'win32' ? 'ffi_test_library.dll' :
                                process.platform === 'darwin' ? 'ffi_test_library.dylib' :
                                  'ffi_test_library.so');

function ensureFixtureLibrary() {
  if (!fs.existsSync(libraryPath)) {
    throw new Error(
      `Missing FFI fixture library: ${libraryPath}. ` +
      'Build it with `make build-ffi-tests` first.',
    );
  }
}

// Every benchmark opens the fixture with the full definition set rather than
// just the one function it calls. Real applications define many functions per
// library, and creating several functions of the same arity keeps V8 from
// specializing the shared JS call wrappers to a single closure, which would
// make the per-call numbers unrealistically optimistic.
const definitions = {
  noop_void: { arguments: [], return: 'void' },
  add_i8: { arguments: ['i8', 'i8'], return: 'i8' },
  add_u8: { arguments: ['u8', 'u8'], return: 'u8' },
  add_i16: { arguments: ['i16', 'i16'], return: 'i16' },
  add_u16: { arguments: ['u16', 'u16'], return: 'u16' },
  add_i32: { arguments: ['i32', 'i32'], return: 'i32' },
  add_u32: { arguments: ['u32', 'u32'], return: 'u32' },
  add_i64: { arguments: ['i64', 'i64'], return: 'i64' },
  add_u64: { arguments: ['u64', 'u64'], return: 'u64' },
  identity_i32: { arguments: ['i32'], return: 'i32' },
  add_f32: { arguments: ['f32', 'f32'], return: 'f32' },
  add_f64: { arguments: ['f64', 'f64'], return: 'f64' },
  identity_pointer: { arguments: ['pointer'], return: 'pointer' },
  is_null_pointer: { arguments: ['pointer'], return: 'u8' },
  pointer_to_usize: { arguments: ['pointer'], return: 'u64' },
  string_length: { arguments: ['pointer'], return: 'u64' },
  string_first_char: { arguments: ['pointer'], return: 'u8' },
  string_equals_hello: { arguments: ['pointer'], return: 'u8' },
  first_byte: { arguments: ['pointer'], return: 'u8' },
  fill_buffer: { arguments: ['pointer', 'u64', 'u32'], return: 'void' },
  sum_buffer: { arguments: ['pointer', 'u64'], return: 'u64' },
  store_i32: { arguments: ['i32'], return: 'void' },
  store_sum_2_i32: { arguments: ['i32', 'i32'], return: 'void' },
  store_sum_3_i32: { arguments: ['i32', 'i32', 'i32'], return: 'void' },
  store_sum_4_i32: { arguments: ['i32', 'i32', 'i32', 'i32'], return: 'void' },
  store_sum_5_i32: { arguments: ['i32', 'i32', 'i32', 'i32', 'i32'], return: 'void' },
  store_sum_6_i32: {
    arguments: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32'], return: 'void',
  },
  store_sum_8_i32: {
    arguments: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    return: 'void',
  },
  get_scratch: { arguments: [], return: 'i32' },
  call_int_callback: { arguments: ['function', 'i32'], return: 'i32' },
  call_void_callback: { arguments: ['function'], return: 'void' },
  call_binary_int_callback: { arguments: ['function', 'i32', 'i32'], return: 'i32' },
  call_callback_multiple_times: { arguments: ['function', 'i32'], return: 'void' },
  sum_3_i32: { arguments: ['i32', 'i32', 'i32'], return: 'i32' },
  sum_4_i32: { arguments: ['i32', 'i32', 'i32', 'i32'], return: 'i32' },
  sum_5_i32: { arguments: ['i32', 'i32', 'i32', 'i32', 'i32'], return: 'i32' },
  sum_6_i32: { arguments: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32'], return: 'i32' },
  sum_7_i32: {
    arguments: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32'], return: 'i32',
  },
  sum_8_i32: {
    arguments: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    return: 'i32',
  },
  mixed_operation: { arguments: ['i32', 'f32', 'f64', 'u32'], return: 'f64' },
  allocate_memory: { arguments: ['u64'], return: 'pointer' },
  deallocate_memory: { arguments: ['pointer'], return: 'void' },
};

// `node:ffi` can only be required behind --experimental-ffi. createBenchmark()
// forwards that flag to the child process it forks, but the parent process
// started by run.js / compare.js does not have it, so benchmarks must load the
// module from inside main() rather than at the top level.
function openFixture(ffi, overrides) {
  ensureFixtureLibrary();
  return ffi.dlopen(libraryPath, { ...definitions, ...overrides });
}

module.exports = { definitions, ensureFixtureLibrary, libraryPath, openFixture };
