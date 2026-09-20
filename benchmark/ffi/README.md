# FFI invocation benchmarks

Build Node.js with FFI support and build the fixture library with
`make build-ffi-tests` before running these benchmarks.

```console
out/Release/node benchmark/ffi/invoke-function.js
```

Each result includes a `scenario` label and throughput in calls per second.
Scenarios use the public API and its normal dispatch, without forcing a path:

| Scenario                  | Call shape                                                                   | Intended path                                                |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `fast-api-candidate`      | `add_i32(20, 22)`                                                            | Fast API when supported and optimized                        |
| `shared-buffer-function`  | `call_int_callback(0n, 21)`, with a `function` parameter                     | SharedBuffer; `function` excludes Fast API                   |
| `shared-buffer-many-args` | `sum_8_i32(...)`, with eight integer parameters                              | SharedBuffer; exceeds current Fast API GP register caps      |
| `generic-buffer`          | `call_string_callback(0n, buffer)`, with `function` and `pointer` parameters | Generic argument conversion via SharedBuffer's slow fallback |

The null callbacks return without invoking JavaScript. The generic case reuses a
NUL-terminated Buffer allocated before measurement; its argument conversion and
SharedBuffer fallback dispatch are included in the measured cost.

SharedBuffer scenarios are skipped on big-endian hosts. On those hosts, the
`generic-buffer` scenario uses the generic invoker directly. The Fast API
candidate can use SharedBuffer or generic callbacks depending on the platform,
executable memory availability, V8 flags, and optimization state. Its label is
not confirmation that the generated trampoline was executed.

Library loading, symbol resolution, buffer allocation, and 10,000 warm-up calls
are outside measurement. Warm-up does not force or verify V8 optimization.

Compare each scenario against itself across revisions. Signatures, input types,
and native work differ between scenarios, so their throughput ratios do not
isolate the cost of choosing one invocation path over another.

The SharedBuffer scenarios retain the original `call_int_callback` and
`sum_8_i32` workloads for libffi call-plan comparisons. On x86-64 SysV, the
former is register-only and the latter also uses the stack. Both SharedBuffer
and generic invokers use reusable libffi call plans when supported by the build.

To run only one scenario:

```console
out/Release/node benchmark/ffi/invoke-function.js scenario=generic-buffer
```
