import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { buildCandidates, estimateStrength, measureSeries, seriesSize, nameStrips, isAutoStrip, evidenceCell, TH } from '../../harness/tools/lib/evidence.mjs';
import { parseEffectTable } from '../../harness/tools/lib/plan.mjs';
import { probe } from '../../harness/tools/_common.mjs';
import { pattern } from '../helpers/frames.mjs';

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
test('pan → cam.pan, not cam.push', () => {
  const c = buildCandidates(S(24, () => gm({ dx: 3 })), [], 2, 160, 90);
  assert.ok(ids(c).includes('cam.pan')); assert.ok(!ids(c).includes('cam.push'));
});
test('rotation → cam.rotate', () => assert.ok(ids(buildCandidates(S(24, () => gm({ rot: 0.5 })), [], 2, 160, 90)).includes('cam.rotate')));
test('shake → cam.shake', () => {
  const c = buildCandidates(S(24, i => gm({ dx: i % 2 ? 2 : -2, dy: i % 2 ? -1 : 1 })), [], 2, 160, 90);
  assert.ok(ids(c).includes('cam.shake'), JSON.stringify(c));
});
test('parallax → cam.parallax', () => assert.ok(ids(buildCandidates(S(24, () => gm({ dx: 1, parallax: 1.6 })), [], 2, 160, 90)).includes('cam.parallax')));
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
  assert.ok(ids(buildCandidates(S(24, i => ({ sharp: at(i < 12 ? 4 : 7) })), [], 2, 160, 90)).includes('lens.rack'));
  assert.ok(!ids(buildCandidates(S(24, i => ({ ...gm({ dx: 3 }), sharp: at(i < 12 ? 4 : 7) })), [], 2, 160, 90)).includes('lens.rack'));   // 패닝 중 선명 칸 이동 ≠ 랙포커스
});
test('motion blur on moving frames → lens.mblur', () => {
  const c = buildCandidates(S(36, i => ({ ...gm({ dx: i >= 12 && i < 24 ? 4 : 0 }), dblur: { ratio: i >= 12 && i < 24 ? 3 : 1 } })), [], 3, 160, 90);
  assert.ok(ids(c).includes('lens.mblur'), JSON.stringify(c));
});
test('smear without camera motion → lens.smear', () => {
  const c = buildCandidates(S(24, i => ({ dblur: { ratio: i >= 8 && i < 13 ? 3 : 1 } })), [], 2, 160, 90);
  assert.ok(ids(c).includes('lens.smear'));
});
test('vhs: sustained jitter above series median → fx.vhs; constant stripes do not trigger', () => {
  assert.ok(ids(buildCandidates(S(36, i => ({ jitter: i >= 12 && i < 30 ? 2 : 0 })), [], 3, 160, 90)).includes('fx.vhs'));
  assert.deepEqual(buildCandidates(S(36, () => ({ jitter: 3, dblur: { ratio: 40 } })), [], 3, 160, 90), []);
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
});
const blob = (cx, cy, area, sig, hex = '#f2c94c') => ({ hex, cx, cy, area, bbox: [0, 0, 1, 1], sig });
const ROUND = Float32Array.from({ length: 16 }, () => 1), SPIKY = Float32Array.from({ length: 16 }, (_, k) => k % 2 ? 0.1 : 1);
test('match cut: same-hex blob in same place across cut → trans.match', () => {
  const c = buildCandidates(S(24, i => ({ blobs: [blob(i < 12 ? 80 : 82, 45, i < 12 ? 0.05 : 0.06, ROUND)] })), [1.0], 2, 160, 90);
  assert.ok(ids(c).includes('trans.match'));
  const far = buildCandidates(S(24, i => ({ blobs: [blob(i < 12 ? 20 : 140, 45, 0.05, ROUND)] })), [1.0], 2, 160, 90);
  assert.ok(!ids(far).includes('trans.match'));
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
  for (const k of ['t', 'gm', 'gm3', 'sharp', 'dblur', 'fill', 'jitter', 'blobs']) assert.ok(k in s[0], k);
  assert.equal(s.at(-1).gm, null); assert.equal(s.at(-2).gm3, null);
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
