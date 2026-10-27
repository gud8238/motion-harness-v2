# morph — 도형·글자 모핑

변수는 항상 `morph` 로 줄여 쓰고 호출은 괄호 앞 공백 없이 쓴다.
소스 점검: `morph.shape(` → morph.shape · `morph.text(` → morph.text (`morph.many(` 는 shape 근거로 본다).
```js
const morph = MH.morph;
```
index.html 이 flubber·opentype 을 먼저 불러온다. 모든 값은 장면 로컬 시간 t 의 순수 함수.

## 경로 만들기 (닫힌 단일 경로)
`morph.circle(cx, cy, r)` · `morph.roundRect(x, y, w, h, r)` · `morph.blob(cx, cy, rx, ry, k = 0.55)` — SVG `d` 문자열을 돌려준다.

## 한 도형 → 한 도형
```js
const d = morph.shape(t, morph.circle(960, 400, 60), morph.roundRect(860, 340, 200, 120, 24), { t0: 2, dur: 0.6, ease: 'dna' });
path.setAttribute('d', d);   // t ≤ t0 이면 a 그대로, t ≥ t0+dur 이면 b 그대로
```
`ease` 는 dna(기본)·E 이름·함수. 오타는 오류로 알려 준다. 경로 쌍마다 보간기를 캐시한다.

## 눈 두 개 → 로고 글자 `oo`
글자 경로는 비동기이므로 `buildReady` 에 등록해 렌더가 기다리게 한다.
```js
let oo = null;
window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady['boon-glyphs'] = morph.text('boon', { weight: 'extrabold', size: 320, x: 700, y: 640 })
  .then(g => { oo = g.slice(1, 3); draw(tl.time()); });   // 글자별 경로 [b, o, o, n]
const eyes = [morph.circle(900, 420, 40), morph.circle(1020, 420, 40)];
function draw(t) { if (!oo) return;
  const ds = morph.many(t, eyes, oo, { t0: 3, dur: 0.7 });   // → 경로 문자열 2개
  ds.forEach((d, i) => paths[i].setAttribute('d', d)); }
```
- `morph.text(str, {weight:'extrabold'|'bold', size, x, y})` → `Promise<string[]>` 글자당 경로 하나(공백 제외). 폰트는 처음 한 번만 읽고 `__hf.buildReady['morph:font:<weight>']` 에도 등록된다. `y` 는 글자 바닥선.
- `morph.many(t, as, bs, o)` → `string[]`. 개수가 같으면 1:1, 한쪽이 1개면 나누기(1→N)·합치기(N→1). 그 밖의 개수는 오류.

## 주의
- 모핑 대상 경로는 **닫힌 단일 경로**(`M … Z` 하나). 구멍이 있는 글자(o·b)는 바깥 윤곽만 변하고 끝 프레임에 구멍이 나타난다 → 장면에서 `fill-rule="evenodd"` 로 그리고 구멍은 짧게 페이드 인.
- 글자 크기·위치는 `text` 인자로 정하고 모핑 도중 SVG 변형을 바꾸지 않는다.
- 폰트 파일 `assets/fonts/Pretendard-*.otf` 는 `mv-new` 가 복사한다.
