/* MH.morph — 도형↔도형, 도형↔글자 모핑 (클래식 스크립트, mh.js 다음 → window.MH.morph. flubber·opentype.js 전역 필요)
 * 경로 문자열 만들기: roundRect · blob · circle (닫힌 단일 경로). 글자: text() 가 Pretendard OTF 에서 글자별 경로를 뽑는다(Promise).
 * shape(t, a, b, o): t ≤ t0 → a 그대로, t ≥ t0+dur → b 그대로, 그 사이는 flubber 보간(경로 쌍별 캐시). 모든 값은 t 의 순수 함수.
 * many(t, as[], bs[], o): 여러 경로 동시에 → string[]. 개수가 같으면 1:1, 한쪽이 1개면 나누기(1→N)·합치기(N→1). */
(function () {
'use strict';
const MH = window.MH;
if (!MH) throw new Error('mh-morph.js 는 mh.js 다음에 불러와야 합니다.');
const { clamp, E } = MH;

const K = 0.5523;                                       // 원을 큐빅 4개로 근사하는 상수
const n3 = v => String(+(+v).toFixed(3) + 0);
const EASES = Object.keys(E).filter(k => k !== 'bez');
const checkEase = e => {
  if (e == null || e === 'dna' || typeof e === 'function' || (typeof e === 'string' && EASES.includes(e))) return e;
  throw new Error(`알 수 없는 ease ${JSON.stringify(e)} — 사용 가능: dna, ${EASES.join(', ')} 또는 함수`);
};
const easeOf = e => {
  if (typeof e === 'function') return e;
  if (e === 'dna' || e == null) return (window.DNA && window.DNA.easeFn) || E.inOut;
  return E[e];
};
const lib = (name, what) => {
  const l = window[name];
  if (!l) throw new Error(`${name} 라이브러리가 없습니다 (${what}) — index.html 에 assets/lib/${name === 'flubber' ? 'flubber' : 'opentype'}.min.js 가 mh-morph.js 보다 먼저 있어야 합니다. /motion-harness2:mv-new 를 다시 실행해 라이브러리를 갱신하세요.`);
  return l;
};

// ───────────── 경로 만들기 (모두 닫힌 단일 경로) ─────────────
function blob(cx, cy, rx, ry, k = 0.55) {
  const a = k * rx, b = k * ry, p = (...v) => v.map(n3).join(' ');
  return `M${p(cx + rx, cy)}C${p(cx + rx, cy + b, cx + a, cy + ry, cx, cy + ry)}C${p(cx - a, cy + ry, cx - rx, cy + b, cx - rx, cy)}C${p(cx - rx, cy - b, cx - a, cy - ry, cx, cy - ry)}C${p(cx + a, cy - ry, cx + rx, cy - b, cx + rx, cy)}Z`;
}
const circle = (cx, cy, r) => blob(cx, cy, r, r, K);
function roundRect(x, y, w, h, r = 0) {
  r = clamp(r, 0, Math.min(w, h) / 2);
  const p = (...v) => v.map(n3).join(' ');
  if (r <= 0) return `M${p(x, y)}H${n3(x + w)}V${n3(y + h)}H${n3(x)}Z`;
  const c = r * K;
  return `M${p(x + r, y)}H${n3(x + w - r)}C${p(x + w - r + c, y, x + w, y + r - c, x + w, y + r)}V${n3(y + h - r)}C${p(x + w, y + h - r + c, x + w - r + c, y + h, x + w - r, y + h)}H${n3(x + r)}C${p(x + r - c, y + h, x, y + h - r + c, x, y + h - r)}V${n3(y + r)}C${p(x, y + r - c, x + r - c, y, x + r, y)}Z`;
}

// ───────────── 보간 ─────────────
const cache = new Map();
const cached = (key, make) => { let f = cache.get(key); if (!f) cache.set(key, f = make()); return f; };
const prog = (t, o) => {
  const { t0 = 0, dur = 0.6, ease = 'dna' } = o || {};
  checkEase(ease);
  if (t <= t0) return 0;
  if (t >= t0 + dur || dur <= 0) return 1;
  return easeOf(ease)((t - t0) / dur);
};
const OPT = { maxSegmentLength: 4 };

function shape(t, a, b, o = {}) {
  const fl = lib('flubber', 'morph.shape');
  const e = prog(t, o);
  if (e <= 0) return a;
  if (e >= 1) return b;
  return cached(a + '|' + b, () => fl.interpolate(a, b, OPT))(e);
}

function many(t, as, bs, o = {}) {
  const fl = lib('flubber', 'morph.many');
  const M = as.length, N = bs.length;
  if (!M || !N) throw new Error('morph.many 는 경로가 1개 이상 있는 배열 두 개가 필요합니다.');
  if (M !== N && M !== 1 && N !== 1) throw new Error(`morph.many: 개수가 다르면 한쪽이 1개여야 합니다 (현재 ${M} → ${N}). 나누기(1→N)나 합치기(N→1)만 지원합니다.`);
  const e = prog(t, o);
  if (M === N && e <= 0) return as.slice();
  if (M === N && e >= 1) return bs.slice();
  const fns = cached('many|' + JSON.stringify([as, bs]), () =>
    M === N ? fl.interpolateAll(as, bs, { ...OPT, single: false })
      : M === 1 ? fl.separate(as[0], bs, { ...OPT, single: false })
        : fl.combine(as, bs[0], { ...OPT, single: false }));
  return fns.map(f => f(e));
}

// ───────────── 글자 → 경로 ─────────────
const FILES = { extrabold: 'Pretendard-ExtraBold.otf', bold: 'Pretendard-Bold.otf' };
const fonts = new Map();                                 // weight → Promise<opentype.Font> (한 번만 로드)
function loadFont(weight) {
  if (!FILES[weight]) throw new Error(`알 수 없는 weight ${JSON.stringify(weight)} — extrabold 또는 bold`);
  let p = fonts.get(weight);
  if (!p) {
    const ot = lib('opentype', 'morph.text');
    p = Promise.resolve().then(() => fetch('assets/fonts/' + FILES[weight])).then(r => {
      if (!r.ok) throw new Error(`글꼴을 불러오지 못했습니다: assets/fonts/${FILES[weight]} (${r.status}) — 프로젝트 폴더에서 /motion-harness2:mv-new 를 다시 실행하세요.`);
      return r.arrayBuffer();
    }).then(buf => ot.parse(buf));
    p.catch(() => fonts.delete(weight));
    fonts.set(weight, p);
    const hf = (window.__hf = window.__hf || {}); (hf.buildReady = hf.buildReady || {})['morph:font:' + weight] = p;
  }
  return p;
}
async function text(str, { weight = 'extrabold', size = 200, x = 0, y = 0 } = {}) {
  const font = await loadFont(weight);
  return font.getPaths(String(str), x, y, size).filter(p => p.commands.length).map(p => p.toPathData(2));   // 공백은 명령이 없어 빠진다
}

MH.morph = { roundRect, blob, circle, shape, many, text };
})();
