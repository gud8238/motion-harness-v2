import test from 'node:test';
import assert from 'node:assert/strict';
import { globalMotion, sharpness, directionalBlur, fillRatio, rowJitter, trackingBand, radialProfile, profileScale, accentBlobs, sigSimilarity } from '../../harness/tools/lib/detect.mjs';
import { pattern, shift, zoom, rotate, blurRegion, hBlur, flood, jitterRows, disk, rect } from '../helpers/frames.mjs';

const w = 160, h = 90, P = pattern(w, h, 1);
test('globalMotion recovers shift', () => { const m = globalMotion(P, shift(P, w, h, 4, -2), w, h); assert.ok(Math.abs(m.dx - 4) < 0.6 && Math.abs(m.dy + 2) < 0.6 && Math.abs(m.scale - 1) < 0.02); });
test('globalMotion recovers zoom', () => { const m = globalMotion(P, zoom(P, w, h, 1.06), w, h); assert.ok(Math.abs(m.scale - 1.06) < 0.02); });
test('static frames → zero motion', () => { const m = globalMotion(P, P, w, h); assert.ok(Math.abs(m.dx) < 0.1 && Math.abs(m.scale - 1) < 0.005); });
test('flat frames do not throw', () => { const z = new Uint8Array(w * h).fill(128); assert.doesNotThrow(() => globalMotion(z, z, w, h)); });
test('sharpness: blurred edges lower than sharp center', () => { const s = sharpness(blurRegion(P, w, h, 'edges', 4), w, h); assert.ok(s[5] > 2 * s[0]); });
test('directionalBlur detects horizontal smear', () => { const d = directionalBlur(hBlur(P, w, h, 6), w, h); assert.ok(d.ratio > 2.5); });
test('fillRatio', () => { assert.ok(Math.abs(fillRatio(flood(w, h, '#F2C94C', 0.95), w, h).ratio - 0.95) < 0.03); });
test('rowJitter', () => { assert.ok(rowJitter(jitterRows(P, w, h, 4, 2), w, h) > 1.5 && rowJitter(P, w, h) < 0.5); });
test('accentBlobs + sigSimilarity', () => {
  const a = accentBlobs(disk(w, h, '#F2C94C', 80, 45, 20), w, h, ['#F2C94C'])[0];
  const b = accentBlobs(rect(w, h, '#F2C94C', 60, 25, 40, 40), w, h, ['#F2C94C'])[0];
  assert.ok(sigSimilarity(a.sig, a.sig) > 0.99 && sigSimilarity(a.sig, b.sig) < 0.9);
});

// ---- 추가 검증 ----
const near = (v, t, tol, msg) => assert.ok(Math.abs(v - t) < tol, `${msg}: ${v} (기대 ${t}±${tol})`);
test('globalMotion: sub-pixel shift', () => { const m = globalMotion(P, shift(P, w, h, 2.3, 1.6), w, h); near(m.dx, 2.3, 0.3, 'dx'); near(m.dy, 1.6, 0.3, 'dy'); });
test('globalMotion: identity result shape on static frames', () => {
  const m = globalMotion(P, P, w, h);
  assert.deepEqual(Object.keys(m).sort(), ['dx', 'dy', 'n', 'parallax', 'res', 'rot', 'scale']); assert.equal(m.n, 48);
  near(m.rot, 0, 0.05, 'rot'); near(m.res, 0, 0.05, 'res'); near(m.parallax, 0, 0.05, 'parallax');
});
test('globalMotion: flat frames → identity', () => {
  const z = new Uint8Array(w * h).fill(128);
  const m = globalMotion(z, z, w, h);
  assert.deepEqual(m, { dx: 0, dy: 0, scale: 1, rot: 0, parallax: 0, res: 0, n: 0 }); assert.equal(m.n, 0);
});
test('globalMotion: rotation sign is clockwise-positive (y down)', () => { const m = globalMotion(P, rotate(P, w, h, 2), w, h); near(m.rot, 2, 0.4, 'rot'); near(m.scale, 1, 0.02, 'scale'); });
test('globalMotion: zoom keeps center fixed', () => { const m = globalMotion(P, zoom(P, w, h, 0.95), w, h); near(m.scale, 0.95, 0.02, 'scale'); near(m.dx, 0, 0.3, 'dx'); near(m.dy, 0, 0.3, 'dy'); });
test('globalMotion: parallax when top half moves alone', () => {
  const S = shift(P, w, h, 4, 0), b = Uint8Array.from(P); b.set(S.subarray(0, w * h / 2));
  const m = globalMotion(P, b, w, h);
  assert.ok(m.parallax > 2.5, `parallax ${m.parallax}`); assert.ok(m.res > 1, `res ${m.res}`);
  assert.ok(globalMotion(P, shift(P, w, h, 4, 0), w, h).parallax < 0.3);
});
test('globalMotion: portrait 9:16 frames', () => {
  const Q = pattern(90, 160, 5), m = globalMotion(Q, shift(Q, 90, 160, -3, 5), 90, 160);
  near(m.dx, -3, 0.6, 'dx'); near(m.dy, 5, 0.6, 'dy');
});
test('globalMotion: tiny frames do not throw', () => {
  const t = pattern(16, 9, 2);
  assert.deepEqual(globalMotion(t, t, 16, 9), { dx: 0, dy: 0, scale: 1, rot: 0, parallax: 0, res: 0, n: 0 });
});
test('globalMotion: < 5 ms per default-range call (median of 20)', () => {
  const b = zoom(P, w, h, 1.03), t = [];
  for (let i = 0; i < 5; i++) globalMotion(P, b, w, h);
  for (let i = 0; i < 20; i++) { const t0 = performance.now(); globalMotion(P, b, w, h); t.push(performance.now() - t0); }
  const ms = t.sort((x, y) => x - y)[10];
  assert.ok(ms < 5, `${ms.toFixed(2)} ms/호출`);
});
test('globalMotion: slow pan is not snapped to integers', () => { const m = globalMotion(P, shift(P, w, h, 0.3, 0), w, h); assert.ok(m.dx >= 0.2, `dx ${m.dx}`); });
test('globalMotion: range option (whip pans)', () => {
  const b = shift(P, w, h, 8, 0);
  near(globalMotion(P, b, w, h, { range: 12 }).dx, 8, 0.3, 'range 12 dx');
  const d = globalMotion(P, b, w, h).dx; assert.ok(d <= 6.2, `기본 범위는 포화: ${d}`);
});
test('globalMotion: static overlay strip does not drag the pan', () => {
  const b = shift(P, w, h, 3, 0); b.set(P.subarray(w * (h - 12)), w * (h - 12));
  const m = globalMotion(P, b, w, h); near(m.dx, 3, 0.3, 'dx'); near(m.scale, 1, 0.01, 'scale');
});
test('sharpness: grid shape and row-major order', () => {
  const s = sharpness(blurRegion(P, w, h, [0, 0, w / 2, h], 4), w, h, [2, 1]);
  assert.ok(s instanceof Float32Array && s.length === 2); assert.ok(s[1] > 2 * s[0]);
  assert.equal(sharpness(P, w, h).length, 12);
});
test('directionalBlur: angle is the smear direction', () => {
  assert.equal(directionalBlur(hBlur(P, w, h, 6), w, h).angle, 0);
  const d = directionalBlur(P, w, h); assert.ok(d.ratio < 2, `무늬 자체 비 ${d.ratio}`);
  assert.deepEqual(directionalBlur(new Uint8Array(w * h).fill(50), w, h), { ratio: 1, angle: 0 });
});
test('fillRatio: hex of dominant color', () => { const f = fillRatio(flood(w, h, '#F2C94C', 0.6), w, h); near(f.ratio, 0.6, 0.03, 'ratio'); assert.equal(f.hex.toLowerCase(), '#f2c94c'); });
test('rowJitter: flat frame → 0', () => { assert.equal(rowJitter(new Uint8Array(w * h).fill(90), w, h), 0); });
test('rowJitter: a few textured rows on an empty frame → 0 when minRows is set', () => {
  const f = new Uint8Array(w * h).fill(10), J = jitterRows(P, w, h, 4, 3); for (let y = 40; y < 44; y++) for (let x = 0; x < w; x++) f[y * w + x] = J[y * w + x];
  assert.ok(rowJitter(f, w, h) > 0.5); assert.equal(rowJitter(f, w, h, { minRows: 9 }), 0);
});
test('accentBlobs: centroid, bbox, area, min-area filter', () => {
  const r = accentBlobs(rect(w, h, '#F2C94C', 60, 25, 40, 40), w, h, ['#F2C94C', '#2D9CDB']);
  assert.equal(r.length, 1); const b = r[0];
  near(b.cx, 79.5, 0.01, 'cx'); near(b.cy, 44.5, 0.01, 'cy'); assert.deepEqual(b.bbox, [60, 25, 99, 64]);
  near(b.area, 1600 / (w * h), 1e-9, 'area'); assert.equal(b.hex, '#F2C94C'); assert.ok(b.sig instanceof Float32Array && b.sig.length === 16);
  assert.deepEqual(accentBlobs(rect(w, h, '#F2C94C', 10, 10, 5, 5), w, h, ['#F2C94C']), []);
  assert.deepEqual(accentBlobs(disk(w, h, '#F2C94C', 80, 45, 20), w, h, []), []);
});
test('sigSimilarity is rotation-invariant (cyclic)', () => {
  const a = Float32Array.from({ length: 16 }, (_, i) => i < 4 ? 1 : 0.3), b = Float32Array.from({ length: 16 }, (_, i) => a[(i + 5) % 16]);
  near(sigSimilarity(a, b), 1, 1e-6, 'sim');
});

// VHS 트래킹 띠: 화면 전체를 가로지르는 가로 경계 + 그 근처 행들의 가로 어긋남
test('trackingBand: full-width bright band with shifted rows over texture → cover ≈1, row, jitter', () => {
  const J = jitterRows(P, w, h, 4, 3), o = Uint8Array.from(P);
  for (let y = 40; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = y < 46 ? Math.min(255, J[y * w + x] + 60) : P[y * w + x];
  const b = trackingBand(o, w, h);
  assert.ok(b.cover >= 0.95 && (Math.abs(b.y - 40) <= 1 || Math.abs(b.y - 46) <= 1) && b.jitter >= 1, JSON.stringify(b));
  const p = trackingBand(P, w, h); assert.ok(p.cover < 0.95, JSON.stringify(p));
});
test('trackingBand: line on a flat frame has no texture → jitter null; flat frame → cover 0', () => {
  const f = new Uint8Array(w * h).fill(200); for (let y = 50; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = 180;
  const b = trackingBand(f, w, h); assert.ok(b.cover >= 0.95 && b.jitter === null, JSON.stringify(b));
  assert.deepEqual(trackingBand(new Uint8Array(w * h).fill(90), w, h), { cover: 0, y: 0, jitter: null });
});

// 반지름 스펙트럼 크기비 (블록 매칭이 못 따라가는 큰 확대·축소용, 이동에는 둔감)
test('profileScale: zoom out 0.7× and in 1.3× recovered; shift alone and identical frames → 1', () => {
  const pr = g => radialProfile(g, w, h), p0 = pr(P);
  for (const z of [0.7, 1.3]) { const r = profileScale(p0, pr(zoom(P, w, h, z))); assert.ok(Math.abs(Math.log(r.scale / z)) < 0.06 && r.corr > 0.5, `${z}: ${JSON.stringify(r)}`); }
  const t = profileScale(p0, pr(shift(P, w, h, 9, -5))); assert.ok(Math.abs(Math.log(t.scale)) < 0.04, JSON.stringify(t));
  const same = profileScale(p0, p0); assert.equal(same.scale, 1); assert.ok(same.corr > 0.99);
});
test('profileScale: flat frames → scale 1, corr 0', () => {
  const z = radialProfile(new Uint8Array(w * h).fill(120), w, h);
  assert.deepEqual(profileScale(z, z), { scale: 1, corr: 0 });
});
