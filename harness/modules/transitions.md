# transitions — 연결 전환 (trans2d)

항상 맨 위에서 `const trans = MH.trans2d;` 로 줄여 쓰고 `trans.fill(` 처럼 호출한다(`MH.trans2d.fill(` 직접 호출 금지).
게이트: `trans.fill(` · `trans.zoomThrough(` · `trans.whip(` · `trans.match(`(`MH.trans2d.` 직접 호출도) 마다 같은 이름의 전환 근거가 필요하다. 배우 `'grow'` 큐도 `trans.fill` 근거(R24). 카메라 `cam` 은 `camera2d` 모듈.
```js
const trans = MH.trans2d;
```
모든 값은 장면 로컬 시간 t 의 순수 함수.

## 1. 도형 채우기 `trans.fill`
원이 커져 화면을 색으로 덮는다. **반환값은 선형 진행도 0..1**(반지름만 eased).
```js
const dot = document.getElementById('dot');   // t 는 draw(t) 의 시각
trans.fill(t, dot, { t0: 3.2, dur: 0.8, color: DNA.accent, cam, point: [1560, 240] });   // 권장: 월드 점의 화면 위치. DNA = scene/index.html 의 window.DNA
trans.fill(t, dot, { t0: 3.2, center: [960, 540] });                                     // 화면 px 직접
```
중심은 `center` 또는 `cam`+`point`(+`depth`)로 준다 — 카메라 레이어 안 요소도 결정적으로 맞는다. 둘 다 없으면 요소를 측정하는 폴백이라 같은 draw 에서 `cam.render(t)` 를 먼저 불러야 한다. 오버레이는 컴포지션 루트에 1회 붙고(z-index 9999) 끝나면 색이 화면을 덮은 채 유지된다.

## 2. 줌 통과 `trans.zoomThrough`
월드 사각형 `[x,y,w,h]` 가 화면을 채울 때까지 들어간다(rect 가 제 위치에서 중심으로 매끄럽게 들어옴).
```js
trans.zoomThrough(cam, [900, 500, 120, 80], { t0: 3, dur: 0.7 });
```
끝 프레임이 rect 안쪽이니 다음 장면 첫 프레임을 같은 내용으로 맞춘다.

## 3. 휙 넘김 `trans.whip`
```js
const w = trans.whip(cam, { t0: 3, dir: 'left', dur: 0.35, dist: 1.2 });   // cam 은 camera2d 의 카메라. left|right|up|down
w.vel(3.17)   // [vx, vy] px/s — 스미어 강도
```
**다른 카메라 키를 먼저 넣고 whip 을 마지막에**(그 시각의 값에서 이어진다). `dir` = 카메라가 가는 쪽, 거리 = 화면 너비(위·아래 높이)의 dist 배 **월드 단위**. 그만큼 떨어진 곳에 다음 내용을 둔다.

## 4. 매치 컷 `trans.match`
```js
const el = document.getElementById('next');
el.style.transformOrigin = '0 0';
el.style.transform = trans.match([100, 50, 400, 200], [700, 300, 100, 50]);
```
rectB = **요소 자신의 변형 전 레이아웃 상자**, rectA = 맞출 목표. 중심끼리 맞추고 배율 = A.w/B.w. `[x,y,w,h]` 또는 DOMRect.

## 쓰는 곳
- **무대 안**: 카메라 키와 전환을 같은 `drive` 에서 부르는 원테이크.
- **장면 사이**: 나가는 장면 끝에서 전환을 끝내고, 들어오는 장면이 같은 색·모양에서 시작해 `trans.match` 로 푼다.
