---
name: mv-plan
description: 'motion-harness2(v2) 레퍼런스 분석·소스 요청·제작 계획. v2 프로젝트(brief.md 맨 위 harness: v2)이거나 v2 를 언급할 때 사용.'
argument-hint: "[프로젝트 폴더]"
---

기준 문서 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md`를 읽는다. 제작 정책은 이 문서가 기준이다.
`P`는 인자의 프로젝트 폴더 또는 `.`. 도구는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/<도구>.mjs"`로 실행한다.

GUIDE 2절 mv-plan과 2.5·3절을 수행한다. 장면 코드는 만들지 않는다.
1. `new.mjs P` → 레퍼런스 분석과 소스 점검.
2. `work/PLAN.md`, `work/assets.json`, 필요한 `work/ASSETS.md`를 작성·제공한다.
3. `이미지 추가 완료` / `일부만 넣고 진행` / `이미지 없이 진행` 선택은 실제 사용자에게 확인한다. 마지막 선택은 저품질 코드 대체가 아니라 구체적인 연출 대안 합의다.
4. `plan-check.mjs P` 검사, 음악 분위기/스타일/BPM 사용자 확인. 다음 단계 mv-build와 미준비 소스를 안내한다.
