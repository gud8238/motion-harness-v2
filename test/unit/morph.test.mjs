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
  for (const s of ['morph.shape(', 'morph.text(', 'morph.many(', 'morph.split(', 'buildReady']) assert.ok(md.includes(s), s);
});

test('setup / new / template wire the libs and fonts', () => {
  const setup = fs.readFileSync('harness/tools/setup.mjs', 'utf8'), nw = fs.readFileSync('harness/tools/new.mjs', 'utf8'), idx = fs.readFileSync('harness/template/scene/index.html', 'utf8');
  for (const s of ['flubber', 'opentype.js', 'pretendard', 'Pretendard-Bold.otf', 'Pretendard-ExtraBold.otf']) assert.ok(setup.includes(s), 'setup ' + s);
  for (const s of ['flubber', 'build', 'flubber.min.js', 'opentype.js', 'opentype.min.js', 'mh-morph.js', 'Pretendard-Bold.otf', 'Pretendard-ExtraBold.otf']) assert.ok(nw.includes(s), 'new ' + s);
  const order = ['mh-fx.js', 'flubber.min.js', 'opentype.min.js', 'mh-morph.js'].map(s => idx.indexOf('assets/lib/' + s));
  assert.ok(order.every(i => i > 0)); assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('split: real "o" glyph gives 1 outer + 1 hole, each a single subpath; circle has no holes', async () => {
  const M = load({ fetch: stubFetch() });
  const [o] = await M.morph.text('o', { size: 300 });
  assert.equal((o.match(/M/g) || []).length, 2);
  const sp = M.morph.split(o);
  assert.equal((sp.outer.match(/M/g) || []).length, 1);
  assert.equal(sp.holes.length, 1);
  assert.equal((sp.holes[0].match(/M/g) || []).length, 1);
  assert.ok(sp.outer.startsWith('M') && sp.holes[0].startsWith('M'));
  const c = M.morph.split(M.morph.circle(5, 5, 3));
  assert.equal(c.outer, M.morph.circle(5, 5, 3)); assert.equal(c.holes.length, 0);
  // 바깥 윤곽만 모핑하면 중간 프레임도 부분경로 1개
  assert.equal((M.morph.shape(0.3, M.morph.circle(50, 50, 20), sp.outer, { dur: 0.6 }).match(/M/gi) || []).length, 1);
});

test('overshoot eases are clipped to 0..1 and end exactly on b', () => {
  const a = MH.morph.circle(50, 50, 20), b = MH.morph.roundRect(20, 20, 60, 60, 10);
  for (let t = 0; t <= 1.0001; t += 0.05) assert.ok(!/NaN|Infinity/.test(MH.morph.shape(t, a, b, { ease: 'back', dur: 1 })));
  assert.equal(MH.morph.shape(1, a, b, { ease: 'back', dur: 1 }), b);
});

test('many 1→N before t0 returns N fragments of a, not a', () => {
  const one = [MH.morph.circle(50, 50, 30)], two = [MH.morph.circle(30, 50, 10), MH.morph.circle(70, 50, 10)];
  const r = Array.from(MH.morph.many(0, one, two, { t0: 1 }));
  assert.equal(r.length, 2); assert.ok(!r.includes(one[0]));
});

test('MH.easeOf / MH.checkEase are shared helpers', () => {
  assert.equal(MH.checkEase('inOut'), 'inOut'); assert.equal(MH.checkEase(undefined), undefined);
  assert.throws(() => MH.checkEase('inOutt'), /알 수 없는 ease/);
  assert.equal(MH.easeOf('inOut'), MH.E.inOut); assert.equal(MH.easeOf(null), MH.E.inOut);
  const f = x => x; assert.equal(MH.easeOf(f), f);
  const w = loadRuntime(['harness/runtime/mh.js']); w.DNA = { easeFn: f };
  assert.equal(w.MH.easeOf('dna'), f);
  for (const file of ['mh-cam.js', 'mh-morph.js']) assert.ok(!/const EASES/.test(fs.readFileSync('harness/runtime/' + file, 'utf8')), file);
});

test('catalog: morph.shape api includes morph.many( (R14) and the glyph loader morph.text( (17c)', () => {
  const e = JSON.parse(fs.readFileSync('harness/catalog.json', 'utf8')).find(x => x.id === 'morph.shape');
  assert.deepEqual(e.api, ['morph.shape(', 'morph.many(', 'morph.text(']);
});

// 엄격한 파서: 명령 문자와 공백으로만 자르고, 숫자 토큰은 정확히 -?\d+(\.\d+)? 이어야 한다
const strict = (d, glued = false) => {   // glued: 원본(opentype 출력)은 '-' 를 구분자로 붙여 쓰므로 '-' 앞에서도 자른다(SVG 표준)
  const tk = (glued ? d.replace(/-/g, ' -') : d).replace(/([A-Za-z])/g, ' $1 ').trim().split(/\s+/), cmds = [], nums = [];
  for (const q of tk) { if (/^[A-Za-z]$/.test(q)) cmds.push(q); else { assert.match(q, /^-?\d+(\.\d+)?$/, `bad number token ${q} in ${d}`); nums.push(+q); } }
  return { cmds: cmds.join(''), nums };
};
const bbox = (d, glued) => { const { nums: v } = strict(d, glued); const xs = v.filter((_, i) => i % 2 === 0), ys = v.filter((_, i) => i % 2 === 1); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, n: v.length }; };

test('split(d, s): synthetic glued-minus path re-parses to exactly the scaled numbers', () => {
  const r = MH.morph.split('M-1 -2L10 -2L10 10L-1 10Z M2 5C4 6 8-1 3 9Z', 0.5).holes[0];
  const p = strict(r);
  assert.equal(p.cmds, 'MCZ');
  // bbox x 2..8, y -1..9 → centre (5, 4); 각 점 = c + (v - c)/2
  assert.deepEqual(p.nums, [3.5, 4.5, 4.5, 5, 6.5, 1.5, 4, 6.5]);
  assert.equal(MH.morph.split('M-1 -2L10 -2L10 10L-1 10Z M2 5C4 6 8-1 3 9Z', 1).holes[0], 'M2 5C4 6 8-1 3 9Z');
});

test('split(d, s): holes scale about their bbox centre; s=1 is the original string', async () => {
  const M = load({ fetch: stubFetch() });
  const [o] = await M.morph.text('o', { size: 300, x: 40, y: 400 });
  const h1 = M.morph.split(o).holes, base = bbox(h1[0], true);
  assert.ok(base.w > 20 && base.h > 20);
  assert.deepEqual(Array.from(M.morph.split(o, 1).holes), Array.from(h1));
  assert.equal(M.morph.split(o, 0.5).outer, M.morph.split(o).outer);
  const z = bbox(M.morph.split(o, 0).holes[0]);
  assert.ok(z.w < 0.05 && z.h < 0.05, JSON.stringify(z));
  const half = bbox(M.morph.split(o, 0.5).holes[0]);
  assert.ok(Math.abs(half.w - base.w / 2) < 0.2 && Math.abs(half.h - base.h / 2) < 0.2, JSON.stringify([half, base]));
  assert.ok(Math.abs(half.cx - base.cx) < 0.2 && Math.abs(half.cy - base.cy) < 0.2);
  assert.equal((M.morph.split(o, 0.5).holes[0].match(/M/g) || []).length, 1);
});

test('split(d, s): glyph hole straddling the origin keeps command sequence and number count', async () => {
  const M = load({ fetch: stubFetch() });
  const [o] = await M.morph.text('o', { size: 300, x: 0, y: 100 });
  const h = M.morph.split(o).holes[0], b = bbox(h, true), p1 = strict(h, true);
  assert.ok(/\d-\d/.test(h), 'original glues minus signs');
  assert.ok(b.cy - b.h / 2 < 0 && b.cy + b.h / 2 > 0, 'hole straddles y=0: ' + JSON.stringify(b));
  for (const s of [0, 0.5, 0.25]) {
    const r = strict(M.morph.split(o, s).holes[0]);
    assert.equal(r.cmds, p1.cmds); assert.equal(r.nums.length, p1.nums.length);
    const bb = bbox(M.morph.split(o, s).holes[0]);
    assert.ok(Math.abs(bb.w - b.w * s) < 0.2 && Math.abs(bb.h - b.h * s) < 0.2 && Math.abs(bb.cx - b.cx) < 0.2 && Math.abs(bb.cy - b.cy) < 0.2, s + JSON.stringify([bb, b]));
  }
});

// I6: 한글은 글자당 바깥 조각이 여러 개다. 첫 부분경로만 바깥으로 보면 나머지 조각이 '구멍'으로 그려진다.
test('split: multi-part Hangul glyph 한 → several outers + the ㅎ hole, classified by containment', async () => {
  const M = load({ fetch: stubFetch() });
  const [g] = await M.morph.text('한', { size: 400, x: 100, y: 500 });
  const subs = (g.match(/M/g) || []).length, sp = M.morph.split(g);
  assert.ok(sp.outers.length >= 3, `outers ${sp.outers.length} of ${subs}`);
  assert.ok(sp.holes.length >= 1 && sp.holes.length < sp.outers.length, JSON.stringify([sp.outers.length, sp.holes.length]));
  assert.equal(sp.outers.length + sp.holes.length, subs);
  assert.equal(sp.outer, Array.from(sp.outers).join(' '));
  for (const o of sp.outers) assert.equal((o.match(/M/g) || []).length, 1);
  const boxes = Array.from(sp.outers).map(o => bbox(o, true));
  for (const h of sp.holes) {                                                  // 구멍마다 그것을 감싸는 바깥 조각이 있다
    const b = bbox(h, true);
    assert.ok(boxes.some(o => Math.abs(b.cx - o.cx) < o.w / 2 && Math.abs(b.cy - o.cy) < o.h / 2 && b.w < o.w && b.h < o.h), JSON.stringify(b));
  }
  const hs = M.morph.split(g, 0.5).holes, hb = bbox(hs[0], false), h1 = bbox(sp.holes[0], true);
  assert.ok(Math.abs(hb.w - h1.w / 2) < 0.2, 'hole scaling still works');
  const ds = Array.from(M.morph.many(0.3, [M.morph.circle(300, 300, 60)], sp.outers, { dur: 0.6 }));   // 1→N 모핑
  assert.equal(ds.length, sp.outers.length); assert.ok(ds.every(d => !/NaN/.test(d)));
});
test('split: nested rings alternate outer/hole/outer; a lone shape has one outer', () => {
  const sq = (a, b) => `M${a} ${a}L${b} ${a}L${b} ${b}L${a} ${b}Z`;
  const r = MH.morph.split([sq(0, 100), sq(10, 90), sq(20, 80), sq(200, 300)].join(' '));
  assert.deepEqual(Array.from(r.outers), [sq(0, 100), sq(20, 80), sq(200, 300)]);
  assert.deepEqual(Array.from(r.holes), [sq(10, 90)]);
  assert.deepEqual(Array.from(MH.morph.split(MH.morph.roundRect(0, 0, 50, 40, 8)).outers), [MH.morph.roundRect(0, 0, 50, 40, 8)]);
});
