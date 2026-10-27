# e2e 스모크 테스트

실제 HyperFrames 로 렌더해 확인한다 (약 1분). `npm test` 에서는 건너뛴다.

1. 무대 `st1`(픽스처 `test/fixtures/e2e/st1.html`)에 근거 없는 ② 효과 표 → `make.mjs --check` 가 게이트로 실패
2. 효과 표를 ③ 사용자 지정 + brief "효과 지정" 으로 고침 → `make.mjs --draft` 성공
3. `hyperframes snapshot` 을 시각 순서만 바꿔 두 번 → 같은 시각 PNG 바이트가 같음
4. v1 프로젝트(`test/fixtures/e2e/v1-project/`, 효과 표 없음·dom 장면 3개) → `new.mjs` 로 라이브러리 갱신 후 게이트 통과·`make.mjs --draft` 성공

프로젝트는 임시 폴더의 `모션 테스트 1/` (한글·공백 경로)에 만든다.

## 실행

먼저 setup 을 끝낸다 (`node harness/tools/setup.mjs`). 설치 폴더를 따로 쓰면 `MH_DATA` 로 지정한다.

```bash
MH2_E2E=1 node --test "test/e2e/*.test.mjs"
MH2_E2E=1 MH_DATA=/경로/mh2data node --test "test/e2e/*.test.mjs"
```

Windows PowerShell:

```powershell
$env:MH2_E2E="1"; node --test "test/e2e/*.test.mjs"
```

- `MH2_E2E_KEEP=1` 이면 임시 폴더를 지우지 않는다 (렌더 결과 `out/draft.mp4` 를 직접 볼 때).
- 렌더용 Chrome 을 내려받을 수 없는 환경(컨테이너·사내망)은 이미 있는 Chrome(headless shell) 경로를 `HYPERFRAMES_BROWSER_PATH` 에 넣는다. playwright Chromium 이 없을 때도 이 경로를 대신 쓴다 (항상 다른 브라우저를 쓰려면 `MH_CHROMIUM`).
- `node --test test/e2e/` 처럼 폴더만 주면 Node 22 에서 실패한다 — 위처럼 따옴표 친 glob 을 쓴다.
