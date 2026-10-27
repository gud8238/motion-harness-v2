/* MH.morph — 도형↔도형, 도형↔글자 모핑 (클래식 스크립트, mh.js 다음 → window.MH.morph. flubber·opentype.js 전역 필요)
 * 경로 문자열 만들기: roundRect · blob · circle (닫힌 단일 경로). 글자: text() 가 Pretendard OTF 에서 글자별 경로를 뽑는다(Promise).
 * shape(t, a, b, o): t ≤ t0 → a 그대로, t ≥ t0+dur → b 그대로, 그 사이는 flubber 보간(경로 쌍별 캐시). 모든 값은 t 의 순수 함수.
 * many(t, as[], bs[], o): 여러 경로 동시에 → string[]. 개수가 같으면 1:1, 한쪽이 1개면 나누기(1→N)·합치기(N→1).
 *   1→N·N→1 은 t0 이전에도 a 자체가 아니라 a 를 나눈 조각(또는 b 쪽 조각)을 돌려준다. 끝은 b 의 조각.
 * split(d, s=1) → { outer, holes[] }: 구멍 있는 글자는 바깥 윤곽만 모핑하고, 구멍은 s 배(중심 기준)로 키워 evenodd 로 이어 붙인다.
 * 이징이 되튀는 종류(E.back 등)여도 진행도는 0..1 로 잘려 끝에서 b 를 넘지 않는다. */
(function () {
'use strict';
const MH = window.MH;
if (!MH) throw new Error('mh-morph.js 는 mh.js 다음에 불러와야 합니다.');
const { clamp } = MH;

const K = 0.5523;                                       // 원을 큐빅 4개로 근사하는 상수
const n3 = v => String(+(+v).toFixed(3) + 0);
const { checkEase, easeOf } = MH;
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

// 경로 → 바깥 윤곽(첫 부분경로)과 구멍들(나머지). 글자 'o' → 바깥 1 + 구멍 1.
// 구멍은 모핑하지 않는다: s(0..1) 로 각 구멍을 제 숫자 bbox 중심에서 s 배 줄여, 바깥 윤곽 뒤에 이어 붙여 evenodd 로 그린다 (배경이 비쳐 보임).
// toPathData 는 절대좌표 M/L/C/Q/Z 만 내므로 숫자를 (x,y) 쌍으로 보고 스케일하면 된다. s=1 이면 원래 문자열 그대로.
const NUM = /-?\d*\.?\d+/g;
function scaleHole(d, s) {
  if (s === 1) return d;
  const v = d.match(NUM).map(Number);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let k = 0;
  return d.replace(NUM, m => { const c = k++ % 2 ? cy : cx; return n3(c + (+m - c) * s); });
}
function split(d, s = 1) {
  const parts = String(d).split(/(?=[Mm])/).map(q => q.trim()).filter(Boolean);
  return { outer: parts[0] || '', holes: parts.slice(1).map(h => scaleHole(h, s)) };
}

// ───────────── 보간 ─────────────
const cache = new Map();
const cached = (key, make) => { let f = cache.get(key); if (!f) cache.set(key, f = make()); return f; };
const prog = (t, o) => {
  const { t0 = 0, dur = 0.6, ease = 'dna' } = o || {};
  checkEase(ease);
  if (t <= t0) return 0;
  if (t >= t0 + dur || dur <= 0) return 1;
  return clamp(easeOf(ease)((t - t0) / dur), 0, 1);               // 되튀는 이징은 0..1 로 자른다
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

MH.morph = { roundRect, blob, circle, split, shape, many, text };
})();
