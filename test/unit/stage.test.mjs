import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadRuntime } from '../helpers/runtime.mjs';
import { readBeats } from '../../harness/tools/lib/plan.mjs';
import { stageShots, storyboardShots } from '../../harness/tools/lib/board-shots.mjs';

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
test('depth sets get their own cam layer, ordered by depth below the actors', () => {
  const { MH: M, doc } = load(); const { root, st } = mkStage(M, doc);
  const far = doc.createElement('div'), near1 = doc.createElement('div'), mid = doc.createElement('div'), far2 = doc.createElement('div');
  st.set('far', far, { at: [0, 0], depth: 0.4 }).set('fg', near1, { at: [0, 0], depth: 1.5 }).set('mid', mid, { at: [10, 20] }).set('far2', far2, { depth: 0.4 });
  assert.equal(mid.parentNode, st.world); assert.equal(far.parentNode, far2.parentNode);
  const depths = root.children.slice(0, -1).map(el => st.cam.layers.find(l => l.el === el).depth);
  assert.deepEqual(depths, [0.4, 1, 1.5]); assert.equal(root.children.at(-1).attrs.class, 'mh-actors');
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
test('actor wrapper: anchor 0 = cam matrix, 1 = identity, midway = element-wise lerp', () => {
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
  const a = A.pose(1.5).anchor, m = st.cam.matrix(1.5, 1), I = [1, 0, 0, 1, 0, 0];
  assert.ok(a > 0.05 && a < 0.95, String(a));
  matOf(g.attrs.transform).forEach((v, i) => near(v, m[i] + (I[i] - m[i]) * a));
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
test('unknown actor in cues warns once', () => {
  const warns = []; const { MH: M, doc } = load({ console: { warn: m => warns.push(m), log() {} } }); const { st } = mkStage(M, doc);
  st.cues([[0, 'ghost', 'blink'], [1, 'ghost', 'hop']]).cues([[2, 'ghost', 'nod']]);
  assert.equal(warns.filter(w => w.includes('ghost')).length, 1);
  st.render(1);
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
