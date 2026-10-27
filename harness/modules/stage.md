# stage — 무대 모드 (원테이크)

`scene.mjs add . st1 stage --dur 12` → `compositions/st1.html`. `MH.stage2d(` 는 효과 표에 `cam.onetake`·`trans.shared` 근거가 필요(무대 카메라 큐도 이 근거로 덮인다, R2).

| 구성 | 역할 |
|---|---|
| 월드 `st.world` | 화면보다 큰 DOM, 깊이 1 |
| 세트 | 월드 안 묶음, 큐로 in/out |
| 카메라 `st.cam` | MH.cam. dur 0 키 = 하드컷 |
| 배우 | MH.rig, 월드↔화면 anchor |
| 비트 | 스토리보드 한 칸 = PLAN 한 행 |

## 큐시트
```js
const st = MH.stage2d(root, { W, H, dur: DUR }).beatsFrom('#st1-beats');
st.set('list', listEl, { at: [400, 300] })          // 월드 px, depth 1
  .set('phone', phoneEl, { at: [2600, 200] });
st.actorTarget('boo');   // 배우 자리 (등록은 로드 뒤)
st.cues([
  [0,   'cam', { x: 960, y: 540, zoom: 3 }],
  [0,   'cam', { zoom: 1, dur: 3.5 }],              // dur·ease·follow = 옵션
  [2.8, 'boo', 'enter', { at: [700, 420] }],
  [4.6, 'boo', 'grow', { dur: 0.8 }],               // 화면 채움, anchor 0→1
  [5.4, 'set:phone', 'in', { from: 'below' }],
  [5.4, 'cam', { x: 2900, y: 500, dur: 0 }],        // 하드컷
]);
MH.drive(tl, DUR, t => st.render(t));
```
같은 시각은 적은 순. 자리도 배우도 없는 이름은 렌더 때 경고(무대별 1회).

## 세트
`'in'|'out'`, `{dur=0.5, from: below|above|left|right|fade|scale}` (out 은 `to` 도). 위치 ±0.15·H/W·배율 0.6↔1 은 MH.move, 투명도는 선형. 첫 큐가 in 이면 그 전엔 숨김, out 이 끝나면 숨김. 도중에 반대 큐가 오면 그 순간 상태에서 출발. 세트 transform 은 무대 몫 → 세트 안 GSAP 은 안쪽 자식에. 쌓기: 깊이 오름차순(<1 월드 뒤, >1 앞) → 배우 → depth 0(화면 고정 HUD, 맨 위).

## 배우
`st.actor('boo', design, {anchor, seed, life})` 또는 두 단계 `g = st.actorTarget('boo'); st.actor('boo', MH.rig.actor(g, design, {W, H}))`.

anchor: `'world'` 면 a = pose.anchor(grow·anchor 동작), `'screen'` 이면 a = 1. 배우 좌표는 a=0 월드 px, a=1 화면 px. 전환 중엔 위치를 섞는다(R16): 크기·회전 = 카메라↔항등, 중심 = 출발 점(전환 시작에 고정)→도착 점, grow 는 화면 중심으로 곧게. `anchor {to:'world'}` 는 자세 숫자를 월드 점으로 읽는다(먼저 그 근처로 옮길 것). grow 중엔 hop/walk 를 넣지 않는다.
배우 파일 `scene/assets/actors/<이름>.json` → `buildReady[...] = MH.rig.load('<이름>').then(d => st.actor('boo', d))` (실패→기본 디자인).

## 비트
```html
<script type="application/json" id="st1-beats">[{"id":"b1","t0":0,"t1":4.6,"title":"목록","note":"줌아웃"}]</script>
```
board.mjs 가 비트마다 한 칸(t0 + 길이 60%, 무대 길이를 넘으면 경고). 사용 위치는 `st1 b2`·`st1 b1–b3`.

## 시간·길이
`st.remap(time.remap([[0,0],[2,2],[3,2.2]]))` — 카메라·세트·배우 모두. 권장 25초 이하(넘으면 경고): 넘으면 무대를 나누고 배우 파일·위치·카메라 끝값으로 잇는다.
