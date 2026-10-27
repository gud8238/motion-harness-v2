import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { loadRuntime } from '../helpers/runtime.mjs';
import { readBeats } from '../../harness/tools/lib/plan.mjs';
import { stageShots, storyboardShots, beatWarnings } from '../../harness/tools/lib/board-shots.mjs';

const RT = ['harness/runtime/mh.js', 'harness/runtime/mh-rig.js', 'harness/runtime/mh-cam.js', 'harness/runtime/mh-fx.js', 'harness/runtime/mh-stage.js'];
const SVGNS = 'http://www.w3.org/2000/svg';
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

// 최소 DOM 스텁: 요소 트리 + style + 속성 + querySelector('#id')
function makeDoc() {
  const byId = {};
  const doc = {
    createElement: tag => mk(tag, null),
    createElementNS: (ns, tag) => mk(tag, ns),
    getElementById: id => byId[id] || null,
    querySelector: sel => (sel.startsWith('#') ? byId[sel.slice(1)] || null : null),
    byId,
  };
  function mk(tag, ns) {
    const el = {
      tagName: tag, namespaceURI: ns, style: {}, attrs: {}, children: [], parentNode: null, ownerDocument: doc, className: '', textContent: '',
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') byId[v] = this; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c, ref) { if (!ref) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.splice(this.children.indexOf(ref), 0, c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    };
    return el;
  }
  return doc;
}
const load = (g = {}) => { const doc = makeDoc(); const W = loadRuntime(RT, { document: doc, ...g }); return { W, MH: W.MH, doc }; };
const { MH } = load();
const matOf = s => (/matrix\(([^)]*)\)/.exec(s) || [])[1].split(/[ ,]+/).map(Number);

// ── 브리프 테스트 ──
test('compile groups and sorts cues', () => {
  const c = MH.stage2d.compile([[2.8, 'boo', 'enter', { at: 'list:c2' }], [0, 'cam', { zoom: 3 }], [0, 'cam', { zoom: 1, dur: 3.5 }], [5.4, 'set:phone', 'in'], [1, 'ghost', 'x']]);
  assert.equal(c.cam.length, 2); assert.equal(c.cam[1][2].dur, 3.5);
  assert.deepEqual([...c.actors.boo.map(a => a[1])], ['enter']);   // vm 런타임 배열 → 펼쳐서 비교 (다른 realm)
  assert.deepEqual([...c.sets.phone[0].slice(0, 2)], [5.4, 'in']);
});

const TPL = fs.readFileSync('harness/template/scene/compositions/_stage.html', 'utf8');
const fill = (id, dur, W, H) => TPL.replaceAll('__ID__', id).replaceAll('__DUR__', String(dur)).replaceAll('__W__', String(W)).replaceAll('__H__', String(H));

function tempProject(size) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-stage 무대-'));
  fs.cpSync('harness/template/scene', path.join(d, 'scene'), { recursive: true });
  if (size) {
    const f = path.join(d, 'scene', 'index.html');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/(id="root"[^>]*?data-width=")\d+("[^>]*?data-height=")\d+/, `$1${size[0]}$2${size[1]}`));
  }
  return d;
}
const SCENE = path.resolve('harness/tools/scene.mjs');
const addStage = d => spawnSync(process.execPath, [SCENE, 'add', '.', 'st1', 'stage', '--dur', '12'], { cwd: d, encoding: 'utf8' });

test('scene.mjs add stage creates composition with beats JSON', () => {
  const d = tempProject();
  try {
    const r = addStage(d); assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(path.join(d, 'scene', 'compositions', 'st1.html'), 'utf8');
    assert.ok(html.includes('st1-beats')); assert.ok(html.includes('MH.stage2d('));
    assert.ok(html.includes('data-width="1920" data-height="1080"'));
    assert.ok(!/__(ID|DUR|W|H)__/.test(html));
    assert.deepEqual(readBeats(html, 'st1'), [{ id: 'b1', t0: 0, t1: 12, title: '', note: '' }]);
    assert.ok(fs.readFileSync(path.join(d, 'scene', 'index.html'), 'utf8').includes('data-mh-kind="stage"'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('scene.mjs add stage in portrait project uses composition size', () => {
  const d = tempProject([1080, 1920]);
  try {
    const r = addStage(d); assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(path.join(d, 'scene', 'compositions', 'st1.html'), 'utf8');
    assert.ok(html.includes('data-width="1080" data-height="1920"'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('scene.mjs rejects unknown kind and lists stage', () => {
  const d = tempProject();
  try {
    const r = spawnSync(process.execPath, [SCENE, 'add', '.', 'x1', 'movie'], { cwd: d, encoding: 'utf8' });
    assert.notEqual(r.status, 0); assert.ok(r.stderr.includes('stage'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('template beats parse', () => assert.deepEqual(readBeats(fill('st1', 12, 1920, 1080), 'st1'), [{ id: 'b1', t0: 0, t1: 12, title: '', note: '' }]));
test('portrait stage uses composition size', () => {
  const html = fill('st1', 12, 1080, 1920);
  assert.ok(html.includes('data-width="1080" data-height="1920"'));
  assert.ok(html.includes('MH.stage2d(') && html.includes("window.__timelines[\"st1\"]") && html.includes('MH.rig.load("main")') && html.includes('buildReady["st1-actor"]'));
});
test('template runs: cues set synchronously, actor from file or fallback, no warnings for the pending actor', async () => {
  for (const ok of [false, true, 'bad']) {
    const warns = [], doc = makeDoc(), html = fill('st1', 12, 1080, 1920);
    const root = doc.createElement('div'); root.setAttribute('id', 'st1'); const card = doc.createElement('div'); card.setAttribute('id', 'st1-card'); root.appendChild(card);
    doc.createElement('script').setAttribute('id', 'st1-beats'); doc.byId['st1-beats'].textContent = /id="st1-beats">([^<]*)</.exec(html)[1];
    let tl; const gsap = { timeline: () => (tl = { time: () => 0, to(d) { this.d = d; return this; } }) };
    const fetch = async () => (ok === true ? { ok: true, status: 200, json: async () => ({ body: { shape: 'capsule', w: 300, h: 120 } }) } : ok === 'bad' ? { ok: true, status: 200, json: async () => ({ kind: 'parts', parts: [{ name: 'body' }] }) } : { ok: false, status: 404 });
    const W = loadRuntime(RT, { document: doc, gsap, fetch, console: { warn: m => warns.push(m), log() {} } });
    W.__timelines = {};
    vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n'), W);
    assert.equal(W.__timelines.st1, tl); assert.equal(warns.length, 0);   // 배우 로드 전 첫 그리기에도 경고 없음
    assert.equal(root.children.find(c => c.attrs.class !== 'mh-actors' && c !== card).style.transform, 'matrix(1.25,0,0,1.25,-135,-240)');   // 큐(카메라)는 로드 전에 이미 들어감
    await W.__hf.buildReady['st1-actor'];
    tl.d.t = 6;
    const g = root.children.find(c => c.attrs.class === 'mh-actors').children[0];
    assert.equal(g.attrs['data-actor'], 'main'); assert.match(g.children[0].attrs.transform, /^translate\(540 1160\)/);
    assert.equal(card.style.visibility, 'visible');
    assert.equal(warns.length, ok === true ? 0 : 1);   // 파일 없음·디자인 오류 → 기본 디자인 경고 1개
  }
});
test('stage.md size', () => assert.ok(fs.statSync('harness/modules/stage.md').size <= 3072));

// ── 추가: compile ──
test('compile: stable order, cam opts stripped, set defaults, actor opts kept', () => {
  const c = MH.stage2d.compile([
    [3, 'cam', { x: 10, ease: 'linear', follow: 'zoom', dur: 1 }],
    [1, 'set:a', 'out', { to: 'left' }], [1, 'set:a', 'in', { from: 'scale', dur: 0.2 }],
    [2, 'boo', 'face', 'happy'], [2, 'boo', 'blink'], [0.5, 'boo', 'hop', { h: 40 }],
    [0, 'cam', { y: 5 }, { dur: 2 }],
  ]);
  assert.deepEqual(Array.from(c.cam, k => [k[0], { ...k[1] }, { ...k[2] }]), [[0, { y: 5 }, { dur: 2 }], [3, { x: 10 }, { dur: 1, ease: 'linear', follow: 'zoom' }]]);
  assert.deepEqual(Array.from(c.sets.a, s => [s[0], s[1], { ...s[2] }]), [[1, 'out', { dur: 0.5, from: 'left' }], [1, 'in', { dur: 0.2, from: 'scale' }]]);
  assert.deepEqual(Array.from(c.actors.boo, a => [...a].map(v => (v && typeof v === 'object' ? { ...v } : v))), [[0.5, 'hop', { h: 40 }], [2, 'face', 'happy'], [2, 'blink']]);
});
test('compile warns once for malformed cues and ignores them', () => {
  const warns = []; const { MH: M } = load({ console: { warn: m => warns.push(m), log() {} } });
  const c = M.stage2d.compile([[0, 42, 'x'], [0, 42, 'y'], ['a', 'cam', {}], [1, 'set:a', 'wiggle'], [1, 'cam', 'zoom']]);
  assert.equal(c.cam.length, 0); assert.deepEqual(Object.keys(c.sets), []); assert.deepEqual(Object.keys(c.actors), []);
  assert.equal(warns.length, 4);
});

// ── 추가: 무대 ──
const mkStage = (M, doc, o = {}) => { const root = doc.createElement('div'); return { root, st: M.stage2d(root, { W: 1000, H: 500, dur: 10, ...o }) }; };

test('stage builds world (cam depth-1 layer) and actor overlay above it', () => {
  const { MH: M, doc } = load(); const { root, st } = mkStage(M, doc);
  assert.equal(root.children.length, 2);
  const [world, svg] = root.children;
  assert.equal(world, st.world); assert.equal(world.className, 'mh-world'); assert.equal(world.style.transformOrigin, '0 0');
  assert.equal(svg.namespaceURI, SVGNS); assert.equal(svg.attrs.class, 'mh-actors'); assert.equal(svg.attrs.viewBox, '0 0 1000 500'); assert.equal(svg.style.pointerEvents, 'none');
  assert.ok(st.cam.layers.some(l => l.el === world && l.depth === 1));
  assert.equal(st.W, 1000); assert.equal(st.H, 500);
});
test('depth layers: ascending by depth under the actors, depth 0 (HUD) on top (R15)', () => {
  const { MH: M, doc } = load(); const { root, st } = mkStage(M, doc);
  const far = doc.createElement('div'), near1 = doc.createElement('div'), mid = doc.createElement('div'), far2 = doc.createElement('div'), hud = doc.createElement('div'), hud2 = doc.createElement('div');
  st.set('hud', hud, { depth: 0 }).set('far', far, { at: [0, 0], depth: 0.4 }).set('fg', near1, { at: [0, 0], depth: 1.5 }).set('mid', mid, { at: [10, 20] }).set('far2', far2, { depth: 0.4 }).set('hud2', hud2, { depth: 0 });
  assert.equal(mid.parentNode, st.world); assert.equal(far.parentNode, far2.parentNode); assert.equal(hud.parentNode, hud2.parentNode);
  const order = root.children.map(el => (el.attrs.class === 'mh-actors' ? 'svg' : st.cam.layers.find(l => l.el === el).depth));
  assert.deepEqual(order, [0.4, 1, 1.5, 'svg', 0]);
  assert.equal(mid.style.position, 'absolute'); assert.equal(mid.style.left, '10px'); assert.equal(mid.style.top, '20px');
});
test('set in/out: hidden before in, offset math, hidden after out', () => {
  const { MH: M, doc, W } = load(); W.DNA = { motion: { ant: 0, over: 0, settle: 0 } };   // 단조 → 오프셋 계산이 단순
  const { st } = mkStage(M, doc);
  const a = doc.createElement('div'), b = doc.createElement('div'), c = doc.createElement('div');
  st.set('a', a, { at: [0, 0] }).set('b', b).set('c', c).cues([
    [1, 'set:a', 'in', { from: 'below', dur: 1 }], [5, 'set:a', 'out', { dur: 1 }],
    [1, 'set:b', 'in', { from: 'left', dur: 1 }], [1, 'set:c', 'in', { from: 'scale', dur: 1 }],
  ]);
  st.render(0);
  assert.equal(a.style.visibility, 'hidden'); assert.equal(a.style.opacity, '0');
  st.render(1);
  assert.equal(a.style.visibility, 'visible'); assert.equal(a.style.opacity, '0'); assert.equal(a.style.transform, 'translate(0px, 75px) scale(1)');   // 0.15·H = 75
  st.render(1.5);
  const y = M.move(1.5, 1, 75, 0, { dur: 1 }); assert.equal(a.style.transform, `translate(0px, ${+y.toFixed(3)}px) scale(1)`); assert.equal(a.style.opacity, '0.5');
  assert.equal(b.style.transform, `translate(${+M.move(1.5, 1, -150, 0, { dur: 1 }).toFixed(3)}px, 0px) scale(1)`);   // 0.15·W = 150
  assert.equal(c.style.transform, `translate(0px, 0px) scale(${+M.move(1.5, 1, 0.6, 1, { dur: 1 }).toFixed(3)})`);
  st.render(3);
  assert.equal(a.style.transform, 'translate(0px, 0px) scale(1)'); assert.equal(a.style.opacity, '1');
  st.render(5.5);
  assert.equal(a.style.transform, `translate(0px, ${+M.move(5.5, 5, 0, 75, { dur: 1 }).toFixed(3)}px) scale(1)`); assert.equal(a.style.opacity, '0.5');
  st.render(6);
  assert.equal(a.style.visibility, 'hidden'); assert.equal(a.style.opacity, '0');
});
test('set: out during in (and in during out) starts from the current state — no pop', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  const a = doc.createElement('div'), b = doc.createElement('div');
  st.set('a', a).set('b', b).cues([[1, 'set:a', 'in', { dur: 1 }], [1.4, 'set:a', 'out', { dur: 1, from: 'right' }], [0, 'set:b', 'out', { dur: 1 }], [0.5, 'set:b', 'in', { dur: 1 }]]);
  const snap = (el, t) => { st.render(t); return [el.style.transform, +el.style.opacity]; };
  const num = s => s[0].match(/-?[\d.]+/g).map(Number);
  for (const [el, t] of [[a, 1.4], [b, 0.5]]) {
    const pre = snap(el, t - 1e-4), at = snap(el, t), post = snap(el, t + 1 / 120);
    num(pre).forEach((v, i) => near(v, num(at)[i], 0.05)); near(pre[1], at[1], 0.01);
    num(at).forEach((v, i) => assert.ok(Math.abs(v - num(post)[i]) < 3, `${t}: ${at[0]} → ${post[0]}`)); assert.ok(Math.abs(at[1] - post[1]) < 0.05);
  }
  assert.ok(+snap(a, 1.4)[1] > 0.3);                  // in 이 40% 진행된 상태에서 out 시작 (0 으로 튀지 않음)
  st.render(2.5); assert.equal(a.style.visibility, 'hidden');
  st.render(3); assert.equal(b.style.transform, 'translate(0px, 0px) scale(1)'); assert.equal(b.style.opacity, '1');
});
test('set without cues or starting with out is visible from the start', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  const a = doc.createElement('div'), b = doc.createElement('div');
  st.set('a', a).set('b', b).cues([[2, 'set:b', 'out', { from: 'fade' }]]);
  st.render(0);
  assert.equal(a.style.visibility, 'visible'); assert.equal(a.style.opacity, '1');
  assert.equal(b.style.visibility, 'visible'); assert.equal(b.style.opacity, '1');
  st.render(2.25); assert.equal(b.style.transform, 'translate(0px, 0px) scale(1)'); assert.equal(b.style.opacity, '0.5');
  st.render(9); assert.equal(b.style.visibility, 'hidden');
});
test('cam cues drive the world layer', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  st.cues([[0, 'cam', { x: 200, y: 100, zoom: 2 }], [1, 'cam', { zoom: 1, dur: 2, ease: 'linear' }]]);
  st.render(2);
  assert.deepEqual(matOf(st.world.style.transform), Array.from(st.cam.matrix(2, 1)).map(v => +v.toFixed(5)));
  near(st.cam.state(3).zoom, 1);
});

const DESIGN = { body: { shape: 'blob', w: 100, h: 80 } };
const centreOf = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
test('actor wrapper: anchor 0 = cam matrix, 1 = identity, midway = position blend (R16)', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  st.actor('boo', DESIGN, { life: false }).cues([[0, 'cam', { x: 300, y: 200, zoom: 2, rot: 10 }], [1, 'boo', 'grow', { dur: 1 }]]);
  const g = st.actorTarget('boo'), A = st.actors.boo;
  assert.equal(g.namespaceURI, SVGNS); assert.equal(g.parentNode.attrs.class, 'mh-actors');
  st.render(0.5);
  assert.ok(g.children.length === 1, 'rig root <g> sits inside the wrapper');
  matOf(g.attrs.transform).forEach((v, i) => near(v, st.cam.matrix(0.5, 1)[i]));
  st.render(3);
  assert.deepEqual(matOf(g.attrs.transform), [1, 0, 0, 1, 0, 0]);
  st.render(1.5);
  const P = A.pose(1.5), a = P.anchor, m = st.cam.matrix(1.5, 1), I = [1, 0, 0, 1, 0, 0], w = matOf(g.attrs.transform);
  assert.ok(a > 0.05 && a < 0.95, String(a));
  for (let i = 0; i < 4; i++) near(w[i], m[i] + (I[i] - m[i]) * a);                       // 선형부 = lerp(카메라, I, a)
  const p0 = A.pose(1), pe = A.pose(1 + 1 + 0.35), from = centreOf(m, [p0.x, p0.y]), c = centreOf(w, [P.x, P.y]);   // 출발: 전환 시작 자세(월드), 도착: 안착 끝 자세(화면)
  near(c[0], from[0] + (pe.x - from[0]) * a, 1e-3); near(c[1], from[1] + (pe.y - from[1]) * a, 1e-3);
});
test('grow under an offset zoomed camera heads straight to the screen centre (R16)', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);   // 1000×500
  st.actor('boo', DESIGN, { life: false, x: 2930, y: 270 }).cues([[0, 'cam', { x: 2900, y: 250, zoom: 3 }], [1, 'boo', 'grow', { dur: 0.8 }]]);
  const g = st.actorTarget('boo'), A = st.actors.boo, path = [];
  for (let i = 0; i <= 360; i++) { const t = i / 120; st.render(t); const p = A.pose(t); path.push(centreOf(matOf(g.attrs.transform), [p.x, p.y])); }
  near(path[0][0], 500 + 30 * 3, 1e-3); near(path[0][1], 250 + 20 * 3, 1e-3);   // 처음엔 월드 점 그대로
  const d = path.map(([x, y]) => Math.hypot(x - 500, y - 250));
  for (const [x, y] of path) assert.ok(x >= 0 && x <= 1000 && y >= 0 && y <= 500, `${x},${y}`);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] <= d[i - 1] + 2, `detour at ${i / 120}s: ${d[i - 1]} → ${d[i]}`);
  near(path.at(-1)[0], 500, 1e-6); near(path.at(-1)[1], 250, 1e-6);
  assert.deepEqual(matOf(g.attrs.transform), [1, 0, 0, 1, 0, 0]);
});
const maxJump = (st, A, g, ts) => {   // 경계 t 마다 [t − 2/120, t + 2/120] 에서 1/120초 간 중심 이동 최댓값
  const cen = t => { st.render(t); const p = A.pose(t); return centreOf(matOf(g.attrs.transform), [p.x, p.y]); };
  let m = 0;
  for (const tb of ts) for (let k = -2; k < 2; k++) { const a = cen(tb + k / 120), b = cen(tb + (k + 1) / 120); m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return m;
};
test('chained transitions start from the displayed centre: grow then anchor→world (no teleport)', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  st.actor('boo', DESIGN, { life: false, x: 2930, y: 270 }).cues([[0, 'cam', { x: 2900, y: 250, zoom: 3 }], [2, 'boo', 'grow'], [2.5, 'boo', 'anchor', { to: 'world' }]]);
  const j = maxJump(st, st.actors.boo, st.actorTarget('boo'), [2, 2.5]);
  assert.ok(j <= 20, `jump ${j}px`);
});
test('chained transitions: grow, hop on screen, grow again (no teleport)', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  st.actor('boo', DESIGN, { life: false, x: 2930, y: 270 }).cues([[0, 'cam', { x: 2900, y: 250, zoom: 3 }], [2, 'boo', 'grow'], [4, 'boo', 'hop', { to: [300, 300] }], [6, 'boo', 'grow']]);
  const A = st.actors.boo, g = st.actorTarget('boo');
  assert.ok(maxJump(st, A, g, [2, 4, 6]) <= 20);
  st.render(5.9); const p = A.pose(5.9), c = centreOf(matOf(g.attrs.transform), [p.x, p.y]); near(c[0], 300, 1e-6); near(c[1], 300, 1e-6);   // 화면에 붙은 채 깡충
  st.render(9); assert.deepEqual(matOf(g.attrs.transform), [1, 0, 0, 1, 0, 0]); near(A.pose(9).x, 500, 1e-9);
});
test('render falls back to pose() when actor.render returns nothing', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  const real = M.rig.actor(st.actorTarget('x'), DESIGN, { W: 1000, H: 500, life: false });
  const A = { act: l => (real.act(l), A), pose: t => real.pose(t), render: t => { real.render(t); } };
  st.actor('x', A).cues([[0, 'cam', { x: 600, zoom: 2 }], [0, 'x', 'hop', { to: [100, 0] }]]);
  st.render(1); assert.match(st.actorTarget('x').attrs.transform, /^matrix\(2 0 0 2 -700 -250\)$/);
});
test('anchor back to world: from the frozen screen point to the live world point', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  st.actor('boo', DESIGN, { life: false, x: 500, y: 250 }).cues([[0, 'cam', { x: 800, y: 250, zoom: 2 }], [0, 'boo', 'grow', { dur: 0.5 }], [2, 'boo', 'anchor', { to: 'world', dur: 0.4 }]]);
  const g = st.actorTarget('boo'), A = st.actors.boo, cen = t => { st.render(t); const p = A.pose(t); return centreOf(matOf(g.attrs.transform), [p.x, p.y]); };
  near(cen(1.9)[0], 500, 1e-6); near(cen(2)[0], 500, 1e-6);
  const end = cen(3), m = st.cam.matrix(3, 1); assert.deepEqual(matOf(g.attrs.transform).map(v => +v.toFixed(4)), Array.from(m, v => +v.toFixed(4)));
  near(end[0], 500 + (500 - 800) * 2, 1e-3);   // 자세 위치(화면 중앙 숫자)가 월드 점으로 읽힌다
});
test('actor two-step: scene creates rig on stage.actorTarget; screen anchor ignores camera', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  const g = st.actorTarget('hud'); assert.equal(st.actorTarget('hud'), g);
  const A = M.rig.actor(g, DESIGN, { W: 1000, H: 500, life: false });
  st.actor('hud', A, { anchor: 'screen' }).cues([[0, 'cam', { x: 0, zoom: 3 }], [0.5, 'hud', 'hop', { to: [100, 0] }]]);
  assert.equal(st.actors.hud, A);
  st.render(1); assert.deepEqual(matOf(g.attrs.transform), [1, 0, 0, 1, 0, 0]);
  st.render(5); assert.equal(A.pose(5).x, 100);   // 큐가 배우 동작으로 전달됨
});
test('unknown actor warns once per stage at render; late or reserved actors do not warn', () => {
  const warns = []; const { MH: M, doc } = load({ console: { warn: m => warns.push(m), log() {} } });
  const { st } = mkStage(M, doc), st2 = mkStage(M, doc).st, st3 = mkStage(M, doc).st;
  st.cues([[0, 'ghost', 'blink'], [1, 'ghost', 'hop']]).cues([[2, 'ghost', 'nod']]);
  assert.equal(warns.length, 0);                                   // cues 시점엔 경고 없음 (나중 등록 허용)
  st.render(0); st.render(1); assert.equal(warns.filter(w => w.includes('ghost')).length, 1);
  st2.cues([[0, 'ghost', 'blink']]).render(0); assert.equal(warns.filter(w => w.includes('ghost')).length, 2);   // 무대마다 따로
  st3.cues([[0, 'late', 'hop', { to: [10, 0] }]]); st3.actorTarget('late'); st3.render(0);
  st3.actor('late', DESIGN, { life: false }); st3.render(5);
  assert.equal(warns.filter(w => w.includes('late')).length, 0); assert.equal(st3.actors.late.pose(5).x, 10);
});
test('remap applies to cam, sets and actors', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  const a = doc.createElement('div');
  const ref = mkStage(M, doc).st, b = doc.createElement('div');
  const cues = [[0, 'cam', { x: 100 }], [0, 'cam', { x: 900 }, { dur: 4, ease: 'linear' }], [1, 'set:a', 'in', { dur: 2 }], [0, 'boo', 'grow', { dur: 4 }]];
  st.set('a', a).actor('boo', DESIGN, { life: false }).cues(cues).remap(M.time.remap([[0, 0], [10, 2]]));
  ref.set('a', b).actor('boo', DESIGN, { life: false }).cues(cues);
  st.render(5); ref.render(1);
  assert.equal(st.world.style.transform, ref.world.style.transform);
  assert.equal(a.style.transform, b.style.transform); assert.equal(a.style.opacity, b.style.opacity);
  assert.equal(st.actorTarget('boo').attrs.transform, ref.actorTarget('boo').attrs.transform);
});
test('render is deterministic for out-of-order t', () => {
  const build = () => {
    const { MH: M, doc } = load(); const { st } = mkStage(M, doc); const a = doc.createElement('div');
    st.set('a', a, { at: [50, 60] }).actor('boo', DESIGN).cues([
      [0, 'cam', { zoom: 2 }], [0, 'cam', { zoom: 1, dur: 3 }], [1, 'set:a', 'in', { from: 'right' }], [4, 'set:a', 'out', { from: 'scale' }],
      [0.5, 'boo', 'enter', { at: [400, 250] }], [2, 'boo', 'grow'], [3.5, 'boo', 'anchor', { to: 'world' }],
    ]);
    const snap = () => [st.world.style.transform, a.style.transform, a.style.opacity, a.style.visibility, st.actorTarget('boo').attrs.transform, JSON.stringify(st.actorTarget('boo').children[0].attrs)];
    return { st, snap };
  };
  const ts = [0, 0.7, 1.2, 2.4, 3, 3.9, 4.2, 5, 9.9];
  const seq = build(), seqOut = ts.map(t => (seq.st.render(t), seq.snap()));
  const rnd = build(), order = [5, 0, 8, 3, 1, 7, 2, 6, 4, 3, 0];
  for (const i of order) { rnd.st.render(ts[i]); assert.deepEqual(rnd.snap(), seqOut[i], `t=${ts[i]}`); }
});
test('beats and beatsFrom', () => {
  const { MH: M, doc } = load(); const { st } = mkStage(M, doc);
  const s = doc.createElement('script'); s.setAttribute('id', 'st1-beats'); s.textContent = '[{"id":"b1","t0":0,"t1":4,"title":"목록","note":""}]';
  assert.equal(st.beatsFrom('#st1-beats'), st);
  assert.deepEqual(Array.from(st.beats(), b => b.id), ['b1']);
  st.beats([{ id: 'b2', t0: 4, t1: 8, title: '', note: '' }]); assert.equal(st.beats()[0].id, 'b2');
  const warns = []; const L = load({ console: { warn: m => warns.push(m), log() {} } }), s2 = mkStage(L.MH, L.doc).st;
  assert.equal(s2.beatsFrom('#nope'), s2); assert.equal(s2.beats().length, 0); assert.equal(warns.length, 1);   // 없어도 렌더는 계속
});
test('long stage warns to split (25 s rule)', () => {
  const warns = []; const { MH: M, doc } = load({ console: { warn: m => warns.push(m), log() {} } });
  mkStage(M, doc, { dur: 30 }); mkStage(M, doc, { dur: 20 });
  assert.equal(warns.length, 1); assert.ok(warns[0].includes('25'));
});

// ── 추가: 스토리보드 칸 ──
test('stageShots: one cell per beat at 60% of the beat', () => {
  const host = { id: 'st1', start: 10, dur: 12, title: '무대', note: '' };
  const s = stageShots(host, [{ id: 'b1', t0: 0, t1: 4, title: '목록', note: '할 일' }, { id: 'b2', t0: 4, t1: 9, title: '', note: '' }], 3);
  assert.deepEqual(s.map(x => x.t), [12.4, 17]);
  assert.deepEqual(s.map(x => x.label), ['#3 st1·b1 목록', '#4 st1·b2']);
  assert.equal(s[0].sub, '할 일'); assert.equal(s[0].id, 'st1');
});
test('stageShots clamps beats to the stage and beatWarnings flags overruns', () => {
  const host = { id: 'st1', start: 10, dur: 12 };
  const beats = [{ id: 'b1', t0: 8, t1: 20, title: '', note: '' }, { id: 'b2', t0: 14, t1: 16, title: '', note: '' }, { id: 'b3', t0: -2, t1: 2, title: '', note: '' }];
  const s = stageShots(host, beats);
  assert.deepEqual(s.map(x => x.beat), ['b3', 'b1', 'b2']);
  assert.deepEqual(s.map(x => x.t), [11.2, 20.4, 21.967]);   // [0,2]→1.2 / [8,12]→10.4 / [12,12] → 끝 직전(1/30초)
  assert.ok(s.every(x => x.t >= 10 && x.t < 22));
  const w = beatWarnings(host, beats);
  assert.equal(w.length, 2); assert.ok(w[0].includes('b1') && w[1].includes('b2') && w[0].includes('12'));
  assert.deepEqual(beatWarnings(host, [{ id: 'b1', t0: 0, t1: 12 }]), []);
});
test('storyboardShots numbers stage beats and plain scenes together', () => {
  const scenes = [
    { id: 's1', start: 0, dur: 4, title: '도입', note: 'n', kind: 'dom' },
    { id: 'st1', start: 4, dur: 10, title: '무대', note: '', kind: 'stage' },
    { id: 'st2', start: 14, dur: 2, title: '빈 무대', note: '', kind: 'stage', key: '1' },
  ];
  const shots = storyboardShots(scenes, h => (h.id === 'st1' ? [{ id: 'b2', t0: 5, t1: 10, title: '', note: '' }, { id: 'b1', t0: 0, t1: 5, title: '첫', note: '' }] : []));
  assert.deepEqual(shots.map(s => s.label.split('   ')[0]), ['#1 도입', '#2 st1·b1 첫', '#3 st1·b2', '#4 빈 무대']);
  assert.deepEqual(shots.map(s => s.t), [2.4, 7, 12, 15]);
});
