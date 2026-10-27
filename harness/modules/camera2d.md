# camera2d — 2D 가상 카메라

큰 DOM 월드 위를 카메라가 팬·줌·회전한다. 카메라 변수는 항상 `cam`, 호출은 `cam.layer(` 처럼 괄호 앞 공백 없이 쓴다.
소스 점검: `MH.cam(` → cam.pan/push/rotate 근거 필요 · `cam.layer(` → cam.parallax · `cam.shake(` → cam.shake.

## 만들기
```js
const cam = MH.cam(document.getElementById('world'), { W, H });   // 월드는 깊이 1 레이어
```
`W`,`H` 는 생략하면 DNA.W/H → `#root` 의 data-width/height → 1920×1080 순으로 읽는다. 9:16 은 1080×1920 이므로 숫자를 박지 말고 `cam.W`,`cam.H` 를 쓴다.
```js
cam.layer(document.getElementById('far'), 0.4)   // 먼 배경: 느리게
   .layer(document.getElementById('hud'), 0)     // 자막·로고: 화면 고정
   .layer(document.getElementById('fg'), 1.4);   // 전경: 더 크게 움직임
MH.drive(tl, DUR, t => cam.render(t));
```
레이어는 `position:absolute; left:0; top:0`. `render` 가 `transform`·`transform-origin:0 0` 을 덮어쓰므로 자체 transform 은 안쪽 자식에 둔다.

## 상태와 키
상태 `{x, y, zoom, rot}`: **x,y = 화면 중심에 오는 월드 점**, rot 는 도(°, 월드가 시계 방향). 기본은 `{x:W/2, y:H/2, zoom:1, rot:0}`.
```js
cam.key(0, { x: 400, y: 300, zoom: 2.5 })              // dur 0 = 컷
   .key(1, { x: 1500, zoom: 1 }, { dur: 1.2 })         // 준 속성만 변함(y 유지)
   .key(4, { rot: -6 }, { dur: 0.8, ease: 'out' });    // ease: 'dna'(기본) | MH.E 키 | 함수. 모르는 문자열은 오류
```
각 키는 그 시각의 값에서 출발, 같은 t 는 넣은 순서로 합쳐진다. **zoom 은 로그 보간**(1→4 중간이 2).

## 깊이 규칙
깊이 d: 이동 d 배, 배율 `1 + (zoom − 1)·d`, 회전 d 배. 0 고정 · 1 월드 · >1 전경. 시차는 d 를 0.2~1.5 로 나눠 준다. `cam.toScreen(t,[wx,wy],d)` · `cam.toWorld(t,[sx,sy])` · `cam.matrix(t,d)`.

## 흔들림
```js
cam.shake(2.0, 2.4, 0.01, 18);   // t0, t1, 진폭(화면 너비 비율), Hz
```
진폭은 줌과 무관한 **화면 크기**, 양 끝 0.1초 페이드, 결정적. 0.003~0.03, 충격 컷은 0.4초·12~20Hz.

## 주의
- 값은 전부 t 의 함수. `Math.random`·타이머 금지.
- 줌 3 이상이면 월드 요소를 큰 해상도로 만든다.
- 전환(`whip` 등)은 `transitions` 모듈. whip 은 그 시각 값에서 이어지므로 앞 키를 먼저 넣는다.
