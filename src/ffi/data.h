#pragma once

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "base_object.h"
#include "ffi.h"
#include "v8-fast-api-calls.h"

#include <cstdint>

namespace node::ffi {

v8::Maybe<int64_t> GetValidatedSignedInt(Environment* env,
                                         v8::Local<v8::Value> value,
                                         int64_t min,
                                         int64_t max,
                                         const char* type_name);

v8::Maybe<uint64_t> GetValidatedUnsignedInt(Environment* env,
                                            v8::Local<v8::Value> value,
                                            uint64_t max,
                                            const char* type_name);

v8::Maybe<uintptr_t> GetValidatedPointerAddress(Environment* env,
                                                v8::Local<v8::Value> value,
                                                const char* label);

size_t GetFFIReturnValueStorageSize(ffi_type* type);

// Primitive memory helpers: JS name suffix, identifier suffix, C type.
#define FFI_MEMORY_HELPER_TYPES(V)                                             \
  V(Int8, int8, int8_t)                                                        \
  V(Uint8, uint8, uint8_t)                                                     \
  V(Int16, int16, int16_t)                                                     \
  V(Uint16, uint16, uint16_t)                                                  \
  V(Int32, int32, int32_t)                                                     \
  V(Uint32, uint32, uint32_t)                                                  \
  V(Int64, int64, int64_t)                                                     \
  V(Uint64, uint64, uint64_t)                                                  \
  V(Float32, float32, float)                                                   \
  V(Float64, float64, double)

// Fast API entrypoints for `get<Type>()` / `set<Type>()`, paired with the
// FunctionCallback implementations of the same name in node_ffi.h.
#define V(Name, name, Type)                                                    \
  extern const v8::CFunction fast_get_##name;                                  \
  extern const v8::CFunction fast_set_##name;
FFI_MEMORY_HELPER_TYPES(V)
#undef V

}  // namespace node::ffi

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS
