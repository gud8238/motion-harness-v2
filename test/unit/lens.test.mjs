import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntime } from '../helpers/runtime.mjs';
import { mblurArgs, mblurMixArgs, wantsMotionBlur, rootFps } from '../../harness/tools/lib/render.mjs';

const RT = ['harness/runtime/mh.js', 'harness/runtime/mh-cam.js', 'harness/runtime/mh-lens.js'];
// 최소 DOM 스텁: SVG 요소를 만들고 body 에 붙인다
const makeDoc = () => {
  const mk = tag => ({ tag, attrs: {}, children: [], style: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { this.children.push(c); c.parentNode = this; return c; } });
  const doc = { createElement: mk, createElementNS: (ns, tag) => mk(tag), getElementById: () => null, body: mk('body') };
  return doc;
};
const setup = () => { const document = makeDoc(); const W = loadRuntime(RT, { document }); return { MH: W.MH, document }; };
const { MH } = setup();
const fakeCam = (...depths) => ({ layers: depths.map(depth => ({ el: { style: {} }, depth })) });

// ── 브리프 테스트 ──
test('blurFor', () => {
  assert.equal(MH.lens.blurFor(1, 1, 6), 0);
  assert.equal(MH.lens.blurFor(3, 1, 6), 12);
  assert.equal(MH.lens.blurFor(9, 1, 6), 24);
  assert.equal(MH.lens.blurFor(-9, 1, 6), 24);
});
test('rack interpolates focus', () => {
  const cam = fakeCam(2), el = cam.layers[0].el;
  const lens = MH.lens.dof(cam, { focus: 1, aperture: 6 }).rack([[0, 1], [1, 2]]);
  lens.render(0); assert.equal(el.style.filter, 'blur(6px)');       // 초점 1, 깊이 2
  lens.render(0.5); assert.equal(el.style.filter, 'blur(3px)');     // 선형: 초점 1.5
  lens.render(1); assert.equal(el.style.filter, '');                // 초점 2 → 선명(0.05px 미만은 해제)
  lens.render(5); assert.equal(el.style.filter, '');                // 마지막 키 이후는 그대로 유지
});
test('mblur args', () => { assert.deepEqual(mblurArgs(30), { fps: 120, vf: 'tmix=frames=4,fps=30' }); });
test('lens2d.md size', () => assert.ok(fs.statSync('harness/modules/lens2d.md').size <= 3072));

// ── dof ──
test('dof without rack uses fixed focus on every layer', () => {
  const cam = fakeCam(0.5, 1, 3);
  const lens = MH.lens.dof(cam, { focus: 1, aperture: 6 });
  assert.equal(lens.render(0), lens);                               // 체인 가능
  assert.deepEqual(cam.layers.map(l => l.el.style.filter), ['blur(3px)', '', 'blur(12px)']);
});
test('dof defaults focus 1 aperture 6, caps at 24px', () => {
  const cam = fakeCam(100); MH.lens.dof(cam).render(0);
  assert.equal(cam.layers[0].el.style.filter, 'blur(24px)');
});
test('dof reads cam.layers at render time (layers added later)', () => {
  const cam = fakeCam(); const lens = MH.lens.dof(cam, { focus: 1, aperture: 2 });
  cam.layers.push({ el: { style: {} }, depth: 4 }); lens.render(0);
  assert.equal(cam.layers[0].el.style.filter, 'blur(6px)');
});
test('rack holds before first and after last key, sorts keys, tolerates duplicate t', () => {
  const cam = fakeCam(3), el = cam.layers[0].el;
  const lens = MH.lens.dof(cam, { aperture: 1 }).rack([[2, 3], [1, 1], [1, 2]]);   // 정렬 → [1,1],[1,2],[2,3] → 같은 t 는 나중 키가 이긴다
  lens.render(0); assert.equal(el.style.filter, 'blur(1px)');       // 앞: 첫 키 값(초점 2) 유지 → |3−2|·1
  lens.render(1); assert.equal(el.style.filter, 'blur(1px)');
  lens.render(1.5); assert.equal(el.style.filter, 'blur(0.5px)');
  lens.render(9); assert.equal(el.style.filter, '');
});
test('lens.rack(dof, keys) equals dof.rack(keys)', () => {
  const a = fakeCam(2), b = fakeCam(2), keys = [[0, 1], [1, 2]];
  const la = MH.lens.dof(a); assert.equal(MH.lens.rack(la, keys), la);
  MH.lens.dof(b).rack(keys).render(0.4); la.render(0.4);
  assert.equal(a.layers[0].el.style.filter, b.layers[0].el.style.filter);
});
test('lens2d.md uses the gate spellings', () => {
  const md = fs.readFileSync('harness/modules/lens2d.md', 'utf8');
  for (const s of ['const lens = MH.lens;', 'lens.dof(', 'lens.rack(', 'lens.smear(']) assert.ok(md.includes(s), s);
});
test('dof preserves a layer\'s original inline filter and composes blur after it', () => {
  const cam = fakeCam(3, 1); cam.layers[0].el.style.filter = 'drop-shadow(0 0 4px #000)'; cam.layers[1].el.style.filter = 'contrast(1.2)';
  const lens = MH.lens.dof(cam, { focus: 1, aperture: 2 });
  lens.render(0);
  assert.deepEqual(cam.layers.map(l => l.el.style.filter), ['drop-shadow(0 0 4px #000) blur(4px)', 'contrast(1.2)']);
  lens.render(1); lens.rack([[0, 3]]); lens.render(1);              // 반복 render 가 blur 를 누적하지 않는다
  assert.deepEqual(cam.layers.map(l => l.el.style.filter), ['drop-shadow(0 0 4px #000)', 'contrast(1.2) blur(4px)']);
});
test('rack is deterministic', () => {
  const run = () => { const cam = fakeCam(2.7); const l = MH.lens.dof(cam).rack([[0, 1], [2, 3]]); return [0, 0.3, 1.1, 1.9, 2.5].map(t => (l.render(t), cam.layers[0].el.style.filter)); };
  assert.deepEqual(run(), run());
});

// ── smear ──
test('smear creates one filter per element and scales stdDeviation with speed', () => {
  const { MH, document } = setup(), el = { style: {} };
  MH.lens.smear(el, 500, 0);
  assert.equal(document.body.children.length, 1);
  const svg = document.body.children[0], filter = svg.children[0], fe = filter.children[0];
  assert.equal(svg.attrs.width, '0'); assert.equal(svg.attrs.height, '0');
  assert.equal(fe.tag, 'feGaussianBlur');
  assert.equal(fe.attrs.stdDeviation, '10 0');                       // 500·0.02
  assert.equal(el.style.filter, `url(#${filter.attrs.id})`);
  MH.lens.smear(el, -250, 1000);
  assert.equal(document.body.children.length, 1);                    // 재생성 없음
  assert.equal(fe.attrs.stdDeviation, '5 20');                       // 속도의 절댓값
});
test('smear filter region is enlarged and sRGB so large blur is not clipped', () => {
  const { MH, document } = setup(), el = { style: {} };
  MH.lens.smear(el, 500, 0);
  const f = document.body.children[0].children[0];
  assert.deepEqual([f.attrs.x, f.attrs.y, f.attrs.width, f.attrs.height], ['-50%', '-50%', '200%', '200%']);
  assert.equal(f.attrs['color-interpolation-filters'], 'sRGB');
});
test('smear caps at max and honors k', () => {
  const { MH, document } = setup(), el = { style: {} };
  MH.lens.smear(el, 1e5, 1e5, { k: 0.5, max: 12 });
  assert.equal(document.body.children[0].children[0].children[0].attrs.stdDeviation, '12 12');
});
test('smear clears the filter when both axes are below 0.05 and restores it after', () => {
  const { MH }  = setup(), el = { style: {} };
  MH.lens.smear(el, 800, 0); assert.ok(el.style.filter.startsWith('url(#mh-smear-'));
  MH.lens.smear(el, 1, 1); assert.equal(el.style.filter, '');       // 0.02 < 0.05
  MH.lens.smear(el, 800, 0); assert.ok(el.style.filter.startsWith('url(#mh-smear-'));
});
test('smear gives each element its own filter id', () => {
  const { MH, document } = setup(), a = { style: {} }, b = { style: {} };
  MH.lens.smear(a, 500, 0); MH.lens.smear(b, 500, 0);
  const ids = document.body.children.map(s => s.children[0].attrs.id);
  assert.equal(new Set(ids).size, 2);
});

// ── 모션 블러 렌더 ──
const plan = rows => `# PLAN\n\n## 효과 표\n\n| 효과 | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n${rows}\n`;
test('wantsMotionBlur', () => {
  assert.equal(wantsMotionBlur(plan('| lens.mblur | ② | refA 0–4.5s (ev_01.png) | s1 |')), true);
  assert.equal(wantsMotionBlur(plan('| lens.mblur | ③ | 사용자 지정 | s1 |')), true);
  assert.equal(wantsMotionBlur(plan('| lens.mblur | ① | 기본기 | s1 |')), false);
  assert.equal(wantsMotionBlur(plan('| cam.push | ② | refA 0–4.5s (ev_01.png) | s1 |')), false);
  assert.equal(wantsMotionBlur('# PLAN\n효과 표 없음'), false);
  assert.equal(wantsMotionBlur(''), false);
  assert.equal(wantsMotionBlur(undefined), false);
});
test('mblurMixArgs encodes the box-averaged frames with copied audio', () => {
  const a = mblurMixArgs('in 한글.mp4', 'out.mp4', 24);
  assert.deepEqual(a.slice(0, 4), ['-i', 'in 한글.mp4', '-vf', 'tmix=frames=4,fps=24']);
  assert.ok(a.join(' ').includes('-c:a copy')); assert.equal(a.at(-1), 'out.mp4');
});
test('rootFps reads data-fps from #root, defaults 30', () => {
  assert.equal(rootFps('<div id="root" data-composition-id="main" data-fps="24" data-width="1920">'), 24);
  assert.equal(rootFps('<div data-fps="60" id="root">'), 60);
  assert.equal(rootFps('<div id="root" data-width="1920">'), 30);
  assert.equal(rootFps('<div id="root" data-fps="0">'), 30);
  assert.equal(rootFps('<div data-fps="12">'), 30);
  assert.equal(rootFps('<div data-id="root" data-fps="12">'), 30);   // data-id 는 #root 가 아니다
  assert.equal(rootFps('<div data-id="x" id="root" data-fps="24">'), 24);               // #root 가 아니면 무시
});

// ── 연결 ──
test('index.html loads mh-lens after mh-cam; new.mjs copies it', () => {
  const idx = fs.readFileSync('harness/template/scene/index.html', 'utf8');
  assert.ok(idx.indexOf('assets/lib/mh-lens.js') > idx.indexOf('assets/lib/mh-cam.js'));
  assert.ok(fs.readFileSync('harness/tools/new.mjs', 'utf8').includes("'mh-lens.js'"));
});
