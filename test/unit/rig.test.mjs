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
