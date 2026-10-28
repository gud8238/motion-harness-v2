---
name: mv-make
description: 계획·검토가 끝난 모션그래픽 프로젝트를 렌더·검수해 납품한다. 수정 요청도 처리한다.
argument-hint: "[하위폴더이름] [수정 요청]"
disable-model-invocation: true
---

기준 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md` (2. 순서 7~8, 5. 사운드, 7. 검수)
**프로젝트 `P`**: 첫 인자가 지금 폴더 아래 하위 폴더 이름이면 그 이름(나머지는 수정 요청), 아니면 `.`(지금 연 폴더 자체) — 인자 전체가 수정 요청이다.
1. `<P>/work/PLAN.md` 와 `scene/compositions/` 가 없으면 `/motion-harness2:mv-plan` 이 먼저라고 알리고 멈춘다.
2. 수정 요청이 있으면 그 부분만 고친다. 처음이면 `work/sound.json` 을 PLAN 의 효과음 열로 작성(내레이션이 있으면 tts→`scene.mjs captions`). 효과 표에 `lens.mblur` 행이 있으면 렌더 시간이 약 4배라고 먼저 한 줄 알린다.
3. `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/make.mjs" <P>` (오래 걸리면 timeout 600000). 검사 오류가 나오면 고쳐서 재실행.
   - **게이트 위반**(✖ 효과 id — 파일:줄)이면: 레퍼런스에 근거가 있으면 analysis.md 의 `→ 근거 칸:` 문구나 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/analyze-ref.mjs" strip <P> ref/<파일> <시작초> <끝초>` 로 효과 표 근거를 채우고, 없으면 장면에서 그 효과 호출을 지운다(사용자가 원한다고 한 효과만 brief "효과 지정" + ③ 행). 고친 뒤 재실행.
4. `work/qc.jpg` 와 `work/qc-motion.png` 각 한 장과 리포트(모션 검수 ✔/✗/⚠ 포함)를 보고, 문제가 있으면 **한 번** 고쳐 재실행.
5. 납품 메시지(짧게): `out/<폴더이름>.mp4` 경로, 길이·해상도, 반영한 DNA 한 줄, LUFS·문제 구간, 모션 검수 한 줄(예: "효과 3개 중 ✔2 ✗1 — trans.fill 이 계획보다 0.5초 늦음"), 직접 들어볼 것, 약점 1개. 편집을 더 하고 싶으면 `npx hyperframes preview`(scene 폴더)로 HyperFrames 미리보기·편집기를 열 수 있다고 한 줄.
