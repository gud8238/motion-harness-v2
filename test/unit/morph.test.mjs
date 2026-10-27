import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntime, loadUMD } from '../helpers/runtime.mjs';

const RT = ['harness/runtime/mh.js', 'harness/runtime/mh-morph.js'];
const flubber = loadUMD('node_modules/flubber/build/flubber.min.js');
const opentype = loadUMD('node_modules/opentype.js/dist/opentype.min.js');
const OTF = w => fs.readFileSync(`node_modules/pretendard/dist/public/static/${w}`);
const stubFetch = (log = []) => async url => {
  log.push(url);
  const f = OTF(url.split('/').pop()); const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength);
  return { ok: true, status: 200, arrayBuffer: async () => ab };
};
const load = (g = {}) => loadRuntime(RT, { flubber, opentype, ...g }).MH;
const MH = load();

test('shape endpoints', () => {
  const a = MH.morph.circle(50, 50, 20), b = MH.morph.roundRect(20, 20, 60, 60, 10);
  assert.equal(MH.morph.shape(0, a, b, { t0: 1 }), a);
  assert.equal(MH.morph.shape(1, a, b, { t0: 1 }), a);
  assert.equal(MH.morph.shape(5, a, b, { t0: 1 }), b);
  assert.equal(MH.morph.shape(1.6, a, b, { t0: 1 }), b);
  const mid = MH.morph.shape(1.3, a, b, { t0: 1 });
  assert.notEqual(mid, a); assert.notEqual(mid, b);
  assert.equal(MH.morph.shape(1.3, a, b, { t0: 1 }), mid);   // 순수 함수
});

test('path builders are closed single subpaths', () => {
  for (const d of [MH.morph.circle(0, 0, 10), MH.morph.blob(0, 0, 20, 10), MH.morph.blob(0, 0, 20, 10, 0.4), MH.morph.roundRect(0, 0, 40, 20, 8), MH.morph.roundRect(0, 0, 40, 20, 99), MH.morph.roundRect(0, 0, 40, 20, 0)]) {
    assert.match(d, /^M/); assert.match(d, /Z$/); assert.equal((d.match(/M/g) || []).length, 1); assert.ok(!/NaN/.test(d));
  }
  assert.equal((MH.morph.blob(0, 0, 20, 10).match(/C/g) || []).length, 4);
});

test('shape: ease typo throws, known ease and function work, missing flubber throws Korean error', () => {
  const a = MH.morph.circle(50, 50, 20), b = MH.morph.roundRect(20, 20, 60, 60, 10);
  assert.throws(() => MH.morph.shape(0.3, a, b, { ease: 'inOutt' }), /알 수 없는 ease/);
  assert.throws(() => MH.morph.shape(0, a, b, { ease: 'nope' }), /알 수 없는 ease/);
  assert.equal(typeof MH.morph.shape(0.3, a, b, { ease: 'out' }), 'string');
  assert.equal(typeof MH.morph.shape(0.3, a, b, { ease: x => x }), 'string');
  const bare = loadRuntime(RT, {}).MH;
  assert.throws(() => bare.morph.shape(0.3, a, b), /flubber 라이브러리가 없습니다/);
  assert.throws(() => bare.morph.many(0.3, [a], [b]), /flubber/);
});

test('shape: dna ease uses DNA.easeFn', () => {
  const a = MH.morph.circle(50, 50, 20), b = MH.morph.roundRect(20, 20, 60, 60, 10);
  const m = load();
  const plain = m.morph.shape(0.3, a, b, { dur: 1 });
  m.morph.shape(0.3, a, b, { dur: 1 });
  const w = loadRuntime(RT, { flubber }); w.DNA = { easeFn: () => 1 };   // 항상 끝 → b
  assert.equal(w.MH.morph.shape(0.3, a, b, { dur: 1 }), b);
  assert.notEqual(plain, b);
});

test('many: 2→2 and 1→2 and 2→1', () => {
  const m = MH.morph;
  const a2 = [m.circle(30, 50, 10), m.circle(70, 50, 10)], b2 = [m.roundRect(10, 10, 30, 30, 5), m.roundRect(60, 10, 30, 30, 5)];
  assert.deepEqual(Array.from(m.many(0, a2, b2, { t0: 1 })), a2);
  assert.deepEqual(Array.from(m.many(9, a2, b2, { t0: 1 })), b2);
  const mid = m.many(1.3, a2, b2, { t0: 1 });
  assert.equal(mid.length, 2); assert.ok(mid.every(s => /^M/.test(s)));
  const one = [m.circle(50, 50, 30)];
  const split = m.many(1.3, one, b2, { t0: 1 });
  assert.equal(split.length, 2); assert.ok(split.every(s => typeof s === 'string' && /^M/.test(s)));
  assert.equal(m.many(9, one, b2, { t0: 1 }).length, 2);
  const merged = m.many(1.3, a2, one, { t0: 1 });
  assert.equal(merged.length, 2);
  assert.throws(() => m.many(0.5, [a2[0], a2[1], a2[0]], b2), /한쪽이 1개/);
  assert.throws(() => m.many(0.5, [], b2), /1개 이상/);
});

test('text paths from OTF: boon → 4 glyphs, spaces skipped', async () => {
  const log = [], M = load({ fetch: stubFetch(log) });
  const p = await M.morph.text('boon', { size: 200 });
  assert.equal(p.length, 4);
  assert.ok(Array.from(p).every(d => d.startsWith('M') && d.endsWith('Z')));
  assert.equal((await M.morph.text('o o')).length, 2);
  assert.ok(log[0].endsWith('assets/fonts/Pretendard-ExtraBold.otf'));
  const oo = await M.morph.text('oo', { x: 100, y: 300 });
  assert.equal(oo.length, 2);
});

test('text: bold file, font fetched and parsed once, buildReady registered', async () => {
  const log = [], W = loadRuntime(RT, { flubber, opentype, fetch: stubFetch(log) }), M = W.MH;
  let parses = 0; const real = opentype.parse;
  W.opentype = { ...opentype, parse: b => (parses++, real(b)) };
  await Promise.all([M.morph.text('boon'), M.morph.text('oo'), M.morph.text('b', { size: 50 })]);
  await M.morph.text('boon');
  assert.equal(log.length, 1); assert.equal(parses, 1);
  assert.equal(typeof W.__hf.buildReady['morph:font:extrabold'].then, 'function');
  await M.morph.text('oo', { weight: 'bold' });
  assert.equal(log.length, 2); assert.ok(log[1].endsWith('Pretendard-Bold.otf'));
  assert.ok(W.__hf.buildReady['morph:font:bold']);
  await assert.rejects(() => M.morph.text('oo', { weight: 'thin' }), /알 수 없는 weight/);
});

test('text: missing opentype / fetch failure reject with Korean message and retry later', async () => {
  await assert.rejects(() => loadRuntime(RT, { flubber }).MH.morph.text('oo'), /opentype 라이브러리가 없습니다/);
  let ok = false;
  const M = load({ fetch: async u => ok ? stubFetch()(u) : { ok: false, status: 404 } });
  await assert.rejects(() => M.morph.text('oo'), /글꼴을 불러오지 못했습니다/);
  ok = true;
  assert.equal((await M.morph.text('oo')).length, 2);
});

test('eyes → "oo": text glyphs feed shape and many', async () => {
  const M = load({ fetch: stubFetch() });
  const oo = await M.morph.text('oo', { size: 300, x: 400, y: 600 });
  const eyes = [M.morph.circle(500, 400, 40), M.morph.circle(700, 400, 40)];
  const mid = M.morph.many(0.3, eyes, oo, { dur: 0.6 });
  assert.equal(mid.length, 2);
  assert.equal(Array.from(M.morph.many(2, eyes, oo, { dur: 0.6 })).join(), oo.join());
  assert.equal(typeof M.morph.shape(0.3, eyes[0], oo[0], { dur: 0.6 }), 'string');
});

test('config pins and dev dependencies', () => {
  const c = JSON.parse(fs.readFileSync('harness/config.json'));
  assert.equal(c.flubber, '0.4.2'); assert.equal(c['opentype.js'], '1.3.4'); assert.equal(c.pretendard, '1.3.9');
  const d = JSON.parse(fs.readFileSync('package.json')).devDependencies;
  assert.deepEqual({ ...d }, { flubber: '0.4.2', 'opentype.js': '1.3.4', pretendard: '1.3.9' });
});

test('morph.md size and gate strings', () => {
  assert.ok(fs.statSync('harness/modules/morph.md').size <= 3072);
  const md = fs.readFileSync('harness/modules/morph.md', 'utf8');
  assert.ok(md.includes('const morph = MH.morph;'));
  for (const s of ['morph.shape(', 'morph.text(', 'morph.many(', 'buildReady']) assert.ok(md.includes(s), s);
});

test('setup / new / template wire the libs and fonts', () => {
  const setup = fs.readFileSync('harness/tools/setup.mjs', 'utf8'), nw = fs.readFileSync('harness/tools/new.mjs', 'utf8'), idx = fs.readFileSync('harness/template/scene/index.html', 'utf8');
  for (const s of ['flubber', 'opentype.js', 'pretendard', 'Pretendard-Bold.otf', 'Pretendard-ExtraBold.otf']) assert.ok(setup.includes(s), 'setup ' + s);
  for (const s of ['flubber', 'build', 'flubber.min.js', 'opentype.js', 'opentype.min.js', 'mh-morph.js', 'Pretendard-Bold.otf', 'Pretendard-ExtraBold.otf']) assert.ok(nw.includes(s), 'new ' + s);
  const order = ['mh-fx.js', 'flubber.min.js', 'opentype.min.js', 'mh-morph.js'].map(s => idx.indexOf('assets/lib/' + s));
  assert.ok(order.every(i => i > 0)); assert.deepEqual([...order].sort((a, b) => a - b), order);
});
