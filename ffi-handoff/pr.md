# PR draft

Branch: `ffi-validate-float-setters` (from `origin/main` @ `ad7a5b8302a`)
Commit: `ffi: validate the value passed to the float setters`

Command (after the issue exists, so the `Fixes:` URL can be filled in):

```bash
gh pr create --repo nodejs/node \
  --head soulee-dev:ffi-validate-float-setters \
  --title "ffi: validate the value passed to the float setters" \
  --body-file body.md
```

---

Title:

```text
ffi: validate the value passed to the float setters
```

Body:

---

`setInt8()` through `setUint64()` reject a value that is not a `number`:
`GetValidatedSignedInt()` and `GetValidatedUnsignedInt()` both check `IsNumber()`
before they look at the range at all, so `setInt8(ptr, 0, '5')` throws. The
floating-point branch of the same `SetValue<T>()` instead calls `ToNumber()` and
writes whatever comes back, so `setFloat64(ptr, 0, '1.5')` writes `1.5`,
`true` writes `1`, `{}` writes `NaN`, and `null` writes `0`.

The same `double` is type-checked when it travels the other path into native
code. `ToFFIArgument()` requires `IsNumber()` and throws
`Argument %s must be a double` otherwise, so `fn('1.5')` throws for an `f64`
parameter while `setFloat64(ptr, 0, '1.5')` does not. The documentation already
describes the behavior this restores: "The setter helpers require an explicit
byte offset and validate the supplied JavaScript value against the target native
type before writing it into memory."

The coercion has a second effect that is a bug regardless of what the module
decides about accepting non-numbers. When `ToNumber()` fails because the value
has a `valueOf()` that throws, `ToLocal()` returns false with an exception
already scheduled, and the branch calls `THROW_ERR_INVALID_ARG_VALUE` on top of
it, so the caller sees `Value must be a number` instead of the error they threw.
`DataView.prototype.setFloat64()` and `Buffer.prototype.writeDoubleLE()` both
propagate the original error. `src/README.md` asks for the opposite of what this
branch does: "the best approach to encountering an empty `Maybe` is to just
return from the current function as soon as possible". #62858 aligned the rest of
the FFI error handling with that document and this spot was missed.

Checking `IsNumber()` fixes both, because the check runs before any conversion:
`valueOf()` is never invoked, so there is no pending exception to discard. The
error messages follow the integer setters and `ToFFIArgument()` rather than the
old generic `Value must be a number`. This was the only `ToNumber(context)` call
in `src/`, so `using v8::Context;` and `using v8::MaybeLocal;` and the local
`context` go away with it.

`NaN` and `Infinity` are still accepted, since both are `number` values, and so
is a `setFloat32()` argument that does not fit in a `float` — `1e50` still
stores `Infinity`. Only the type check is new.

This makes input that is accepted today throw. `node:ffi` is experimental, no
test or benchmark passes a non-number to either setter, and the recent fixes in
this area went the same way without a `semver-major` label (#64614, #64691,
#65032).

Six assertions are added to the setter block in `test/ffi/test-ffi-memory.js`,
which covered only the integer setters. The last one passes
`{ valueOf: common.mustNotCall() }`, which fails if the setter ever converts the
value again.

Fixes: <ISSUE_URL>
Refs: https://github.com/nodejs/node/pull/62858
