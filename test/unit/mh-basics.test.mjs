import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRuntime, loadUMD } from '../helpers/runtime.mjs';

const RT = ['harness/runtime/mh.js'];
const W = loadRuntime(RT), MH = W.MH;

test('v1 exports intact', () => {
  for (const k of ['tween', 'kf', 'springAt', 'drive', 'load', 'gsapEase', 'trans', 'txtIn']) assert.equal(typeof MH[k], 'function', k);
  for (const k of ['motion', 'move', 'follow', 'sim', 'gsapSpring']) assert.equal(typeof MH[k], 'function', k);
  assert.equal(typeof MH.phys.body, 'function');
});
test('window is the global object of the context', () => {
  const R = loadRuntime(RT, { marker: 7 });
  assert.equal(R.window, R); assert.equal(R.window.marker, 7);
});
test('move endpoints and phases', () => {
  assert.equal(MH.move(0.9, 1, 0, 100), 0);
  assert.equal(MH.move(3, 1, 0, 100), 100);
  const xs = Array.from({ length: 200 }, (_, i) => MH.move(1 + i * 0.01, 1, 0, 100));
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 100);
  const flat = Array.from({ length: 200 }, (_, i) => MH.move(1 + i * 0.01, 1, 0, 100, { ant: 0, over: 0 }));
  assert.ok(flat.every((v, i) => i === 0 || v >= flat[i - 1] - 1e-9));
});
test('move anticipates then overshoots by the DNA amounts, settles exactly', () => {
  const m = MH.motion(), t0 = 1, dur = 0.6;
  assert.ok(Math.abs(MH.move(t0 + 0.2 * dur, t0, 0, 100) - -m.ant * 100) < 1e-9);
  assert.ok(Math.abs(MH.move(t0 + dur, t0, 0, 100) - (100 + m.over * 100)) < 1e-9);
  assert.equal(MH.move(t0 + dur + m.settle, t0, 0, 100), 100);
  assert.equal(MH.move(t0, t0, 0, 100), 0);
});
test('move is continuous across phase boundaries', () => {
  const t0 = 0, dur = 0.6, s = MH.motion().settle, eps = 1e-6;
  for (const tb of [0.2 * dur, dur, dur + s]) assert.ok(Math.abs(MH.move(tb - eps, t0, 0, 100) - MH.move(tb + eps, t0, 0, 100)) < 0.01, `boundary ${tb}`);
});
test('move works component-wise on arrays, with options', () => {
  const v = Array.from(MH.move(0.3, 0, [0, 10], [100, -10], { dur: 1 }));
  assert.equal(v.length, 2);
  assert.equal(v[0], MH.move(0.3, 0, 0, 100, { dur: 1 }));
  assert.equal(v[1], MH.move(0.3, 0, 10, -10, { dur: 1 }));
  assert.deepEqual(Array.from(MH.move(9, 0, [0, 10], [100, -10])), [100, -10]);
  assert.equal(MH.move(0.75, 0, 0, 100, { dur: 1, ant: 0, over: 0 }), 100 * MH.E.inOut((0.75 - 0.2) / 0.8) * 1);
});
test('DNA.motion overrides defaults', () => {
  assert.deepEqual({ ...MH.motion() }, { ant: 0.12, over: 0.08, settle: 0.35, hold: 0.4, squash: 1.25 });
  const W2 = loadRuntime(RT, {}); W2.DNA = { motion: { over: 0 } };
  assert.equal(W2.MH.motion().over, 0); assert.equal(W2.MH.motion().ant, 0.12);
  assert.equal(W2.MH.move(0.6, 0, 0, 100), 100);   // over=0 → 본 이동 끝이 곧 b
});
test('sim/follow deterministic under random seek order', () => {
  const f = t => (t > 1 ? 100 : 0), ts = [2.5, 0.3, 1.7, 1.1, 2.9, 0.8];
  const fresh = ts.map(t => loadRuntime(RT).MH.follow(t, f));
  const seq = ts.map(t => MH.follow(t, f));
  assert.deepEqual(seq.map(v => v.toFixed(6)), fresh.map(v => v.toFixed(6)));
  assert.ok(Math.abs(MH.follow(3, f) - 100) < 1);
});
test('follow lags the target, starts at fn(-lag), and options do not share state', () => {
  const f = t => (t > 1 ? 100 : 0);
  assert.equal(MH.follow(0, f), 0);
  assert.ok(MH.follow(1.05, f) < 100 * 0.5);
  const a = MH.follow(2, f, { damp: 0.2 }), b = MH.follow(2, f, { damp: 0.9 }), a2 = MH.follow(2, f, { damp: 0.2 });
  assert.notEqual(a, b); assert.equal(a, a2);
  const g = t => 50 + t * 0;   // 상수 목표: 시작값 fn(-lag) 에서 움직이지 않는다
  assert.equal(MH.follow(1.3, g), 50);
});
test('sim memoizes per update function and never mutates', () => {
  let calls = 0;
  const upd = (s, tau, step) => { calls++; return s + step; };
  assert.ok(Math.abs(MH.sim(1, 0.01, 0, upd) - 1) < 1e-9);
  const c1 = calls;
  MH.sim(1.5, 0.01, 0, upd);
  assert.ok(calls - c1 <= 51);              // 이어서 적분 (처음부터 다시 150 이 아님)
  assert.ok(Math.abs(MH.sim(0.5, 0.01, 0, upd) - 0.5) < 1e-9);   // 뒤로 시크: 0부터 다시, 같은 값
  assert.ok(Math.abs(MH.sim(0.505, 0.01, 0, upd) - 0.505) < 1e-9); // 단계 사이 t 는 부분 단계
  assert.equal(MH.sim(0, 0.01, 7, upd), 7);
});
test('phys body', () => {
  const b = MH.phys.body({ pos: [0, 0], vel: [100, -800], floor: 300 });
  assert.deepEqual([b.at(0).x, b.at(0).y], [0, 0]);
  for (let t = 0; t < 4; t += 0.01) assert.ok(b.at(t).y <= 300 + 1e-6);
  assert.equal(b.at(10).y, 300);
});
test('phys body: ballistic arc, bounce, rest, spin, t0', () => {
  const g = 2400, b = MH.phys.body({ pos: [10, 0], vel: [100, -800], spin: 2, rot: 1, floor: 300, t0: 1 });
  assert.deepEqual({ ...b.at(0) }, { x: 10, y: 0, rot: 1 });                 // t ≤ t0 → 시작 자세
  const s = 0.2, p = b.at(1 + s);
  assert.ok(Math.abs(p.y - (-800 * s + 0.5 * g * s * s)) < 1e-9 && Math.abs(p.x - (10 + 100 * s)) < 1e-9 && Math.abs(p.rot - (1 + 2 * s)) < 1e-9);
  const hit = (800 + Math.sqrt(800 * 800 + 2 * g * 300)) / g;                  // 첫 충돌
  assert.ok(Math.abs(b.at(1 + hit).y - 300) < 1e-6);
  assert.ok(b.at(1 + hit + 0.1).y < 300);                                       // 튀어 오름
  const rest = b.at(20), later = b.at(30);
  assert.equal(rest.y, 300); assert.deepEqual({ ...rest }, { ...later });       // 정지 후 x·rot 고정
  const noFloor = MH.phys.body({ pos: [0, 0], vel: [0, 0] });
  assert.ok(Math.abs(noFloor.at(1).y - 1200) < 1e-9);                           // 바닥 없음: 계속 낙하, y 아래로 +
});
test('gsapSpring registers path with overshoot', () => {
  let path = ''; const W3 = loadRuntime(RT, { CustomEase: { create: (n, p) => (path = p) }, gsap: { registerPlugin() {} } });
  assert.equal(W3.MH.gsapSpring('pop'), 'pop');
  assert.ok(path.startsWith('M0,0') && path.split(/[ ,L]+/).map(Number).some(v => v > 1));
});
test('gsapSpring path: 60 points, x in 0..1, ends at 1,1; presets; fallback', () => {
  const log = []; const R = loadRuntime(RT, { CustomEase: { create: (n, p) => log.push([n, p]) }, gsap: { registerPlugin: (...a) => log.push(['reg', a.length]) } });
  R.MH.gsapSpring('a', 'heavy'); R.MH.gsapSpring('b', { f: 3, z: 0.2 });
  assert.deepEqual(log.map(l => l[0]), ['reg', 'a', 'reg', 'b']);
  const pts = log[1][1].replace(/^M0,0 L/, '').split(' ').map(s => s.split(',').map(Number));
  assert.equal(pts.length, 60);
  assert.deepEqual(pts[59], [1, 1]);
  assert.ok(pts.every(([x], i) => x > 0 && x <= 1 && (i === 0 || x > pts[i - 1][0])));
  assert.equal(MH.gsapSpring('x'), 'back.out(1.7)');   // CustomEase 없음
});
test('loadUMD returns module.exports or the single new global', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-umd-')), w = (n, c) => { const f = path.join(dir, n); fs.writeFileSync(f, c); return f; };
  try {
    const a = loadUMD(w('a.js', "(function(r,f){typeof exports==='object'&&typeof module!=='undefined'?f(exports):r.Foo=f({})})(this,function(e){e.a=1;return e;});"));
    assert.equal(a.a, 1);
    const b = loadUMD(w('b.js', '(function(r){r.Bar={b:2};})(this);'));
    assert.equal(b.b, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
