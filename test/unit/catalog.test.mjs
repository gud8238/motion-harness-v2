import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, findApiCalls } from '../../harness/tools/lib/catalog.mjs';

test('catalog has every spec 5.2 id with valid tier', () => {
  const ids = loadCatalog().map(e => e.id);
  for (const id of ['cam.pan','cam.push','cam.rotate','cam.shake','cam.parallax','cam.onetake','lens.dof','lens.rack','lens.smear','lens.mblur','fx.vhs','fx.glitch','time.remap','morph.shape','morph.text','trans.fill','trans.zoomThrough','trans.whip','trans.match','trans.shared','move','follow','spring','phys','rig.actor'])
    assert.ok(ids.includes(id), id);
  for (const e of loadCatalog()) { assert.ok([1,2].includes(e.tier)); assert.ok(Array.isArray(e.ko)); }
});
test('catalog entries are well formed: unique ids, module names, detectors, ko', () => {
  const cat = loadCatalog();
  assert.equal(new Set(cat.map(e => e.id)).size, cat.length);
  const modules = ['camera2d', 'stage', 'lens2d', 'fx2d', 'morph', 'transitions'];
  const detectors = ['globalMotion', 'residualDepth', 'sharpnessMap', 'sharpnessShift', 'directionalBlur', 'compositeFill', 'scaleSpike', 'blurSpike', 'blobAcrossCut', 'blobContour', 'rowJitter'];
  const kos = [];
  for (const e of cat) {
    assert.equal(typeof e.desc, 'string'); assert.ok(e.desc.length > 0, e.id);
    assert.ok(Array.isArray(e.api)); assert.ok(e.api.every(a => typeof a === 'string' && a.length), e.id);
    if (e.tier === 2) { assert.ok(modules.includes(e.module), e.id); assert.ok(e.ko.length >= 1, e.id); }
    else assert.equal(e.api.length, 0, e.id);
    assert.ok(e.detect === null || detectors.includes(e.detect), e.id);
    kos.push(...e.ko);
  }
  assert.equal(new Set(kos).size, kos.length, 'ko expressions must be unique');
  assert.equal(cat.find(e => e.id === 'rig.actor').module, 'rig2d');
  assert.equal(cat.find(e => e.id === 'move').module, null);
  assert.equal(cat.find(e => e.id === 'time.remap').detect, null);
  assert.deepEqual(cat.find(e => e.id === 'lens.mblur').api, []);
});
test('findApiCalls finds lines and shared ids, ignores comments', () => {
  const code = 'a\n  const cam = MH.cam(world, {W, H});\n// trans.fill(t)\n  trans.fill(t, el, {t0: 4})';
  const r = findApiCalls(code, loadCatalog());
  assert.deepEqual(r.map(x => x.line), [2, 4]);
  assert.deepEqual(r[0].ids.sort(), ['cam.pan','cam.parallax','cam.push','cam.rotate','cam.shake','lens.dof','lens.rack']);   // R19
  assert.equal(r[0].api, 'MH.cam(');
  assert.deepEqual(r[1].ids, ['trans.fill']);
});
test('tier 1 api never reported', () => {
  assert.deepEqual(findApiCalls('MH.move(t,0,0,1)', loadCatalog()), []);
});
test('R1: cam.layer/cam.shake detected, v1 MH.layer(W,H) and bare .shake( are not', () => {
  const cat = loadCatalog();
  assert.deepEqual(findApiCalls('const L = MH.layer(W, H);', cat), []);
  assert.deepEqual(findApiCalls('el.shake(3)', cat), []);
  assert.deepEqual(findApiCalls('cam.layer(el, 0.5)', cat).map(x => x.ids), [['cam.parallax']]);
  assert.deepEqual(findApiCalls('st.cam.shake(t, 2)', cat).map(x => x.ids), [['cam.shake']]);
});
test('shared stage api reports both ids', () => {
  const r = findApiCalls('const st = MH.stage2d(root, {W, H})', loadCatalog());
  assert.deepEqual(r[0].ids.sort(), ['cam.onetake', 'trans.shared']);
});
test('multiple hits on one line and multiple apis are all reported in order', () => {
  const r = findApiCalls('fx.vhs(t); fx.glitch(t); fx.vhs(t)', loadCatalog());
  assert.deepEqual(r.map(x => [x.api, x.line]), [['fx.vhs(', 1], ['fx.glitch(', 1], ['fx.vhs(', 1]]);
});
test('comment stripping: block, html and line comments are ignored, line numbers preserved', () => {
  const code = ['/* fx.vhs(t)', 'still comment trans.whip( */', '<!-- lens.dof(', 'lens.rack( -->', 'x // time.remap(t)', 'time.remap(t)'].join('\n');
  const r = findApiCalls(code, loadCatalog());
  assert.deepEqual(r.map(x => [x.api, x.line]), [['time.remap(', 6]]);
});
test('a URL does not hide a call on a later line', () => {
  const code = '<img src="https://example.com/a.png">\n<a href=http://x.y/z>q</a>\nconst u = "http://a.b"; // c\ntrans.match(t)';
  const r = findApiCalls(code, loadCatalog());
  assert.deepEqual(r.map(x => [x.api, x.line]), [['trans.match(', 4]]);
});
test('call on the same line after a URL string is still found', () => {
  const r = findApiCalls('const u = "https://a.b/c"; morph.shape(t)', loadCatalog());
  assert.deepEqual(r.map(x => x.api), ['morph.shape(']);
});
test('CRLF input keeps line numbers', () => {
  assert.deepEqual(findApiCalls('a\r\n// x\r\ntrans.whip(t)', loadCatalog()).map(x => x.line), [3]);
});
test('astral characters (emoji) before a comment do not shift stripping', () => {
  const r = findApiCalls('<p>🎬🎬</p> /* fx.vhs(t) */\nfx.glitch(t)', loadCatalog());
  assert.deepEqual(r.map(x => [x.api, x.line]), [['fx.glitch(', 2]]);
});
