# morph — 도형·글자 모핑

변수는 항상 `morph` 로 줄여 쓰고 호출은 괄호 앞 공백 없이 쓴다.
소스 점검: `morph.shape(` · `morph.many(` → morph.shape 근거, `morph.text(` → morph.text 근거.
```js
const morph = MH.morph;
```
index.html 이 flubber·opentype 을 먼저 불러온다. 모든 값은 장면 로컬 시간 t 의 순수 함수.

## 경로 만들기 (닫힌 단일 경로)
`morph.circle(cx, cy, r)` · `morph.roundRect(x, y, w, h, r)` · `morph.blob(cx, cy, rx, ry, k = 0.55)` — SVG `d` 문자열.

## 한 도형 → 한 도형
```js
const d = morph.shape(t, morph.circle(960, 400, 60), morph.roundRect(860, 340, 200, 120, 24), { t0: 2, dur: 0.6, ease: 'dna' });
path.setAttribute('d', d);   // t ≤ t0 이면 a 그대로, t ≥ t0+dur 이면 b 그대로
```
`ease` 는 dna(기본)·E 이름·함수(오타는 오류). 진행도는 0..1 로 잘려 `E.back` 의 되튐은 끝에서 사라진다.

## 눈 두 개 → 로고 글자 `oo`
`morph.text` 는 비동기: **장면 빌드 때(draw 밖) 한 번** 불러 `buildReady` 에 등록하면 렌더가 기다린다. 구멍(o 안쪽)은 `split` 으로 떼어 따로 그린다.
```js
const T0 = 3, DUR = 0.7, eyes = [morph.circle(900, 420, 40), morph.circle(1020, 420, 40)];
let outers = null, holes = null;
window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady['boon-glyphs'] = morph.text('boon', { weight: 'extrabold', size: 320, x: 700, y: 640 })
  .then(g => { const p = g.slice(1, 3).map(morph.split); outers = p.map(q => q.outer); holes = p.map(q => q.holes.join(' ')); draw(tl.time()); });
function draw(t) { if (!outers) return;
  const ds = morph.many(t, eyes, outers, { t0: T0, dur: DUR });       // 바깥 윤곽만 모핑
  const a = MH.seg(t, T0 + DUR * 0.7, T0 + DUR);                      // 구멍은 마지막 30% 에 서서히
  ds.forEach((d, i) => { bodies[i].setAttribute('d', d); holeEls[i].setAttribute('d', holes[i]); holeEls[i].setAttribute('opacity', a); }); }
```
`holeEls[i]` 는 `fill-rule="evenodd"` · `fill` = 배경색(DNA.bg)인 `<path>`.
- `morph.text(str, {weight:'extrabold'|'bold', size, x, y})` → `Promise<string[]>` 글자당 경로 하나(공백 제외). 폰트는 한 번만 읽고 `__hf.buildReady['morph:font:<weight>']` 에도 등록. `y` 는 글자 바닥선.
- `morph.split(d)` → `{ outer, holes[] }` 첫 부분경로 / 나머지.
- `morph.many(t, as, bs, o)` → `string[]`. 개수가 같으면 1:1, 한쪽이 1개면 나누기(1→N)·합치기(N→1), 그 밖은 오류. 1→N 은 t0 이전에도 `a` 가 아니라 `a` 를 N 조각으로 나눈 경로를 돌려준다.

## 주의
- `shape`·`many` 에 넣는 경로는 **닫힌 단일 경로**(`M … Z` 하나). 구멍 있는 글자는 `split().outer` 를 쓴다.
- 모핑 도중 SVG 변형을 바꾸지 않는다. 폰트 `assets/fonts/Pretendard-*.otf` 는 `mv-new` 가 복사한다.
