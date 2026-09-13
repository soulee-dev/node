'use strict';

const {
  NumberIsInteger,
  ObjectDefineProperty,
  ReflectApply,
  StringPrototypeIncludes,
  Symbol,
  TypeError,
} = primordials;

const {
  Buffer,
} = require('buffer');

const {
  isAnyArrayBuffer,
  isArrayBufferView,
} = require('internal/util/types');

const {
  charIsSigned,
  getRawPointer,
  kFastArguments,
  kFastBufferInvoke,
  kSbSharedBuffer,
} = internalBinding('ffi');

const kFastBuffer = Symbol('kFastBuffer');

const U64_MAX = 0xFFFFFFFFFFFFFFFFn;
const I64_MAX = 0x7FFFFFFFFFFFFFFFn;
const I64_MIN = -0x8000000000000000n;

// These ranges mirror ToFFIArgument in src/ffi/types.cc. V8's Fast API
// exposes narrow integers as 32-bit values and uses truncating BigInt
// conversions, so the public FFI ranges must be checked before the raw call.
const fastIntegerTypeInfo = {
  __proto__: null,
  i8: { kind: 'number', min: -128, max: 127, label: 'an int8' },
  int8: { kind: 'number', min: -128, max: 127, label: 'an int8' },
  char: charIsSigned ?
    { kind: 'number', min: -128, max: 127, label: 'an int8' } :
    { kind: 'number', min: 0, max: 255, label: 'a uint8' },
  u8: { kind: 'number', min: 0, max: 255, label: 'a uint8' },
  uint8: { kind: 'number', min: 0, max: 255, label: 'a uint8' },
  bool: { kind: 'number', min: 0, max: 255, label: 'a uint8' },
  i16: { kind: 'number', min: -32768, max: 32767, label: 'an int16' },
  int16: { kind: 'number', min: -32768, max: 32767, label: 'an int16' },
  u16: { kind: 'number', min: 0, max: 65535, label: 'a uint16' },
  uint16: { kind: 'number', min: 0, max: 65535, label: 'a uint16' },
  i64: { kind: 'bigint', min: I64_MIN, max: I64_MAX, label: 'an int64' },
  int64: { kind: 'bigint', min: I64_MIN, max: I64_MAX, label: 'an int64' },
  u64: { kind: 'bigint', min: 0n, max: U64_MAX, label: 'a uint64' },
  uint64: { kind: 'bigint', min: 0n, max: U64_MAX, label: 'a uint64' },
};

function throwFFIArgError(msg) {
  // eslint-disable-next-line no-restricted-syntax
  const err = new TypeError(msg);
  err.code = 'ERR_INVALID_ARG_VALUE';
  throw err;
}

function throwFFIArgCountError(expected, actual) {
  throwFFIArgError(
    `Invalid argument count: expected ${expected}, got ${actual}`);
}

function validateIntegerArg(info, value, index) {
  const validType = info.kind === 'number' ?
    typeof value === 'number' && NumberIsInteger(value) :
    typeof value === 'bigint';
  if (!validType || value < info.min || value > info.max) {
    throwFFIArgError(`Argument ${index} must be ${info.label}`);
  }
}

// The predicates below classify signature type names. They only run while a
// wrapper is being built, never per call.

function isBufferTypeName(type) {
  return type === 'buffer' || type === 'arraybuffer';
}

function needsRawPointerConversion(type, rawFn) {
  if (rawFn !== undefined && rawFn[kFastBuffer] === true &&
      isBufferTypeName(type)) {
    return false;
  }
  return isBufferTypeName(type);
}

function needsPointerLikeConversion(type) {
  return type === 'pointer' || type === 'ptr' || type === 'function';
}

function needsStringPointerConversion(type) {
  return type === 'string' || type === 'str' || needsPointerLikeConversion(type);
}

function needsPointerConversion(type, rawFn) {
  return needsRawPointerConversion(type, rawFn) ||
         needsStringPointerConversion(type);
}

function enterStringConversion(state) {
  if (state.buffers[state.depth] === undefined) {
    state.buffers[state.depth] = [];
  }
  state.depth++;
}

function exitStringConversion(state) {
  state.depth--;
}

function getStringConversionPointer(state, value, index) {
  const size = value.length * 3 + 1;
  const buffers = state.buffers[state.depth - 1];
  let entry = buffers[index];
  if (entry !== undefined && entry.string === value) {
    return entry.pointer;
  }
  if (StringPrototypeIncludes(value, '\0')) {
    throwFFIArgError(`Argument ${index} must not contain null bytes`);
  }
  if (entry === undefined || entry.buffer.length < size) {
    const buffer = Buffer.allocUnsafe(size);
    entry = {
      __proto__: null,
      buffer,
      pointer: getRawPointer(buffer),
      string: undefined,
    };
    buffers[index] = entry;
  }

  const buffer = entry.buffer;
  const written = buffer.write(value, 0, size - 1, 'utf8');
  buffer[written] = 0;
  entry.string = value;
  return entry.pointer;
}

// Builds the per-argument conversion plan for one parameter, or returns null
// when the raw Fast API function can take the JS value as is. Every spec has
// the same shape so the per-call code below stays monomorphic.
function makeArgSpec(type, index, rawFn) {
  const intInfo = fastIntegerTypeInfo[type];
  if (intInfo !== undefined) {
    return {
      __proto__: null,
      index,
      intInfo,
      stringy: false,
      rawConv: false,
    };
  }
  if (!needsPointerConversion(type, rawFn)) {
    return null;
  }
  return {
    __proto__: null,
    index,
    intInfo: null,
    // `pointer`, `ptr`, `function`, `string` and `str` accept JS strings,
    // which are encoded into a temporary NUL-terminated buffer per call.
    stringy: needsStringPointerConversion(type),
    // `buffer` / `arraybuffer` parameters on a function without a native
    // buffer entrypoint: anything that is not memory-backed is rejected by
    // getRawPointer().
    rawConv: needsRawPointerConversion(type, rawFn),
  };
}

function isStringArg(spec, value) {
  return spec !== null && spec.stringy && typeof value === 'string';
}

function convertArg(spec, value, stringState) {
  if (spec === null) {
    return value;
  }
  const intInfo = spec.intInfo;
  if (intInfo !== null) {
    validateIntegerArg(intInfo, value, spec.index);
    return value;
  }
  if (spec.rawConv) {
    if (value === null || value === undefined) {
      return 0n;
    }
    return getRawPointer(value);
  }
  // Raw BigInt pointers are the common case for pointer-like parameters.
  // Check them first: the memory-backed checks below call into C++.
  if (typeof value === 'bigint') {
    return value;
  }
  if (value === null || value === undefined) {
    return 0n;
  }
  if (typeof value === 'string') {
    if (spec.stringy) {
      return getStringConversionPointer(stringState, value, spec.index);
    }
    return value;
  }
  if (typeof value === 'object' &&
      (isArrayBufferView(value) || isAnyArrayBuffer(value))) {
    return getRawPointer(value);
  }
  return value;
}

function initializeFastBufferMetadata(rawFn, argumentTypes) {
  if (rawFn === undefined || rawFn === null || argumentTypes === undefined) {
    return;
  }
  if (rawFn[kSbSharedBuffer] !== undefined) {
    return;
  }

  if (rawFn[kFastArguments] !== undefined) {
    for (let i = 0; i < argumentTypes.length; i++) {
      if (isBufferTypeName(argumentTypes[i])) {
        rawFn[kFastBuffer] = true;
        break;
      }
    }
  }
}

function inheritMetadata(wrapper, rawFn, nargs) {
  ObjectDefineProperty(wrapper, 'name', {
    __proto__: null, value: rawFn.name, configurable: true,
  });
  ObjectDefineProperty(wrapper, 'length', {
    __proto__: null, value: nargs, configurable: true,
  });
  ObjectDefineProperty(wrapper, 'pointer', {
    __proto__: null, value: rawFn.pointer,
    writable: true, configurable: true, enumerable: true,
  });
  return wrapper;
}

// Single-argument wrappers get a dedicated shape: pointer-like parameters can
// route memory-backed values through the Buffer-aware Fast API entrypoint
// instead of extracting a BigInt pointer in JS.
function buildUnaryWrapper(rawFn, spec, type, stringState) {
  const intInfo = spec.intInfo;
  if (intInfo !== null) {
    return function(a0) {
      if (arguments.length !== 1) {
        throwFFIArgCountError(1, arguments.length);
      }
      validateIntegerArg(intInfo, a0, 0);
      return rawFn(a0);
    };
  }

  const fastBufferInvoke = needsPointerLikeConversion(type) ?
    rawFn[kFastBufferInvoke] : undefined;
  if (fastBufferInvoke === undefined) {
    return function(a0) {
      if (arguments.length !== 1) {
        throwFFIArgCountError(1, arguments.length);
      }
      if (!isStringArg(spec, a0)) {
        return rawFn(convertArg(spec, a0, stringState));
      }
      enterStringConversion(stringState);
      try {
        return rawFn(convertArg(spec, a0, stringState));
      } finally {
        exitStringConversion(stringState);
      }
    };
  }

  return function(a0) {
    if (arguments.length !== 1) {
      throwFFIArgCountError(1, arguments.length);
    }
    if (typeof a0 === 'bigint') {
      return rawFn(a0);
    }
    if (a0 === null || a0 === undefined) {
      return rawFn(0n);
    }
    if (typeof a0 === 'string') {
      enterStringConversion(stringState);
      try {
        return rawFn(getStringConversionPointer(stringState, a0, 0));
      } finally {
        exitStringConversion(stringState);
      }
    }
    if (typeof a0 === 'object' &&
        (isArrayBufferView(a0) || isAnyArrayBuffer(a0))) {
      return fastBufferInvoke(a0);
    }
    return rawFn(a0);
  };
}

// Fixed-arity wrappers keep the call to `rawFn` a direct call with a static
// argument count, which is what lets V8 use the Fast API entrypoint. A
// rest-parameter + ReflectApply shape would force the slow call path, so
// arities up to 6 are spelled out and only wider signatures use the generic
// fallback. The per-argument plans are captured in closure locals so the
// hot path reads one variable per argument.
function buildWrapper(rawFn, specs, nargs, stringState) {
  let anyStringy = false;
  for (let i = 0; i < nargs; i++) {
    if (specs[i] !== null && specs[i].stringy) {
      anyStringy = true;
      break;
    }
  }

  if (nargs === 2) {
    const s0 = specs[0];
    const s1 = specs[1];
    return function(a0, a1) {
      if (arguments.length !== 2) {
        throwFFIArgCountError(2, arguments.length);
      }
      const stringCall = anyStringy &&
        (isStringArg(s0, a0) || isStringArg(s1, a1));
      if (stringCall) enterStringConversion(stringState);
      try {
        return rawFn(convertArg(s0, a0, stringState),
                     convertArg(s1, a1, stringState));
      } finally {
        if (stringCall) exitStringConversion(stringState);
      }
    };
  }
  if (nargs === 3) {
    const s0 = specs[0];
    const s1 = specs[1];
    const s2 = specs[2];
    return function(a0, a1, a2) {
      if (arguments.length !== 3) {
        throwFFIArgCountError(3, arguments.length);
      }
      const stringCall = anyStringy &&
        (isStringArg(s0, a0) || isStringArg(s1, a1) || isStringArg(s2, a2));
      if (stringCall) enterStringConversion(stringState);
      try {
        return rawFn(convertArg(s0, a0, stringState),
                     convertArg(s1, a1, stringState),
                     convertArg(s2, a2, stringState));
      } finally {
        if (stringCall) exitStringConversion(stringState);
      }
    };
  }
  if (nargs === 4) {
    const s0 = specs[0];
    const s1 = specs[1];
    const s2 = specs[2];
    const s3 = specs[3];
    return function(a0, a1, a2, a3) {
      if (arguments.length !== 4) {
        throwFFIArgCountError(4, arguments.length);
      }
      const stringCall = anyStringy &&
        (isStringArg(s0, a0) || isStringArg(s1, a1) ||
         isStringArg(s2, a2) || isStringArg(s3, a3));
      if (stringCall) enterStringConversion(stringState);
      try {
        return rawFn(convertArg(s0, a0, stringState),
                     convertArg(s1, a1, stringState),
                     convertArg(s2, a2, stringState),
                     convertArg(s3, a3, stringState));
      } finally {
        if (stringCall) exitStringConversion(stringState);
      }
    };
  }
  if (nargs === 5) {
    const s0 = specs[0];
    const s1 = specs[1];
    const s2 = specs[2];
    const s3 = specs[3];
    const s4 = specs[4];
    return function(a0, a1, a2, a3, a4) {
      if (arguments.length !== 5) {
        throwFFIArgCountError(5, arguments.length);
      }
      const stringCall = anyStringy &&
        (isStringArg(s0, a0) || isStringArg(s1, a1) ||
         isStringArg(s2, a2) || isStringArg(s3, a3) ||
         isStringArg(s4, a4));
      if (stringCall) enterStringConversion(stringState);
      try {
        return rawFn(convertArg(s0, a0, stringState),
                     convertArg(s1, a1, stringState),
                     convertArg(s2, a2, stringState),
                     convertArg(s3, a3, stringState),
                     convertArg(s4, a4, stringState));
      } finally {
        if (stringCall) exitStringConversion(stringState);
      }
    };
  }
  if (nargs === 6) {
    const s0 = specs[0];
    const s1 = specs[1];
    const s2 = specs[2];
    const s3 = specs[3];
    const s4 = specs[4];
    const s5 = specs[5];
    return function(a0, a1, a2, a3, a4, a5) {
      if (arguments.length !== 6) {
        throwFFIArgCountError(6, arguments.length);
      }
      const stringCall = anyStringy &&
        (isStringArg(s0, a0) || isStringArg(s1, a1) ||
         isStringArg(s2, a2) || isStringArg(s3, a3) ||
         isStringArg(s4, a4) || isStringArg(s5, a5));
      if (stringCall) enterStringConversion(stringState);
      try {
        return rawFn(convertArg(s0, a0, stringState),
                     convertArg(s1, a1, stringState),
                     convertArg(s2, a2, stringState),
                     convertArg(s3, a3, stringState),
                     convertArg(s4, a4, stringState),
                     convertArg(s5, a5, stringState));
      } finally {
        if (stringCall) exitStringConversion(stringState);
      }
    };
  }

  return function(...args) {
    if (args.length !== nargs) {
      throwFFIArgCountError(nargs, args.length);
    }
    let stringCall = false;
    if (anyStringy) {
      for (let i = 0; i < nargs; i++) {
        if (isStringArg(specs[i], args[i])) {
          stringCall = true;
          break;
        }
      }
    }
    if (stringCall) enterStringConversion(stringState);
    try {
      for (let i = 0; i < nargs; i++) {
        args[i] = convertArg(specs[i], args[i], stringState);
      }
      return ReflectApply(rawFn, undefined, args);
    } finally {
      if (stringCall) exitStringConversion(stringState);
    }
  };
}

function wrapWithRawPointerConversions(rawFn, argumentTypes, _owner) {
  if (rawFn === undefined || rawFn === null) {
    return rawFn;
  }
  if (argumentTypes === undefined) {
    argumentTypes = rawFn[kFastArguments];
  }
  if (argumentTypes === undefined) {
    return rawFn;
  }

  const nargs = argumentTypes.length;
  const specs = [];
  let needsWrapper = false;
  for (let i = 0; i < nargs; i++) {
    const spec = makeArgSpec(argumentTypes[i], i, rawFn);
    specs.push(spec);
    if (spec !== null) needsWrapper = true;
  }
  if (!needsWrapper) {
    return rawFn;
  }

  const stringState = {
    __proto__: null,
    buffers: [],
    depth: 0,
  };

  const wrapper = nargs === 1 ?
    buildUnaryWrapper(rawFn, specs[0], argumentTypes[0], stringState) :
    buildWrapper(rawFn, specs, nargs, stringState);

  return inheritMetadata(wrapper, rawFn, nargs);
}

module.exports = {
  initializeFastBufferMetadata,
  throwFFIArgError,
  wrapWithRawPointerConversions,
};
