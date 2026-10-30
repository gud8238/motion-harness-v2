// Minimal complete production contract for runtime render fixtures with no source images.
import fs from 'node:fs';import path from 'node:path';
export function completePlan(p){
 fs.writeFileSync(path.join(p,'work/assets.json'),'{"items":[]}');
 fs.appendFileSync(path.join(p,'work/PLAN.md'),`
소스 해부 표
| 소스 | 종류 | 움직임 단위 | 재구성 | 예외 사유 |
| 없음 | 기타 | 코드 UI | 미사용 | 자체 도형 |
동작 표
| 동사 | 주체 | 화면 동작 | 물리·연결 | 결과 | 장면 |
| 표시 | UI | 텍스트와 도형 표시 | 자체 좌표 | 읽기 | st1 |
연기 표
| 레퍼런스 연기 | 우리 피사체 | 표현 | 장면 |
| 해당 없음 | UI | 런타임 픽스처 | st1 |
전환 표
| 경계 | 이어주는 요소 | 방식 | 근거 |
| 전체 | 화면 | 연속 | 런타임 픽스처 |
`);
}
