import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntime } from '../helpers/runtime.mjs';

const RT = ['harness/runtime/mh.js', 'harness/runtime/mh-fx.js'];
// 최소 DOM 스텁: 요소 트리와 style 만 기록한다
const mk = () => ({ style: {}, children: [], textContent: '', appendChild(c) { this.children.push(c); return c; }, setAttribute() {} });
const makeEl = () => { const doc = { createElement: mk, getElementById: () => null }; const el = mk(); el.ownerDocument = doc; el.clientHeight = 1080; return { doc, el }; };
const { el: _e, doc } = makeEl();
const MH = loadRuntime(RT, { document: doc }).MH;
const nums = a => Array.from(a);

// ── 브리프 테스트 ──
test('remap forward, hold, rewind', () => {
  const f = MH.time.remap([[0, 0], [2, 2], [3, 2], [4, 0.5]]);
  assert.equal(f(1), 1); assert.equal(f(2.5), 2); assert.equal(f(3.5), 1.25); assert.equal(f(9), 0.5);
});
test('vhsLabel picks latest', () => assert.equal(MH.fx.vhsLabel(2.1, [[0, 'II PAUSE'], [2, '<< REWIND']]), '<< REWIND'));
test('glitch deterministic', () => {
  const a = { style: {} }, b = { style: {} };
  MH.fx.glitch(1.37, a, { amount: 1, seed: 3 }); MH.fx.glitch(1.37, b, { amount: 1, seed: 3 });
  assert.deepEqual({ ...a.style }, { ...b.style });
  assert.ok(a.style.transform && a.style.filter && a.style.clipPath);
});
test('fx2d.md size', () => assert.ok(fs.statSync('harness/modules/fx2d.md').size <= 3072));

// ── remap ──
test('remap: 되감기 구간과 범위 밖 끝값', () => {
  const f = MH.time.remap([[2, 2], [0, 0], [4, 0]]);   // 정렬되지 않은 키도 tOut 순으로 정렬
  assert.equal(f(-5), 0); assert.equal(f(1), 1); assert.equal(f(3), 1); assert.equal(f(4), 0); assert.equal(f(99), 0);
});
test('remap: 같은 tOut 은 나중 키가 이긴다(점프)', () => {
  const f = MH.time.remap([[0, 0], [1, 1], [1, 5], [2, 6]]);
  assert.equal(f(0.5), 0.5); assert.equal(f(1), 5); assert.equal(f(1.5), 5.5);
});
test('remap: 키 검증은 한국어 오류', () => {
  assert.throws(() => MH.time.remap([[0, 0]]), /time\.remap.*2개 이상/);
  assert.throws(() => MH.time.remap(null), /time\.remap/);
  assert.throws(() => MH.time.remap([[0, 0], [1, NaN]]), /time\.remap.*키 #1.*숫자/);
  assert.throws(() => MH.time.remap([[0, 0], [Infinity, 1]]), /키 #1/);
  assert.throws(() => MH.time.remap([[0, 0], 'x']), /키 #1/);
  assert.throws(() => MH.time.remap([[0, 0], ['1', 1]]), /키 #1/);
});

// ── vhsLabel ──
test('vhsLabel: 첫 키 앞은 빈 문자열, 정렬 안 된 키·같은 t 는 나중이 이긴다', () => {
  const k = [[2, '<< REWIND'], [0, 'II PAUSE'], [2, 'PLAY ▶']];
  assert.equal(MH.fx.vhsLabel(-1, k), ''); assert.equal(MH.fx.vhsLabel(1, k), 'II PAUSE'); assert.equal(MH.fx.vhsLabel(2, k), 'PLAY ▶');
  assert.equal(MH.fx.vhsLabel(5, []), '');
});

// ── vhs ──
const build = (opts, size) => { const { doc, el } = makeEl(); if (size) Object.assign(el, size); const W = loadRuntime(RT, { document: doc }); const v = W.MH.fx.vhs(el, opts); return { el, v, root: el.children[0] }; };
const parts = root => { const [scan, band, label, tc] = root.children; return { scan, band, label, tc }; };

test('vhs: 오버레이는 한 번만 만들어지고 render 는 만들지 않는다', () => {
  const { el, v, root } = build({ label: 'PLAY ▶' });
  assert.equal(el.children.length, 1);
  assert.equal(root.style.position, 'absolute'); assert.equal(root.style.pointerEvents, 'none');
  assert.ok(+root.style.zIndex >= 100);
  const { scan, label } = parts(root);
  assert.match(scan.style.background, /repeating-linear-gradient/);
  assert.match(label.style.textShadow, /rgba\(255,\s*0,\s*0/);
  const n = root.children.length;
  for (const t of [0, 0.4, 1, 2.2]) v.render(t);
  assert.equal(el.children.length, 1); assert.equal(root.children.length, n);
  assert.equal(label.textContent, 'PLAY ▶');
});
test('vhs: [t0, t1] 밖에서는 display:none', () => {
  const { v, root } = build({ t0: 1, t1: 3 });
  v.render(0.5); assert.equal(root.style.display, 'none');
  v.render(1); assert.equal(root.style.display, '');
  v.render(3); assert.equal(root.style.display, '');
  v.render(3.01); assert.equal(root.style.display, 'none');
});
test('vhs: 트래킹 띠 y 는 1/12 초 단계 안에서 같고 단계마다 달라진다', () => {
  const { v, root } = build({ seed: 5 });
  const { band } = parts(root);
  const y = t => { v.render(t); return band.style.top; };
  assert.equal(y(1.0), y(1.0 + 1 / 12 - 0.001)); assert.equal(y(2.5), y(2.5 + 0.05));
  const set = new Set(); for (let s = 0; s < 24; s++) set.add(y(s / 12 + 0.01));
  assert.ok(set.size >= 20, `단계마다 달라야 함: ${set.size}`);
  for (const s of set) { const p = parseFloat(s); assert.ok(p >= 6 && p <= 90, s); }   // 위 가장자리에서 떨어짐(화면 끝 경계와 섞이지 않게)
  assert.match(band.style.height, /^10%$/);
});
test('vhs: 트래킹 띠 = 밝은 윗줄 + 어두운 몸통(어떤 바탕에서도 화면 폭 경계) + 줄무늬 조각들이 단계마다 서로 다르게 가로로 어긋남 (fx.vhs 감지와 맞춤)', () => {
  const { v, root } = build({ seed: 3 }, { clientWidth: 1920, clientHeight: 1080 });
  const { band } = parts(root);
  assert.match(band.style.background, /linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255/);
  assert.match(band.style.background, /rgba\(0,\s*0,\s*0,\s*\.5/);
  assert.match(band.id, /^mh-vhs-/);   // make.mjs 가 이 띠가 덮은 글자(text_occluded)를 의도된 가림으로 본다
  const strips = [...band.children]; assert.ok(strips.length >= 3, `${strips.length}`);
  for (const st of strips) assert.match(st.style.background, /repeating-linear-gradient\(90deg/);
  const n = root.children.length;
  const offs = t => { v.render(t); return strips.map(st => parseFloat(/translateX\((-?[\d.]+)px\)/.exec(st.style.transform)[1])); };
  const a = offs(1.01), b = offs(1.01 + 1 / 12);
  assert.ok(new Set(a).size >= 3 && JSON.stringify(a) !== JSON.stringify(b), JSON.stringify([a, b]));
  assert.deepEqual(offs(1.01), offs(1.04));                       // 같은 단계 안에서는 고정
  for (let k = 0; k < 120; k++) { const o = offs(k / 12 + 0.01); for (let j = 1; j < o.length; j++) assert.ok(Math.abs(o[j] - o[j - 1]) >= 2 * 1920 / 160 - 1e-6, `단계 ${k}: 이웃 조각 어긋남 ${JSON.stringify(o)}`); }
  for (const o of [...a, ...b]) assert.ok(Math.abs(o) <= 1920 / 160 * 6 + 1e-9, `${o}`);   // 분석 160폭 기준 ±6px 안
  assert.equal(root.children.length, n); assert.equal(band.children.length, strips.length);
});
test('vhs: 같은 seed 면 같은 y, 다른 seed 면 다른 y', () => {
  const a = build({ seed: 1 }), b = build({ seed: 1 }), c = build({ seed: 2 });
  for (const x of [a, b, c]) x.v.render(1.7);
  assert.equal(parts(a.root).band.style.top, parts(b.root).band.style.top);
  assert.notEqual(parts(a.root).band.style.top, parts(c.root).band.style.top);
});
test('vhs: labels 는 vhsLabel 로 바뀐다', () => {
  const { v, root } = build({ labels: [[0, 'II PAUSE'], [2, '<< REWIND'], [4, 'PLAY ▶']] });
  const { label } = parts(root);
  v.render(1); assert.equal(label.textContent, 'II PAUSE');
  v.render(2.5); assert.equal(label.textContent, '<< REWIND');
  v.render(9); assert.equal(label.textContent, 'PLAY ▶');
});
test('vhs: 타임코드 — true 는 HH:MM:SS, 문자열은 그대로, false 는 숨김', () => {
  const a = build({ t0: -10 }), tcA = parts(a.root).tc;
  a.v.render(0); assert.equal(tcA.textContent, '00:00:00');
  a.v.render(75.9); assert.equal(tcA.textContent, '00:01:15');
  a.v.render(3725); assert.equal(tcA.textContent, '01:02:05');
  a.v.render(-3); assert.equal(tcA.textContent, '00:00:00');
  const b = build({ timecode: 'FRI 17:59' }), tcB = parts(b.root).tc;
  b.v.render(0); assert.equal(tcB.textContent, 'FRI 17:59'); b.v.render(40); assert.equal(tcB.textContent, 'FRI 17:59');
  const c = build({ timecode: false }), tcC = parts(c.root).tc;
  c.v.render(5); assert.equal(tcC.style.display, 'none'); assert.equal(tcC.textContent, '');
});
test('vhs: 요소가 없으면 한국어 오류', () => assert.throws(() => MH.fx.vhs(null), /fx\.vhs.*요소/));

// ── glitch ──
test('glitch: 1/24 초 단계 안에서는 같고 단계가 바뀌면 달라진다', () => {
  const g = t => { const e = { style: {} }; MH.fx.glitch(t, e, { seed: 2 }); return JSON.stringify(e.style); };
  assert.equal(g(1.0), g(1.0 + 1 / 24 - 0.001));
  const set = new Set(); for (let s = 0; s < 24; s++) set.add(g(s / 24 + 0.001));
  assert.ok(set.size >= 20, `${set.size}`);
});
test('glitch: 이동 ≤ 8·amount px, RGB 분리 ±2·amount px, 띠 2~4개', () => {
  for (const amount of [0.5, 1, 2]) for (let s = 0; s < 60; s++) {
    const e = { style: {} }; MH.fx.glitch(s / 24 + 0.001, e, { amount, seed: 7 });
    const tx = parseFloat(/translateX\((-?[\d.]+)px\)/.exec(e.style.transform)[1]);
    assert.ok(Math.abs(tx) <= 8 * amount + 1e-9, `${tx}`);
    const sh = [...e.style.filter.matchAll(/drop-shadow\((-?[\d.]+)px 0 rgba\((\d+),(\d+),(\d+),\.7\)\)/g)];
    assert.equal(sh.length, 2);
    assert.ok(Math.abs(+sh[0][1]) === 2 * amount && +sh[0][1] === -sh[1][1]);
    assert.deepEqual(nums(sh[0].slice(2, 5)), ['255', '0', '0']); assert.deepEqual(nums(sh[1].slice(2, 5)), ['0', '255', '255']);
    const pts = e.style.clipPath.match(/-?[\d.]+%/g);
    assert.match(e.style.clipPath, /^polygon\(/);
    const slits = (pts.length - 8) / 8;      // 시작 두 점 + 끝 두 점(좌표 8개) 외에 띠마다 4점(좌표 8개)
    assert.ok(Number.isInteger(slits) && slits >= 2 && slits <= 4, `bands ${slits}`);
  }
});
test('glitch: amount 0 은 transform·filter·clipPath 를 지운다', () => {
  const e = { style: {} };
  MH.fx.glitch(1, e, { amount: 1 }); assert.ok(e.style.transform);
  MH.fx.glitch(1, e, { amount: 0 });
  assert.equal(e.style.transform, ''); assert.equal(e.style.filter, ''); assert.equal(e.style.clipPath, '');
});

// ── 리뷰 1차 ──
test('vhs: 글자 그림자에 어두운 층이 있고 color 옵션이 적용된다', () => {
  const a = build({}), { label, tc } = parts(a.root);
  assert.equal(label.style.color, '#fff');
  for (const e of [label, tc]) { assert.match(e.style.textShadow, /0 0 6px rgba\(0,0,0,\.85\)/); assert.match(e.style.textShadow, /rgba\(255,0,0/); }
  const b = build({ color: '#111' }), p = parts(b.root);
  assert.equal(p.label.style.color, '#111'); assert.equal(p.tc.style.color, '#111');
});
test('vhs: 글자 크기는 짧은 변 기준 (세로 1080x1920 도 1080 변)', () => {
  const land = parts(build({}, { clientWidth: 1920, clientHeight: 1080 }).root).label.style;
  const port = parts(build({}, { clientWidth: 1080, clientHeight: 1920 }).root).label.style;
  assert.equal(land.fontSize, '49px'); assert.equal(port.fontSize, land.fontSize); assert.equal(port.top, land.top);
});
test('vhs: 크기가 없는 el 은 MH.screenSize() 로 대신한다 (#root 1080x1920)', () => {
  const { doc, el } = makeEl(); el.clientWidth = 0; el.clientHeight = 0;
  const root = { getAttribute: k => ({ 'data-width': '1080', 'data-height': '1920' })[k] };
  doc.getElementById = id => (id === 'root' ? root : null);
  const W = loadRuntime(RT, { document: doc }); W.MH.fx.vhs(el, {});
  assert.equal(el.children[0].children[2].style.fontSize, '49px');
});
test('vhs: 트래킹 띠는 화면 폭 전체, 줄무늬 조각은 최대 어긋남(6u)보다 넓게(8u) 양쪽으로 넘쳐 가장자리 틈이 없다', () => {
  const { band } = parts(build({}, { clientWidth: 1600 }).root);
  assert.equal(band.style.left, '0'); assert.equal(band.style.right, '0');
  for (const st of band.children) { assert.equal(st.style.left, '-80px'); assert.equal(st.style.right, '-80px'); }   // u = 1600/160 = 10px
});

test('vhs: color 를 안 주면 라벨·타임코드에 어두운 판(밝은 바탕에서도 대비 통과), color 를 주면 판 없음', () => {
  const a = parts(build({ label: 'PLAY' }).root), b = parts(build({ label: 'PLAY', color: '#1d1d1f' }).root);
  for (const e of [a.label, a.tc]) { assert.match(e.style.background, /rgba\(0,\s*0,\s*0,\s*\.55\)/); assert.match(e.style.padding, /px/); assert.ok(parseFloat(e.style.borderRadius) > 0); assert.equal(e.style.color, '#fff'); }
  for (const e of [b.label, b.tc]) { assert.ok(!e.style.background, e.style.background); assert.equal(e.style.color, '#1d1d1f'); }
});
test('vhs: id 없는 상자 여러 개 → 띠 id 가 겹치지 않는다 (mh-vhs-root-1, -2 …)', () => {
  const { doc } = makeEl(), W = loadRuntime(RT, { document: doc }), ids = [];
  for (let k = 0; k < 3; k++) { const el = mk(); el.ownerDocument = doc; el.clientHeight = 1080; W.MH.fx.vhs(el, {}); ids.push(el.children[0].children[1].id); }
  assert.equal(new Set(ids).size, 3, JSON.stringify(ids)); assert.ok(ids.every(i => /^mh-vhs-root-\d+$/.test(i)), JSON.stringify(ids));
});
