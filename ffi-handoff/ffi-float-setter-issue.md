### Version

main (ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85)

### Platform

```text
<uname -a 출력으로 교체>
```

### Subsystem

ffi

### What steps will reproduce the bug?

`repro.js`

```js
// node --experimental-ffi repro.js
const { getRawPointer, setFloat64, getFloat64, setInt8 } = require('node:ffi');

const buf = Buffer.alloc(8);
const ptr = getRawPointer(buf);

setFloat64(ptr, 0, '1.5');
console.log('string:', getFloat64(ptr, 0));

setFloat64(ptr, 0, true);
console.log('boolean:', getFloat64(ptr, 0));

setFloat64(ptr, 0, {});
console.log('object:', getFloat64(ptr, 0));

try {
  setInt8(ptr, 0, 1.5);
} catch (err) {
  console.log('setInt8:', err.code, err.message);
}
```

### How often does it reproduce? Is there a required condition?

Always. `setFloat32()` behaves the same way as `setFloat64()`.

### What is the expected behavior? Why is that the expected behavior?

`setFloat32()` and `setFloat64()` should reject a value that is not a
`number` with `ERR_INVALID_ARG_VALUE`, the way every other setter in the
module does.

Two things in the module already imply that:

* The same `double` value is type-checked when it is passed as a call
  argument. `ToFFIArgument()` requires `IsNumber()` and throws
  `Argument %u must be a double` otherwise:
  https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/src/ffi/types.cc#L675-L689
  So `fn('1.5')` throws for an `f64` parameter while
  `setFloat64(ptr, 0, '1.5')` silently writes `1.5`.

* The documentation states that the setters validate:
  https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/doc/api/ffi.md?plain=1#L536-L537

  > The setter helpers require an explicit byte offset and validate the
  > supplied JavaScript value against the target native type before writing
  > it into memory.

### What do you see instead?

No error. The value is coerced and the result is written into native
memory:

```text
string: 1.5
boolean: 1
object: NaN
setInt8: ERR_INVALID_ARG_VALUE Value must be an int8
```

`SetValue<T>()` validates every integer type through
`GetValidatedSignedInt()` / `GetValidatedUnsignedInt()`, but the
floating-point branch calls `ToNumber()` and casts the result:

https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/src/ffi/data.cc#L402-L411

Only values whose coercion itself fails reach the error path, so a
string, a boolean, or a plain object is converted instead of rejected,
and `{}` writes `NaN` into the target memory.

The test suite shows the same split: every setter value assertion in
`test/ffi/test-ffi-memory.js` covers an integer setter, and none covers
the float setters:

https://github.com/nodejs/node/blob/ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85/test/ffi/test-ffi-memory.js#L259-L275

### Additional information

This matters because the setters write straight into native memory. A
value that arrives as a string from a config file or an environment
variable is written as-is, and a typo such as `'1,5'` stores `NaN` in a
struct field with no error at the call site. The equivalent mistake with
`setInt32()` throws immediately.

Note that `DataView.prototype.setFloat64()` also coerces, but that is not
a strong argument for keeping the current behavior: `DataView` coerces
and wraps for integers too (`dv.setInt8(0, 300)` writes `44`), while
`node:ffi` deliberately rejects those. The module already chose stricter
semantics than `DataView`; the float setters are the only place where
that choice is not applied.

I could not find a discussion about this. The integer validation, the
float coercion, and the documentation sentence all landed together in
https://github.com/nodejs/node/pull/62072, and I found no review comment
about the difference there or in
https://github.com/nodejs/node/pull/62762.

Proposed fix: check `IsNumber()` in the floating-point branch of
`SetValue<T>()` and throw `Value must be a float` / `Value must be a
double`, matching the wording of the integer setters and of
`ToFFIArgument()`, plus assertions for both setters in
`test/ffi/test-ffi-memory.js`. This makes input that is accepted today
throw, but `node:ffi` is experimental and recent fixes in this area took
the same direction (https://github.com/nodejs/node/pull/64614,
https://github.com/nodejs/node/pull/64691,
https://github.com/nodejs/node/pull/65032).

I am happy to open a pull request if this is considered a bug rather
than intended behavior. If it is intended, the documentation sentence
above needs to be corrected instead.
