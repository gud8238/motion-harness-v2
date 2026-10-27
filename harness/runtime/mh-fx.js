/* MH.fx / MH.time — 특수효과(VHS·글리치)와 시간 재매핑 (클래식 스크립트, mh.js 다음에 불러온다 → window.MH.fx · window.MH.time)
 * 변수 이름은 항상 `fx`·`time` (const fx = MH.fx, time = MH.time;) — 게이트가 `fx.vhs(`·`fx.glitch(`·`time.remap(` 호출을 찾는다.
 * time.remap([[tOut, tIn], …]) → f(t)   tOut 순으로 정렬, 키 사이는 선형, 범위 밖은 끝값. tIn 이 같으면 정지, 줄어들면 되감기. 같은 tOut 이 겹치면 나중 키가 이긴다(점프).
 * fx.vhs(el, {label, labels, timecode, t0, t1, seed, color}) → {render(t)}   el 안에 오버레이를 한 번만 만든다(el 이 position 을 가진 상자여야 한다).
 *   주사선(반복 그라디언트) · 트래킹 띠 하나(높이 10%, y = hash(floor(t·12), seed) — 1/12초마다 뛴다. 밝은 윗줄 + 어두운 몸통 + 단계마다 서로 어긋나는 줄무늬 조각 4개 — fx.vhs 감지 조건과 같다) · 좌상단 라벨(어두운 그림자 + RGB 분리 그림자, color 기본 '#fff') · 좌하단 타임코드.
 *   labels [[t, 글자], …] 는 vhsLabel 로 고른다. timecode true → 'HH:MM:SS'(t 초), 문자열 → 그대로, false → 숨김. [t0, t1] 밖에서는 display:none.
 *   render 는 style 쓰기와 글자 갱신만 한다(요소를 새로 만들지 않는다).
 * fx.glitch(t, el, {amount, seed}) — 1/24초 단계마다 hash 로: translateX(≤ 8·amount px) + 빨강/청록 drop-shadow(±2·amount px) + clip-path 로 가로 띠 2~4개를 도려낸다.
 *   el 의 transform·filter·clip-path 를 직접 쓴다 → 그 요소에 다른 변형을 걸지 말고 안쪽 요소로 감싼다. amount 0 이면 셋 다 지운다(구간 밖에서 부른다).
 * 모든 값은 t 와 seed 의 순수 함수(난수·타이머 없음). */
(function () {
'use strict';
const MH = window.MH;
if (!MH) throw new Error('mh-fx.js 는 mh.js 다음에 불러와야 합니다.');
const { hash } = MH;
const r2 = v => +v.toFixed(2);
const fin = v => typeof v === 'number' && Number.isFinite(v);

// ───────────── 시간 재매핑 ─────────────
function remap(keys) {
  if (!Array.isArray(keys) || keys.length < 2) throw new Error('time.remap: [tOut, tIn] 키가 2개 이상 필요합니다.');
  keys.forEach((k, i) => {
    if (!Array.isArray(k) || !fin(k[0]) || !fin(k[1])) throw new Error(`time.remap: 키 #${i} 는 유한한 숫자 [tOut, tIn] 이어야 합니다.`);
  });
  const ks = keys.map((k, i) => [k[0], k[1], i]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const n = ks.length;
  return t => {
    if (!(t > ks[0][0])) return ks[0][1];
    if (t >= ks[n - 1][0]) return ks[n - 1][1];
    for (let i = 0; i < n - 1; i++) {
      if (t < ks[i + 1][0]) { const a = ks[i], b = ks[i + 1]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    }
    return ks[n - 1][1];
  };
}

// ───────────── VHS ─────────────
// 시각 t 에 켜져 있는 라벨: t 이하인 마지막 키 (첫 키 앞이면 '')
function vhsLabel(t, keys) {
  let best = null;
  (keys || []).forEach((k, i) => { if (k[0] <= t && (!best || k[0] > best[0] || (k[0] === best[0] && i > best[2]))) best = [k[0], k[1], i]; });
  return best ? best[1] : '';
}
const pad2 = n => String(n).padStart(2, '0');
const timecodeOf = t => { const s = Math.floor(Math.max(0, t)); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`; };

const BAND_H = 10, STEP = 12, STRIPS = 4, TOP = 15;   // 띠 높이(화면 %), 1/12초 단계, 줄무늬 조각 수, 밝은 윗줄(띠 높이 %)
// 줄무늬: 분석 폭 160 기준 칸(u) 단위의 불규칙한 흰 조각 [불투명도, 칸 수] — 축소해도 남는 굵기. 조각마다 단계별로 ±6u 어긋나 행 사이 가로 어긋남을 만든다
const STREAK = [[.85, 2], [0, 3], [.5, 1], [0, 4], [.85, 1], [0, 2]];
const streakCss = u => { let x = 0; const st = []; for (const [a, n] of STREAK) { const c = a ? `rgba(255,255,255,${a})` : 'rgba(255,255,255,0)'; st.push(`${c} ${r2(x)}px`, `${c} ${r2(x + n * u)}px`); x += n * u; } return `repeating-linear-gradient(90deg,${st.join(',')})`; };
const DARK = '0 0 6px rgba(0,0,0,.85)';                         // 밝은 배경에서도 읽히도록 깔아 두는 어두운 그림자
function vhs(el, { label = '', labels = null, timecode = true, t0 = 0, t1 = Infinity, seed = 1, color = '#fff' } = {}) {
  if (!el) throw new Error('fx.vhs: 요소가 필요합니다.');
  const doc = el.ownerDocument || document;
  // 글자 크기 기준 = 짧은 변: el 의 크기, 없으면(숨김·분리) MH.screenSize() (R10)
  const S = el.clientWidth > 0 && el.clientHeight > 0 ? Math.min(el.clientWidth, el.clientHeight) : Math.min(...MH.screenSize());
  const fs = Math.round(S * 0.045), pad = Math.round(S * 0.04);
  const mk = css => { const d = doc.createElement('div'); Object.assign(d.style, css); return d; };
  const text = { fontFamily: "ui-monospace,'SF Mono',Menlo,Consolas,Pretendard,monospace", fontSize: fs + 'px', fontWeight: '700', color, letterSpacing: '.04em', whiteSpace: 'pre', position: 'absolute', left: pad + 'px' };
  const root = mk({ position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '9999' });
  const scan = mk({ position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', background: 'repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0px,rgba(0,0,0,.16) 1px,rgba(0,0,0,0) 1px,rgba(0,0,0,0) 2px)' });
  // 트래킹 띠: 밝은 윗줄 + 어두운 몸통 → 어떤 바탕(흰·검정·중간)에서도 화면 폭 전체의 가로 경계가 생긴다. 몸통 안 줄무늬 조각들이 서로 다르게 어긋난다
  const Wd = el.clientWidth > 0 ? el.clientWidth : MH.screenSize()[0], u = Wd / 160, over = 8 * u;   // 조각을 양옆으로 넉넉히 늘려 어긋나도 빈틈이 없게
  const band = mk({ position: 'absolute', left: '0', right: '0', height: BAND_H + '%', top: '0%', overflow: 'hidden', background: `linear-gradient(180deg,rgba(255,255,255,.8) 0%,rgba(255,255,255,.8) ${TOP}%,rgba(0,0,0,.55) ${TOP}%,rgba(0,0,0,.55) 100%)` });
  band.id = `mh-vhs-${el.id || 'root'}-${(el.__mhVhs = (el.__mhVhs || 0) + 1)}`;   // make.mjs 는 이 띠가 덮은 글자(text_occluded)를 의도된 가림으로 본다 (mh-fill 과 같은 방식)
  const strips = [];
  for (let k = 0; k < STRIPS; k++) { const h = (100 - TOP) / STRIPS; strips.push(mk({ position: 'absolute', left: -over + 'px', right: -over + 'px', top: r2(TOP + k * h) + '%', height: r2(h) + '%', background: streakCss(u) })); band.appendChild(strips[k]); }
  const lab = mk({ ...text, top: pad + 'px', textShadow: DARK + ',-2px 0 rgba(255,0,0,.8),2px 0 rgba(0,255,255,.8)' });
  const tc = mk({ ...text, bottom: pad + 'px', fontSize: Math.round(fs * 0.8) + 'px', textShadow: DARK + ',-1.5px 0 rgba(255,0,0,.7),1.5px 0 rgba(0,255,255,.7)' });
  if (timecode === false) tc.style.display = 'none';
  [scan, band, lab, tc].forEach(c => root.appendChild(c));
  el.appendChild(root);
  let shown = null, lastLabel = null, lastTc = null;
  return {
    render(t) {
      const on = t >= t0 && t <= t1;
      if (on !== shown) { root.style.display = on ? '' : 'none'; shown = on; }
      if (!on) return;
      const step = Math.floor(t * STEP);                              // 1/12초마다 뛰는 단계 (같은 단계 안에서는 고정)
      band.style.top = r2(hash(step, seed * 7.3 + 1) * (100 - BAND_H)) + '%';
      strips.forEach((st, k) => { st.style.transform = `translateX(${r2((hash(step, seed * 3.1 + 2 + k * 1.7) - .5) * 12 * u)}px)`; });
      const l = labels ? vhsLabel(t, labels) : label;
      if (l !== lastLabel) { lab.textContent = l; lastLabel = l; }
      const c = timecode === false ? '' : typeof timecode === 'string' ? timecode : timecodeOf(t);
      if (c !== lastTc) { tc.textContent = c; lastTc = c; }
    },
  };
}

// ───────────── 글리치 ─────────────
const GSTEP = 24;
function glitch(t, el, { amount = 1, seed = 1 } = {}) {
  if (!el) throw new Error('fx.glitch: 요소가 필요합니다.');
  if (!(amount > 0)) { el.style.transform = ''; el.style.filter = ''; el.style.clipPath = ''; return; }
  const s = Math.floor(t * GSTEP), m = seed * 5.7;
  const dx = r2((hash(s, m + 1) - .5) * 2 * 8 * amount), sp = 2 * amount, sg = hash(s, m + 2) < .5 ? 1 : -1;
  el.style.transform = `translateX(${dx}px)`;
  el.style.filter = `drop-shadow(${sg * sp}px 0 rgba(255,0,0,.7)) drop-shadow(${-sg * sp}px 0 rgba(0,255,255,.7))`;
  // 띠 2~4개: [시작%, 끝%] — 시작 순으로 정렬하고 겹치지 않게 민다. polygon 이 띠 구간만 빼고 보여 준다.
  const n = 2 + Math.floor(hash(s, m + 3) * 3), bands = [];
  for (let i = 0; i < n; i++) bands.push([hash(s, m + 10 + i) * 88, Math.min(12, (2 + hash(s, m + 20 + i) * 6) * amount)]);
  bands.sort((a, b) => a[0] - b[0]);
  let prev = 0, pts = '0% 0%,100% 0%';
  for (const [y, h] of bands) {
    const a = Math.min(100, Math.max(y, prev + 1)), b = Math.min(100, a + h);
    pts += `,100% ${r2(a)}%,0% ${r2(a)}%,0% ${r2(b)}%,100% ${r2(b)}%`; prev = b;
  }
  el.style.clipPath = `polygon(${pts},100% 100%,0% 100%)`;
}

MH.fx = { vhs, glitch, vhsLabel };
MH.time = { remap };
})();
