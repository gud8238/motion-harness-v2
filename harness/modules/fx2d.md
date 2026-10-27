# fx2d — VHS·글리치·시간 재매핑

변수는 항상 `fx`·`time`, 호출은 `fx.vhs(` 처럼 괄호 앞 공백 없이 쓴다.
게이트: `fx.vhs(` → fx.vhs · `fx.glitch(` → fx.glitch · `time.remap(` → time.remap.

## VHS 오버레이 (일시정지·되감기·재생)
```js
const fx = MH.fx, time = MH.time;
const vhs = fx.vhs(box, {                      // box: position 이 있는 상자. 안에 한 번만 만든다
  labels: [[0, 'II PAUSE'], [2, '<< REWIND'], [4, 'PLAY ▶']],   // [t, 글자]: t 이후 마지막 값
  timecode: 'FRI 17:59',                       // true = 00:00:00 초시계 · 문자열 = 그대로 · false = 숨김
  t0: 0, t1: 6, seed: 1,                       // [t0, t1] 밖은 display:none
});
MH.drive(tl, DUR, t => vhs.render(t));
```
- 주사선(2px 줄무늬) + 트래킹 띠(높이 10%, 밝은 윗줄·어두운 몸통·서로 어긋난 줄무늬 — 글자를 덮어도 검사 예외) 하나가 1/12초마다 뛰고, 라벨에 빨강/청록 번짐이 붙는다. 고정 글자만 쓰려면 `label: 'PLAY ▶'`. 글자색은 `color`(기본 `#fff`, 어두운 그림자가 깔려 밝은 배경에서도 읽힌다). 크기는 상자의 짧은 변 기준.
- render 는 style·글자만 바꾼다. 요소는 만들 때 한 번뿐이다.

## 글리치
```js
MH.drive(tl, DUR, t => fx.glitch(t, inner, { amount: t > 3 && t < 3.4 ? 1 : 0, seed: 2 }));
```
1/24초마다 좌우 흔들림(≤ 8·amount px), 색 갈라짐(±2·amount px), 가로 띠 2~4개가 잘려 나간다. amount 0 이면 지운다.
`inner` 의 transform·filter·clip-path 는 글리치가 쓴다(amount 0 은 매 프레임 지운다) → `cam.layer` 요소·렌즈 대상·GSAP 로 움직이는 요소에는 걸지 말고, 내용을 안쪽 요소로 감싸 거기에 건다. 색 갈라짐은 알파가 있는 모양(글자·스프라이트)에서만 보인다.

## 시간 재매핑 (되감기·정지)
```js
const remap = time.remap([[0, 0], [2, 2], [3, 2], [4, 0.5]]);   // [장면 t, 재생할 t]
MH.drive(tl, DUR, t => draw(remap(t)));       // 0~2 재생 · 2~3 정지 · 3~4 되감기 · 이후 0.5 유지
```
- 같은 tIn 이 이어지면 정지, 줄어들면 되감기. 키는 유한한 숫자 쌍 2개 이상.
- 무대(stage)는 `st.remap(fn)` 으로 같은 함수를 건다.
- remap 한 draw 안의 sim/follow 는 맞게 나오지만 되감는 동안 0 부터 다시 계산한다. vhs·glitch 에는 remap 한 t 가 아니라 장면 t 를 넘긴다.

## 게이트
② 효과라서 효과 표에 레퍼런스 근거(또는 ③ 사용자 지정)가 없으면 make 가 렌더 전에 멈춘다.
