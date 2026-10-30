---
name: mv-build
description: '계획을 장면과 15fps 초안으로 구현하고 storyboard·씬별 strip으로 사용자 피드백을 반영한다.'
argument-hint: "[프로젝트 폴더]"
disable-model-invocation: true
---

기준 문서 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md`를 읽는다. 제작 정책은 이 문서가 기준이다.
`P`는 인자의 프로젝트 폴더 또는 `.`. 도구는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/<도구>.mjs"`로 실행한다.

GUIDE 2절 mv-build, 2.5·4절을 수행한다.
1. PLAN과 assets 상태를 확인하고, 받은 이미지 시각 검증 후 `workflow.mjs asset-ready P <파일> "근거"`.
2. 장면 제작 → `board.mjs P` → 각 씬 `board.mjs P --strip <id> --n 8` → `make.mjs P --draft`.
3. 전체 storyboard와 s1부터 모든 씬의 strip, draft를 보여주고 사용자 피드백을 반영한다.
4. 실제 승인 후에만 `workflow.mjs approve P "사용자 승인"`. 다음은 mv-make. 여기서는 최종 렌더하지 않는다.
