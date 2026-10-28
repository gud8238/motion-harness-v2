---
name: mv-plan
description: 'motion-harness2(v2) 계획 단계 — 레퍼런스 영상(mp4·프롬프트·라이브러리 스타일)과 이미지로 모션그래픽 영상을 만들 때 레퍼런스 측정·해독, 소스 해부(움직임 단위·재구성), 스타일 DNA·효과·동작 표, 장면 코드, 애니메틱 채점 루프까지 하고 검토를 요청한다. "모션그래픽 만들어줘", "이 레퍼런스처럼 영상 만들어줘" 같은 요청이 v2 프로젝트(brief.md 맨 위 harness: v2)이거나 v2 를 언급할 때 사용.'
argument-hint: "[하위폴더이름] [바로 만들어]"
---

기준 문서 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md` (이 대화에서 아직 안 읽었으면 처음부터 끝까지 읽는다) · 형식 예시 `${CLAUDE_PLUGIN_ROOT}/harness/PLAN-example.md`
**프로젝트 `P`**: 인자에 지금 폴더 아래 하위 폴더 이름이 있으면 그 이름, 없으면 `.`(Claude Code 로 연 폴더 자체). 아래 모든 도구에 `P` 를 넘긴다.
**원칙**: GUIDE 1절 품질 우선 — 6절 합격선(핵심 5개 항목 5점, 나머지 4.5 이상, 기준선이 있으면 항목마다 +1)을 넘을 때까지 만든다. 필요한 문서·이미지·모듈 문서는 얼마든지 열고, 토큰·시간을 아끼려고 단계를 줄이지 않는다.

0. **항상 먼저** `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/new.mjs" <P>` — 여러 번 실행해도 안전하다. 빠진 폴더·scene·brief 를 만들고 source/ → scene/assets/source 를 동기화한다. 대화·brief 에 화면 비율(9:16 등)이 있고 출력의 화면 크기와 다르면 `--size` 를 붙여 다시 실행한다(장면을 만들기 전에만 바뀐다). ref/ 가 비어 있고 대화에도 레퍼런스가 없으면 `/motion-harness2:mv-refs` 를 안내하고 멈춘다.

GUIDE 의 **2. 순서 1~6** 을 이 순서로 수행한다: **측정·해독 → 근거표 확정 → 소스 해부 → DNA + 효과 표 → 동작·연기·전환 표 → 장면 → 애니메틱 채점 루프 → 검토 요청**.
- **측정·해독 (2)**: `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/analyze-ref.mjs" <P> ref/<파일>` → `analysis.md`·`card.png`·`sheet.jpg`·`motion_N.png`·`evidence.png`(쪽마다)를 모두 본다. 매체·주인공과 연기 어휘·장면을 잇는 방식·움직임 성격·**좋은 이유 5가지**를 PLAN 에 적는다.
- **근거표 확정 (2.2)**: 후보마다 확정·기각. 확정한 것은 analysis.md 후보 줄의 `→ 근거 칸:` 문구를 효과 표에 그대로 붙인다. 감지가 놓친 효과(형태 변형·매치컷 포함)는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/analyze-ref.mjs" strip <P> ref/<파일> <시작초> <끝초>` 가 근거 이미지와 근거 칸을 준다. 근거 이미지가 없는 ② 효과는 쓰지 않는다.
- **소스 해부 (2.5)**: `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/assets.mjs" sheet <P>` → sources.png 와 필요하면 개별 소스를 열어, 소스마다 종류·움직임 단위·재구성 방식을 **소스 해부 표**에 적는다. 레퍼런스 매체로 다시 만드는 것이 기본이고, 사진 그대로는 예외 사유(실사 매체·실물 공개·레이어 분리)가 있을 때만. 캐릭터면 판정 한 줄(코드 캐릭터 / 파츠 시트) — 파츠 시트면 `${CLAUDE_PLUGIN_ROOT}/harness/modules/rig2d.md` 의 프롬프트를 채워 요청에 넣는다. 소스·코드로 만들 수 없는 핵심 이미지만 `work/assets.json` → `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/assets.mjs" request <P>` → `work/ASSETS.md`, 채팅에는 표(파일 이름·역할·장면·필수)와 ASSETS.md 경로만 보이고 AskUserQuestion(`이미지 추가 완료` / `일부만 넣고 진행` / `이미지 없이 진행`)으로 멈춘다. 답이 오면 `assets.mjs check <P>` 와 `new.mjs <P>` 후 새 이미지만 확인하고 계속. 필요한 이미지가 없으면 한 줄로 알리고 계속.
- **DNA + 효과 표 (3)**: DNA 5번에 ① 강도 숫자(ant·over·settle·hold·squash → `window.DNA.motion`). 효과 표에 ② 는 근거 칸, ③ 은 `사용자 지정`(brief "효과 지정"에 있는 것만). `lens.mblur` 를 넣으면 렌더 시간 약 4배를 검토 요청에 적는다.
- **동작·연기·전환 표 (3)**: 브리프 "전달할 내용"의 동사마다 동작 표 한 행(주체가 직접 하는 동작 — 라벨·자막만은 오류), 레퍼런스 연기 → 우리 피사체의 연기 표, 장면 경계마다 이어주는 요소의 전환 표. `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/plan-check.mjs" <P>` 오류 0 까지.
- **장면 (4)**: 효과 표에 `cam.onetake`·`trans.shared` 가 확정됐으면 `stage`(`${CLAUDE_PLUGIN_ROOT}/harness/modules/stage.md`), 아니면 dom·canvas·three. 켜진 ② 모듈과 쓰는 장면 종류의 `${CLAUDE_PLUGIN_ROOT}/harness/modules/<이름>.md` 를 읽는다(연기할 대상이 있으면 `rig2d.md` 도). `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/scene.mjs" add <P> <id> <dom|canvas|three|stage> --dur … --title … --note …` → `scene/compositions/<id>.html`. 해부한 부품은 함수·관절 리그로 만들어 `scene/assets/` 공용 스크립트에서 장면끼리 공유한다. DNA 는 `scene/index.html` 의 `window.DNA`·CSS 변수에.
- **애니메틱 채점 루프 (2절 5)**: `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/board.mjs" <P>` + 장면마다 `board.mjs <P> --strip <id> --n 8` + `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/make.mjs" <P> --draft`. 레퍼런스 card.png·motion strip 과 나란히 보고, 동작 표의 행마다 그 동작이 strip 에 보이는지 확인한 뒤 GUIDE 6절 채점표를 `work/review/round-N.md` 에 쓴다. 미달 항목만 고쳐 다시, 최대 3회. `plan-check.mjs <P> --review` 로 합격선 확인.
- 인자나 대화에 "바로 만들어/검토 없이"가 있으면 사용자 검토만 건너뛰고(채점 루프는 그대로) `/motion-harness2:mv-make` 절차로 이어간다. 아니면 검토 요청(최신 채점표 · DNA 반영률 · 효과 표 · 시그니처→장면 · 동작 표 · 장면 표 · storyboard·strip·draft 경로 · 자신 없는 점)을 보내고 멈춘다. 이 단계에서 최종 렌더(`--draft` 없는 make.mjs)는 실행하지 않는다.
