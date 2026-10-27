import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { buildCandidates, estimateStrength, measureSeries, seriesSize, nameStrips, isAutoStrip, evidenceCell, spikeCuts, frameDiffs, mergeCuts, TH } from '../../harness/tools/lib/evidence.mjs';
import { parseEffectTable } from '../../harness/tools/lib/plan.mjs';
import { probe } from '../../harness/tools/_common.mjs';
import { pattern, rng } from '../helpers/frames.mjs';

const S = (n, f) => Array.from({ length: n }, (_, i) => ({ t: i / 12, gm: { dx: 0, dy: 0, scale: 1, rot: 0, parallax: 0 }, sharp: new Float32Array(12).fill(10), dblur: { ratio: 1 }, fill: { ratio: 0.1, hex: '#ffffff' }, jitter: 0, blobs: [], ...f(i) }));
test('zoom-out series → cam.push', () => { const c = buildCandidates(S(24, () => ({ gm: { dx: 0, dy: 0, scale: 0.985, rot: 0, parallax: 0 } })), [], 2, 160, 90); assert.ok(c.some(x => x.id === 'cam.push')); });
test('fill series → trans.fill with time', () => { const c = buildCandidates(S(24, i => ({ fill: { ratio: i < 10 ? 0.2 : 0.95, hex: '#f2c94c' } })), [], 2, 160, 90).find(x => x.id === 'trans.fill'); assert.ok(c && c.t0 >= 0.5 && c.t1 <= 1.2); });
test('static series → no candidates', () => assert.deepEqual(buildCandidates(S(24, () => ({})), [], 2, 160, 90), []));
test('very short series (<2s, 1 frame) → []', () => assert.deepEqual(buildCandidates(S(1, () => ({})), [], 0.08, 160, 90), []));
test('estimateStrength overshoot', () => { const e = [0, .2, .6, 1, .6, .2, .05, .35, .1, 0, 0, 0]; const s = estimateStrength(e, 12, [3 / 12]); assert.ok(s.over > 0.2 && s.dur > 0); });

// ---- 추가 검증 ----
const ids = c => c.map(x => x.id);
const gm = o => ({ gm: { dx: 0, dy: 0, scale: 1, rot: 0, parallax: 0, n: 48, ...o } });

test('candidate shape and rounding', () => {
  const c = buildCandidates(S(24, () => gm({ scale: 0.985 })), [], 2, 160, 90).find(x => x.id === 'cam.push');
  assert.deepEqual(Object.keys(c).sort(), ['id', 'score', 'signal', 't0', 't1']);
  assert.ok(c.score > 0 && c.score <= 1 && c.t0 >= 0 && c.t1 <= 2 && c.t1 - c.t0 >= TH.pushDur);
  assert.equal(typeof c.signal, 'string'); assert.ok(c.signal.length > 0);
});
test('zoom across a cut does not accumulate (cut splits segments)', () => {
  const c = buildCandidates(S(24, () => gm({ scale: 0.985 })), [0.5, 1.0, 1.5], 2, 160, 90);
  assert.ok(!c.some(x => x.id === 'cam.push'), JSON.stringify(c));
});
test('strided gm3 is preferred for camera totals (R5)', () => {
  // 1-프레임 gm 은 작게 읽히지만(정지), gm3 는 3프레임마다 0.95배 → 누적 확대로 잡혀야 한다
  const c = buildCandidates(S(24, i => ({ ...gm({ scale: 0.999 }), gm3: i % 3 === 0 && i + 3 < 24 ? { dx: 0, dy: 0, scale: 0.95, rot: 0, parallax: 0, n: 48 } : null })), [], 2, 160, 90);
  assert.ok(c.some(x => x.id === 'cam.push'));
});
test('fast zoom that block matching cannot follow: radial-spectrum scale (rs3, corr ≥ rsCorr) accumulates → cam.push', () => {
  const rs = (scale, corr) => i => ({ ...gm({}), rs3: i % 3 === 0 && i + 3 < 24 ? { scale, corr } : null });
  const c = buildCandidates(S(24, rs(0.8, 0.9)), [], 2, 160, 90).find(x => x.id === 'cam.push');
  assert.ok(c && /축소/.test(c.signal) && /스펙트럼/.test(c.signal), JSON.stringify(c));
  assert.ok(!ids(buildCandidates(S(24, rs(0.8, TH.rsCorr - 0.1)), [], 2, 160, 90)).includes('cam.push'));   // 상관 낮음 = 내용이 바뀐 것
  assert.ok(!ids(buildCandidates(S(24, rs(0.8, 0.9)), [0.5, 1.0, 1.5], 2, 160, 90)).includes('cam.push'));   // 컷이 나누면 누적 안 됨
});
test('pan → cam.pan, not cam.push', () => {
  const c = buildCandidates(S(24, () => gm({ dx: 3 })), [], 2, 160, 90);
  assert.ok(ids(c).includes('cam.pan')); assert.ok(!ids(c).includes('cam.push'));
});
test('rotation → cam.rotate', () => assert.ok(ids(buildCandidates(S(24, () => gm({ rot: 0.5 })), [], 2, 160, 90)).includes('cam.rotate')));
test('shake → cam.shake', () => {
  const c = buildCandidates(S(24, i => gm({ dx: i % 2 ? 2 : -2, dy: i % 2 ? -1 : 1 })), [], 2, 160, 90);
  assert.ok(ids(c).includes('cam.shake'), JSON.stringify(c));
  assert.ok(!ids(buildCandidates(S(24, i => gm({ dx: i % 2 ? 1 : -1, res: 2 })), [], 2, 160, 90)).includes('cam.shake'));   // 맞춤 잔차보다 작은 왕복 = 측정 잡음
  assert.ok(!ids(buildCandidates(S(24, i => gm({ dx: i % 2 ? 2 : -2, n: 8 })), [], 2, 160, 90)).includes('cam.shake'));     // 블록 몇 칸만 맞춤
});
test('parallax → cam.parallax; misfit residual (scattered, larger than the top/bottom split) is not parallax', () => {
  assert.ok(ids(buildCandidates(S(24, () => gm({ dx: 1, parallax: 1.6, res: 1 })), [], 2, 160, 90)).includes('cam.parallax'));
  assert.ok(!ids(buildCandidates(S(24, () => gm({ dx: 1, parallax: 1.6, res: 3 })), [], 2, 160, 90)).includes('cam.parallax'));
});
test('long moving uncut segment → cam.onetake', () => {
  const c = buildCandidates(S(96, i => gm({ dx: i % 24 < 12 ? 0.5 : -0.5 })), [], 8, 160, 90);
  assert.ok(ids(c).includes('cam.onetake'));
  assert.ok(!ids(buildCandidates(S(96, i => gm({ dx: i % 24 < 12 ? 0.5 : -0.5 })), [4], 8, 160, 90)).includes('cam.onetake'));
});
test('dof: sharp center, soft (but not flat) edges ≥1s → lens.dof', () => {
  const sharp = Float32Array.from({ length: 12 }, (_, k) => k === 5 || k === 6 ? 300 : 6);
  assert.ok(ids(buildCandidates(S(24, () => ({ sharp })), [], 2, 160, 90)).includes('lens.dof'));
  const flat = Float32Array.from({ length: 12 }, (_, k) => k === 5 || k === 6 ? 300 : 0);   // 단색 바탕 위 가운데 글자 ≠ 심도
  assert.ok(!ids(buildCandidates(S(24, () => ({ sharp: flat })), [], 2, 160, 90)).includes('lens.dof'));
});
test('rack focus: sharpest cell jumps ≥2 cells → lens.rack', () => {
  const at = k => Float32Array.from({ length: 12 }, (_, j) => j === k ? 300 : 20);
  assert.ok(!ids(buildCandidates(S(24, i => ({ sharp: at(i < 12 ? 4 : 7) })), [], 2, 160, 90)).includes('lens.rack'));   // 한 프레임에 15배 뜀 = 컷처럼 바뀐 내용 (초점 이동은 여러 프레임에 걸친다)
  assert.ok(!ids(buildCandidates(S(24, i => ({ ...gm({ dx: 3 }), sharp: at(i < 12 ? 4 : 7) })), [], 2, 160, 90)).includes('lens.rack'));   // 패닝 중 선명 칸 이동 ≠ 랙포커스
  const appear = Float32Array.from({ length: 12 }, (_, j) => j === 4 ? 300 : j === 7 ? 3 : 20), shown = Float32Array.from({ length: 12 }, (_, j) => j === 7 ? 300 : 20);
  assert.ok(!ids(buildCandidates(S(24, i => ({ sharp: i < 12 ? appear : shown })), [], 2, 160, 90)).includes('lens.rack'));   // 빈 칸에 글자가 나타남 ≠ 초점 이동
  const pop = Float32Array.from({ length: 12 }, (_, j) => j === 4 ? 300 : j === 7 ? 25 : 20);
  assert.ok(!ids(buildCandidates(S(24, i => ({ sharp: i < 12 ? pop : at(7) })), [], 2, 160, 90)).includes('lens.rack'));   // 한 프레임에 12배 → 내용이 튀어나옴
  const pull = i => Float32Array.from({ length: 12 }, (_, j) => j === 4 ? 300 / 1.6 ** Math.max(0, i - 6) : j === 7 ? 300 / 1.6 ** Math.max(0, 14 - i) : 20);   // 0.7초에 걸쳐 초점이 옮겨 감
  assert.ok(ids(buildCandidates(S(24, i => ({ sharp: pull(i) })), [], 2, 160, 90)).includes('lens.rack'));
  assert.ok(!ids(buildCandidates(S(24, i => ({ ...gm({ scale: 1.05 }), sharp: pull(i) })), [], 2, 160, 90)).includes('lens.rack'));   // 확대 중 = 화면이 움직임
});
test('motion blur on moving frames → lens.mblur', () => {
  const c = buildCandidates(S(36, i => ({ ...gm({ dx: i >= 12 && i < 24 ? 4 : 0 }), dblur: { ratio: i >= 12 && i < 24 ? 3 : 1 } })), [], 3, 160, 90);
  assert.ok(ids(c).includes('lens.mblur'), JSON.stringify(c));
});
test('smear without camera motion → lens.smear', () => {
  const c = buildCandidates(S(24, i => ({ dblur: { ratio: i >= 8 && i < 13 ? 3 : 1 } })), [], 2, 160, 90);
  assert.ok(ids(c).includes('lens.smear'));
  assert.ok(!ids(buildCandidates(S(48, i => ({ dblur: { ratio: i < 30 ? 1 : 3 } })), [], 4, 160, 90)).includes('lens.smear'));   // 글자 줄이 나타나 계속 남음 = 고정 줄무늬 (R5)
});
test('vhs: tracking band (full-width edge + shifted rows near it) that moves between frames ≥0.4s → fx.vhs; flat-frame lines, short bursts, static bands do not', () => {
  const band = (cover, jitter, y = 40) => ({ band: { cover, y, jitter } });
  const roll = i => 80 - 7 * (i % 11);   // 띠가 프레임마다 위로 굴러간다
  const c = buildCandidates(S(36, i => i >= 12 && i < 20 && i !== 15 ? band(1, 1.5, roll(i)) : band(0.4, 0.1)), [], 3, 160, 90).find(x => x.id === 'fx.vhs');
  assert.ok(c && c.t0 === 1 && c.t1 >= 1.6, JSON.stringify(c));
  assert.ok(!ids(buildCandidates(S(36, i => i >= 12 && i < 20 ? band(1, null, roll(i)) : band(0.4, 0.1)), [], 3, 160, 90)).includes('fx.vhs'));   // 평평한 바탕 위 선
  assert.ok(!ids(buildCandidates(S(36, i => i >= 12 && i < 16 ? band(1, 1.5, roll(i)) : band(0.4, 0.1)), [], 3, 160, 90)).includes('fx.vhs'));    // 0.33초
  assert.ok(!ids(buildCandidates(S(48, () => band(1, 8, 7)), [], 4, 160, 90)).includes('fx.vhs'));   // 고정 샷의 머리띠 경계(같은 행·같은 어긋남) — R5
  assert.ok(!ids(buildCandidates(S(48, i => band(1, 8, i < 24 ? 7 : 40)), [2.02], 4, 160, 90)).includes('fx.vhs'));   // 고정 샷 둘이 컷으로 이어짐 — 컷에서만 '움직임'
  const cut = buildCandidates(S(36, i => i >= 6 && i < 30 ? band(1, 1.5, roll(i)) : band(0.4, 0.1)), [1.56], 3, 160, 90).filter(x => x.id === 'fx.vhs');
  assert.ok(cut.length === 1 && cut[0].t0 <= 0.6 && cut[0].t1 >= 2.4, JSON.stringify(cut));   // 오버레이는 컷을 넘어 이어진다 (레퍼런스 A 되감기)
  const short = buildCandidates(S(36, i => i >= 12 && i < 17 ? band(1, 1.5, i < 15 ? 30 : 31) : band(0.4, 0.1)), [], 3, 160, 90);
  assert.ok(!ids(short).includes('fx.vhs'), JSON.stringify(short));   // 띠가 거의 제자리(1행)인 프레임이 끼면 0.4초가 안 된다
  assert.deepEqual(buildCandidates(S(36, () => ({ jitter: 3, dblur: { ratio: 40 } })), [], 3, 160, 90), []);   // 고정 줄무늬
});
test('glitch: ≥2 short jitter bursts → fx.glitch', () => {
  const c = buildCandidates(S(36, i => ({ jitter: i === 6 || i === 7 || i === 24 ? 4 : 0.2 })), [], 3, 160, 90);
  assert.ok(ids(c).includes('fx.glitch')); assert.ok(!ids(c).includes('fx.vhs'));
  assert.ok(!ids(buildCandidates(S(36, i => ({ jitter: i === 6 ? 4 : 0.2 })), [], 3, 160, 90)).includes('fx.glitch'));
});
test('fill: noisy fill ≥0.85 counts as filled (R5)', () => {
  assert.ok(ids(buildCandidates(S(24, i => ({ fill: { ratio: i < 10 ? 0.2 : 0.87, hex: '#f2c94c' } })), [], 2, 160, 90)).includes('trans.fill'));
  assert.ok(!ids(buildCandidates(S(36, i => ({ fill: { ratio: i < 10 ? 0.2 : i < 24 ? 0.6 : 0.95, hex: '#f2c94c' } })), [], 3, 160, 90)).includes('trans.fill'));   // 1초 넘게 걸린 변화
});
test('fill on a flat background: colour A (≥85%) → disk of B grows → B (≥85%) without a cut → trans.fill; hard colour cut or dissolve → not', () => {
  const W_ = '#ffffff', Y = '#f2c94c', f = (ratio, hex) => ({ fill: { ratio, hex } });
  const grow = i => i < 12 ? f(0.95, W_) : i === 12 ? f(0.8, W_) : i === 13 ? f(0.55, W_) : i === 14 ? f(0.7, Y) : f(0.96, Y);
  const c = buildCandidates(S(30, grow), [], 2.5, 160, 90).find(x => x.id === 'trans.fill');
  assert.ok(c && c.t0 >= 0.9 && c.t1 <= 1.3, JSON.stringify(c));
  assert.ok(!ids(buildCandidates(S(30, i => i < 12 ? f(0.95, W_) : f(0.96, Y)), [], 2.5, 160, 90)).includes('trans.fill'));            // 한 프레임 만에 바뀜 = 컷
  assert.ok(!ids(buildCandidates(S(30, grow), [1.1], 2.5, 160, 90)).includes('trans.fill'));                                            // 사이에 컷
  assert.ok(!ids(buildCandidates(S(30, i => i < 12 ? f(0.95, W_) : i < 15 ? f(0.97, '#f8e2a6') : f(0.96, Y)), [], 2.5, 160, 90)).includes('trans.fill'));   // 디졸브(중간색)
});
test('zoom-through before a cut → trans.zoomThrough', () => {
  const c = buildCandidates(S(24, i => gm({ scale: i < 12 ? 1.06 : 1 })), [1.0], 2, 160, 90);
  assert.ok(ids(c).includes('trans.zoomThrough'), JSON.stringify(c));
  const z = c.find(x => x.id === 'trans.zoomThrough'); assert.ok(z.t0 >= 0.4 && z.t1 <= 1.05);
});
test('whip: fast pan near a cut → trans.whip; same pan far from cuts does not', () => {
  const series = S(36, i => gm({ dx: i >= 9 && i < 12 ? 9 : 0 }));
  assert.ok(ids(buildCandidates(series, [1.0], 3, 160, 90)).includes('trans.whip'));
  assert.ok(!ids(buildCandidates(series, [2.5], 3, 160, 90)).includes('trans.whip'));
});
test('whip: block matching collapses while blur rises near cut → trans.whip', () => {
  const c = buildCandidates(S(36, i => ({ ...gm(i === 11 ? { n: 0 } : {}), dblur: { ratio: i === 11 ? 2 : 1 } })), [1.0], 3, 160, 90);
  assert.ok(ids(c).includes('trans.whip'), JSON.stringify(c));
  const dip = buildCandidates(S(36, i => ({ ...gm(i === 11 ? { n: 0 } : {}), dblur: { ratio: i === 11 ? 2 : 1 }, fill: { ratio: i === 12 ? 1 : 0.1, hex: '#000000' } })), [1.0], 3, 160, 90);
  assert.ok(!ids(dip).includes('trans.whip'), JSON.stringify(dip));   // 검은 화면으로 넘어가는 프레임: 매칭할 무늬가 없을 뿐
});
const blob = (cx, cy, area, sig, hex = '#f2c94c', r = 8) => ({ hex, cx, cy, area, bbox: [cx - r, cy - r, cx + r, cy + r], sig });
const ROUND = Float32Array.from({ length: 16 }, () => 1), SPIKY = Float32Array.from({ length: 16 }, (_, k) => k % 2 ? 0.1 : 1);
test('match cut: same-hex blob in same place across cut → trans.match', () => {
  const c = buildCandidates(S(24, i => ({ blobs: [blob(i < 12 ? 80 : 82, 45, i < 12 ? 0.05 : 0.06, ROUND)] })), [1.0], 2, 160, 90);
  assert.ok(ids(c).includes('trans.match'));
  const far = buildCandidates(S(24, i => ({ blobs: [blob(i < 12 ? 20 : 140, 45, 0.05, ROUND)] })), [1.0], 2, 160, 90);
  assert.ok(!ids(far).includes('trans.match'));
  assert.ok(!ids(buildCandidates(S(24, () => ({ blobs: [blob(80, 45, 0.005, ROUND)] })), [1.0], 2, 160, 90)).includes('trans.match'));   // 글자 조각 크기
});
test('shared element across ≥2 cuts → trans.shared', () => {
  const c = buildCandidates(S(36, i => ({ blobs: i === 20 ? [] : [blob(40 + i * 2, 45, 0.04, ROUND)] })), [1.0, 2.0], 3, 160, 90);
  assert.ok(ids(c).includes('trans.shared'));
  assert.ok(!ids(buildCandidates(S(36, i => ({ blobs: [blob(40, 45, 0.04, ROUND)] })), [1.0], 3, 160, 90)).includes('trans.shared'));
});
test('blob changes shape without cut → morph.shape', () => {
  const c = buildCandidates(S(24, i => ({ blobs: [blob(80, 45, 0.05, i < 12 ? ROUND : SPIKY)] })), [], 2, 160, 90);
  assert.ok(ids(c).includes('morph.shape'));
  assert.ok(!ids(buildCandidates(S(24, () => ({ blobs: [blob(80, 45, 0.05, ROUND)] })), [], 2, 160, 90)).includes('morph.shape'));
});
test('morph: one blob turns into a row of pieces (logo) in place, even through a frame where it is too small to see → morph.shape', () => {
  const piece = (cx, cy) => ({ hex: '#f2c94c', cx, cy, area: 0.006, bbox: [cx - 3, cy - 4, cx + 3, cy + 4], sig: ROUND });
  const c = buildCandidates(S(24, i => ({ ...gm({}), blobs: i < 10 ? [blob(80, 45, 0.02, ROUND)] : i === 10 ? [] : [60, 72, 88, 100].map(x => piece(x, 45)) })), [], 2, 160, 90);
  assert.ok(ids(c).includes('morph.shape'), JSON.stringify(c));
});
test('morph: shape change explained by frame edge, moving camera or vanishing is not a morph', () => {
  const edge = i => ({ ...gm({}), blobs: [{ ...blob(80, 85, 0.05, i < 12 ? ROUND : SPIKY), bbox: [70, 75, 90, 89] }] });   // 화면 아래 끝에 걸린 덩어리
  assert.ok(!ids(buildCandidates(S(24, edge), [], 2, 160, 90)).includes('morph.shape'));
  assert.ok(!ids(buildCandidates(S(24, i => ({ ...gm({ dx: 3 }), blobs: [blob(80, 45, 0.05, i < 12 ? ROUND : SPIKY)] })), [], 2, 160, 90)).includes('morph.shape'));
  assert.ok(!ids(buildCandidates(S(24, i => ({ ...gm({}), blobs: [blob(80, 45, i < 12 ? 0.05 : 0.004, i < 12 ? ROUND : SPIKY, '#f2c94c', i < 12 ? 8 : 2)] })), [], 2, 160, 90)).includes('morph.shape'));
});
test('null detector fields are tolerated', () => {
  const nul = S(24, i => ({ gm: i % 2 ? null : undefined, gm3: null, sharp: null, dblur: null, fill: null, jitter: null, blobs: null }));
  assert.deepEqual(buildCandidates(nul, [1.0], 2, 160, 90), []);
});
test('same-id candidates within 0.3s merge; at most 3 per id, score-desc', () => {
  const bursts = [3, 6, 30, 33, 60, 63, 90, 93];   // 0.25초 간격 쌍 4개 → 병합 후 4개 → 최대 3개
  const c = buildCandidates(S(108, i => ({ jitter: bursts.includes(i) ? 4 + i / 100 : 0.2 })), [], 9, 160, 90).filter(x => x.id === 'fx.glitch');
  assert.equal(c.length, 3);
  for (let k = 1; k < c.length; k++) assert.ok(c[k - 1].score >= c[k].score);
  assert.ok(c.every(x => x.t1 - x.t0 >= 0.2), JSON.stringify(c));
});
test('candidates on both sides of a cut are not merged', () => {
  const c = buildCandidates(S(168, () => gm({ dx: 0.5 })), [7.0], 14, 160, 90).filter(x => x.id === 'cam.onetake');
  assert.equal(c.length, 2, JSON.stringify(c)); assert.ok(c.every(x => x.t1 <= 7.0 || x.t0 >= 7.0));
});
test('estimateStrength: no peaks → zeros, hold from holds', () => {
  assert.deepEqual(estimateStrength([0, 0, 0], 12, []), { dur: 0, over: 0, hold: 0 });
  assert.equal(estimateStrength([0, 1, 0], 12, [1 / 12], [[0, 1], [2, 4]]).hold, 1.5);
  const s = estimateStrength([0, .5, 1, .5, 0, 0, 0, 0], 12, [2 / 12]); assert.equal(s.over, 0); assert.ok(s.dur > 0 && s.dur < 0.3);
});

// ---- measureSeries: 실제 ffmpeg 디코드 ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
const mk = (name, args) => { const f = path.join(tmp, name); const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, '-pix_fmt', 'yuv420p', f]); assert.equal(r.status, 0, String(r.stderr)); return f; };
test('measureSeries: still video → static series of the right shape', () => {
  const f = mk('still.mp4', ['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=1.5']), P = probe(f);
  const failed = [], s = measureSeries(f, P, { accents: ['#f2c94c'], failed });
  assert.deepEqual(seriesSize(P), [160, 90]);
  assert.ok(s.length >= 16 && s.length <= 19, `${s.length} 프레임`);
  assert.deepEqual(failed, []);
  for (const k of ['t', 'gm', 'gm3', 'rs3', 'sharp', 'dblur', 'fill', 'jitter', 'band', 'blobs']) assert.ok(k in s[0], k);
  assert.equal(s.at(-1).gm, null); assert.equal(s.at(-2).gm3, null); assert.equal(s.at(-2).rs3, null);
  assert.deepEqual(buildCandidates(s, [], P.duration, 160, 90), []);
});
test('measureSeries: panning texture → strided motion beyond default range; cut blocks gm3', () => {
  // 무늬(1280×360) 위를 24fps 프레임당 6px 이동 → 160 폭 12fps 기준 프레임당 3px, 3프레임에 9px (기본 범위 6 초과)
  const pgm = path.join(tmp, 'pat.pgm'); fs.writeFileSync(pgm, Buffer.concat([Buffer.from('P5\n1280 360\n255\n'), Buffer.from(pattern(1280, 360, 7))]));
  const f = mk('pan.mp4', ['-loop', '1', '-framerate', '24', '-i', pgm, '-t', '2', '-vf', "crop=640:360:x='n*6':y=0"]);
  const P = probe(f), s = measureSeries(f, P, { cuts: [1.0] });
  const mid = s.filter(e => e.gm3 && e.t > 0.1 && e.t < 0.6);
  assert.ok(mid.length > 2 && mid.every(e => Math.abs(e.gm3.dx + 9) < 0.5 && Math.abs(e.gm.dx + 3) < 0.3), JSON.stringify(mid.map(e => [e.gm.dx, e.gm3.dx])));
  const across = s.filter(e => e.t < 1.0 && e.t + 3 / 12 > 1.0 - 1e-6);
  assert.ok(across.length && across.every(e => e.gm3 === null));
});
test('measureSeries: a failing detector leaves its field null and is reported', () => {
  const f = path.join(tmp, 'still.mp4'), P = probe(f), failed = [];
  const s = measureSeries(f, P, { accents: ['not-a-color'], failed, detectors: { accentBlobs: () => { throw new Error('x'); } } });
  assert.ok(s.every(e => e.blobs === null)); assert.deepEqual(failed, ['accentBlobs']);
});
test('measureSeries: only vivid accents (Lab chroma ≥ accentChroma) reach the blob detector — dark background colours are not accents', () => {
  const f = path.join(tmp, 'still.mp4'), P = probe(f), seen = new Set();
  measureSeries(f, P, { accents: ['#050a0c', '#0f242e', '#e5cc61', '#c8605a'], detectors: { accentBlobs: (rgb, w, h, acc) => { acc.forEach(a => seen.add(a)); return []; } } });
  assert.deepEqual([...seen].sort(), ['#c8605a', '#e5cc61']);
});
test('measureSeries: series.size defaults buildCandidates W·H (not video pixels)', () => {
  const f = path.join(tmp, 'pan.mp4'), P = probe(f), s = measureSeries(f, P, { cuts: [1.0] });
  assert.deepEqual(s.size, seriesSize(P)); assert.ok(!Object.keys(s).includes('size'));
  assert.deepEqual(buildCandidates(s, [1.0], P.duration), buildCandidates(s, [1.0], P.duration, ...seriesSize(P)));
  assert.notDeepEqual(buildCandidates(s, [], P.duration).map(c => c.id), buildCandidates(s, [], P.duration, P.width * 10, P.height * 10).map(c => c.id));
});
test('strip names are stable (id + start), unique, and parse as gate evidence', () => {
  const c = nameStrips([{ id: 'trans.fill', t0: 6.67, t1: 7.67 }, { id: 'cam.push', t0: 0, t1: 2 }, { id: 'trans.fill', t0: 6.67, t1: 7 }]);
  assert.deepEqual(c.map(x => x.strip), ['ev_trans-fill_6.67.png', 'ev_cam-push_0.00.png', 'ev_trans-fill_6.67_2.png']);
  assert.deepEqual(nameStrips([{ id: 'trans.fill', t0: 6.67, t1: 7.67 }])[0].strip, c[0].strip);
  assert.ok(c.every(x => isAutoStrip(x.strip)) && isAutoStrip('ev_01.png') && !isAutoStrip('ev_m01.png') && !isAutoStrip('evidence.png'));
  const cell = evidenceCell('b_ref', 6.67, 7.67, c[0].strip);
  assert.equal(cell, 'b_ref 6.67–7.67s (ev_trans-fill_6.67.png)');
  assert.deepEqual(parseEffectTable(`효과 표\n| a | b | c | d |\n|---|---|---|---|\n| trans.fill | ② | ${cell} | s1 |`)[0].evidence, { ref: 'b_ref', t0: 6.67, t1: 7.67, img: 'ev_trans-fill_6.67.png' });
});

// ---- 컷: 프레임 차이 스파이크 (R7) ----
const quiet = (n, seed = 1) => { let a = seed; return Float32Array.from({ length: n }, () => { a = (a * 16807) % 2147483647; return 0.002 + 0.003 * (a / 2147483647); }); };
test('spikeCuts: isolated jump in a quiet series → one cut at that frame', () => {
  const d = quiet(120); d[60] = 0.05;
  assert.deepEqual(spikeCuts(d, 60), [1]);
});
test('spikeCuts: cut followed by fast motion still counts (quiet side decides); two cuts 0.2 s apart both count', () => {
  const d = quiet(240); d[60] = 0.12; for (let i = 61; i < 100; i++) d[i] = 0.02 + 0.01 * (i % 3);   // 끝에서 갑자기 멈춰도 움직임 끝은 컷이 아니다
  assert.deepEqual(spikeCuts(d, 60), [1]);
  const e = quiet(240); e[120] = 0.15; e[132] = 0.2;
  assert.deepEqual(spikeCuts(e, 60), [2, 2.2]);
});
test('spikeCuts: periodic flicker, sustained motion, abrupt start/stop of motion and small pops are not cuts', () => {
  const g = quiet(240); for (let i = 60; i < 120; i++) g[i] = 0.06 + 0.01 * (i % 3);   // 갑자기 시작해 갑자기 멈추는 빠른 움직임
  assert.deepEqual(spikeCuts(g, 60), []);
  const f = quiet(240); for (let i = 12; i < 239; i += 12) { f[i] = 0.06; f[i + 1] = 0.03; }   // 0.2초마다 같은 크기 깜빡임(2프레임)
  assert.deepEqual(spikeCuts(f, 60), []);
  const m = Float32Array.from({ length: 240 }, (_, i) => 0.05 + 0.02 * Math.abs(Math.sin(i)));   // 빠른 카메라 이동
  assert.deepEqual(spikeCuts(m, 60), []);
  const p = quiet(120); p[60] = TH.cutMin * 0.8;   // 작은 요소 하나가 튀어나옴
  assert.deepEqual(spikeCuts(p, 60), []);
  assert.deepEqual(spikeCuts(new Float32Array(0), 60), []); assert.deepEqual(spikeCuts(quiet(3), 60), []);
});
test('mergeCuts: union, sorted, near-duplicates and edge times dropped', () => {
  assert.deepEqual(mergeCuts([[2.07, 16.98], [2.0667, 7.33, 16.983, 19.02]], 19.05), [2.07, 7.33, 16.98]);
  assert.deepEqual(mergeCuts([], 5), []);
  assert.deepEqual(mergeCuts([[], [25.0167, 25.2]], 40), [25.02, 25.2]);   // 한 감지기의 0.18초 간격 두 컷(검은 띠 전환)은 둘 다 남는다
  assert.deepEqual(mergeCuts([[2.0667, 2.0833]], 19), [2.07]);             // 같은 목록의 1프레임 차 중복은 하나
});
test('frameDiffs + spikeCuts on decoded video: hard cut between two flat colours of similar brightness; smooth pan has none', () => {
  const f = mk('cut.mp4', ['-f', 'lavfi', '-i', 'color=c=0xF5F5F5:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=0xF2C94C:s=320x180:r=30:d=1', '-filter_complex', '[0][1]concat=n=2:v=1[v]', '-map', '[v]']);
  const P = probe(f), { d, fps } = frameDiffs(f, P);
  assert.equal(fps, 30); assert.ok(d.length >= 58 && d.length <= 61, String(d.length));
  const c = spikeCuts(d, fps); assert.equal(c.length, 1); assert.ok(Math.abs(c[0] - 1) <= 1 / 30 + 1e-9, String(c));
  const pan = path.join(tmp, 'pan.mp4'), Q = probe(pan), r = frameDiffs(pan, Q);
  assert.deepEqual(spikeCuts(r.d, r.fps), []);
});

// ---- 리뷰 합성 영상 (rev17b probe): 평평한 UI 정지 화면·단색 바탕 채움 ----
const raw = (name, W, H, fps, n, frame) => {
  const f = path.join(tmp, name), bufs = []; for (let i = 0; i < n; i++) bufs.push(Buffer.from(frame(i / fps)));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-', '-pix_fmt', 'yuv420p', '-crf', '18', f], { input: Buffer.concat(bufs), maxBuffer: 1 << 30 });
  assert.equal(r.status, 0, String(r.stderr)); return f;
};
const canvas = (W, H, c) => { const o = new Uint8Array(W * H * 3); for (let i = 0; i < W * H; i++) o.set(c, i * 3); return o; };
const box = (o, W, H, x0, y0, w, h, c) => { for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) o.set(c, (y * W + x) * 3); };
const lines = (o, W, H, y0, n, seed, k = W / 640) => { const r = rng(seed); for (let l = 0; l < n; l++) { let x = 30 * k; const y = y0 + l * 22 * k, end = (560 - r() * 200) * k; while (x < end) { const gw = (4 + Math.floor(r() * 8)) * k; if (r() < 0.15) { x += 10 * k; continue; } box(o, W, H, Math.round(x), Math.round(y + Math.floor(r() * 3) * k), Math.round(gw), Math.round((12 - Math.floor(r() * 4)) * k), [40, 40, 40]); x += gw + 2 * k; } } };
test('flat UI still (header band + text lines right below or further down, 1280×720) → no fx.vhs (review flatui_text_near_edge / far)', () => {
  for (const gap of [4, 40]) {   // 리뷰 probe 와 같은 그림 (머리띠 60px, 글자 줄 22px 간격)
    const fr = canvas(1280, 720, [255, 255, 255]); box(fr, 1280, 720, 0, 0, 1280, 60, [0x2d, 0x9c, 0xdb]); lines(fr, 1280, 720, 60 + gap, 10, 5, 1);
    const f = raw(`flatui_${gap}.mp4`, 1280, 720, 12, 18, () => fr), P = probe(f), s = measureSeries(f, P);
    assert.ok(!ids(buildCandidates(s, [], P.duration)).includes('fx.vhs'), `gap ${gap}: ` + JSON.stringify(s.slice(0, 3).map(e => e.band)));
  }
});
test('yellow disk grows over a flat white screen with a few text lines in 0.4 s → trans.fill (review fill_ours); hard cut white → yellow → none', () => {
  const W = 640, H = 360, Y = [0xf2, 0xc9, 0x4c];
  const grow = raw('fill_ours.mp4', W, H, 24, 72, t => { const o = canvas(W, H, [255, 255, 255]); lines(o, W, H, 30, 4, 3); const rr = t < 1 ? 30 : t < 1.4 ? 30 + (t - 1) / 0.4 * 420 : 450; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 320) ** 2 + (y - 180) ** 2 < rr * rr) o.set(Y, (y * W + x) * 3); return o; });
  const P = probe(grow), c = buildCandidates(measureSeries(grow, P), [], P.duration).find(x => x.id === 'trans.fill');
  assert.ok(c && c.t0 >= 0.8 && c.t1 <= 1.6, JSON.stringify(c));
  const cut = raw('cut_wy.mp4', W, H, 24, 48, t => t < 1 ? canvas(W, H, [255, 255, 255]) : canvas(W, H, Y)), Q = probe(cut);
  assert.ok(!ids(buildCandidates(measureSeries(cut, Q), [], Q.duration)).includes('trans.fill'));   // 컷 검출 전이라도 한 프레임 만에 바뀐 색은 채움이 아니다
});
