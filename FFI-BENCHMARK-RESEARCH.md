# `node:ffi` 벤치마크 리서치 노트

`benchmark/ffi`와 `node:ffi` 호출 경로를 읽고 정리한 결과. 다음 세션에서 이어서
작업하기 위한 트래킹 문서다. 기준 커밋: `0618e9f0` (`v8: report minor mark-sweep
in GCProfiler`).

> **상태 요약**
> - 아래 항목을 구현한 WIP 코드가 `claude/nodejs-ffi-benchmark-2935ui` 브랜치에
>   한 커밋(`ffi: WIP benchmark overhaul and call-path optimizations`)으로 올라가
>   있다. **아직 빌드/테스트/측정을 하지 못했다.** (컨테이너가 4코어라 빌드가
>   끝나기 전에 세션을 정리했다.)
> - lint(`eslint`, `cpplint`)는 통과한 상태.

---

## 1. 실행 자체가 깨지는 문제 (버그)

### 1-1. `require('node:ffi')`가 모듈 최상위에 있어서 러너로 실행이 안 됨

- `benchmark/run.js`, `benchmark/compare.js`는 벤치마크 파일을 플래그 없이
  `fork()`한다. `createBenchmark(..., { flags: ['--experimental-ffi'] })`의 플래그는
  그 안에서 **다시 fork되는 손자 프로세스**에만 적용된다.
- `ffi`는 `lib/internal/bootstrap/realm.js`의 `experimentalModuleList`에 있어서
  `--experimental-ffi` 없이는 `canBeRequiredByUsersList`에 들어가지 않는다
  (`lib/internal/process/pre_execution.js` `setupFFI()`가 플래그가 있을 때만
  `allowRequireByUsers('ffi')` 호출).
- 결과: `node benchmark/run.js ffi`는 부모 프로세스에서
  `ERR_UNKNOWN_BUILTIN_MODULE`로 죽는다. `node --experimental-ffi benchmark/run.js ffi`
  처럼 부모에 플래그를 주면 `execArgv` 상속으로 우연히 동작할 뿐이다.
- 저장소 관례: `--expose-internals`가 필요한 벤치마크는 `main()` 안에서 require
  (`benchmark/util/priority-queue.js` 참고).
- **수정(WIP)**: 모든 파일에서 `require('node:ffi')`와 `dlopen`을 `main()` 안으로
  이동.

### 1-2. `benchmark/ffi/common.js`가 벤치마크로 취급됨

- `benchmark/_cli.js`는 `_` 또는 `.`으로 시작하는 파일만 제외한다.
- `common.js`는 출력 없이 종료하므로 `run.js`에서는 조용히 넘어가지만,
  `test/common/benchmark.js`의 파서는 각 블록의 두 번째 줄(`lines[1]`)을 읽어서
  스모크 테스트가 생기는 순간 터진다.
- **수정(WIP)**: `_common.js`로 이름 변경 (`benchmark/http/_chunky_http_client.js`
  와 같은 관례).

### 1-3. `test/benchmark/test-benchmark-ffi.js`가 없음

- 다른 카테고리는 전부 스모크 테스트가 있다.
- **수정(WIP)**: `common.hasFFI`가 false이거나 fixture `.so`가 없으면 skip하는
  테스트 추가. `test-benchmark-napi.js`가 참고본.

### 1-4. 빌드 안내 메시지 오류 / `make bench` 의존성 누락

- `common.js`의 에러 메시지는 `tools/test.py test/ffi/test-ffi-calls.js`로 빌드하라고
  하는데 `test.py`는 fixture를 빌드하지 않는다. 올바른 타깃은
  `make build-ffi-tests` (`test/ffi/ffi-test-common.js`는 이미 그렇게 안내).
- `bench-addons-build`는 napi 애드온만 빌드한다.
- **수정(WIP)**: 메시지 수정, `Makefile`의 `bench-addons-build`에
  `test/ffi/.buildstamp` 추가.

---

## 2. 측정 범위의 공백

### 2-1. 같은 파일이 플랫폼마다 다른 경로를 측정함

`src/ffi/types.cc` `IsFastCallEligible()`의 레지스터 상한 때문에 Fast API를
타는 정수 인자 개수가 플랫폼마다 다르다.

| 플랫폼 | Fast API 정수/포인터 인자 상한 | 6개 (`many-args.js`) | 8개 (`sum-8-i32.js`) |
|---|---|---|---|
| x86-64 SysV | 6 | Fast API | shared-buffer |
| AArch64 | 7 | Fast API | shared-buffer |
| Win64 | 3 (인자 총 3개) | shared-buffer | shared-buffer |

- 경로 선택 순서 (`src/node_ffi.cc` `CreateFunction`):
  `CreateFastFFIMetadata` 성공 → Fast API; 아니면 `IsSBEligibleSignature` →
  shared-buffer(`lib/internal/ffi-shared-buffer.js`); 아니면 generic libffi
  (`InvokeFunction`).
- x86-64/arm64에서 generic libffi 경로에 도달하는 시그니처는 사실상 없다
  (인자 0개 + JIT 불가 환경, 혹은 struct 등 미지원 타입). 9개 이상 인자도 SB로
  간다.
- 포인터 인자가 섞인 SB 래퍼 분기(`anyPointer`)는 fixture에 해당 시그니처
  (포인터 + 7개 이상 정수)가 없어서 **fixture 함수 추가가 필요**하다. 미착수.
- **수정(WIP)**: `sum-i32.js` (`args: [1..8]`), `void-args.js`
  (`args: [1,2,3,4,5,6,8]`), `get-function.js` (`args: [2, 8]`)로 경계를 명시적으로
  파라미터화하고 주석으로 경로를 설명.

### 2-2. `string` 인자 벤치마크가 캐시 히트만 측정

- `lib/internal/ffi/fast-api.js` `getStringConversionPointer()`는
  `entry.string === value`(동일성)로 캐시하므로 같은 리터럴을 반복 전달하면
  첫 호출 이후 UTF-8 인코딩이 일어나지 않는다.
- **수정(WIP)**: `string-length-string-rotating.js` (`len: [8,64,1024]`,
  `unique: [1, 8]`).

### 2-3. 벤치마크가 아예 없던 API

| 영역 | 이유 | WIP 파일 |
|---|---|---|
| 콜백 | `registerCallback` → libffi closure → JS 재진입. 가장 무거운 경로 | `callback-invoke.js`, `callback-batch.js`, `callback-register.js` |
| 메모리 헬퍼 | `get*/set*`, `toString`, `toBuffer/toArrayBuffer(copy)`, `exportString`, `getRawPointer` 전부 일반 C++ 바인딩 | `memory-get-set.js`, `memory-to-string.js`, `memory-to-buffer.js`, `memory-export-string.js`, `get-raw-pointer.js` |
| 셋업 비용 | `dlopen`+`getFunctions`는 함수마다 트램폴린 JIT + `CFunctionInfo` 생성 | `dlopen.js` (`functions: [1,8,32]`), `get-function.js` |
| 스칼라 누락 | fixture에 `add_u32`가 있는데 벤치마크 없음, 인자 있는 void, 혼합 타입 | `add-u32.js`, `void-args.js`, `mixed-args.js` |

### 2-4. 기타

- 루프 뒤 반환값 검증이 하나도 없었다. WIP에서는 `bench.start()` 전에 한 번
  호출해 `assert.strictEqual`로 검증 (타이밍에 영향 없음).
- 각 벤치마크가 함수 하나만 정의하고 `dlopen`하면 V8이 arity별 공용 래퍼
  클로저를 단일 클로저로 보고 context specialization을 적용해 수치가 과도하게
  낙관적일 수 있다(one-closure-cell). WIP `_common.js`는 fixture 전체 정의로
  열도록 바꿨다(실제 앱과 유사). **이 가정은 측정으로 확인 필요.**

---

## 3. 중복/정리

- `add-64.js`는 `add-f64.js`와 상수만 다른 중복 → 삭제(WIP).
- `string-length-buffer-direct.js`와 `string-length-string-direct.js`는 바이트
  단위 동일 → 후자 삭제(WIP).
- `identity-i32`, `sum-3/5/8-i32`, `many-args` → `sum-i32.js`로 통합(WIP).
- `*-direct.js`(pointer+bigint) / `*-buffer.js`(buffer 타입) 12개 파일은
  `type: ['pointer','buffer','string']` 파라미터로 서너 파일로 합칠 수 있다.
  **churn을 줄이기 위해 WIP에서는 손대지 않음** (업스트림 PR 크기 고려).

---

## 4. 성능 개선 후보 (코드 근거)

### 4-1. [WIP 구현] `InvokeFunction` / `InvokeFunctionSB`의 호출당 힙 할당

- `src/node_ffi.cc`: generic 경로는 호출마다 `std::vector` 3개 + `Malloc`(반환값)
  + `free`, SB 경로는 `std::vector` 2개를 할당한다.
- 모든 지원 반환 타입은 8바이트 이하, libffi는 작은 정수를 `ffi_arg`로 승격 →
  `max(sizeof(ffi_arg), 8)` 스택 버퍼로 충분.
- **WIP**: `MaybeStackBuffer<uint64_t, 16>` / `MaybeStackBuffer<void*, 16>` +
  스택 결과 버퍼로 교체. `strings` 벡터는 string 인자가 있을 때만 lazy reserve.
- 기대 효과: x86-64에서 SB를 타는 7개 이상 정수 인자 호출, 그리고 JIT 불가
  환경(hardened macOS, SELinux execmem 등)의 모든 호출.

### 4-2. [WIP 구현] `fast-api.js` 래퍼의 호출당 타입 분류

- 기존 `convertFastArg()`는 매 호출마다 `needsPointerConversion(type, rawFn)` 등
  문자열 비교와 `rawFn[kFastBuffer]` 프로퍼티 로드를 반복한다. 시그니처별로
  정적인 정보다.
- 더 큰 문제: pointer 계열 인자에 **BigInt**를 넘겨도
  `hasPointerMemoryArg()`가 `isArrayBufferView(value) || isAnyArrayBuffer(value)`를
  평가하는데, `isAnyArrayBuffer`는 `internalBinding('types')`의 **C++ 호출**이다.
  즉 `*-direct.js` 벤치마크와 실사용 raw pointer 호출 모두 매번 불필요한 바인딩
  호출을 한다. 1인자 래퍼(`memory0 && (...)`)도 동일.
- 4개 이상 인자에 변환이 필요한 시그니처는 rest 파라미터 + `ReflectApply`로
  호출한다. 배열을 수정한 뒤 apply하면 TurboFan이 직접 호출로 환원하지 못해
  Fast API 진입점을 못 쓸 가능성이 크다(예: `fn(pointer, u64, u32, i8)`).
- **WIP**: 인자별 plan 객체(`intInfo/stringy/rawConv`)를 래퍼 생성 시 1회 계산,
  `typeof value === 'bigint'`를 먼저 검사해 바인딩 호출 회피, 4~6 인자 고정 arity
  래퍼 추가. 공개 export에서 `convertPointerArg/hasPointerMemoryArg/hasStringPointerArg`
  제거(다른 사용처 없음).
- 검증 필요: `test/ffi/test-ffi-fast-buffer.js`, `test-ffi-fast-integer-validation.js`,
  `test-ffi-calls.js`(reentrant string), `test-ffi-void-parameter.js`.

### 4-3. [WIP 구현] 메모리 헬퍼 `get*/set*`의 V8 Fast API 진입점

- `src/ffi/data.cc`의 `GetValue<T>/SetValue<T>`는 `SetMethod`로만 등록된 일반
  `FunctionCallback`. 매 호출 `Environment::GetCurrent`, 권한 체크, BigInt 검증,
  `Integer::New`/`BigInt::New` 박싱.
- **WIP 설계**
  - `FastGetValue<T>(receiver, uint64_t pointer, double offset, options)` →
    8/16/32비트는 `int32_t`/`uint32_t`로, 64비트는 BigInt(`Int64Representation::kBigInt`),
    float/double 그대로 반환.
  - `FastSetValue<T>(receiver, uint64_t pointer, double offset, V value, options)`:
    정수는 `double`로 받아 slow path와 같은 조건/메시지로 검증, 64비트는 BigInt.
  - `SetFastMethod(context, target, "getInt32", GetInt32, &fast_get_int32)` 형태로
    등록 (`FFI_MEMORY_HELPER_TYPES(V)` 매크로, `src/ffi/data.h`).
  - **BigInt 인자는 fast path에 64비트로 잘려서(truncating) 도달**하므로 음수/2^64
    초과 포인터, 범위 밖 int64/uint64 값은 `lib/ffi.js` 래퍼에서 미리 던진다
    (`checkPointerArg`, `wrapMemorySetter64`). 그렇지 않으면 최적화 여부에 따라
    동작이 달라진다. offset 기본값 `0`도 JS 래퍼에서 처리(undefined는 fast path
    불가).
  - 권한 모델: fast path에서 `Environment::GetCurrent(options.isolate)` 후
    `THROW_IF_INSUFFICIENT_PERMISSIONS` 그대로 사용.
- 테스트: `test/ffi/test-ffi-fast-memory.js` (`%OptimizeFunctionOnNextCall` 후
  값/에러 메시지 동일성 검증).
- **검토 필요 사항**
  - fast callback 안에서 `Environment::GetCurrent(isolate)`(=`GetCurrentContext`)
    사용이 안전한지. 다른 Node fast 함수는 대부분 receiver/BaseObject로 env를
    얻는다. 문제가 되면 `options.data`에 external을 싣거나 receiver에서 얻는
    방식으로 변경.
  - `CFunction::Make(&FastGetValue<int8_t>, kBigInt)` 템플릿 인스턴스 주소
    전달이 컴파일되는지.
  - `Int64Representation::kBigInt`일 때 `double` 파라미터는 영향 없음(확인됨,
    fast.cc 참고).
  - 권한 거부 + 잘못된 포인터를 동시에 넘길 때 에러 순서가 slow path와 다름
    (JS 가드가 먼저). 의미 있는 차이는 아니지만 리뷰에서 언급될 수 있음.

### 4-4. 미착수 아이디어

- `getRawPointer`: `GetBackingStore()`(shared_ptr 원자 refcount) 대신
  `view->Buffer()->Data()`로 충분할 수 있음 (`src/ffi/fast.cc` `PointerFromValue`가
  이미 그렇게 함). Fast API 진입점(BigInt 반환)도 가능.
- 2개 이상 인자 시그니처에서 `pointer` 타입에 Buffer를 넘기면 JS에서
  `getRawPointer`(C++ 호출 + BigInt 할당)를 매번 한다. `buffer` 타입으로 선언하면
  네이티브 `kBuffer` 경로를 탄다. 문서에 가이드로 적을 가치 있음. 또는 다중
  인자 시그니처에도 buffer-aware 보조 CFunction을 만드는 방안.
- 콜백 `InvokeCallback`: `LocalVector` 할당, `Local<Function>::New`, `TryCatch`
  매 호출. 측정 후 판단.
- shared-buffer 래퍼(`ffi-shared-buffer.js`)는 이미 튜닝돼 있어 추가 여지는 작아
  보임.

---

## 5. 다음 세션에서 할 일

1. 빌드 (4코어 컨테이너 기준 2~3시간):
   ```sh
   ./configure --ninja && ninja -C out/Release -j$(nproc) node
   make build-ffi-tests
   ```
2. 테스트:
   ```sh
   python3 tools/test.py --mode=release ffi
   python3 tools/test.py --mode=release benchmark/test-benchmark-ffi
   ```
3. 베이스라인 바이너리 확보: WIP 커밋의 `src/`, `lib/` 변경만 잠시 stash 하고
   증분 빌드 → `out/Release/node`를 `node-base`로 복사 → stash pop → 다시 빌드.
4. 비교:
   ```sh
   node benchmark/compare.js --old ./node-base --new ./out/Release/node \
     --filter sum-i32 --filter pointer --filter buffer-sum --filter memory-get-set ffi \
     | Rscript benchmark/compare.R
   ```
   특히 확인할 것: `sum-i32 args=7,8`(4-1), `*-direct`/`pointer-bigint`(4-2),
   `memory-get-set`(4-3), `string-length-string-rotating unique=8`(회귀 없는지).
5. 결과에 따라 WIP 커밋을 목적별로 분리해서 PR:
   - benchmark 정비 (1, 2, 3장)
   - `InvokeFunction`/`InvokeFunctionSB` 스택 스토리지 (4-1)
   - `fast-api.js` 래퍼 (4-2)
   - 메모리 헬퍼 Fast API (4-3)
6. 4-3의 "검토 필요 사항"을 빌드 결과로 확인. `Environment::GetCurrent(isolate)`가
   문제면 설계 변경.

## 6. 참고한 파일

- `benchmark/run.js`, `benchmark/_cli.js`, `benchmark/common.js`, `test/common/benchmark.js`
- `lib/ffi.js`, `lib/internal/ffi/fast-api.js`, `lib/internal/ffi-shared-buffer.js`
- `lib/internal/bootstrap/realm.js`, `lib/internal/process/pre_execution.js`
- `src/node_ffi.cc`, `src/ffi/fast.cc`, `src/ffi/types.cc`, `src/ffi/data.cc`
- `test/ffi/fixture_library/ffi_test_library.c`, `test/ffi/ffi-test-common.js`
- `deps/v8/include/v8-fast-api-calls.h` (`Int64Representation`, `FastApiCallbackOptions`)
