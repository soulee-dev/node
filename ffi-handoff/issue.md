# Issue draft

Title:

```text
ffi: setFloat32()/setFloat64() coerce their value and discard a pending exception
```

Command:

```bash
gh issue create --repo nodejs/node \
  --title "ffi: setFloat32()/setFloat64() coerce their value and discard a pending exception" \
  --body-file body.md
```

---

### Version

main (ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85)

### Platform

```text
Darwin 25.5.0 Darwin Kernel Version 25.5.0: Tue Jun  9 22:28:34 PDT 2026; root:xnu-12377.121.10~1/RELEASE_ARM64_T6041 arm64
```

### Subsystem

ffi

### What steps will reproduce the bug?

`repro.js`

```js
// node --experimental-ffi repro.js
const { getRawPointer, setFloat32, getFloat32, setFloat64, getFloat64, setInt8 } =
  require('node:ffi');

const ptr = getRawPointer(Buffer.alloc(8));
const thrower = { valueOf() { throw new RangeError('boom'); } };

for (const [name, fn] of [
  ['ffi.setFloat64', () => setFloat64(ptr, 0, thrower)],
  ['DataView      ', () => new DataView(new ArrayBuffer(8)).setFloat64(0, thrower)],
  ['Buffer        ', () => Buffer.alloc(8).writeDoubleLE(thrower)],
]) {
  try {
    fn();
  } catch (err) {
    console.log(`${name}: ${err.name}: ${err.message}`);
  }
}

for (const value of ['1.5', '1,5', true, {}, null]) {
  setFloat64(ptr, 0, value);
  console.log(`setFloat64(${String(value)}) ->`, getFloat64(ptr, 0));
}

setFloat32(ptr, 0, 1e50);
console.log('setFloat32(1e50) ->', getFloat32(ptr, 0));

try {
  setInt8(ptr, 0, '5');
} catch (err) {
  console.log("setInt8('5') ->", err.code, err.message);
}
```

### How often does it reproduce? Is there a required condition?

Always. `setFloat32()` and `setFloat64()` behave the same way.

### What is the expected behavior? Why is that the expected behavior?

Two things, the first of which is independent of any decision about the second.

**A JavaScript exception raised by the value must not be replaced.** When
`valueOf()` throws, that exception is already pending, and the setter throws
`ERR_INVALID_ARG_VALUE` on top of it, so the original error never reaches the
caller. `src/README.md` says the opposite:

https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/src/README.md#handling-empty-maybes

> Usually, the best approach to encountering an empty `Maybe` is to just return
> from the current function as soon as possible, and let execution in
> JavaScript land resume.

`DataView.prototype.setFloat64()` and `Buffer.prototype.writeDoubleLE()` both
propagate the original error.

**`setFloat32()` and `setFloat64()` should reject a value that is not a
`number`,** the way every other setter in the module does. Two things in the
module already imply that:

* The same `double` value is type-checked when it is passed as a call
  argument. `ToFFIArgument()` requires `IsNumber()` and throws
  `Argument %s must be a double` otherwise:
  https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/src/ffi/types.cc#L675-L689
  So `fn('1.5')` throws for an `f64` parameter while
  `setFloat64(ptr, 0, '1.5')` silently writes `1.5`.

* The documentation states that the setters validate:
  https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/doc/api/ffi.md?plain=1#L536-L537

  > The setter helpers require an explicit byte offset and validate the
  > supplied JavaScript value against the target native type before writing
  > it into memory.

### What do you see instead?

```text
ffi.setFloat64: TypeError: Value must be a number
DataView      : RangeError: boom
Buffer        : RangeError: boom
setFloat64(1.5) -> 1.5
setFloat64(1,5) -> NaN
setFloat64(true) -> 1
setFloat64([object Object]) -> NaN
setFloat64(null) -> 0
setFloat32(1e50) -> Infinity
setInt8('5') -> ERR_INVALID_ARG_VALUE Value must be an int8
```

`SetValue<T>()` validates every integer type through
`GetValidatedSignedInt()` / `GetValidatedUnsignedInt()`, both of which require
`IsNumber()` before any range check, but the floating-point branch calls
`ToNumber()` and casts the result:

https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/src/ffi/data.cc#L402-L411

Only a value whose coercion itself fails reaches the error path, and there the
`ERR_INVALID_ARG_VALUE` overwrites whatever `ToNumber()` left pending. This is
the only `ToNumber(context)` call in `src/`.

The test suite shows the same split: every setter value assertion in
`test/ffi/test-ffi-memory.js` covers an integer setter, and none covers the
float setters:

https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/test/ffi/test-ffi-memory.js#L259-L275

### Additional information

This matters because the setters write straight into native memory. A value
that arrives as a string from a config file or an environment variable is
written as-is, and a typo such as `'1,5'` stores `NaN` in a struct field with no
error at the call site. The equivalent mistake with `setInt32()` throws
immediately.

`DataView.prototype.setFloat64()` and `Buffer.prototype.writeDoubleLE()` also
coerce, but neither is a strong argument for keeping the current behavior,
because both coerce for integers too: `dv.setInt8(0, 300)` writes `44` and
`buf.writeInt8('5')` writes `5`, while `node:ffi` rejects both. The module
already chose stricter semantics than either of them; the float setters are the
only place where that choice is not applied.

Nor is the current split explained by rejecting only lossy writes.
`setFloat32(ptr, 0, 1e50)` silently stores `Infinity`, while
`setInt8(ptr, 0, 300)` throws.

I could not find a discussion about this. The integer validation, the float
coercion, and the documentation sentence all landed together in d0fa608c079
(https://github.com/nodejs/node/pull/62072), the floating-point branch has not
been modified since, and I found no review comment about the difference there,
in https://github.com/nodejs/node/pull/62762, or in
https://github.com/nodejs/node/pull/62858, which aligned the rest of the FFI
error handling with `src/README.md`.

Proposed fix: check `IsNumber()` in the floating-point branch of `SetValue<T>()`
and throw `Value must be a float` / `Value must be a double`, matching the
wording of the integer setters and of `ToFFIArgument()`, plus assertions for
both setters in `test/ffi/test-ffi-memory.js`. Because the check runs before any
conversion, `valueOf()` is never invoked and there is no pending exception to
discard, which resolves both points above.

This makes input that is accepted today throw, but `node:ffi` is experimental
and recent fixes in this area took the same direction
(https://github.com/nodejs/node/pull/64614,
https://github.com/nodejs/node/pull/64691,
https://github.com/nodejs/node/pull/65032).

If the coercion is intended, the documentation sentence above needs to be
corrected instead, but the discarded exception is a bug either way.
