# `doc/api/ffi.md` 문서와 구현 대조 결과

- 대상 문서: `doc/api/ffi.md` (772줄 전체)
- 대상 저장소: `nodejs/node` main, `ad7a5b8302a` (2026-08-16 pull 기준)
- 대조한 구현: `lib/ffi.js`, `lib/internal/ffi/fast-api.js`, `lib/internal/ffi-shared-buffer.js`, `src/node_ffi.cc`, `src/ffi/{types,data,fast,jit_memory}.cc`, `test/ffi/**`
- 방법: 문서를 4구역으로 나눠 sub-agent 4개가 병렬 대조, 주요 항목은 코드로 재확인
- 작성일: 2026-08-16

## A. 문서가 코드와 정면으로 다른 것

| # | 문서 | 실제 코드 |
|---|---|---|
| 1 | `ffi.md:129-135` fast call 인자 최대 8개, 정수/포인터는 AArch64 7개, x86-64 6개 | Win64 x64는 인자 **3개**가 한도이고 `buffer` 인자는 fast path 불가 (`src/ffi/types.cc:329-346`). 재확인함 |
| 2 | `ffi.md:124` fast call에서 `function` 파라미터가 raw pointer bigint를 받는다 | `function`은 인자든 반환이든 fast path에서 무조건 제외 (`src/ffi/types.cc:295-298`, `254-257`). 해당 상황 자체가 발생하지 않음 |
| 3 | `ffi.md:64` 타입 목록에 `void` 포함, `arguments` 제약 서술 없음 | 인자로 `void`를 쓰면 `ERR_INVALID_ARG_VALUE` (`src/ffi/types.cc:167`). 반환 전용. 재확인함 |
| 4 | `ffi.md:536-537` setter는 값을 대상 네이티브 타입에 대해 검증한 뒤 기록 | `setFloat32/64`는 검증 없이 `ToNumber` 코어싱 (`src/ffi/data.cc:400-411`). `'1.5'`는 통과, `{}`는 NaN 기록. 정수 계열만 검증. 재확인함 |
| 5 | `ffi.md:551-554` 이 API들은 ownership, bounds, lifetime을 추적하지 않는다 | null 포인터는 `ERR_FFI_INVALID_POINTER`, 포인터+오프셋+크기가 주소 공간을 넘으면 `ERR_INVALID_ARG_VALUE` (`src/ffi/data.cc:173-176`, `214-217`, `127-145`) |
| 6 | `ffi.md:748-749` 모듈은 네이티브 객체 수명을 추적하지 않는다 | `close()`가 모든 함수 래퍼를 무효화하고 콜백을 소유 해제하며, 함수가 살아 있으면 라이브러리도 유지됨 (`src/node_ffi.cc:97-119`, `229`). 추적되지 않는 것은 raw bigint 포인터뿐 |
| 7 | `ffi.md:248`, `262` `ffi.dlclose(handle)`는 `handle.close()`와, `ffi.dlsym`은 `handle.getSymbol()`과 동등 | 함수형만 `checkFFIPermission()`을 통과해야 함 (`lib/ffi.js:222-230`). `--permission` 상태에서 `lib.close()`는 성공하고 `ffi.dlclose(lib)`은 `ERR_ACCESS_DENIED`. 재확인함 |
| 8 | `ffi.md:193` `definitions` 생략 시 `functions`는 심볼이 명시적으로 해석될 때까지 빈 객체 | `ObjectFreeze`된 빈 객체라 이후에도 채워지지 않음 (`lib/ffi.js:210`). 나중 해석분은 `lib.functions` getter로만 노출. 재확인함 |
| 9 | `ffi.md:293-303` `library.functions`/`symbols`를 일반 데이터 프로퍼티처럼 기술 | read-only accessor이고 close 후에는 읽기만 해도 `ERR_FFI_LIBRARY_CLOSED`, 매 접근마다 새 null-prototype 객체 생성 (`src/node_ffi.cc:1246-1260`, `813-821`) |
| 10 | `ffi.md:669-674` 등 `export*`의 `length`가 기록 대상 크기인 것처럼 서술 | `memcpy`는 원본 길이만 복사하고 `length`는 하한 검사용 (`src/ffi/data.cc:709`, `730`). 남는 구간은 0으로 채워지지 않음. 재확인함 |
| 11 | `ffi.md:493-494` string 인자는 NUL 종료 UTF-8로 복사된다 | 문자열에 `\0`이 있으면 `ERR_INVALID_ARG_VALUE`로 거부 (`src/node_ffi.cc:582-584`) |
| 12 | `ffi.md:459-479` `refCallback`/`unrefCallback`은 `ERR_INVALID_ARG_VALUE`만 언급 | 비-bigint 인자는 `ERR_INVALID_ARG_TYPE` (`src/node_ffi.cc:1156-1158`), 미등록 포인터는 `ERR_INVALID_ARG_VALUE`로 갈라짐 |
| 13 | `ffi.md:287-291` `library.path`는 로드에 사용한 경로 | `null`로 연 경우 `''`가 반환됨 (`src/node_ffi.cc:511-521`, `753-763`) |

## B. 문서에 빠진 동작

- 인자 개수가 다르면 세 호출 경로 모두 `ERR_INVALID_ARG_VALUE`로 throw합니다. 문서에 arity 언급이 없습니다.
- `offset`은 Number 전용이라 `getInt32(ptr, 4n)`은 throw합니다 (`src/ffi/data.cc:40-61`). 재확인함
- `ERR_ACCESS_DENIED`와 `ERR_FFI_LIBRARY_CLOSED`가 `ffi.md`에 한 번도 등장하지 않습니다. 문서가 언급하는 에러 코드는 464줄과 478줄의 `ERR_INVALID_ARG_VALUE` 두 번뿐입니다.
- `copy`는 `{boolean}`으로 문서화됐지만 `BooleanValue` 코어싱이라 `0`, `''`, `null`이 조용히 zero-copy view를 만듭니다 (`src/ffi/data.cc:586`, `649`). 메모리 안전성이 갈리는 분기입니다. 재확인함
- `toBuffer`/`toArrayBuffer`는 포인터가 `0n`이고 길이가 0보다 크면 throw합니다. `toString(0n)`이 `null`을 반환하는 것과 비대칭입니다.
- `getRawPointer`는 뷰의 `byteOffset`을 더한 주소를 반환하므로 `getRawPointer(u8)`과 `getRawPointer(u8.buffer)`가 다릅니다. detached 버퍼는 나중에 무효화되는 것이 아니라 즉시 throw합니다.
- 반환 타입 변환: `return: 'string'`은 문자열이 아니라 bigint 주소, `bool`은 number, `void`는 `undefined`입니다.
- 콜백 4종 모두 close 이후 호출하면 `ERR_FFI_LIBRARY_CLOSED`이고, `unregisterCallback`은 미등록 포인터에도 throw합니다.
- `ffi.md:366`의 "같은 시그니처로 다시 요청하면 같은 함수를 반환한다"는 weak 캐시라서 GC 이후에는 성립하지 않습니다 (`src/node_ffi.cc:274-280`).
- fast path 지원 아키텍처에 ppc64le, loongarch64, riscv64, s390x가 더 있고 각자 한도가 다릅니다. `buffer` 인자가 있으면 GP 레지스터 한도가 줄고 float 인자와 함께 쓸 수 없습니다.
- `dlopen`은 정의 해석에 실패하면 라이브러리를 닫고 에러를 다시 던집니다.
- `getFunctions()`의 에러 동작(닫힌 라이브러리, 비객체 인자)과 시그니처 충돌 시 던지는 코드가 문서에 없습니다.
- `ffi.dlclose`/`ffi.dlsym`은 `handle`에 대한 타입 검사를 하지 않아 덕 타이핑 객체도 받습니다.

## C. 문서가 아니라 구현 쪽 의심 사항

`SharedArrayBuffer` 인자는 fast path에서는 받아들여지고(`lib/internal/ffi/fast-api.js:131-134`, `src/ffi/fast.cc:139-143`) 일반 libffi 경로에서는 `ERR_INVALID_ARG_VALUE`로 거부됩니다(`src/ffi/types.cc:690-763`). 같은 코드가 시그니처와 플랫폼에 따라 성공하기도 실패하기도 합니다. 서로 다른 두 agent가 독립적으로 같은 결론에 도달했습니다. 문서 수정보다 동작을 어느 쪽으로 통일할지 정하는 문제로 보입니다.

## 코드와 일치한 부분

타입 이름 표와 `ffi.types` 상수, `ffi.suffix`, 빌드 지원 플랫폼 목록, 시그니처 객체 구조, `new DynamicLibrary(path)`, `close()` 멱등성과 `Symbol.dispose` 동일성, `registerCallback` 오버로드와 콜백 제약, getter 반환 폭(32비트 이하 number, 64비트 bigint), 64비트 setter 규칙, `toString`, `getCurrentEventLoop`, copy와 view 의미론, 권한 게이팅 범위, `get*`/`set*` 20개 이름과 인자 순서는 모두 코드와 일치합니다.
