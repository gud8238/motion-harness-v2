# lens2d — 심도·초점 이동·스미어·모션 블러

렌즈 변수는 항상 `lens`, 호출은 `lens.dof(` 처럼 괄호 앞 공백 없이 쓴다.
소스 점검: `lens.dof(` → lens.dof · `lens.rack(`·`.rack(` → lens.rack · `lens.smear(` → lens.smear. 모션 블러는 API 가 없다.

## 심도와 초점 이동
```js
const lens = MH.lens;
const cam = MH.cam(world).layer(far, 0.4).layer(fg, 1.4);   // camera2d 모듈
const dof = lens.dof(cam, { focus: 1, aperture: 6 });       // 기본값 그대로
lens.rack(dof, [[0, 1.4], [2, 1], [4, 0.4]]);               // [t, focus]: 키 사이는 선형, 양 끝은 유지
MH.drive(tl, DUR, t => { cam.render(t); dof.render(t); });  // 순서: cam.render 먼저
```
- 초점 이동은 `lens.rack(dof, keys)` 또는 `dof.rack(keys)` 로 쓴다(둘 다 게이트가 찾는다).
- 레이어 흐림 = `min(24, |깊이 − focus|·aperture)` px. 초점 깊이는 선명, 멀수록 흐리다.
- `render` 는 `filter` 만 쓰고 카메라는 `transform` 만 쓰므로 겹치지 않는다. 레이어에 처음 붙어 있던 인라인 filter 는 보존되고 그 뒤에 blur 가 덧붙는다.
- 깊이 0(화면 고정) 레이어도 흐려진다. 선명해야 할 자막은 `cam.layer` 에 넣지 않는다.
- 레이어 깊이가 다 달라야 효과가 보인다(레이어 하나면 통째로 흐려진다).

## 스미어 (빠른 요소 하나)
```js
MH.drive(tl, DUR, t => {
  const h = 1 / 240, a = pos(t - h), b = pos(t + h);      // pos(t) = 요소의 화면 좌표 [x, y] (t 의 함수)
  lens.smear(ball, (b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h));   // 화면 px/s, 옵션 { k: 0.02, max: 40 }
});
```
번짐 = `min(max, |속도|·k)` px, x·y 따로(축 정렬, 대각선 회전은 없음). 둘 다 0.05 미만이면 필터를 뗀다. 필터는 요소당 1회 만들고 값만 갱신한다.
빠른 요소가 하나면 모션 블러보다 스미어를 쓴다: 렌더가 빠르고 그 요소만 번진다.

## 모션 블러 (렌더 단계)
`work/PLAN.md` 효과 표에 `lens.mblur` ② 행(근거 필수) 또는 ③ 행(brief.md "효과 지정"에 `모션 블러`)을 적으면 make 가 켠다.
- make 가 fps 의 4배로 렌더해 4프레임을 평균한 뒤 원래 fps 로 줄인다: **렌더 시간 약 4배**. `--draft` 에서는 건너뛴다.
- 장면 코드는 바꾸지 않는다(fps 는 `#root` 의 data-fps, 없으면 30. 60 초과는 불가).

## 게이트
② 효과라서 효과 표에 레퍼런스 근거(또는 ③ 사용자 지정)가 없으면 make 가 렌더 전에 멈춘다. `lens.mblur` 는 장면에 호출이 없어도 표의 행만으로 검사한다.
