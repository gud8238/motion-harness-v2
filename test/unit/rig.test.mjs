import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from '../helpers/runtime.mjs';

const RT = ['harness/runtime/mh.js', 'harness/runtime/mh-rig.js'];
const MH = loadRuntime(RT).MH, D = MH.rig.normalize({});
const OFF = { life: false };

// ── 브리프 테스트 ──
test('blink closes eyes briefly', () => {
  const A = [[1, 'blink']];
  assert.ok(MH.rig.pose(D, A, 1.06, { life: false }).eyes.open < 0.2);
  assert.equal(MH.rig.pose(D, A, 1.5, { life: false }).eyes.open, 1);
});
test('hop anticipates then lands at target', () => {
  const A = [[0, 'hop', { to: [300, 0] }]], ys = Array.from({ length: 60 }, (_, i) => MH.rig.pose(D, A, i * 0.03, { life: false }));
  assert.ok(ys.slice(0, 5).some(p => p.sy < 1));         // 웅크림
  assert.ok(Math.min(...ys.map(p => p.y)) < -50);           // 비행
  assert.equal(MH.rig.pose(D, A, 5, { life: false }).x, 300);
});
test('stretch respects opts', () => assert.ok(Math.abs(MH.rig.pose(D, [[0, 'stretch', { x: 2.2 }]], 0.6, { life: false }).sx - 2.2) < 0.05));
test('life blinks deterministically by seed', () => {
  const opens = s => Array.from({ length: 300 }, (_, i) => MH.rig.pose(D, [], i / 30, { seed: s }).eyes.open);
  assert.deepEqual(opens(3), opens(3));
  assert.ok(opens(3).some(v => v < 0.2));
});
test('geometry returns paths for body and two eyes', () => {
  const g = MH.rig.geometry(D, MH.rig.pose(D, [], 0, { life: false }));
  assert.ok(g.find(p => p.part === 'body').d.startsWith('M'));
  assert.equal(g.filter(p => p.part.startsWith('eye')).length, 2);
});
test('face sets eye/mouth shapes', () => assert.equal(MH.rig.pose(D, [[0, 'face', 'squint']], 0.5, { life: false }).face, 'squint'));

// ── 추가 테스트 ──
test('normalize fills defaults and rejects unknown shapes', () => {
  assert.deepEqual({ ...D.body }, { shape: 'roundRect', w: 200, h: 160, r: 48, color: '#F2C94C' });
  assert.deepEqual({ ...D.eyes }, { shape: 'oval', gap: 0.32, size: 0.12, y: -0.05, color: '#111' });
  assert.equal(D.mouth.shape, 'none'); assert.equal(D.cheeks, null);
  assert.equal(D.limbs.length, 0); assert.equal(D.extras.length, 0);
  const R = loadRuntime(RT, { console: { warn() {}, log() {} } }).MH;
  assert.equal(R.rig.normalize({ body: { shape: 'triangle', w: 120 } }).body.shape, 'roundRect');
  assert.equal(R.rig.normalize({ body: { w: 120 } }).body.w, 120);
});
test('face table drives eye/mouth shapes and sweat, persists', () => {
  const p = MH.rig.pose(D, [[0, 'face', 'happy'], [1, 'face', 'sweat']], 0.5, OFF);
  assert.equal(p.eyes.shape, 'arc'); assert.equal(p.mouth.shape, 'smile'); assert.equal(p.sweat, 0);
  const q = MH.rig.pose(D, [[0, 'face', 'happy'], [1, 'face', 'sweat']], 9, OFF);
  assert.equal(q.face, 'sweat'); assert.equal(q.mouth.shape, 'line'); assert.equal(q.sweat, 1);
  for (const [f, e, m] of [['star', 'star', 'open'], ['sad', 'arcDown', 'line'], ['surprise', 'dot', 'o'], ['squint', 'line', 'line']]) {
    const r = MH.rig.pose(D, [[0, 'face', f]], 0, OFF);
    assert.equal(r.eyes.shape, e, f); assert.equal(r.mouth.shape, m, f);
  }
  assert.ok(MH.rig.geometry(D, q).some(g => g.part === 'sweat'));
  assert.ok(!MH.rig.geometry(D, MH.rig.pose(D, [], 0, OFF)).some(g => g.part === 'mouth' || g.part === 'sweat'));
});
test('future action has no effect', () => {
  const base = MH.rig.pose(D, [], 0.5, OFF), fut = MH.rig.pose(D, [[1, 'hop', { to: [500, 0] }], [2, 'face', 'happy'], [3, 'grow']], 0.5, OFF);
  assert.equal(JSON.stringify(fut), JSON.stringify(base));
});
test('unknown action ignored, warned once', () => {
  const warns = [], R = loadRuntime(RT, { console: { warn: m => warns.push(m), log() {} } }).MH, d = R.rig.normalize({});
  const a = R.rig.pose(d, [[0, 'dance', {}], [0.2, 'dance']], 1, OFF), b = R.rig.pose(d, [], 1, OFF);
  R.rig.pose(d, [[0, 'dance']], 2, OFF);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(warns.length, 1); assert.match(warns[0], /dance/);
});
test('look moves eye positions in geometry', () => {
  const eyeX = p => MH.rig.geometry(D, p).find(g => g.part === 'eyeR').m[0];
  const p0 = MH.rig.pose(D, [], 2, OFF), p1 = MH.rig.pose(D, [[0, 'look', { x: 1, y: -1 }]], 2, OFF);
  assert.equal(p1.eyes.lx, 1); assert.equal(p1.eyes.ly, -1);
  assert.ok(eyeX(p1) > eyeX(p0) + 10);
  const ey = p => MH.rig.geometry(D, p).find(g => g.part === 'eyeL').m[1];
  assert.ok(ey(p1) < ey(p0));
});
test('grow covers the screen diagonal with the short side (16:9 and 9:16)', () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    const p = MH.rig.pose(D, [[0, 'grow', { fill: 'screen' }]], 3, { life: false, W, H });
    assert.ok(Math.min(p.sx * D.body.w, p.sy * D.body.h) >= Math.hypot(W, H) * 0.999, `${W}x${H}`);   // R9
    assert.equal(p.sy, p.sx); assert.equal(p.x, W / 2); assert.equal(p.y, H / 2); assert.equal(p.anchor, 1);
  }
  const mid = MH.rig.pose(D, [[0, 'grow']], 0.3, OFF);
  assert.ok(mid.anchor > 0 && mid.anchor < 1);
});
test('anchor eases between world and screen', () => {
  const A = [[0, 'anchor', { to: 'screen' }], [1, 'anchor', { to: 'world' }]];
  assert.equal(MH.rig.pose(D, A, 0, OFF).anchor, 0);
  assert.ok(MH.rig.pose(D, A, 0.2, OFF).anchor > 0);
  assert.equal(MH.rig.pose(D, A, 0.5, OFF).anchor, 1);
  assert.equal(MH.rig.pose(D, A, 1.5, OFF).anchor, 0);
});
test('hop with ant=0 has no crouch; y ends exactly at target', () => {
  const A = [[0, 'hop', { to: [0, 40], ant: 0 }]];
  for (let i = 0; i <= 15; i++) assert.ok(MH.rig.pose(D, A, i * 0.01, OFF).sy >= 1 - 1e-9);
  const end = MH.rig.pose(D, A, 3, OFF);
  assert.equal(end.y, 40); assert.equal(end.sx, 1); assert.equal(end.sy, 1);
});
test('squash/stretch hold until reset (R3)', () => {
  const sq = MH.rig.pose(D, [[0, 'squash']], 5, OFF);
  assert.ok(Math.abs(sq.sx - MH.motion().squash) < 1e-9 && Math.abs(sq.sy - 1 / MH.motion().squash) < 1e-9);
  const st = MH.rig.pose(D, [[0, 'stretch', { x: 2 }]], 5, OFF);
  assert.ok(Math.abs(st.sy - 0.5) < 1e-9);
  const reset = MH.rig.pose(D, [[0, 'stretch', { x: 2 }], [1, 'stretch', { x: 1, y: 1 }]], 5, OFF);
  assert.equal(reset.sx, 1); assert.equal(reset.sy, 1);
  const reset2 = MH.rig.pose(D, [[0, 'squash'], [1, 'squash', { amt: 1 }]], 5, OFF);
  assert.equal(reset2.sx, 1); assert.equal(reset2.sy, 1);
});
test('actions fold from the value left by earlier actions', () => {
  const A = [[0, 'walk', { to: [200, 0] }], [5, 'hop', { to: [400, -100] }]];
  assert.equal(MH.rig.pose(D, A, 4, OFF).x, 200);
  assert.equal(MH.rig.pose(D, A, 5, OFF).x, 200);
  const p = MH.rig.pose(D, A, 9, OFF); assert.equal(p.x, 400); assert.equal(p.y, -100);
});
test('talk opens the mouth at 6Hz then returns to the face mouth', () => {
  const A = [[0, 'face', 'happy'], [1, 'talk', { dur: 1 }]];
  const opens = Array.from({ length: 120 }, (_, i) => MH.rig.pose(D, A, 1 + i / 120, OFF).mouth);
  assert.ok(opens.every(m => m.shape === 'open'));
  assert.ok(Math.max(...opens.map(m => m.open)) > 0.95 && Math.min(...opens.map(m => m.open)) < 0.05);
  assert.equal(MH.rig.pose(D, A, 2.5, OFF).mouth.shape, 'smile');
});
test('nod and shake return rot to where they started', () => {
  const nod = Array.from({ length: 10 }, (_, i) => MH.rig.pose(D, [[0, 'nod']], i * 0.04, OFF).rot);
  assert.ok(Math.max(...nod.map(Math.abs)) > 2);
  assert.equal(MH.rig.pose(D, [[0, 'nod']], 1, OFF).rot, 0);
  const sh = Array.from({ length: 25 }, (_, i) => MH.rig.pose(D, [[0, 'shake']], i * 0.02, OFF).rot);
  assert.ok(Math.max(...sh) > 2 && Math.min(...sh) < -2 && Math.max(...sh.map(Math.abs)) <= 6);
  assert.equal(MH.rig.pose(D, [[0, 'shake']], 1, OFF).rot, 0);
});
test('walk bobs and lands at target; enter/exit move positions only', () => {
  const A = [[0, 'walk', { to: [300, 0], steps: 4 }]];
  assert.ok(Array.from({ length: 40 }, (_, i) => MH.rig.pose(D, A, i * 0.03, OFF).y).some(y => y < -3));
  const e = MH.rig.pose(D, [[0, 'walk', { to: [300, 0] }]], 5, OFF); assert.equal(e.x, 300); assert.equal(e.y, 0); assert.equal(e.rot, 0);
  const en = [[0, 'enter', { from: 'below', at: [500, 400] }]];
  assert.ok(MH.rig.pose(D, en, 0.01, { life: false, W: 1920, H: 1080 }).y > 1080);
  const fin = MH.rig.pose(D, en, 3, OFF); assert.equal(fin.x, 500); assert.equal(fin.y, 400);
  const sc = MH.rig.pose(D, [[0, 'enter', { from: 'scale', at: [10, 20] }]], 0.01, OFF);
  assert.ok(sc.sx >= 0 && sc.sx < 0.2); assert.equal(sc.x, 10);
  const ex = MH.rig.pose(D, [[0, 'exit', { to: 'left' }]], 3, { life: false, x: 100, y: 50, W: 1920, H: 1080 });
  assert.ok(ex.x < -1000); assert.equal(ex.y, 50);
  assert.ok(!('opacity' in ex));
});
test('life breathes and sways without moving x/y', () => {
  const ps = Array.from({ length: 120 }, (_, i) => MH.rig.pose(D, [], i / 10, { seed: 2 }));
  assert.ok(ps.every(p => p.x === 0 && p.y === 0));
  assert.ok(ps.some(p => p.sy > 1.01) && ps.some(p => p.sy < 0.99) && ps.every(p => Math.abs(p.sy - 1) <= 0.015 + 1e-9));
  assert.ok(ps.some(p => Math.abs(p.rot) > 0.05) && ps.every(p => Math.abs(p.rot) <= 0.6 + 1e-9));
  assert.notDeepEqual(Array.from({ length: 300 }, (_, i) => MH.rig.pose(D, [], i / 30, { seed: 1 }).eyes.open),
    Array.from({ length: 300 }, (_, i) => MH.rig.pose(D, [], i / 30, { seed: 5 }).eyes.open));
});
test('pose is identical regardless of seek order', () => {
  const A = [[0, 'enter', { from: 'left', at: [400, 300] }], [0.8, 'hop', { to: [700, 300] }], [1.2, 'look', { x: -1 }], [2, 'squash'], [2.5, 'talk', { dur: 0.8 }], [3, 'grow']];
  const ts = Array.from({ length: 120 }, (_, i) => i / 30);
  const fwd = ts.map(t => JSON.stringify(MH.rig.pose(D, A, t, { seed: 4 })));
  const order = ts.map((t, i) => [MH.hash(i, 9), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const rnd = []; for (const i of order) rnd[i] = JSON.stringify(MH.rig.pose(D, A, ts[i], { seed: 4 }));
  assert.deepEqual(rnd, fwd);
});
test('geometry includes cheeks, limbs and extras from the design', () => {
  const d = MH.rig.normalize({ body: { shape: 'capsule' }, cheeks: {}, limbs: [{ at: [-0.25, 0.5] }, { at: [0.25, 0.5] }], extras: [{ d: 'M0 0 L10 0 L5 8 Z', fill: '#000' }] });
  const parts = MH.rig.geometry(d, MH.rig.pose(d, [], 0, OFF)).map(g => g.part);
  assert.deepEqual(Array.from(parts), ['limb0', 'limb1', 'body', 'extra0', 'cheekL', 'cheekR', 'eyeL', 'eyeR']);
  const blob = MH.rig.normalize({ body: { shape: 'blob' } });
  assert.match(MH.rig.geometry(blob, MH.rig.pose(blob, [], 0, OFF))[0].d, /^M.*C/);
});

// ── 렌더러 ──
const fakeSVG = () => {
  const log = { created: 0, sets: 0 };
  const el = tag => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); log.sets++; }, appendChild(c) { this.children.push(c); return c; } });
  const document = { createElementNS: (ns, tag) => { assert.equal(ns, 'http://www.w3.org/2000/svg'); log.created++; return el(tag); }, createElement: () => ({}), getElementById: () => null };
  const root = Object.assign(el('svg'), { namespaceURI: 'http://www.w3.org/2000/svg' });
  return { log, document, root };
};
test('SVG actor creates paths once and only updates attributes', () => {
  const { log, document, root } = fakeSVG();
  const R = loadRuntime(RT, { document }).MH;
  const a = R.rig.actor(root, { mouth: { shape: 'smile' } }, { life: false }).act([[0, 'hop', { to: [200, 0] }], [0.5, 'face', 'sweat']]);
  a.render(0);
  const created = log.created, g = root.children[0];
  assert.equal(root.children.length, 1); assert.equal(g.tag, 'g');
  assert.ok(g.children.length >= 4 && g.children.every(c => c.tag === 'path'));
  const tf0 = g.attrs.transform, sweat = g.children[g.children.length - 1];
  assert.equal(sweat.attrs.display, 'none');
  a.render(0.4); a.render(1);
  assert.equal(log.created, created); assert.equal(root.children.length, 1);
  assert.notEqual(g.attrs.transform, tf0);
  assert.equal(sweat.attrs.display, 'inline');
  assert.match(g.children.find(c => c.attrs.fill === '#F2C94C').attrs.d, /^M/);
  const sets = log.sets; a.render(1); assert.ok(log.sets - sets <= 1, 'unchanged frame writes nothing but the group transform');
});
test('canvas actor draws with Path2D', () => {
  const calls = [];
  class Path2D { constructor(d) { this.d = d; } }
  const R = loadRuntime(RT, { Path2D }).MH;
  const ctx = { drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fill: p => calls.push(['fill', p.d]), stroke: p => calls.push(['stroke', p.d]) };
  const a = R.rig.actor(ctx, {}, { life: false });
  assert.equal(typeof a.pose(0).x, 'number');
  a.render(0);
  assert.equal(calls.filter(c => c[0] === 'fill').length, 3);   // 몸통 + 눈 2
  a.life(true); assert.notEqual(a.pose(1.3).sy, 1);
  assert.throws(() => R.rig.actor({}, {}), /SVG|캔버스/);
});
test('load fetches assets/actors/<name>.json and rejects in Korean', async () => {
  const urls = [];
  const fetch = async u => { urls.push(u); return u.includes('blob') ? { ok: true, json: async () => ({ body: { w: 10 } }) } : { ok: false, status: 404 }; };
  const R = loadRuntime(RT, { fetch }).MH;
  assert.equal((await R.rig.load('blob')).body.w, 10);
  assert.equal(urls[0], 'assets/actors/blob.json');
  await assert.rejects(R.rig.load('none'), /불러오지 못했습니다/);
});

// ── 리뷰 1차 수정 ──
test('overlapping transient rotations leave no permanent tilt', () => {
  for (const A of [[[0, 'nod'], [0.2, 'walk', { to: [100, 0] }]], [[0, 'walk', { to: [300, 0] }], [1.05, 'nod']], [[0, 'shake'], [0.1, 'nod'], [0.3, 'shake']]]) {
    assert.ok(Math.abs(MH.rig.pose(D, A, 5, OFF).rot) < 0.01, JSON.stringify(A));
  }
  const L = MH.rig.normalize({ limbs: [{}, {}] });
  assert.ok(Math.abs(MH.rig.pose(L, [[0, 'walk', { to: [100, 0] }], [0.5, 'walk', { to: [200, 0] }]], 5, OFF).limbs[0]) < 0.01);
});
test('stroked eyes keep their stroke while blinking', () => {
  for (const f of ['squint', 'happy', 'sad']) {
    const p = MH.rig.pose(D, [[0, 'face', f], [1, 'blink']], 1.06, OFF);
    assert.ok(p.eyes.open < 0.2);
    const e = MH.rig.geometry(D, p).find(g => g.part === 'eyeL');
    assert.ok(e.stroke && e.width >= 2, f); assert.equal(e.m[4], 1, f);
    const xs = e.d.match(/-?[\d.]+/g).map(Number);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 5, f + ' path not degenerate');
  }
  const ov = MH.rig.geometry(D, MH.rig.pose(D, [[1, 'blink']], 1.06, OFF)).find(g => g.part === 'eyeL');
  assert.ok(ov.m[4] < 0.2);   // 채운 눈은 여전히 세로로 눌린다
});
test('screen size falls back to #root data-width/height', () => {
  const root = { getAttribute: k => ({ 'data-width': '1080', 'data-height': '1920' })[k] ?? null };
  const R = loadRuntime(RT, { document: { createElement: () => ({}), getElementById: id => (id === 'root' ? root : null) } }).MH, d = R.rig.normalize({});
  const p = R.rig.pose(d, [[0, 'grow']], 3, OFF);
  assert.equal(p.x, 540); assert.equal(p.y, 960);
  const q = R.rig.pose(d, [[0, 'grow']], 3, { life: false, W: 800, H: 600 });
  assert.equal(q.x, 400);
  const W = loadRuntime(RT); W.DNA = { W: 1000, H: 1000 };
  assert.equal(W.MH.rig.pose(d, [[0, 'grow']], 3, OFF).y, 500);
  assert.equal(MH.rig.pose(D, [[0, 'grow']], 3, OFF).x, 960);
});
test('talk starts and ends with the mouth closed', () => {
  const A = [[1, 'talk', { dur: 1 }]];
  assert.ok(MH.rig.pose(D, A, 1, OFF).mouth.open < 1e-9);
  assert.ok(MH.rig.pose(D, A, 1.999, OFF).mouth.open < 0.01);
});
test('walk has no anticipation or overshoot by default (R10)', () => {
  const xs = Array.from({ length: 200 }, (_, i) => MH.rig.pose(D, [[0, 'walk', { to: [300, 0] }]], i / 100, OFF).x);
  assert.ok(xs.every((x, i) => x >= 0 && x <= 300 && (i === 0 || x >= xs[i - 1] - 1e-9)));
  const ant = Array.from({ length: 50 }, (_, i) => MH.rig.pose(D, [[0, 'walk', { to: [300, 0], ant: 0.2 }]], i / 100, OFF).x);
  assert.ok(Math.min(...ant) < 0);
});
test('partial targets fall back per component', () => {
  const o = { life: false, x: 10, y: 20 };
  for (const a of [['hop', { to: [300] }], ['walk', { to: [300] }], ['enter', { from: 'left', at: [300] }]]) {
    const p = MH.rig.pose(D, [[0, ...a]], 5, o);
    assert.equal(p.x, 300, a[0]); assert.equal(p.y, 20, a[0]);
  }
});
test('extras colliding with built-in part names are renamed', () => {
  const warns = [], R = loadRuntime(RT, { console: { warn: m => warns.push(m), log() {} } }).MH;
  const d = R.rig.normalize({ extras: [{ part: 'body', d: 'M0 0L1 1' }, { part: 'hat', d: 'M0 0L1 1' }, { part: 'hat', d: 'M0 0L2 2' }] });
  assert.deepEqual(d.extras.map(e => e.part), ['extra0', 'hat', 'extra2']);
  assert.equal(warns.length, 2);
  const parts = Array.from(R.rig.geometry(d, R.rig.pose(d, [], 0, OFF)).map(g => g.part));
  assert.equal(parts.filter(n => n === 'body').length, 1);
  assert.equal(R.rig.normalize(d).extras[0].part, 'extra0'); assert.equal(warns.length, 2);   // 다시 정규화해도 경고 없음
});
test('load wraps network errors in Korean', async () => {
  const R = loadRuntime(RT, { fetch: () => Promise.reject(new Error('offline')) }).MH;
  await assert.rejects(R.rig.load('x'), /불러오지 못했습니다: assets\/actors\/x\.json \(offline\)/);
});
test('channels stay continuous across interrupting actions', () => {
  const keys = ['x', 'y', 'sx', 'sy', 'rot'], bound = { x: 30, y: 30, sx: 0.25, sy: 0.25, rot: 3 };
  const cases = [
    [[0, 'stretch', { x: 2.2 }], [0.5, 'hop', { to: [200, 0] }]],
    [[0, 'squash'], [0.12, 'squash', { amt: 0.7 }]],
    [[0, 'hop', { to: [200, 0] }], [0.85, 'walk', { to: [0, 0] }]],
    [[0, 'nod'], [0.2, 'walk', { to: [100, 0] }]],
    [[0, 'walk', { to: [300, 0] }], [1.05, 'nod']],
  ];
  for (const A of cases) {
    let prev = MH.rig.pose(D, A, 0, OFF);
    for (let i = 1; i <= 360; i++) {
      const p = MH.rig.pose(D, A, i / 120, OFF);
      for (const k of keys) assert.ok(Math.abs(p[k] - prev[k]) <= bound[k], `${JSON.stringify(A)} ${k} @${(i / 120).toFixed(3)}: ${prev[k]} → ${p[k]}`);
      prev = p;
    }
  }
});

// ── 파츠 시트 (Task 10) ──
import fs from 'node:fs';
const R = JSON.parse(fs.readFileSync('test/fixtures/rig/parts.json', 'utf8'));
const PD = MH.rig.normalize(R);
const lay = (A, t, o = OFF, rig = R) => MH.rig.layout(rig, MH.rig.pose(PD, A, t, o));
const byName = L => Object.fromEntries(L.map(q => [q.name, q]));
test('layout hides open eyes during blink', () => {
  const L = MH.rig.layout(R, MH.rig.pose(R, [[1, 'blink']], 1.06, { life: false }));
  assert.equal(L.find(p => p.name === R.eyesClosed).visible, true);
  assert.equal(L.find(p => p.name === 'eyes_open').visible, false);
  const open = byName(lay([], 0.5));
  assert.equal(open.eyes_open.visible, true); assert.equal(open.eyes_closed.visible, false);
});
test('child part follows parent transform', () => {
  const A = byName(MH.rig.layout(R, { ...MH.rig.pose(PD, [], 0, OFF), x: 50, y: 20, rot: 10, sx: 1, sy: 1, limbs: [0, 0] }));
  assert.ok(A.body.transform.startsWith('translate(50 20) rotate(10)'));
  assert.ok(A.limb0.transform.startsWith(A.body.transform), A.limb0.transform);
  assert.ok(A.limb0.transform.length > A.body.transform.length);
  const W = byName(lay([[0, 'nod', { amt: 20, dur: 1 }], [0, 'walk', { to: [100, 0], steps: 2, dur: 1 }]], 0.5));   // 움직이는 중에도
  assert.ok(W.limb0.transform.startsWith(W.body.transform) && W.eyes_open.transform.startsWith(W.body.transform));
  assert.equal(A.body.transform, 'translate(50 20) rotate(10) translate(-200 -160)');
  assert.equal(A.limb0.transform, `${A.body.transform} translate(10 180) translate(-30 -10)`);   // 부모 pivot(200,160) + at(-190,20), 자기 pivot 만큼 되돌림
});
test('layout is z-ascending, pure, and hides non-chosen face parts', () => {
  const L = lay([], 0.5);
  assert.ok(L.every((q, i) => i === 0 || L[i - 1].z <= q.z));
  assert.deepEqual(Array.from(L.map(q => q.name)), ['limb0', 'limb1', 'body', 'eyes_open', 'eyes_closed', 'mouth_smile', 'mouth_open']);
  assert.equal(JSON.stringify(lay([], 0.5)), JSON.stringify(L));
  const q = byName(lay([[0, 'face', 'happy']], 1));   // happy = 감은 눈 + 열린 입
  assert.equal(q.eyes_closed.visible, true); assert.equal(q.eyes_open.visible, false);
  assert.equal(q.mouth_open.visible, true); assert.equal(q.mouth_smile.visible, false);
  assert.ok(q.body.visible && q.limb0.visible);
});
test('talk swaps in talkMouth while the mouth is open, not when idle', () => {
  const A = [[0, 'talk', { dur: 1 }]], seen = new Set();
  for (let i = 0; i < 60; i++) { const b = byName(lay(A, i / 60)); seen.add(b.mouth_open.visible + '/' + b.mouth_smile.visible); }
  assert.ok(seen.has('true/false') && seen.has('false/true'));
  const after = byName(lay(A, 2)); assert.equal(after.mouth_open.visible, false); assert.equal(after.mouth_smile.visible, true);
  const noTalk = { ...R, talkMouth: undefined }, p = MH.rig.pose(PD, A, 0.08, OFF);
  assert.equal(byName(MH.rig.layout(noTalk, p)).mouth_open.visible, false);
});
test('unknown face falls back to idle; look offsets only face parts', () => {
  const lonely = { ...R, faces: { idle: R.faces.idle } };
  const f = byName(MH.rig.layout(lonely, MH.rig.pose(PD, [[0, 'face', 'star']], 0.5, OFF)));
  assert.equal(f.mouth_smile.visible, true);
  const p0 = byName(lay([], 2)), p1 = byName(lay([[0, 'look', { x: 1, y: -1 }]], 2));
  assert.ok(p0.eyes_open.transform.endsWith('translate(200 120) translate(-80 -30)'), p0.eyes_open.transform);
  assert.ok(p1.eyes_open.transform.endsWith('translate(206 114) translate(-80 -30)'), p1.eyes_open.transform);   // lookPx 6 × (1, −1)
  assert.equal(p1.body.transform, p0.body.transform); assert.equal(p1.limb0.transform, p0.limb0.transform);
});
test('limbs swing from pose.limbs; sweat part follows pose.sweat', () => {
  const W = [[0, 'walk', { to: [300, 0], steps: 2, dur: 1 }]];
  const mid = byName(lay(W, 0.25)), end = byName(lay(W, 5));
  assert.notEqual(mid.limb0.transform, end.limb0.transform);
  const rotOf = q => q.m[q.m.length - 2][2];
  assert.ok(Math.abs(rotOf(mid.limb0)) > 1 && rotOf(mid.limb1) === -rotOf(mid.limb0));   // 팔 둘은 반대로 흔들린다
  const rig = { ...R, parts: [...R.parts, { name: 'sweat', src: 'sweat.png', size: [20, 30], pivot: [10, 15], parent: 'body', at: [150, -120], z: 30 }], faces: { ...R.faces, sweat: { eyes: 'eyes_open', mouth: 'mouth_smile' } } };
  const s0 = byName(MH.rig.layout(rig, MH.rig.pose(PD, [], 0, OFF))), s1 = byName(MH.rig.layout(rig, MH.rig.pose(PD, [[0, 'face', 'sweat']], 1, OFF)));
  assert.equal(s0.sweat.visible, false); assert.equal(s1.sweat.visible, true); assert.equal(s1.sweat.opacity, 1);
  const custom = byName(MH.rig.layout({ ...R, limbs: ['limb1', 'limb0'] }, { ...MH.rig.pose(PD, [], 0, OFF), limbs: [30, 0] }));
  assert.match(custom.limb1.transform, /rotate\(30\)/); assert.doesNotMatch(custom.limb0.transform, /rotate\(30\)/);
});
test('parts rig: body size comes from the root part, bad rigs are rejected in Korean', () => {
  assert.deepEqual([PD.body.w, PD.body.h], [400, 320]);
  const pv = { pivot: [0, 0] }, bad = (parts, extra) => () => MH.rig.normalize({ kind: 'parts', ...extra, parts });
  assert.throws(bad([{ name: 'a', src: 'a.png', parent: null, ...pv }]), /size/);
  assert.throws(bad([{ name: 'a', src: 'a.png', parent: 'b', ...pv }], { size: [1, 1] }), /루트/);
  assert.throws(bad([{ name: 'a', src: 'a', parent: null, ...pv }, { name: 'b', src: 'b', parent: 'c', ...pv }], { size: [1, 1] }), /parent/);
  assert.throws(bad([{ name: 'a', src: 'a', parent: null, ...pv }, { name: 'b', src: 'b', parent: 'c', ...pv }, { name: 'c', src: 'c', parent: 'b', ...pv }], { size: [1, 1] }), /순환/);
  assert.throws(bad([{ name: 'a', src: 'a', parent: null, ...pv }, { name: 'a', src: 'b', parent: 'a', ...pv }], { size: [1, 1] }), /겹칩니다: 'a'/);
  assert.throws(bad([{ name: 'a', src: 'a', parent: null, ...pv }, { name: 'b', src: 'b', parent: null, ...pv }], { size: [1, 1] }), /하나여야/);
  assert.throws(bad([{ name: 'a', src: 'a', parent: null }], { size: [1, 1] }), /pivot/);
  assert.throws(() => MH.rig.layout(D, MH.rig.pose(D, [], 0, OFF)), /parts/);
});
test('grow fills portrait screen', () => {
  const p = MH.rig.pose(PD, [[0, 'grow', { fill: 'screen', dur: 0.8 }]], 2, { life: false, W: 1080, H: 1920 });
  assert.ok(p.sx * PD.body.h >= Math.hypot(1080, 1920) * 0.99);   // 짧은 변(320) 기준 R9
  assert.equal(p.x, 540); assert.equal(p.y, 960);
  const q = byName(MH.rig.layout(R, p));
  assert.match(q.body.transform, /^translate\(540 960\) scale\(6\.\d+ 6\.\d+\) translate\(-200 -160\)$/);
});
test('parts actor: SVG images are created once, canvas draws with drawImage, loads register buildReady', async () => {
  const loaded = [];
  class Image { set src(v) { this._s = v; loaded.push(v); this.naturalWidth = 50; this.naturalHeight = 40; Promise.resolve().then(() => this.onload()); } get src() { return this._s; } }
  const { log, document, root } = fakeSVG();
  const RT2 = loadRuntime(RT, { document, Image }), M2 = RT2.MH;
  const a = M2.rig.actor(root, R, { life: false }).act([[0, 'face', 'happy'], [0.5, 'walk', { to: [100, 0] }]]);
  assert.deepEqual(Array.from(new Set(loaded)).sort(), Array.from(new Set(R.parts.map(q => q.src))).sort());
  assert.equal(loaded.length, new Set(R.parts.map(q => q.src)).size);   // src 별 한 번
  await Promise.all(Object.values(RT2.__hf.buildReady));
  assert.equal(typeof RT2.__hf.buildReady['rig:assets/actors/hero/body.png'].then, 'function');
  a.render(0); const created = log.created, g = root.children[0];
  assert.equal(g.children.length, R.parts.length); assert.ok(g.children.every(c => c.tag === 'image'));
  assert.deepEqual(Array.from(g.children.map(c => c.attrs['data-part'])), ['limb0', 'limb1', 'body', 'eyes_open', 'eyes_closed', 'mouth_smile', 'mouth_open']);
  const body = g.children.find(c => c.attrs['data-part'] === 'body'), eo = g.children.find(c => c.attrs['data-part'] === 'eyes_open');
  assert.equal(body.attrs.href, 'assets/actors/hero/body.png'); assert.equal(body.attrs.width, '400');
  assert.equal(eo.attrs.display, 'none');
  const tf0 = body.attrs.transform; a.render(0.7); a.render(1);
  assert.equal(log.created, created); assert.notEqual(body.attrs.transform, tf0);
  const sets = log.sets; a.render(1); assert.equal(log.sets, sets);
  // 캔버스
  const calls = [];
  const ctx = { save() {}, restore() {}, translate: (...a) => calls.push(['t', ...a]), rotate() {}, scale() {}, drawImage: (img, ...a) => calls.push(['d', img.src, ...a]) };
  const c = M2.rig.actor(ctx, R, { life: false });
  c.render(0);
  const draws = calls.filter(x => x[0] === 'd');
  assert.deepEqual(Array.from(draws.map(d => d[1].split('/').pop())), ['arm.png', 'arm.png', 'body.png', 'eyes_open.png', 'mouth_smile.png']);
  assert.deepEqual(Array.from(draws[2].slice(2)), [0, 0, 400, 320]);
});
test('parts image load failure rejects buildReady in Korean', async () => {
  class Image { set src(v) { Promise.resolve().then(() => this.onerror()); } }
  const R2 = loadRuntime(RT, { Image, document: fakeSVG().document });
  R2.MH.rig.actor(fakeSVG().root, R, { life: false });
  await assert.rejects(R2.__hf.buildReady['rig:assets/actors/hero/body.png'], /불러오지 못했습니다/);
});


// ── 리뷰 1차 수정 (파츠 이미지 로딩) ──
const sizeless = { ...R, parts: R.parts.map(q => (q.name === 'body' ? q : { ...q, size: undefined })) };
const fakeImage = (log = {}) => class Image {
  set src(v) { this._s = v; (log.srcs = log.srcs || []).push(v); const fail = (log.fail || []).some(f => v.includes(f)); log.pending = (log.pending || []); log.pending.push(() => { if (fail) this.onerror(); else { this.naturalWidth = 77; this.naturalHeight = 33; this.onload(); } }); if (!log.manual) log.release(); }
  get src() { return this._s; }
};
const imgLog = (o = {}) => { const log = { ...o, pending: [] }; log.release = () => { const f = log.pending.splice(0); Promise.resolve().then(() => f.forEach(x => x())); }; return log; };
test('sizeless parts become visible after load without an external render call', async () => {
  const log = imgLog({ manual: true }), { document, root } = fakeSVG();
  const RT3 = loadRuntime(RT, { document, Image: fakeImage(log) });
  const a = RT3.MH.rig.actor(root, sizeless, { life: false });
  a.render(0.5);
  const eyes = () => root.children[0].children.find(c => c.attrs['data-part'] === 'eyes_open');
  assert.equal(eyes().attrs.display, 'none');          // 아직 크기를 모른다
  log.release(); await Promise.all(Object.values(RT3.__hf.buildReady)); await null;
  assert.equal(eyes().attrs.display, 'inline'); assert.equal(eyes().attrs.width, '77'); assert.equal(eyes().attrs.height, '33');
});
test('late image load re-renders the last t, not a stale one', async () => {
  const log = imgLog({ manual: true }), { document, root } = fakeSVG();
  const RT3 = loadRuntime(RT, { document, Image: fakeImage(log) });
  const a = RT3.MH.rig.actor(root, sizeless, { life: false }).act([[0, 'walk', { to: [100, 0], dur: 1 }]]);
  a.render(0.2); a.render(1.5);
  log.release(); await Promise.all(Object.values(RT3.__hf.buildReady)); await null;
  const body = root.children[0].children.find(c => c.attrs['data-part'] === 'body');
  assert.ok(body.attrs.transform.startsWith('translate(100 0)'), body.attrs.transform);
});
test('load() of a parts rig awaits its images and registers buildReady', async () => {
  const log = imgLog({ manual: true });
  const fetch = async () => ({ ok: true, json: async () => R });
  const RT3 = loadRuntime(RT, { fetch, Image: fakeImage(log) });
  let done = false;
  const pr = RT3.MH.rig.load('hero').then(j => { done = true; return j; });
  await new Promise(r => setImmediate(r));
  assert.equal(done, false); assert.equal(log.srcs.length, 6);   // 서로 다른 이미지 6장 (팔 둘은 같은 파일)
  assert.ok(Object.keys(RT3.__hf.buildReady).includes('rig:assets/actors/hero/body.png'));
  log.release();
  const j = await pr;
  assert.equal(done, true); assert.equal(j.kind, 'parts');
  const code = loadRuntime(RT, { fetch: async () => ({ ok: true, json: async () => ({ body: { w: 10 } }) }), Image: fakeImage(imgLog({ manual: true })) });
  assert.equal((await code.MH.rig.load('blob')).body.w, 10);   // 코드 캐릭터는 이미지 없이 바로
});
test('a rejected image leaves the part hidden, warns once, never throws from render', async () => {
  const log = imgLog({ manual: true, fail: ['eyes_open'] }), warns = [], { document, root } = fakeSVG();
  const RT3 = loadRuntime(RT, { document, Image: fakeImage(log), console: { warn: m => warns.push(m), log() {} } });
  const a = RT3.MH.rig.actor(root, R, { life: false });
  a.render(0.5); log.release();
  await Promise.all(Object.values(RT3.__hf.buildReady).map(p => p.catch(() => {}))); await null;
  const el = n => root.children[0].children.find(c => c.attrs['data-part'] === n);
  assert.equal(el('eyes_open').attrs.display, 'none'); assert.equal(el('body').attrs.display, 'inline');
  assert.doesNotThrow(() => { a.render(0.6); a.render(0.7); });
  assert.equal(warns.filter(m => /eyes_open\.png/.test(m)).length, 1);
  const ctxCalls = [], ctx = { save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage: img => ctxCalls.push(img.src) };
  const c = RT3.MH.rig.actor(ctx, R, { life: false }); assert.doesNotThrow(() => c.render(0.5));
  assert.ok(!ctxCalls.some(s => s.includes('eyes_open')) && ctxCalls.some(s => s.includes('body')));
  const hf = RT3.__hf.buildReady['rig:assets/actors/hero/eyes_open.png'];
  await assert.rejects(hf, /불러오지 못했습니다/);
});
test('rig2d.md size and prompt placeholders', () => {
  const md = fs.readFileSync('harness/modules/rig2d.md', 'utf8');
  assert.ok(Buffer.byteLength(md) <= 3072, String(Buffer.byteLength(md)));
  for (const k of ['<CHARACTER>', '<STYLE SUFFIX>', 'idle, happy, sweat, squint, star, sad, surprise', 'do NOT draw any labels', 'at least 10% of the canvas width', 'no text, no watermark, no logo']) assert.ok(md.includes(k), k);
  const m = md.match(/```json\n([\s\S]*?)```/), ex = JSON.parse(m[1]), names = new Set(ex.parts.map(q => q.name));
  for (const n of [ex.eyesClosed, ex.talkMouth, ...Object.values(ex.faces).flatMap(f => [f.eyes, f.mouth])]) assert.ok(names.has(n), n);
  assert.doesNotThrow(() => MH.rig.normalize(ex));
});

// R17: grow 의 배율은 예비동작 없이 (음수 배율 금지)
test('grow never makes sx/sy negative (ant 0 for scale)', () => {
  const A = [[0.5, 'grow', { dur: 0.8 }]];
  for (let i = 0; i <= 240; i++) { const p = MH.rig.pose(D, A, i / 120, { life: false, W: 1000, H: 500 }); assert.ok(p.sx >= 1 - 1e-9 && p.sy >= 1 - 1e-9, `t=${i / 120} sx=${p.sx}`); }
  const W = loadRuntime(RT); W.DNA = { motion: { ant: 0.5, over: 0.08, settle: 0.35 } };   // 큰 예비동작 DNA 에서도
  for (let i = 0; i <= 240; i++) { const p = W.MH.rig.pose(D, A, i / 120, { life: false, W: 1000, H: 500 }); assert.ok(p.sx > 0 && p.sy > 0, `t=${i / 120} sx=${p.sx}`); }
});
test('before a later first enter the actor waits at the entry start (not visible at 0,0)', () => {
  const O = { life: false, W: 1920, H: 1080 };
  const below = [[0.3, 'blink'], [0.8, 'enter', { from: 'below', at: [960, 740] }]];
  for (const t of [0, 0.5, 0.79]) { const p = MH.rig.pose(D, below, t, O); assert.equal(p.x, 960); assert.ok(p.y >= 740 + 1080, `t=${t} y=${p.y}`); }
  assert.equal(MH.rig.pose(D, below, 3, O).y, 740);
  const sc = [[2.3, 'enter', { from: 'scale', at: [1060, 600] }]];
  const p0 = MH.rig.pose(D, sc, 1, O); assert.equal(p0.sx, 0); assert.equal(p0.sy, 0); assert.equal(p0.x, 1060);
  const p1 = MH.rig.pose(D, sc, 5, O); assert.equal(p1.sx, 1); assert.equal(p1.x, 1060);
  // 첫 위치 동작이 enter 가 아니면 그대로 (기본 자리에서 시작)
  assert.equal(MH.rig.pose(D, [[1, 'hop', { to: [300, 0] }], [3, 'enter', { from: 'left', at: [10, 10] }]], 0.5, O).x, 0);
});
