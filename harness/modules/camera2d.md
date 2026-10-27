# camera2d — 2D 가상 카메라

큰 DOM 월드(`#world`)를 한 장 깔고, 카메라가 그 위를 팬·줌·회전한다. 카메라 변수는 항상 `cam` 으로 쓴다(소스 점검이 `cam.layer(`·`cam.shake(`·`MH.cam(` 문자열로 찾는다. 호출 괄호 앞에 공백 금지).

## 만들기
```js
const W = 1920, H = 1080;            // 컴포지션 #root 의 data-width/height. 9:16 이면 1080×1920 — 숫자를 박지 말 것
const cam = MH.cam(document.getElementById('world'), { W, H });   // 월드는 깊이 1 레이어
cam.layer(document.getElementById('far'), 0.4)                    // 먼 배경: 느리게
   .layer(document.getElementById('hud'), 0)                      // 자막·로고: 화면 고정
   .layer(document.getElementById('fg'), 1.4);                    // 전경: 더 크게 움직임
MH.drive(tl, DUR, t => cam.render(t));
```
월드·레이어는 `position:absolute; left:0; top:0` 로 두고 크기는 월드 좌표 그대로. `render` 가 `transform` 과 `transform-origin:0 0` 을 덮어쓰므로 요소 자체의 transform 은 안쪽 자식에 둔다.

## 상태와 키
상태 `{x, y, zoom, rot}`: **x,y = 화면 중심에 오는 월드 점**, rot 는 도(°, 월드가 시계 방향). 기본 `{x:W/2, y:H/2, zoom:1, rot:0}`.
```js
cam.key(0, { x: 400, y: 300, zoom: 2.5 })                    // dur 0 = 컷
   .key(1, { x: 1500, zoom: 1 }, { dur: 1.2 })               // 1.0→2.2s 이동, 준 속성만 변함(y 유지)
   .key(4, { rot: -6 }, { dur: 0.8, ease: 'out' });          // ease: 'dna'(기본, DNA.easeFn) | MH.E 키 | 함수
```
각 키는 그 시각의 현재 값에서 출발한다. 같은 t 의 키는 넣은 순서로 합쳐진다.

## 깊이 규칙
깊이 d: 이동 d 배, 배율 `1 + (zoom − 1)·d`, 회전 d 배. d=0 고정 · d=1 월드 · d>1 전경. 시차는 d 를 0.2~1.5 로 나눠 줄 때 생긴다. 좌표 변환: `cam.toScreen(t,[wx,wy],d)`, `cam.toWorld(t,[sx,sy])`, `cam.matrix(t,d)`.

## 흔들림
```js
cam.shake(2.0, 2.4, 0.01, 18);   // t0, t1, 진폭(화면 너비 비율), Hz — 양 끝 0.1초 페이드, 결정적
```
진폭 0.003~0.03(너비 대비)이 자연스럽다. 충격 컷에는 0.4초 안팎, 12~20Hz.

## 주의
- 카메라 값은 전부 t 의 함수. `Math.random`·타이머 금지.
- 줌 3 이상으로 들어갈 땐 월드 요소를 큰 해상도로 만든다(흐려짐 방지).
- 전환에 쓰는 법은 `transitions` 모듈.
