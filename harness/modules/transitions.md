# transitions — 연결 전환 (trans2d)

장면 코드 맨 위에서 줄여 쓴다(소스 점검이 `trans.fill(` 등 문자열로 찾는다). 카메라는 `camera2d` 의 `cam`.
```js
const trans = MH.trans2d;
```
모든 값은 장면 로컬 시간 t 의 순수 함수 — 되감아도 같은 결과.

## 1. 도형 채우기 `trans.fill`
요소(도형·캐릭터) 중심에서 원이 커져 화면을 색으로 덮는다. 진행도 0..1 반환.
```js
MH.drive(tl, DUR, t => { trans.fill(t, document.getElementById('dot'), { t0: 3.2, dur: 0.8, color: DNA.accent }); });
```
요소의 형제로 오버레이 div 를 1회 만든다(z-index 9999). t0 전엔 숨고, 끝나면 색이 화면을 덮은 채 유지 — 다음 장면이 같은 색으로 시작하게 한다.

## 2. 줌 통과 `trans.zoomThrough`
월드 사각형 `[x,y,w,h]` 가 화면을 꽉 채울 때까지 카메라가 파고든다.
```js
trans.zoomThrough(cam, [900, 500, 120, 80], { t0: 3, dur: 0.7 });   // 창문·구멍·화면 속으로
```
끝 프레임이 그 사각형 안쪽이므로 다음 장면의 첫 프레임을 같은 내용(색·화면)으로 맞춘다.

## 3. 휙 넘김 `trans.whip`
```js
const w = trans.whip(cam, { t0: 3, dir: 'left', dur: 0.35, dist: 1.2 });   // left|right|up|down
w.vel(3.17)   // [vx, vy] px/s 화면 속도 — 모션 블러·스미어 강도에 사용
```
`dir` = 카메라가 가는 쪽. 이동량은 화면 너비(위·아래는 높이)의 dist 배, 월드에 다음 내용을 그만큼 떨어뜨려 둔다.

## 4. 매치 컷 `trans.match`
끝 모양과 다음 시작 모양을 겹쳐 잇는다. 요소의 `transform-origin` 을 `0 0` 으로 둔다.
```js
el.style.transformOrigin = '0 0';
el.style.transform = trans.match([100, 50, 400, 200], [700, 300, 100, 50]);   // B 를 A 상자에 중심·배율 맞춤
```
rect 는 `[x,y,w,h]` 또는 `getBoundingClientRect()` 결과. 배율 = A.w / B.w.

## 쓰는 곳
- **무대 안(한 장면)**: 카메라 키와 `fill`/`whip` 을 같은 `drive` 에서 부른다. 새 장면으로 자르지 않고 이어 가는 원테이크.
- **장면 사이**: 나가는 장면 마지막에 전환을 끝내고(색·모양 유지), 들어오는 장면은 같은 색·모양에서 시작해 `trans.match` 로 풀어낸다.
