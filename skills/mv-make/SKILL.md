---
name: mv-make
description: '사용자 초안 승인 후 새 에이전트의 레퍼런스 비교 검수·수정·음악 믹스·최종 렌더와 납품.'
argument-hint: "[프로젝트 폴더]"
disable-model-invocation: true
---

기준 문서 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md`를 읽는다. 제작 정책은 이 문서가 기준이다.
`P`는 인자의 프로젝트 폴더 또는 `.`. 도구는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/<도구>.mjs"`로 실행한다.

GUIDE 2절 mv-make, 5·6·7절을 수행한다.
1. PLAN, 최신 draft, 사용자 승인 확인. 새 서브 에이전트에게 레퍼런스부터 보여주고 기준을 정하게 한다. 제작 이력·기존 점수 전달 금지.
2. 최신 후보를 평가하여 구간별 결함을 수정, 최대 3회. 미달이 지속되면 이유/대안을 사용자와 결정한다.
3. 화면 확정 후 `music.mjs P` → `make.mjs P --draft`; 음악 포함 최신 초안을 사용자에게 들려준다. 키가 없으면 mv-setup을 안내한다. 음악 없음은 사용자 선택일 때만.
4. 최신 snapshot 기반 독립 검수 JSON 등록, 실제 사용자 승인 등록. `workflow.mjs check P` → `make.mjs P`.
5. 고품질 렌더 결과의 QC/모션/음량을 검수하고 영상·자막·포스터와 남은 약점을 전달한다. 수정 시 검수·승인 갱신.
