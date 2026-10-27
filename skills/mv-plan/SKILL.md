---
name: mv-plan
description: 'motion-harness2(v2) 계획 단계 — 레퍼런스 영상(mp4·프롬프트·라이브러리 스타일)과 이미지로 모션그래픽 영상을 만들 때 레퍼런스 측정·효과 근거표 확정, 소스 점검(캐릭터 판정 포함), 스타일 DNA·효과 표, 장면(원테이크 무대 포함) 코드, 스토리보드까지 하고 검토를 요청한다. "모션그래픽 만들어줘", "이 레퍼런스처럼 영상 만들어줘" 같은 요청이 v2 프로젝트(brief.md 맨 위 harness: v2)이거나 v2 를 언급할 때 사용.'
argument-hint: "[하위폴더이름] [바로 만들어]"
---

기준 문서 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md` (이 대화에서 아직 안 읽었으면 한 번 읽는다)
**프로젝트 `P`**: 인자에 지금 폴더 아래 하위 폴더 이름이 있으면 그 이름, 없으면 `.`(Claude Code 로 연 폴더 자체). 아래 모든 도구에 `P` 를 넘긴다.

0. **항상 먼저** `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/new.mjs" <P>` — 여러 번 실행해도 안전하다. 빠진 폴더·scene·brief 를 만들고 source/ → scene/assets/source 를 동기화한다(이미지를 나중에 넣었어도 스토리보드에 나오게). 대화·brief 에 화면 비율(9:16 등)이 있고 출력의 화면 크기와 다르면 `--size` 를 붙여 다시 실행한다(장면을 만들기 전에만 바뀐다). ref/ 가 비어 있고 대화에도 레퍼런스가 없으면 `/motion-harness2:mv-refs` 를 안내하고 멈춘다.

GUIDE 의 **2. 순서 1~6** 을 이 순서로 수행한다: **측정 → 근거표 확정 → 소스 점검 → DNA + 효과 표 → 장면/무대 선택 → 장면 → 스토리보드 → 검토 요청**.
- 가볍게: 레퍼런스는 `analysis.md` + `card.png` + `evidence.png`(쪽마다), 소스는 `sources.png`(`assets.mjs sheet`) 한 장씩. 모듈 문서는 효과 표에 켜진 것만. PLAN.md 하나, 스토리보드 1장. 질문은 처음 한 번.
- **측정·근거표 확정 (2·2.2)**: `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/analyze-ref.mjs" <P> ref/<파일>` → evidence.png 를 보고 후보마다 확정·기각. 확정한 것은 analysis.md 후보 줄의 `→ 근거 칸:` 문구를 효과 표에 그대로 붙인다. 감지가 놓친 효과는 `analyze-ref.mjs strip <P> ref/<파일> <시작초> <끝초>` 가 근거 이미지와 근거 칸을 준다. 근거 이미지가 없는 ② 효과는 쓰지 않는다.
- **소스 점검 (2.5)**: 레퍼런스 요소와 소스를 맞춰 보고, 코드로는 레퍼런스 느낌을 살리기 어려운 이미지만 `work/assets.json` → `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/assets.mjs" request <P>` → `work/ASSETS.md`. 캐릭터가 있으면 표에 판정 한 줄(코드 캐릭터 / 파츠 시트) — 파츠 시트면 `${CLAUDE_PLUGIN_ROOT}/harness/modules/rig2d.md` 의 프롬프트를 채워 요청에 넣는다. 채팅에는 표(파일 이름·역할·장면·필수)와 ASSETS.md 경로만 보이고 AskUserQuestion(`이미지 추가 완료` / `일부만 넣고 진행` / `이미지 없이 진행`)으로 멈춘다. 답이 오면 `assets.mjs check <P>` 와 `new.mjs <P>` 후 새 이미지만 확인하고 계속. 필요한 이미지가 없으면 한 줄로 알리고 계속.
- **DNA + 효과 표 (3)**: DNA 5번에 ① 강도 숫자(ant·over·settle·hold·squash → `window.DNA.motion`). 효과 표에 ② 는 근거 칸, ③ 은 `사용자 지정`(brief "효과 지정"에 있는 것만). `lens.mblur` 를 넣으면 렌더 시간 약 4배를 검토 요청에 적는다.
- **장면/무대 선택 (4)**: 효과 표에 `cam.onetake`·`trans.shared` 가 확정됐으면 `stage`(`${CLAUDE_PLUGIN_ROOT}/harness/modules/stage.md`), 아니면 dom·canvas·three. 켜진 ② 모듈의 `${CLAUDE_PLUGIN_ROOT}/harness/modules/<이름>.md` 만 읽는다(캐릭터가 있으면 `rig2d.md` 도).
- 장면은 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/scene.mjs" add <P> <id> <dom|canvas|three|stage> --dur … --title … --note …` → `scene/compositions/<id>.html` 작성. DNA 는 `scene/index.html` 의 `window.DNA`·CSS 변수에.
- `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/board.mjs" <P>` → storyboard.png(무대는 비트마다 한 칸)를 레퍼런스 card.png 와 나란히 보고 GUIDE 6절 **품질 기준**(밀도·동시 움직임·깊이·전환) 미달이면 보강, 한 번 고침.
- 인자나 대화에 "바로 만들어/검토 없이"가 있으면 검토를 건너뛰고 `/motion-harness2:mv-make` 절차로 이어간다. 아니면 검토 요청(DNA 반영률 · 효과 표 · 시그니처→장면 · 장면 표 · storyboard 경로 · 자신 없는 점 1개)을 보내고 멈춘다. 이 단계에서 make.mjs 는 실행하지 않는다.
