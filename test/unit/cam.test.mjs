import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntime } from '../helpers/runtime.mjs';

const RT = ['harness/runtime/mh.js', 'harness/runtime/mh-cam.js'];
const MH = loadRuntime(RT).MH;
const A = v => Array.from(v);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

// ── 브리프 테스트 ──
test('keys interpolate and cut', () => {
  const c = MH.cam(null, { W: 1920, H: 1080 }).key(0, { x: 0, zoom: 3 }).key(0, { zoom: 1 }, { dur: 3.5 }).key(5, { x: 800 });
  assert.equal(c.state(0).zoom, 3); assert.equal(c.state(3.6).zoom, 1);
  assert.equal(c.state(4.99).x, 0); assert.equal(c.state(5).x, 800);
});
test('toScreen centers camera target, portrait aware', () => {
  const c = MH.cam(null, { W: 1080, H: 1920 }).key(0, { x: 100, y: 200, zoom: 2 });
  assert.deepEqual(A(c.toScreen(0, [100, 200])).map(Math.round), [540, 960]);
  assert.deepEqual(A(c.toScreen(0, [110, 200])).map(Math.round), [560, 960]);
});
test('depth 0 ignores camera', () => assert.deepEqual(A(MH.cam(null, { W: 100, H: 100 }).key(0, { x: 50, zoom: 2 }).matrix(0, 0)), [1, 0, 0, 1, 0, 0]));
test('shake deterministic and bounded', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).shake(0, 1, 0.01, 8);
  const xs = Array.from({ length: 30 }, (_, i) => c.state(i / 30).x - 500);   // 기본 x = W/2
  assert.ok(xs.every(x => Math.abs(x) <= 10.0001) && xs.some(x => x !== 0));
  assert.deepEqual(xs, Array.from({ length: 30 }, (_, i) => MH.cam(null, { W: 1000, H: 1000 }).shake(0, 1, 0.01, 8).state(i / 30).x - 500));
});
test('zoomThrough fills screen with rect', () => {
  const c = MH.cam(null, { W: 1920, H: 1080 }); MH.trans2d.zoomThrough(c, [900, 500, 120, 80], { t0: 1 });
  const s = c.state(2); assert.ok(Math.abs(s.x - 960) < 1 && s.zoom >= 1920 / 120 - 0.01);
});
test('module docs size', () => { for (const f of ['camera2d', 'transitions']) assert.ok(fs.statSync(`harness/modules/${f}.md`).size <= 3072); });

// ── 추가 ──
test('default state is identity', () => {
  const c = MH.cam(null, { W: 1920, H: 1080 });
  assert.deepEqual({ ...c.state(3) }, { x: 960, y: 540, zoom: 1, rot: 0 });
  assert.deepEqual(A(c.matrix(3)), [1, 0, 0, 1, 0, 0]);
});
test('key with only zoom keeps x; later keys continue from earlier values', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).key(0, { x: 300 }).key(2, { zoom: 2 }, { dur: 1 });
  assert.equal(c.state(2.5).x, 300); near(c.state(3).zoom, 2); assert.equal(c.state(1).zoom, 1);
  const d = MH.cam(null, { W: 1000, H: 1000 }).key(0, { x: 0 }).key(1, { x: 100 }, { dur: 2 }).key(2, { x: 0 }, { dur: 1 });   // 이동 도중 새 키: 그 순간 값에서 출발
  const mid = d.state(2).x; assert.ok(mid > 0 && mid < 100); near(d.state(3).x, 0); assert.ok(d.state(2.5).x < mid);
});
test('ease: function, MH.E key, dna', () => {
  const lin = MH.cam(null, { W: 100, H: 100 }).key(0, { x: 0 }).key(0, { x: 100 }, { dur: 1, ease: 'linear' });
  near(lin.state(0.25).x, 25);
  const fn = MH.cam(null, { W: 100, H: 100 }).key(0, { x: 0 }).key(0, { x: 100 }, { dur: 1, ease: t => t * t });
  near(fn.state(0.5).x, 25);
  const dna = MH.cam(null, { W: 100, H: 100 }).key(0, { x: 0 }).key(0, { x: 100 }, { dur: 1 });
  near(dna.state(0.5).x, 50, 1e-6);   // DNA 없음 → E.inOut(0.5)=0.5
  const W = loadRuntime(RT); W.DNA = { easeFn: () => 1 };
  const d2 = W.MH.cam(null, { W: 100, H: 100 }).key(0, { x: 0 }).key(0, { x: 100 }, { dur: 1 });
  near(d2.state(0.1).x, 100);   // DNA.easeFn 사용
});
test('depth 0.5 parallax is half the full-depth shift', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).key(0, { x: 500 }).key(0, { x: 700 }, { dur: 1, ease: 'linear' });
  const full = c.matrix(1, 1), half = c.matrix(1, 0.5);
  near(full[4], -200); near(half[4], -100); near(half[0], 1);
  near(c.toScreen(1, [500, 500], 0.5)[0], 400); near(c.toScreen(1, [500, 500], 1)[0], 300); near(c.toScreen(1, [500, 500], 0)[0], 500);
});
test('zoom scale per depth is 1 + (zoom-1)·d', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).key(0, { zoom: 3 });
  near(c.matrix(0, 1)[0], 3); near(c.matrix(0, 0.5)[0], 2); near(c.matrix(0, 0)[0], 1); near(c.matrix(0, 2)[0], 5);
});
test('rot maps with depth and toScreen/toWorld invert', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).key(0, { rot: 90 });
  const m = c.matrix(0, 1);   // 90°: (1000,500) 은 화면 중심 오른쪽 500 → 중심 아래 500
  near(m[0], 0); near(m[1], 1); near(m[2], -1); near(m[3], 0);
  const p = c.toScreen(0, [1000, 500]); near(p[0], 500); near(p[1], 1000);
  near(c.matrix(0, 0.5)[1], Math.sin(Math.PI / 4));
  const k = MH.cam(null, { W: 1000, H: 800 }).key(0, { x: 120, y: 340, zoom: 1.7, rot: 23 });
  const w = k.toWorld(0, k.toScreen(0, [333, 77])); near(w[0], 333, 1e-6); near(w[1], 77, 1e-6);
});
test('shake fades in and out (no pop) and is silent outside', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).shake(1, 2, 0.02, 10);
  const o = t => Math.hypot(c.state(t).x - 500, c.state(t).y - 500);
  assert.equal(o(0.99), 0); assert.equal(o(2.01), 0);
  assert.ok(o(1) < 0.01 && o(2) < 0.01 && o(1.001) < 0.5);
  assert.ok(Array.from({ length: 40 }, (_, i) => o(1.3 + i * 0.015)).some(v => v > 2));
});
test('layers register and render sets matrix transform', () => {
  const el = { style: {} }, a = { style: {} }, b = { style: {} };
  const c = MH.cam(el, { W: 1000, H: 1000 }).layer(a, 0).layer(b, 0.5).key(0, { x: 600 });
  assert.deepEqual(A(c.layers).map(l => l.depth), [1, 0, 0.5]); assert.equal(c.layers[0].el, el);
  c.render(0);
  assert.equal(el.style.transform, 'matrix(1,0,0,1,-100,0)'); assert.equal(el.style.transformOrigin, '0 0');
  assert.equal(a.style.transform, 'matrix(1,0,0,1,0,0)'); assert.equal(b.style.transform, 'matrix(1,0,0,1,-50,0)');
});
test('whip: direction, velocity mid-whip, ~0 after', () => {
  const c = MH.cam(null, { W: 1000, H: 500 }).key(0, { x: 500 });
  const w = MH.trans2d.whip(c, { t0: 1, dir: 'left', dur: 0.4, dist: 1.2 });
  near(c.state(1.4).x, 500 - 1200); assert.equal(c.state(0.9).x, 500);
  const v = w.vel(1.2); assert.ok(Math.abs(v[0]) > 1000 && v[0] > 0 && Math.abs(v[1]) < 1e-6);   // 카메라 왼쪽 → 내용은 오른쪽으로 흐름
  assert.ok(Math.abs(w.vel(2)[0]) < 1e-6 && Math.abs(w.vel(0.5)[0]) < 1e-6);
  const u = MH.cam(null, { W: 1000, H: 500 }); MH.trans2d.whip(u, { t0: 0, dir: 'down' });
  near(u.state(1).y, 250 + 1.2 * 500); near(u.state(1).x, 500);
});
test('match maps rectB corners onto rectA (top-left origin)', () => {
  const A_ = [100, 50, 400, 200], B_ = [700, 300, 100, 50];
  const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\)$/.exec(MH.trans2d.match(A_, B_));
  assert.ok(m, MH.trans2d.match(A_, B_));
  const [dx, dy, s] = m.slice(1).map(Number);
  near(s, 4);
  const map = ([px, py]) => [B_[0] + dx + s * (px - B_[0]), B_[1] + dy + s * (py - B_[1])];   // origin = B 의 왼쪽 위
  const tl = map([700, 300]), br = map([800, 350]);
  near(tl[0], 100); near(tl[1], 50); near(br[0], 500); near(br[1], 250);
  assert.deepEqual(A(map([750, 325])), [300, 150]);
});
test('fill: overlay created once, progress and clip-path', () => {
  let made = 0;
  const W = loadRuntime(RT, { document: { createElement: () => { made++; return { style: {} }; } } });
  const kids = [];
  const parent = { appendChild: n => kids.push(n), getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) };
  const el = { parentNode: parent, getBoundingClientRect: () => ({ left: 900, top: 500, width: 120, height: 80 }) };
  const f = t => W.MH.trans2d.fill(t, el, { t0: 1, dur: 1, color: '#E8442E' });
  assert.equal(f(0), 0); assert.equal(made, 1); assert.equal(kids.length, 1);
  const ov = kids[0]; assert.equal(ov.style.display, 'none'); assert.equal(ov.style.background, '#E8442E'); assert.equal(ov.style.zIndex, '9999');
  assert.equal(ov.style.pointerEvents, 'none'); assert.equal(ov.style.position, 'absolute');
  near(f(1), 0); assert.notEqual(ov.style.display, 'none'); assert.match(ov.style.clipPath, /^circle\(40(\.0+)?px at 960(\.0+)?px 540(\.0+)?px\)$/);
  near(f(1.5), 0.5); const r = parseFloat(/circle\(([\d.]+)px/.exec(ov.style.clipPath)[1]);
  const rEnd = Math.hypot(960, 540); near(r, (40 + rEnd) / 2, 0.01);   // inOut(0.5)=0.5
  near(f(2), 1); assert.equal(ov.style.clipPath, 'none');
  assert.equal(f(3), 1); f(0.2); assert.equal(made, 1); assert.equal(ov.style.display, 'none');   // 되감기: 결정적
  f(1.5); assert.ok(/circle/.test(ov.style.clipPath));
});
