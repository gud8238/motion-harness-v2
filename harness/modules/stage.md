# stage — 무대 모드 (원테이크)

`scene.mjs add . st1 stage --dur 12` → `compositions/st1.html`. `MH.stage2d(` 는 효과 표에 `cam.onetake` 또는 `trans.shared` 근거가 있어야 게이트 통과(무대 안 카메라 큐도 이 근거로 덮인다, R2).

| 구성 | 역할 |
|---|---|
| 월드 `st.world` | 화면보다 큰 DOM 세계, 카메라 깊이 1 |
| 세트 | 월드 안 내용 묶음, 큐로 in/out |
| 카메라 `st.cam` | MH.cam. dur 0 키 = 하드컷 |
| 배우 | MH.rig, 월드↔화면 anchor |
| 비트 | 스토리보드 한 칸 = PLAN 장면 표 한 행 |

## 큐시트
```js
const st = MH.stage2d(root, { W, H, dur: DUR }).beatsFrom('#st1-beats');
st.set('list', listEl, { at: [400, 300] })          // 월드 px, depth 1
  .set('phone', phoneEl, { at: [2600, 200] });
st.actor('boo', design);                            // 배우 먼저, 큐는 나중
st.cues([
  [0,   'cam', { x: 960, y: 540, zoom: 3 }],
  [0,   'cam', { zoom: 1, dur: 3.5 }],              // dur·ease·follow 는 키 옵션
  [2.8, 'boo', 'enter', { at: [700, 420] }],
  [4.6, 'boo', 'grow', { dur: 0.8 }],               // 화면을 채움, anchor 0→1
  [5.4, 'set:phone', 'in', { from: 'below' }],
  [5.4, 'cam', { x: 2900, y: 500, dur: 0 }],        // 하드컷
  [6.0, 'boo', 'anchor', { to: 'world' }],
]);
MH.drive(tl, DUR, t => st.render(t));
```
같은 시각은 적은 순서대로. 모르는 배우 이름은 경고 후 무시.

## 세트
`'in'|'out'`, `{dur=0.5, from: below|above|left|right|fade|scale}` (out 은 `to` 도 됨). 위치 ±0.15·H/W 또는 배율 0.6↔1 은 MH.move(DNA.motion), 투명도는 선형. 첫 큐가 in 이면 그 전엔 숨김, out 이 끝나면 숨김. 세트 요소의 transform 은 무대가 쓰므로 세트 안 GSAP 움직임은 안쪽 자식에. `depth` ≠ 1 이면 그 깊이 레이어(작을수록 뒤).

## 배우
- 디자인: `st.actor('boo', design, {anchor, seed, life})`
- 두 단계: `const g = st.actorTarget('boo'); st.actor('boo', MH.rig.actor(g, design, { W, H }))`

anchor 규칙: 래퍼 변환 = 카메라 행렬과 항등을 a 로 섞음. `'world'` 면 a = pose.anchor(grow·anchor 동작), `'screen'` 이면 a = 1(카메라 무시). 배우 좌표는 a=0 월드 px, a=1 화면 px.
배우 파일 `scene/assets/actors/<이름>.json` → `buildReady[...] = MH.rig.load('<이름>').then(d => st.actor('boo', d).cues(CUES))`. 무대를 나눠도 같은 파일·같은 위치로 잇는다.

## 비트
```html
<script type="application/json" id="st1-beats">[{"id":"b1","t0":0,"t1":4.6,"title":"목록","note":"줌아웃"}]</script>
```
board.mjs 가 비트마다 한 칸(t0 + 길이 60%). 사용 위치는 `st1 b2`·`st1 b1–b3`.

## 시간
`st.remap(time.remap([[0,0],[2,2],[3,2.2]]))` — 카메라·세트·배우 모두에 적용. 렌더는 t 의 순수 함수.

## 길이
권장 25초 이하(넘으면 경고). 넘으면 무대를 나누고 배우 파일·위치·카메라 끝값으로 경계를 잇는다.
