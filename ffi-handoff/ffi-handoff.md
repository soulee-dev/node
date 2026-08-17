# node:ffi 문서 대조 작업 인수인계

작성일 2026-08-16. Windows/WSL 세션에서 진행한 내용을 맥북에서 이어받기 위한 문서입니다.
이 파일 하나만 있으면 이어서 작업할 수 있도록 필요한 내용을 모두 넣었습니다.

## 1. 지금까지 한 일

1. `nodejs/node`를 upstream(`origin`)에서 pull. 기준 커밋 `ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85` (2026-08-16).
2. `doc/api/ffi.md` 772줄 전체를 구현과 대조. 실제 차이 약 30건 확인. 상세 목록은 `ffi-doc-audit.md`에 있습니다.
3. 기존 이슈/PR 중복 조사.
4. 우선순위 정리 후, 가장 급한 1건만 문서 패치로 커밋해서 포크에 push. PR은 아직 열지 않았습니다.
5. 논의 끝에 방향 변경. 이 건은 문서가 아니라 **코드를 고치는 것이 맞다**고 판단해서, 이슈 본문까지 작성해 둔 상태입니다.

## 2. 저장소 상태

- Windows/WSL 쪽 클론 경로: `/home/soulee/workspaces/node` (WSL Ubuntu 24.04). 맥북에는 별도 클론이 필요합니다.
- 리모트: `origin` = `https://github.com/nodejs/node`, `fork` = `https://github.com/soulee-dev/node`
- 푸시된 브랜치: `soulee-dev/node` 의 `doc-ffi-float-setter-validation`
  - 커밋 `8258fdb2951` `doc: fix FFI float setter validation claim`
  - `doc/api/ffi.md` 한 문단 수정, +10/-4
  - **PR은 열지 않았습니다. 그리고 아래 5절의 결론에 따라 이 브랜치는 보류합니다.**
- 커밋에 `Assisted-by` 트레일러는 넣지 않았습니다(`doc/contributing/ai-guidelines.md`는 아직 신경 쓰지 않기로 함).
- 로컬 git 사용자 정보가 비어 있어 WSL 클론에 `Soul Lee <alus20x@gmail.com>`로 설정했습니다. 맥북에서도 동일해야 합니다.

## 3. 중복 조사 결과

이미 다른 사람이 다루고 있어 **손대면 안 되는 것**:

| 내 발견 | 기존 항목 |
|---|---|
| fast call 인자 한도가 Win64에서 3개인데 문서는 8개, 아키텍처 목록 누락 | [PR #65207](https://github.com/nodejs/node/pull/65207) 열림. 7개 아키텍처 표로 교체 중이며 내용이 동일합니다 |
| `SharedArrayBuffer` 인자가 fast path에서만 허용되는 불일치 | [이슈 #65232](https://github.com/nodejs/node/issues/65232) + [PR #65233](https://github.com/nodejs/node/pull/65233) 열림 |

`doc/api/ffi.md`를 수정하는 열린 PR은 #65207 하나뿐입니다. 나머지 발견 항목은 이슈도 PR도 없습니다.

## 4. 현재 진행 중인 건: float setter 검증

### 무엇이 문제인가

`node:ffi`의 `set*` 헬퍼 20개는 네이티브 주소에 값을 직접 기록합니다. 정수 setter는 값을 검증하고 `ERR_INVALID_ARG_VALUE`로 거부하지만, `setFloat32()`와 `setFloat64()`는 검증 없이 `ToNumber()`로 코어싱한 뒤 기록합니다.

```js
setInt8(ptr, 0, 1.5);        // throw: Value must be an int8
setFloat64(ptr, 0, '1.5');   // 통과. 1.5가 기록됨
setFloat64(ptr, 0, true);    // 통과. 1이 기록됨
setFloat64(ptr, 0, {});      // 통과. NaN이 기록됨
```

### 코드를 고쳐야 한다는 근거 세 가지

1. **같은 모듈 안에서 이미 float을 검증합니다.** 네이티브 함수 인자로 `f64`를 넘길 때는 `ToFFIArgument()`가 `IsNumber()`를 요구하고 `Argument %u must be a double`로 거부합니다(`src/ffi/types.cc:675-689`). 같은 double인데 경로에 따라 규칙이 다릅니다.
2. **프로젝트가 조용한 변환을 버그로 취급해 왔습니다.** #64613→[#64614](https://github.com/nodejs/node/pull/64614), #64690→[#64691](https://github.com/nodejs/node/pull/64691), #65031→[#65032](https://github.com/nodejs/node/pull/65032) 모두 검증을 추가하는 방향이었고 semver-major 라벨 없이 처리됐습니다.
3. **문서가 이미 검증을 약속하고 있습니다**(`doc/api/ffi.md:536-537`). 원래 의도가 검증이었을 가능성이 높습니다.

### 왜 이렇게 됐는지 조사한 결과

- 정수 검증, float 코어싱, 문서 문장 셋 다 최초 커밋 `d0fa608c079`([PR #62072](https://github.com/nodejs/node/pull/62072))에서 함께 들어왔습니다.
- #62072의 리뷰 코멘트 44개와 일반 코멘트 43개, [#62762](https://github.com/nodejs/node/pull/62762)의 리뷰 41개를 확인했지만 이 비대칭을 논의한 흔적은 없습니다. 결정 근거가 기록되어 있지 않습니다.

### DataView 비교

`DataView.prototype.setFloat64()`도 ECMA-262상 `ToNumber()`로 코어싱합니다. 다만 DataView는 정수도 코어싱하고 범위를 wrap 합니다(`dv.setInt8(0, 300)` → 44). `node:ffi`는 그걸 거부하므로, 이미 표준보다 엄격한 노선을 택한 모듈입니다. float만 표준 기본값으로 남은 셈이라 "표준과 같으니 그대로 두자"는 논거는 약합니다.

### 관련 코드 위치 (기준 커밋 `ad7a5b8302a`)

- float 분기: `src/ffi/data.cc:402-411`
- 정수 검증: `src/ffi/data.cc:319-399`, 검증 함수는 88행과 108행
- 인자 경로의 float 검증: `src/ffi/types.cc:675-689`
- 문서 문장: `doc/api/ffi.md:536-537`
- 테스트 단언(정수만 존재): `test/ffi/test-ffi-memory.js:259-275`

## 5. 남은 작업

### 5.1 빌드하고 재현 확인 (맥북에서 첫 작업)

```bash
git clone https://github.com/nodejs/node.git && cd node
git remote add fork https://github.com/soulee-dev/node.git
./configure && make -j$(sysctl -n hw.ncpu)
```

FFI는 기본 빌드에 포함되고 런타임에만 `--experimental-ffi`가 필요합니다.

재현 스크립트 `repro.js`:

```js
// ./node --experimental-ffi repro.js
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

예상 출력은 `1.5`, `1`, `NaN`, 그리고 `ERR_INVALID_ARG_VALUE Value must be an int8`입니다. **이 값은 소스를 읽고 예측한 것이지 실행해서 확인한 것이 아닙니다.** 반드시 실행해서 확인한 뒤 이슈에 올리세요.

### 5.2 이슈 등록

아래 본문을 그대로 쓰되, Platform 칸을 `uname -a` 출력으로 채우고 실제 출력값을 반영하세요.

제목:

```text
ffi: setFloat32()/setFloat64() coerce their value while every other setter validates
```

본문:

````text
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
````

등록 명령:

```bash
gh issue create --repo nodejs/node \
  --title "ffi: setFloat32()/setFloat64() coerce their value while every other setter validates" \
  --body-file issue.md
```

### 5.3 코드 패치 (이슈 반응 확인 후)

`src/ffi/data.cc`의 float 분기를 이렇게 바꾸는 방향입니다. 컴파일과 메시지 문구는 실제로 빌드해서 확인해야 합니다.

```cpp
} else if constexpr (std::is_same_v<T, float> || std::is_same_v<T, double>) {
  if (!value->IsNumber()) {
    if constexpr (std::is_same_v<T, float>) {
      THROW_ERR_INVALID_ARG_VALUE(env, "Value must be a float");
    } else {
      THROW_ERR_INVALID_ARG_VALUE(env, "Value must be a double");
    }
    return;
  }

  converted = static_cast<T>(value.As<Number>()->Value());
}
```

테스트는 `test/ffi/test-ffi-memory.js`의 setter 단언 블록(259-275행 부근)에 추가합니다.

```js
assert.throws(() => ffi.setFloat32(ptr, 0, '1.5'), /Value must be a float/);
assert.throws(() => ffi.setFloat64(ptr, 0, '1.5'), /Value must be a double/);
assert.throws(() => ffi.setFloat64(ptr, 0, true), /Value must be a double/);
assert.throws(() => ffi.setFloat64(ptr, 0, {}), /Value must be a double/);
```

패치 전에 기존 테스트나 벤치마크가 float setter에 숫자 아닌 값을 넘기는 곳이 없는지 확인하세요.

```bash
grep -rn "setFloat" test/ benchmark/ doc/
python3 tools/test.py ffi
```

### 5.4 문서 브랜치 처리

`doc-ffi-float-setter-validation` 브랜치는 문서를 현재 동작에 맞추는 내용입니다. 코드 수정이 받아들여지면 원래 문서 문장이 참이 되므로 불필요해집니다. 이슈 결론이 나기 전까지 PR을 열지 마세요. "코어싱이 의도된 동작"이라는 답이 오면 그때 이 브랜치로 PR을 올리면 됩니다.

## 6. 아직 손대지 않은 나머지 발견 항목

`ffi-doc-audit.md`에 전체 목록이 있습니다. 우선순위 순으로 요약하면 다음과 같습니다.

**다음으로 급한 것 (문서가 실제보다 안전하다고 서술)**

- `export*` 4종의 `length`가 기록 바이트 수가 아니라 하한 검사입니다. 원본 길이만 복사되고 나머지 구간은 손대지 않습니다(`src/ffi/data.cc:709`, `730`).
- `copy` 파라미터가 `{boolean}` 표기지만 `BooleanValue` 코어싱이라 `0`이나 `''`도 zero-copy view를 만듭니다(`src/ffi/data.cc:586`, `649`). 이것도 코드 수정 후보입니다.

**그다음 (문서대로 쓰면 바로 실패)**

- `void`를 인자 타입으로 쓰면 throw, `dlopen()`의 `functions`가 frozen이라 영원히 빈 객체, `ffi.dlclose`/`dlsym`만 권한 검사가 있어 메서드형과 동등하지 않음, `library.functions`/`symbols`가 close 후 읽기만 해도 throw, NUL 포함 문자열 거부, `return: 'string'`이 bigint, `offset`은 Number 전용, 인자 개수 불일치 throw, `refCallback`의 비-bigint는 `ERR_INVALID_ARG_TYPE`.

**정확성 보강**

- Safety notes 문구, `library.path`가 `''`, `ERR_ACCESS_DENIED`와 `ERR_FFI_LIBRARY_CLOSED` 명시, weak 캐시 단서, null 포인터 규칙, `getRawPointer`의 byteOffset과 detached 처리, `getFunctions()` 에러, `dlopen` 실패 시 자동 close.

한 PR에 몰아넣지 말고 주제별로 나눠서 올리는 편이 리뷰가 빠릅니다.

## 7. 기여 시 참고

- 커밋 규칙: `doc/contributing/pull-requests.md`. 제목은 `subsystem: 소문자 명령형`, 50자 이내 권장, 본문 72칸 줄바꿈, `git commit -s`로 `Signed-off-by` 필수.
- 기존에 올린 PR 세 건의 문체를 참고하세요: [#64874](https://github.com/nodejs/node/pull/64874), [#64814](https://github.com/nodejs/node/pull/64814), [#64731](https://github.com/nodejs/node/pull/64731). 본문에 "무엇이 어떻게 동작하는데 왜 바꾸는지"를 코드 근거와 함께 적는 방식입니다.
- 문서 린트: `make lint-md`. C++ 수정이면 `make lint-cpp`, 테스트는 `python3 tools/test.py ffi`.
- FFI 관련 CODEOWNERS가 있으므로 리뷰는 `@nodejs/ffi` 팀이 봅니다.

## 8. 같이 옮겨야 할 파일

- `ffi-doc-audit.md` (문서 대조 전체 결과, 약 30건)
- 이 파일 `ffi-handoff.md`
