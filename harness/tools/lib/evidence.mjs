// 레퍼런스 효과 근거표: 감지기 시계열(Series) → 효과 후보(Candidate) → 후보별 strip 이미지
// Series 항목 = { t, gm(i→i+1), gm3(i→i+3, 끝 3프레임·컷 너머는 null), sharp, dblur, fill, jitter, blobs } — 모든 px 은 움직임 프레임(seriesSize) 기준.
// 감지기 하나가 실패하면 그 칸만 null. buildCandidates 는 null 칸을 건너뛴다.
// Candidate = { id, t0, t1, score(0~1), signal(한국어 설명) }. 판정 문턱은 TH (Task 17 에서 레퍼런스 A·B 로 보정).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ffmpeg, rawFrames, board } from '../_common.mjs';
import * as detect from './detect.mjs';

export const TH = {
  fps: 12, motionW: 160, colorW: 96, remeasure: 5.5, minBlocks: 6,          // 시계열: 12fps, 회색 160폭·RGB 96폭, |dx|·|dy| ≥5.5px 이면 range 12 로 다시 측정 (R5)
  gm3Wide: 4, gm3Max: 11,                                                    // gm3: 예측(gm 3개 합) ≥4px 이면 range 12 로, >11px 이면 측정 안 함
  moveEps: 0.25, moveScale: 0.002, moveRot: 0.05,                            // 프레임당 이만큼 넘으면 '움직이는 프레임'
  pushDur: 0.8, pushIn: 1.15, pushOut: 0.87,                                 // cam.push
  panDur: 0.8, panFrac: 0.25, panScaleTol: 0.08,                             // cam.pan (누적 이동 > 0.25·w)
  rotDeg: 4,                                                                 // cam.rotate
  shakeWin: 0.5, shakeFlips: 3, shakeAmpLo: 0.003, shakeAmpHi: 0.03, shakeEps: 0.15,   // cam.shake (진폭 = 폭 대비)
  parallaxPx: 1.0, parallaxDur: 0.6, parallaxCam: 0.3,                       // cam.parallax (카메라도 움직일 때만)
  onetakeDur: 6, onetakeMoving: 0.6,                                         // cam.onetake
  dofRatio: 2.5, dofDur: 1, dofEdgeMin: 1.5,                                 // lens.dof (가장자리가 완전한 단색이면 심도가 아님)
  rackDur: 1.5, rackCells: 2, rackDom: 1.5, rackDrop: 0.5, rackMove: 1,     // lens.rack (카메라가 거의 멈춰 있을 때만, 프레임당 px)
  mblurMove: 3, mblurRatio: 2.2, mblurShare: 0.3, mblurMin: 4,               // lens.mblur (흐림 비 = 시계열 중앙값의 배수)
  smearMove: 1, smearRatio: 2.2, smearRun: 4,                                // lens.smear
  vhsJitter: 1.2, vhsDur: 1, glitchJitter: 2.0, glitchMaxDur: 0.5, glitchBursts: 2,   // fx.* (jitter = 시계열 중앙값 + 이 값)
  fillLo: 0.4, fillHi: 0.85, fillWin: 1.0,                                   // trans.fill (R5: ≥0.85 = 채움)
  zoomWin: 0.5, zoomRate: 1.5,                                               // trans.zoomThrough (배/초)
  whipWin: 0.4, whipSpeed: 0.5, whipBlurRise: 1.5, whipNear: 0.5,            // trans.whip (속도 = 폭/초)
  matchDist: 0.08, matchSig: 0.85, matchAreaLo: 0.5, matchAreaHi: 2,         // trans.match (거리 = 대각선 대비)
  sharedCuts: 2, sharedPresence: 0.8,                                        // trans.shared
  morphDt: 0.5, morphSig: 0.6, morphMinArea: 0.01,                           // morph.shape
  mergeGap: 0.3, perId: 3, stripMin: 0.5,                                    // 병합·개수·strip 최소 구간(초)
};

const evenH = (w, P) => Math.max(2, Math.round(w * P.height / P.width / 2) * 2);
export const seriesSize = P => [TH.motionW, evenH(TH.motionW, P)];
// 프레임 a(ta)→b(tb) 사이에 컷이 있을 수 있는가 (반 프레임 여유, 보수적으로)
const crosses = (cuts, ta, tb, fps) => cuts.some(c => c > ta - 0.5 / fps && c <= tb + 0.5 / fps);

// ffmpeg 원시 디코드 두 번(회색 160폭·RGB 96폭, 12fps)으로 프레임별 감지기 값을 잰다.
// opts: { cuts, accents(hex[]), failed(배열 — 실패한 감지기 이름이 들어감), detectors(테스트용 대체) }
export function measureSeries(file, P, opts = {}) {
  const fps = TH.fps, cuts = opts.cuts || [], accents = opts.accents || [], failed = opts.failed || [], D = { ...detect, ...(opts.detectors || {}) };
  const [gw, gh] = seriesSize(P), cw = TH.colorW, ch = evenH(cw, P);
  const G = rawFrames(file, { w: gw, h: gh, fps, gray: true }), C = rawFrames(file, { w: cw, h: ch, fps });
  const gs = gw * gh, cs = cw * ch * 3, n = Math.min(Math.floor(G.length / gs), Math.floor(C.length / cs));
  const g = i => G.subarray(i * gs, (i + 1) * gs), c = i => C.subarray(i * cs, (i + 1) * cs);
  const safe = (name, fn) => { try { return fn(); } catch (e) { if (!failed.includes(name)) { failed.push(name); console.error(`⚠ 감지 실패: ${name}: ${e.message}`); } return null; } };
  const motion = (a, b, range = 6) => {
    let m = D.globalMotion(g(a), g(b), gw, gh, { range });
    if (range < 12 && (Math.abs(m.dx) >= TH.remeasure || Math.abs(m.dy) >= TH.remeasure)) m = D.globalMotion(g(a), g(b), gw, gh, { range: 12 });
    return m;
  };
  const gm = Array.from({ length: n }, (_, i) => i + 1 < n ? safe('globalMotion', () => motion(i, i + 1)) : null);
  // gm3: 반복 무늬에서는 범위를 넘는 이동이 포화 대신 엉뚱한 값으로 읽히므로, 1프레임 gm 세 개의 합으로 3프레임 이동을 예측해
  // 기본 범위를 넘을 것 같으면 처음부터 range 12, 12 도 넘으면 null (→ 누적은 gm 으로; 그렇게 큰 이동은 1프레임 값이 작게 읽히지 않는다)
  const gm3 = i => {
    const p = gm.slice(i, i + 3); if (!p.every(m => m && m.n)) return motion(i, i + 3);
    const ex = Math.max(Math.abs(p[0].dx + p[1].dx + p[2].dx), Math.abs(p[0].dy + p[1].dy + p[2].dy));
    return ex > TH.gm3Max ? null : motion(i, i + 3, ex >= TH.gm3Wide ? 12 : 6);
  };
  const sx = gw / cw, sy = gh / ch, out = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    out.push({
      t: +t.toFixed(3),
      gm: gm[i],
      gm3: i + 3 < n && !crosses(cuts, t, (i + 3) / fps, fps) ? safe('globalMotion', () => gm3(i)) : null,
      sharp: safe('sharpness', () => D.sharpness(g(i), gw, gh)),
      dblur: safe('directionalBlur', () => D.directionalBlur(g(i), gw, gh)),
      fill: safe('fillRatio', () => D.fillRatio(c(i), cw, ch)),
      jitter: safe('rowJitter', () => D.rowJitter(g(i), gw, gh)),
      blobs: safe('accentBlobs', () => D.accentBlobs(c(i), cw, ch, accents).map(b => ({ ...b, cx: b.cx * sx, cy: b.cy * sy, bbox: [b.bbox[0] * sx, b.bbox[1] * sy, b.bbox[2] * sx, b.bbox[3] * sy] }))),
    });
  }
  Object.defineProperty(out, 'size', { value: [gw, gh] });   // 시계열 px 기준 크기 — buildCandidates 의 W·H 기본값 (영상 원본 크기를 넘기는 실수 방지)
  return out;
}

// ── 판정 도우미 ──
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const score = (v, th) => clamp(0.5 + 0.5 * (v / th - 1), 0, 1);               // 문턱 = 0.5, 문턱의 2배 = 1
const lowMedian = a => { const q = a.filter(v => Number.isFinite(v)).sort((x, y) => x - y); return q.length ? q[Math.floor((q.length - 1) / 2)] : 0; };
const gmOk = m => !!m && !(m.n < TH.minBlocks);                               // n 이 없으면(합성 시계열) 유효로 본다
const num = v => Number.isFinite(v) ? v : null;
const f2 = v => v.toFixed(2), pct = v => Math.round(v * 100);
// 닮음 변환 T = { s, r(도), dx, dy }: p' = s·R(r)·(p − c) + c + d. compose(A, B) = A 다음 B
const I = () => ({ s: 1, r: 0, dx: 0, dy: 0 });
const stepOf = m => ({ s: num(m.scale) ?? 1, r: num(m.rot) ?? 0, dx: num(m.dx) ?? 0, dy: num(m.dy) ?? 0 });
function compose(A, B) {
  const t = B.r * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return { s: A.s * B.s, r: A.r + B.r, dx: B.s * (c * A.dx - s * A.dy) + B.dx, dy: B.s * (s * A.dx + c * A.dy) + B.dy };
}
function inv(T) {
  const t = -T.r * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return { s: 1 / T.s, r: -T.r, dx: -(c * T.dx - s * T.dy) / T.s, dy: -(s * T.dx + c * T.dy) / T.s };
}
const relT = (P, Q) => compose(inv(P), Q);
// 무컷 구간 [a, b] 의 누적 카메라 변환 (R5: gm3 를 3프레임 간격으로, 없으면 gm 하나씩)
function walk(S, a, b) {
  let T = I(), i = a; const pts = [{ i, T }], steps = [];
  while (i < b) {
    const g3 = S[i].gm3, g1 = S[i].gm;
    if (i + 3 <= b && gmOk(g3)) { T = compose(T, stepOf(g3)); steps.push({ i, k: 3, m: g3 }); i += 3; }
    else { if (gmOk(g1)) { T = compose(T, stepOf(g1)); steps.push({ i, k: 1, m: g1 }); } i += 1; }
    pts.push({ i, T });
  }
  return { pts, steps };
}
// 조건을 만족하는 프레임 번호 목록 → 연속 구간 [i0, i1] (gap 프레임까지 이어 붙임)
function runs(idx, gap = 1) {
  const out = []; for (const i of idx) { const r = out.at(-1); if (r && i - r[1] <= gap) r[1] = i; else out.push([i, i]); }
  return out;
}

// ── 규칙: ctx → Candidate[] ──
const RULES = {
  'cam.push': x => x.segs.flatMap(([a, b]) => {
    if (x.T(b) - x.T(a) < TH.pushDur) return [];
    const { pts } = walk(x.S, a, b); let best = null;
    for (let p = 0; p < pts.length; p++) for (let q = p + 1; q < pts.length; q++) {
      if (x.T(pts[q].i) - x.T(pts[p].i) < TH.pushDur) continue;
      const s = relT(pts[p].T, pts[q].T).s, v = Math.abs(Math.log(s));
      if (!best || v > best.v) best = { v, s, p: pts[p].i, q: pts[q].i };
    }
    if (!best || (best.s <= TH.pushIn && best.s >= TH.pushOut)) return [];
    const th = Math.log(best.s > 1 ? TH.pushIn : 1 / TH.pushOut);
    return [{ id: 'cam.push', t0: x.T(best.p), t1: x.T(best.q), score: score(best.v, th), signal: `누적 ${best.s > 1 ? '확대' : '축소'} ${f2(best.s)}배 (${f2(x.T(best.q) - x.T(best.p))}s, 무컷)` }];
  }),
  'cam.pan': x => x.segs.flatMap(([a, b]) => {
    if (x.T(b) - x.T(a) < TH.panDur) return [];
    const { pts } = walk(x.S, a, b), lim = TH.panFrac * x.W; let best = null;
    for (let p = 0; p < pts.length; p++) for (let q = p + 1; q < pts.length; q++) {
      if (x.T(pts[q].i) - x.T(pts[p].i) < TH.panDur) continue;
      const R = relT(pts[p].T, pts[q].T), v = Math.max(Math.abs(R.dx), Math.abs(R.dy));
      if (Math.abs(R.s - 1) < TH.panScaleTol && (!best || v > best.v)) best = { v, R, p: pts[p].i, q: pts[q].i };
    }
    if (!best || best.v <= lim) return [];
    return [{ id: 'cam.pan', t0: x.T(best.p), t1: x.T(best.q), score: score(best.v, lim), signal: `누적 이동 x ${best.R.dx.toFixed(1)} · y ${best.R.dy.toFixed(1)}px (폭의 ${pct(best.v / x.W)}%, 확대 변화 ${pct(Math.abs(best.R.s - 1))}%)` }];
  }),
  'cam.rotate': x => x.segs.flatMap(([a, b]) => {
    const { pts } = walk(x.S, a, b); let best = null;
    for (let p = 0; p < pts.length; p++) for (let q = p + 1; q < pts.length; q++) {
      const v = Math.abs(relT(pts[p].T, pts[q].T).r); if (!best || v > best.v) best = { v, p: pts[p].i, q: pts[q].i };
    }
    if (!best || best.v <= TH.rotDeg) return [];
    return [{ id: 'cam.rotate', t0: x.T(best.p), t1: x.T(best.q), score: score(best.v, TH.rotDeg), signal: `누적 회전 ${best.v.toFixed(1)}° (무컷)` }];
  }),
  'cam.shake': x => {
    const w = Math.max(2, Math.round(TH.shakeWin * x.fps)), hit = new Set(), lo = TH.shakeAmpLo * x.W, hi = TH.shakeAmpHi * x.W;
    const flips = a => { let n = 0, prev = 0; for (const v of a) { if (Math.abs(v) < TH.shakeEps) continue; const s = Math.sign(v); if (prev && s !== prev) n++; prev = s; } return n; };
    const amp = a => { let p = 0, mn = 0, mx = 0; for (const v of a) { p += v; mn = Math.min(mn, p); mx = Math.max(mx, p); } return (mx - mn) / 2; };
    let best = 0;
    for (const [a, b] of x.segs) for (let i = a; i + w <= b; i++) {
      const ms = x.S.slice(i, i + w).map(e => e.gm); if (!ms.every(gmOk)) continue;
      const dx = ms.map(m => m.dx), dy = ms.map(m => m.dy), A = Math.max(amp(dx), amp(dy));
      if (Math.max(flips(dx), flips(dy)) >= TH.shakeFlips && A >= lo && A <= hi) { for (let k = i; k <= i + w; k++) hit.add(k); best = Math.max(best, A); }
    }
    return runs([...hit].sort((p, q) => p - q)).map(([i0, i1]) => ({ id: 'cam.shake', t0: x.T(i0), t1: x.T(i1), score: score(i1 - i0, w), signal: `0.5초 안 방향 반전 ${TH.shakeFlips}회 이상 · 진폭 최대 ${best.toFixed(1)}px (폭의 ${(100 * best / x.W).toFixed(1)}%)` }));
  },
  'cam.parallax': x => {
    const k = Math.ceil(TH.parallaxDur * x.fps - 1e-6), hit = new Set(); let best = 0;
    for (const [a, b] of x.segs) for (let i = a; i + k <= b; i++) {
      const ms = x.S.slice(i, i + k).map(e => e.gm); if (!ms.every(gmOk)) continue;
      const par = ms.reduce((s, m) => s + (num(m.parallax) ?? 0), 0) / k, cam = ms.reduce((s, m) => s + Math.abs(m.dx) + Math.abs(m.dy), 0) / k;
      if (par > TH.parallaxPx && cam >= TH.parallaxCam) { for (let j = i; j <= i + k; j++) hit.add(j); best = Math.max(best, par); }
    }
    return runs([...hit].sort((p, q) => p - q)).map(([i0, i1]) => ({ id: 'cam.parallax', t0: x.T(i0), t1: x.T(i1), score: score(best, TH.parallaxPx), signal: `위·아래 잔여 움직임 차 평균 ${best.toFixed(1)}px (카메라 이동 중)` }));
  },
  'cam.onetake': x => x.segs.flatMap(([a, b]) => {
    const d = x.T(b) - x.T(a); if (d < TH.onetakeDur) return [];
    const { steps } = walk(x.S, a, b);
    const mov = steps.filter(({ k, m }) => (Math.abs(m.dx) + Math.abs(m.dy)) / k > TH.moveEps || Math.abs((num(m.scale) ?? 1) - 1) / k > TH.moveScale || Math.abs(num(m.rot) ?? 0) / k > TH.moveRot).reduce((s, st) => s + st.k, 0) / (b - a);
    if (mov < TH.onetakeMoving) return [];
    return [{ id: 'cam.onetake', t0: x.T(a), t1: x.T(b), score: score(mov, TH.onetakeMoving), signal: `무컷 ${d.toFixed(1)}s · 카메라 움직임 프레임 ${pct(mov)}%` }];
  }),
  'lens.dof': x => {
    const C = [5, 6], k = Math.ceil(TH.dofDur * x.fps - 1e-6), rs = new Map();
    x.S.forEach((e, i) => {
      const s = e.sharp; if (!s || s.length !== 12) return;
      let c = 0, ed = 0; for (let j = 0; j < 12; j++) if (C.includes(j)) c += s[j] / 2; else ed += s[j] / 10;
      const r = (c + 1) / (ed + 1); if (r > TH.dofRatio && ed >= TH.dofEdgeMin) rs.set(i, r);
    });
    return runs([...rs.keys()]).filter(([i0, i1]) => i1 - i0 + 1 >= k).map(([i0, i1]) => {
      let m = 0; for (let i = i0; i <= i1; i++) m += rs.get(i) / (i1 - i0 + 1);
      return { id: 'lens.dof', t0: x.T(i0), t1: x.T(i1), score: score(m, TH.dofRatio), signal: `중앙/가장자리 선명도 비 평균 ${m.toFixed(1)} (${f2((i1 - i0 + 1) / x.fps)}s)` };
    });
  },
  'lens.rack': x => {
    const top = x.S.map(e => {
      const s = e.sharp; if (!s || s.length !== 12) return null;
      let k = 0; for (let j = 1; j < 12; j++) if (s[j] > s[k]) k = j;
      return s[k] >= TH.rackDom * lowMedian(Array.from(s)) && s[k] > 0 ? k : null;
    });
    const dist = (p, q) => Math.abs(p % 4 - q % 4) + Math.abs((p / 4 | 0) - (q / 4 | 0)), seg = x.segOf, out = [];
    const still = (i, j) => { let s = 0; for (let k = i; k < j; k++) { const m = x.S[k].gm; if (gmOk(m)) s += Math.abs(m.dx) + Math.abs(m.dy); } return s / (j - i) < TH.rackMove; };   // 화면이 흘러가면 선명 칸도 따라 움직인다
    let hold = null;
    for (let j = 0; j < x.n; j++) {
      if (top[j] == null) continue; if (top[j] === hold) continue; hold = null;
      for (let i = j - 1; i >= 0 && x.T(j) - x.T(i) <= TH.rackDur + 1e-6; i--) {
        if (top[i] == null || seg[i] !== seg[j] || dist(top[i], top[j]) < TH.rackCells || !still(i, j)) continue;
        const si = x.S[i].sharp, sj = x.S[j].sharp;
        if (sj[top[i]] < TH.rackDrop * si[top[i]] && si[top[j]] < TH.rackDrop * sj[top[j]]) {
          out.push({ id: 'lens.rack', t0: x.T(i), t1: x.T(j), score: score(dist(top[i], top[j]), TH.rackCells), signal: `가장 선명한 칸 ${top[i] + 1} → ${top[j] + 1} (4×3 격자, ${dist(top[i], top[j])}칸 이동)` });
          hold = top[j]; break;
        }
      }
    }
    return out;
  },
  'lens.mblur': x => {
    const base = lowMedian(x.S.map(e => e.dblur?.ratio)), mov = [], blur = [];
    x.S.forEach((e, i) => { if (gmOk(e.gm) && e.dblur && Math.abs(e.gm.dx) + Math.abs(e.gm.dy) > TH.mblurMove) { mov.push(i); if (e.dblur.ratio > TH.mblurRatio * base) blur.push(i); } });
    const share = mov.length ? blur.length / mov.length : 0;
    if (mov.length < TH.mblurMin || share < TH.mblurShare) return [];
    return runs(blur, Math.round(TH.whipNear * x.fps)).map(([i0, i1]) => ({ id: 'lens.mblur', t0: x.T(i0), t1: x.T(i1) + 1 / x.fps, score: score(share, TH.mblurShare), signal: `움직임 큰 프레임 ${mov.length}개 중 ${pct(share)}% 가 방향 흐림 (기준 비 ${base.toFixed(1)}의 ${TH.mblurRatio}배↑)` }));
  },
  'lens.smear': x => {
    const base = lowMedian(x.S.map(e => e.dblur?.ratio)), idx = [];
    x.S.forEach((e, i) => { if (e.gm && e.dblur && Math.abs(e.gm.dx) + Math.abs(e.gm.dy) < TH.smearMove && e.dblur.ratio > TH.smearRatio * base) idx.push(i); });
    return runs(idx).filter(([i0, i1]) => i1 - i0 + 1 >= TH.smearRun).map(([i0, i1]) => ({ id: 'lens.smear', t0: x.T(i0), t1: x.T(i1) + 1 / x.fps, score: score(i1 - i0 + 1, TH.smearRun), signal: `카메라 정지 중 방향 흐림 ${i1 - i0 + 1}프레임 연속 (기준 비 ${base.toFixed(1)}의 ${TH.smearRatio}배↑)` }));
  },
  'fx.vhs': x => {
    const base = lowMedian(x.S.map(e => e.jitter)), k = Math.ceil(TH.vhsDur * x.fps - 1e-6), idx = [];
    x.S.forEach((e, i) => { if (Number.isFinite(e.jitter) && e.jitter > base + TH.vhsJitter) idx.push(i); });
    return runs(idx).filter(([i0, i1]) => i1 - i0 + 1 >= k).map(([i0, i1]) => {
      let m = 0; for (let i = i0; i <= i1; i++) m += x.S[i].jitter / (i1 - i0 + 1);
      return { id: 'fx.vhs', t0: x.T(i0), t1: x.T(i1) + 1 / x.fps, score: score(m - base, TH.vhsJitter), signal: `행 어긋남 평균 ${m.toFixed(1)}px (기준 ${base.toFixed(1)}px) ${f2((i1 - i0 + 1) / x.fps)}s 지속` };
    });
  },
  'fx.glitch': x => {
    const base = lowMedian(x.S.map(e => e.jitter)), idx = [];
    x.S.forEach((e, i) => { if (Number.isFinite(e.jitter) && e.jitter > base + TH.glitchJitter) idx.push(i); });
    const bursts = runs(idx).filter(([i0, i1]) => (i1 - i0 + 1) / x.fps < TH.glitchMaxDur);
    if (bursts.length < TH.glitchBursts) return [];
    return bursts.map(([i0, i1]) => {
      let m = 0; for (let i = i0; i <= i1; i++) m = Math.max(m, x.S[i].jitter);
      return { id: 'fx.glitch', t0: x.T(i0), t1: x.T(i1) + 1 / x.fps, score: score(m - base, TH.glitchJitter), signal: `짧은 행 어긋남 폭발 (최대 ${m.toFixed(1)}px, 기준 ${base.toFixed(1)}px) · 전체 ${bursts.length}회` };
    });
  },
  'trans.fill': x => {
    const r = x.S.map(e => num(e.fill?.ratio)), win = Math.round(TH.fillWin * x.fps), out = [];
    for (let j = 1; j < x.n; j++) {
      if (r[j] == null || r[j] < TH.fillHi || (r[j - 1] != null && r[j - 1] >= TH.fillHi)) continue;
      for (let i = j - 1; i >= Math.max(0, j - win); i--) if (r[i] != null && r[i] < TH.fillLo) {
        out.push({ id: 'trans.fill', t0: x.T(i), t1: x.T(j), score: score(r[j] - r[i], TH.fillHi - TH.fillLo), signal: `단색 영역 ${pct(r[i])}% → ${pct(r[j])}% (${x.S[j].fill.hex}, ${f2(x.T(j) - x.T(i))}s)` });
        break;
      }
    }
    return out;
  },
  'trans.zoomThrough': x => x.cuts.flatMap(c => {
    const b = x.lastBefore(c); if (b < 0) return [];
    let a = b; while (a > 0 && x.segOf[a - 1] === x.segOf[b] && x.T(a - 1) >= c - TH.zoomWin - 1e-6) a--;
    if (b - a < 2) return [];
    const { pts } = walk(x.S, a, b), s = pts.at(-1).T.s, rate = s ** (1 / (x.T(b) - x.T(a)));
    if (!(rate > TH.zoomRate)) return [];
    return [{ id: 'trans.zoomThrough', t0: Math.max(0, c - TH.zoomWin), t1: c, score: score(rate - 1, TH.zoomRate - 1), signal: `컷(${f2(c)}s) 직전 확대 속도 ${f2(rate)}배/초` }];
  }),
  'trans.whip': x => x.cuts.flatMap(c => {
    const near = [], lim = TH.whipSpeed * x.W, nb = Math.round(TH.whipNear * x.fps); let why = '';
    for (let i = 0; i < x.n; i++) {
      if (Math.abs(x.T(i) - c) > TH.whipWin + 1e-6) continue;
      const m = x.S[i].gm;
      if (gmOk(m) && i + 1 < x.n && !crosses(x.cuts, x.T(i), x.T(i + 1), x.fps)) {
        const v = Math.hypot(m.dx, m.dy) * x.fps; if (v >= lim) { near.push(i); why = `이동 속도 ${Math.round(v)}px/s (폭의 ${f2(v / x.W)}배/초)`; continue; }
      }
      if (m && m.n < TH.minBlocks && x.S[i].dblur) {
        const ns = [], rs = [];
        for (let j = Math.max(0, i - nb); j <= Math.min(x.n - 1, i + nb); j++) if (Math.abs(j - i) > 1) { if (x.S[j].gm) ns.push(x.S[j].gm.n ?? Infinity); if (x.S[j].dblur) rs.push(x.S[j].dblur.ratio); }
        const rb = lowMedian(rs);
        if (ns.length && lowMedian(ns) >= TH.minBlocks && rs.length && x.S[i].dblur.ratio >= TH.whipBlurRise * rb) { near.push(i); why = `블록 매칭 붕괴(유효 ${m.n}칸) + 흐림 비 ${f2(x.S[i].dblur.ratio)} (주변 ${f2(rb)})`; }
      }
    }
    if (!near.length) return [];
    return [{ id: 'trans.whip', t0: Math.min(c, x.T(near[0])), t1: Math.max(c, x.T(near.at(-1)) + 1 / x.fps), score: score(near.length, 1), signal: `컷(${f2(c)}s) 전후 ${why}` }];
  }),
  'trans.match': x => x.cuts.flatMap(c => {
    const a = x.lastBefore(c), b = x.firstAfter(c); if (a < 0 || b < 0) return [];
    const A = x.S[a].blobs, B = x.S[b].blobs; if (!A || !B) return [];
    const diag = Math.hypot(x.W, x.H); let best = null;
    for (const p of A) for (const q of B) {
      if (p.hex !== q.hex || !p.sig || !q.sig) continue;
      const d = Math.hypot(p.cx - q.cx, p.cy - q.cy) / diag, sim = detect.sigSimilarity(p.sig, q.sig), ar = q.area / p.area;
      if (d < TH.matchDist && sim > TH.matchSig && ar >= TH.matchAreaLo && ar <= TH.matchAreaHi) {
        const sc = clamp(0.5 + 0.25 * (sim - TH.matchSig) / (1 - TH.matchSig) + 0.25 * (1 - d / TH.matchDist), 0, 1);
        if (!best || sc > best.sc) best = { sc, d, sim, ar, hex: p.hex };
      }
    }
    if (!best) return [];
    return [{ id: 'trans.match', t0: x.T(a), t1: x.T(b), score: best.sc, signal: `컷(${f2(c)}s) 전후 ${best.hex} 덩어리: 거리 대각선의 ${pct(best.d)}% · 모양 유사도 ${f2(best.sim)} · 면적비 ${f2(best.ar)}` }];
  }),
  'trans.shared': x => {
    if (x.cuts.length < TH.sharedCuts) return [];
    const hexes = new Set(); for (const e of x.S) for (const b of e.blobs || []) hexes.add(b.hex);
    const bounds = [0, ...x.cuts, x.dur], out = [];
    for (const hex of hexes) {
      const pre = [0]; x.S.forEach((e, i) => pre.push(pre[i] + ((e.blobs || []).some(b => b.hex === hex) ? 1 : 0)));
      const idx = t => { let i = 0; while (i < x.n && x.T(i) < t - 1e-9) i++; return i; };
      const ok = [];
      for (let j = 0; j < x.cuts.length; j++) for (let k = j + TH.sharedCuts - 1; k < x.cuts.length; k++) {
        const i0 = idx(bounds[j]), i1 = idx(bounds[k + 2]); if (i1 <= i0) continue;
        const fr = (pre[i1] - pre[i0]) / (i1 - i0);
        if (fr >= TH.sharedPresence) ok.push({ j, k, fr, i0, i1 });
      }
      ok.sort((p, q) => (q.k - q.j) - (p.k - p.j) || q.fr - p.fr);
      const used = [];
      for (const o of ok) {
        if (used.some(u => o.i0 < u.i1 && u.i0 < o.i1)) continue;
        used.push(o);
        out.push({ id: 'trans.shared', t0: x.T(o.i0), t1: Math.min(x.dur, x.T(o.i1 - 1) + 1 / x.fps), score: score(o.k - o.j + 1, TH.sharedCuts) * 0.5 + score(o.fr, TH.sharedPresence) * 0.5, signal: `${hex} 덩어리가 컷 ${o.k - o.j + 1}개를 넘어 프레임 ${pct(o.fr)}% 에 존재` });
      }
    }
    return out;
  },
  'morph.shape': x => {
    const dt = Math.max(1, Math.round(TH.morphDt * x.fps)), hit = new Map();
    for (let i = 0; i + dt < x.n; i++) {
      const j = i + dt; if (x.segOf[i] !== x.segOf[j] || !x.S[i].blobs || !x.S[j].blobs) continue;
      const big = new Map(); for (const b of x.S[i].blobs) if (b.area >= TH.morphMinArea && b.sig && (!big.has(b.hex) || b.area > big.get(b.hex).area)) big.set(b.hex, b);
      for (const [hex, A] of big) {
        let kept = true; for (let k = i + 1; k <= j && kept; k++) kept = !!x.S[k].blobs?.some(b => b.hex === hex);
        if (!kept) continue;
        const B = x.S[j].blobs.filter(b => b.hex === hex && b.sig).sort((p, q) => Math.hypot(p.cx - A.cx, p.cy - A.cy) - Math.hypot(q.cx - A.cx, q.cy - A.cy))[0];
        const sim = B ? detect.sigSimilarity(A.sig, B.sig) : 1;
        if (sim < TH.morphSig) { const h = hit.get(i); if (!h || sim < h.sim) hit.set(i, { sim, hex }); }
      }
    }
    return runs([...hit.keys()].sort((p, q) => p - q)).map(([i0, i1]) => {
      let m = { sim: 1, hex: '' }; for (let i = i0; i <= i1; i++) if (hit.get(i).sim < m.sim) m = hit.get(i);
      return { id: 'morph.shape', t0: x.T(i0), t1: x.T(i1 + dt), score: score(1 - m.sim, 1 - TH.morphSig), signal: `${m.hex} 덩어리 모양이 ${TH.morphDt}초 사이 크게 변함 (유사도 ${f2(m.sim)}, 무컷)` };
    });
  },
};

// 시계열 → 후보. 같은 id 의 0.3초 이내 인접 후보는 병합(사이에 컷이 있으면 병합하지 않음), id 당 score 상위 3개, score 내림차순(같으면 시간순).
// W·H 는 시계열 px 기준 크기(생략하면 series.size, 없으면 160×90). opts.failed: 예외를 던진 규칙 id 가 들어감 (그 규칙 후보만 빠짐)
export function buildCandidates(series, cuts = [], dur = 0, W = series?.size?.[0] ?? 160, H = series?.size?.[1] ?? 90, opts = {}) {
  const S = series || [], n = S.length, failed = opts.failed || [];
  if (n < 2) return [];
  const fps = (n - 1) / ((S[n - 1].t - S[0].t) || (n - 1) / TH.fps), T = i => S[i].t;
  const cs = [...(cuts || [])].filter(Number.isFinite).sort((a, b) => a - b);
  const segOf = new Int32Array(n), segs = []; let a = 0;
  for (let i = 0; i < n - 1; i++) { if (crosses(cs, T(i), T(i + 1), fps)) { segs.push([a, i]); a = i + 1; } segOf[i + 1] = segs.length; }
  segs.push([a, n - 1]);
  const total = dur > 0 ? dur : T(n - 1) + 1 / fps;
  const ctx = {
    S, n, fps, T, cuts: cs, dur: total, W, H, segs, segOf,
    lastBefore: c => { let r = -1; for (let i = 0; i < n; i++) if (T(i) <= c - 0.5 / fps) r = i; return r; },
    firstAfter: c => { for (let i = 0; i < n; i++) if (T(i) >= c + 0.5 / fps) return i; return -1; },
  };
  const all = [];
  for (const [id, rule] of Object.entries(RULES)) { try { all.push(...rule(ctx)); } catch (e) { failed.push(id); console.error(`⚠ 감지 실패: ${id}: ${e.message}`); } }
  const out = [];
  for (const id of Object.keys(RULES)) {
    const list = all.filter(c => c.id === id).sort((p, q) => p.t0 - q.t0), merged = [];
    for (const c of list) {
      const m = merged.at(-1);
      if (m && c.t0 - m.t1 <= TH.mergeGap + 1e-9 && !cs.some(k => k > m.t1 && k < c.t0)) { if (c.score > m.score) { m.score = c.score; m.signal = c.signal; } m.t1 = Math.max(m.t1, c.t1); }
      else merged.push({ ...c });
    }
    out.push(...merged.sort((p, q) => q.score - p.score).slice(0, TH.perId));
  }
  return out.map(c => ({ id: c.id, t0: +clamp(c.t0, 0, total).toFixed(2), t1: +clamp(c.t1, 0, total).toFixed(2), score: +c.score.toFixed(2), signal: c.signal }))
    .sort((p, q) => q.score - p.score || p.t0 - q.t0);
}

// ① 기본기 강도: 움직임 에너지 피크 전후 10%→90% 상승·하강 시간 평균(dur 초), 피크 뒤 0.3초 안 2차 상승 / 1차 높이(over 0~1), holds 평균(hold 초)
export function estimateStrength(energy, fps, peaks, holds = []) {
  const e = energy || [], n = e.length, durs = [], overs = [];
  const at = (i0, i1, lv, up) => {   // i0→i1 방향으로 처음 lv 를 넘는 지점(보간, 프레임 단위)
    const d = i1 >= i0 ? 1 : -1;
    for (let m = i0 + d; d > 0 ? m <= i1 : m >= i1; m += d) {
      const p = e[m - d], q = e[m];
      if (up ? q >= lv : q <= lv) return m - d + d * (q === p ? 1 : (lv - p) / (q - p));
    }
    return null;
  };
  for (const tp of peaks || []) {
    const k = Math.round(tp * fps); if (k < 0 || k >= n) continue;
    const H = e[k]; let j0 = k, j1 = k;
    while (j0 > 0 && e[j0 - 1] <= e[j0]) j0--;
    while (j1 < n - 1 && e[j1 + 1] <= e[j1]) j1++;
    const h0 = H - e[j0], h1 = H - e[j1], ds = [];
    if (h0 > 1e-9) { const a = at(j0, k, e[j0] + 0.1 * h0, true), b = at(j0, k, e[j0] + 0.9 * h0, true); if (a != null && b != null) ds.push(b - a); }
    if (h1 > 1e-9) { const a = at(k, j1, e[j1] + 0.9 * h1, false), b = at(k, j1, e[j1] + 0.1 * h1, false); if (a != null && b != null) ds.push(b - a); }
    if (ds.length) durs.push(ds.reduce((s, v) => s + v, 0) / ds.length / fps);
    const W = Math.ceil(0.3 * fps - 1e-6); let over = 0;
    if (j1 > k && j1 <= k + W && h0 > 1e-9) { let mx = e[j1]; for (let m = j1; m <= Math.min(n - 1, k + W); m++) mx = Math.max(mx, e[m]); over = clamp((mx - e[j1]) / h0, 0, 1); }
    overs.push(over);
  }
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  return { dur: +mean(durs).toFixed(2), over: +mean(overs).toFixed(2), hold: +mean((holds || []).map(h => h[1] - h[0])).toFixed(2) };
}

// ── 이미지 ──
export const NO_CANDIDATES = '자동 감지 후보 없음 — 필요하면 strip 명령으로 근거를 만드세요';
export const evLabel = (name, c) => `${name.replace(/\.png$/, '')} · ${c.id} · ${c.t0.toFixed(2)}–${c.t1.toFixed(2)}s · ${c.signal}`;
// 효과 표 근거 칸에 그대로 붙여 넣는 문구: "<레퍼런스 이름> t0–t1s (<이미지>)" — 레퍼런스 이름 = work/ref-<이름> 폴더
export const evidenceCell = (label, t0, t1, img) => `${label} ${t0.toFixed(2)}–${t1.toFixed(2)}s (${img})`;
// 자동 strip 이름은 id·시작 시각으로 정한다 → 다시 분석해도 같은 후보는 같은 파일 (PLAN.md 효과 표가 계속 유효)
export const isAutoStrip = f => /^ev_.+\.png$/.test(f) && !/^ev_m\d+\.png$/.test(f);
export function nameStrips(cands) {
  const used = new Set();
  return cands.map(c => {
    const stem = `ev_${c.id.replace(/\./g, '-')}_${c.t0.toFixed(2)}`; let name = stem + '.png';
    for (let k = 2; used.has(name); k++) name = `${stem}_${k}.png`;
    used.add(name); return { ...c, strip: name };
  });
}

// 구간 [t0, t1] 을 고르게 6장(양 끝 포함) → board 한 줄(cols 6). 0.5초보다 짧으면 가운데 기준으로 넓힌다.
export async function stripImage(file, P, t0, t1, out, { browser, title = '', note = '' } = {}) {
  const D = P.duration, last = Math.max(0, D - 0.1);
  let a = clamp(t0, 0, D), b = clamp(t1, 0, D);
  if (b - a < TH.stripMin) { const m = (a + b) / 2; b = Math.min(D, Math.max(m + TH.stripMin / 2, TH.stripMin)); a = Math.max(0, b - TH.stripMin); }
  const portrait = P.width < P.height, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-ev-')), items = [];
  try {
    for (let k = 0; k < 6; k++) {
      const t = Math.min(last, a + (b - a) * k / 5), f = path.join(tmp, `${k}.jpg`);
      ffmpeg(['-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${portrait ? 180 : 320}:-2`, '-q:v', '3', f]);
      items.push({ img: f, label: `${t.toFixed(2)}s` });
    }
    await board(items, out, { cols: 6, cellW: portrait ? 120 : 200, browser, title, note });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return out;
}

// 후보 strip 들을 세로로 묶은 쪽: evidence.png(1~8번), evidence_2.png(9~16번)… 후보가 없으면 evidence.png 에 안내 한 칸.
// 이전 실행의 남는 쪽(evidence_N.png)은 지운다. 반환: 쓴 파일 이름 목록
export const EV_PAGE = 8;
export async function evidenceBoard(cands, dir, { browser, title = '' } = {}) {
  const pages = [], n = Math.max(1, Math.ceil(cands.length / EV_PAGE));
  for (let p = 0; p < n; p++) {
    const part = cands.slice(p * EV_PAGE, (p + 1) * EV_PAGE), name = p ? `evidence_${p + 1}.png` : 'evidence.png';
    const items = part.length ? part.map(c => ({ img: path.join(dir, c.strip), label: `${c.strip} · score ${c.score}` })) : [{ label: NO_CANDIDATES }];   // 자세한 라벨은 strip 제목에 있다
    await board(items, path.join(dir, name), { cols: 1, cellW: part.length ? 1100 : 640, browser, title: n > 1 ? `${title} (${p + 1}/${n}쪽)` : title, note: part.length ? '각 strip 을 보고 후보를 확정·기각한다. 놓친 효과는 analyze-ref strip 명령으로 근거를 만든다' : '' });
    pages.push(name);
  }
  for (const f of fs.readdirSync(dir)) if (/^evidence_\d+\.png$/.test(f) && !pages.includes(f)) fs.rmSync(path.join(dir, f));
  return pages;
}
