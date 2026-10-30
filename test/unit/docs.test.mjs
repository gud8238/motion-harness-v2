import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCatalog } from '../../harness/tools/lib/catalog.mjs';
import { parseEffectTable } from '../../harness/tools/lib/plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const desc = f => (read(f).match(/^description:\s*(.*)$/m) || [])[1] || '';
const MODULES = ['rig2d', 'camera2d', 'lens2d', 'fx2d', 'morph', 'transitions', 'stage', 'canvas', 'three'];

test('always-on description budget ≤ 2270 bytes', () => {
  const total = ['mv-new', 'mv-refs', 'mv-plan'].reduce((s, d) => s + Buffer.byteLength(desc(`skills/${d}/SKILL.md`)), 0);
  assert.ok(total <= 2270, String(total));
});
test('mv-setup and mv-make are command-only', () => { for (const d of ['mv-setup', 'mv-make']) assert.match(read(`skills/${d}/SKILL.md`), /disable-model-invocation: true/); });
test('auto skills are not command-only', () => { for (const d of ['mv-new', 'mv-refs', 'mv-plan']) assert.doesNotMatch(read(`skills/${d}/SKILL.md`), /disable-model-invocation/); });
test('v2 marker in auto skills', () => {
  for (const d of ['mv-new', 'mv-refs', 'mv-plan']) {
    const s = desc(`skills/${d}/SKILL.md`);
    assert.match(s, /v2/, d);
    assert.ok(s.includes('motion-harness2(v2)'), d);
    assert.ok(s.includes('v2 프로젝트(brief.md 맨 위 harness: v2)이거나 v2 를 언급할 때'), d);
  }
});
test('GUIDE ≤ 26000 bytes and lists every module doc', () => {
  const g = fs.readFileSync(path.join(ROOT, 'harness/GUIDE.md')); assert.ok(g.length <= 26000, String(g.length));
  for (const m of MODULES) assert.ok(g.includes(`modules/${m}.md`), m);
});
test('v2.2 guide preserves reference evidence, user draft review and secure music workflow', () => {
  const g = read('harness/GUIDE.md');
  for (const marker of ['15fps','ASSETS.md','storyboard','strip','독립 검수','OS 보안 저장소','Lyria 3.5','workflow.mjs check','modules/three.md']) assert.ok(g.includes(marker),marker);
  assert.doesNotMatch(g, /핵심 5개 항목 5점|같은 방식 3회 초과 금지|필수\(최대 5\)/);
});
test('plan/build/make responsibilities do not collapse into one skill', () => {
  const p=read('skills/mv-plan/SKILL.md'), b=read('skills/mv-build/SKILL.md'), m=read('skills/mv-make/SKILL.md');
  assert.ok(p.includes('장면 코드는 만들지 않는다'));
  assert.ok(b.includes('--draft') && b.includes('--strip') && b.includes('사용자 피드백'));
  assert.ok(m.includes('새 서브 에이전트') && m.includes('workflow.mjs check'));
  for(const f of ['README.md','harness/GUIDE.md',...fs.readdirSync(path.join(ROOT,'skills')).map(d=>`skills/${d}/SKILL.md`)]) assert.doesNotMatch(read(f), /바로 만들어/);
});
test('module gate lines are labelled 게이트, lens2d example does not chain .layer( off MH.cam(', () => {
  for (const m of ['camera2d', 'fx2d', 'lens2d', 'morph', 'transitions']) {
    const t = read(`harness/modules/${m}.md`);
    assert.match(t, /^게이트: `/m, m);
    assert.doesNotMatch(t, /^소스 점검:/m, m);
  }
  assert.doesNotMatch(read('harness/modules/lens2d.md'), /MH\.cam\([^)]*\)\.layer\(/);
});
test('user-facing tool strings do not hard-code node harness/tools/analyze-ref.mjs', () => {
  for (const f of ['harness/tools/gate.mjs', 'harness/tools/analyze-ref.mjs']) {
    const code = read(f).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(code, /node harness\/tools\/analyze-ref\.mjs/, f);
  }
});
test('every tier-2 catalog module has a doc', () => { for (const e of loadCatalog().filter(e => e.tier === 2)) assert.ok(fs.existsSync(path.join(ROOT, `harness/modules/${e.module}.md`)), e.id); });
test('module docs stay ≤ 3072 bytes', () => { for (const m of MODULES) { const n = fs.statSync(path.join(ROOT, `harness/modules/${m}.md`)).size; assert.ok(n <= 3072, `${m} ${n}`); } });
test('source check pause options kept', () => { const p = read('skills/mv-plan/SKILL.md'); for (const s of ['이미지 추가 완료', '일부만 넣고 진행', '이미지 없이 진행']) assert.ok(p.includes(s)); });
test('PLAN-example parses', () => {
  const rows = parseEffectTable(read('harness/PLAN-example.md'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.tier), [2, 2, 3]);
  assert.ok(rows[0].evidence.img && rows[1].evidence.img && rows[2].evidence.user);
  const ids = new Set(loadCatalog().map(e => e.id));
  for (const r of rows) assert.ok(ids.has(r.id), r.id);
});
test('gate hint strings use stable strip names (no ev_01)', () => {
  const g = read('harness/tools/gate.mjs');
  assert.doesNotMatch(g, /ev_01/);
  assert.match(g, /ev_trans-fill_6\.67\.png/);
});
test('README lists v2 runtime files, tools and licenses', () => {
  const r = read('README.md');
  for (const f of ['mh-rig.js', 'mh-cam.js', 'mh-lens.js', 'mh-fx.js', 'mh-morph.js', 'mh-stage.js']) assert.ok(r.includes(f), f);
  for (const t of ['gate (3단계 게이트)', 'plan-check (계획 검사·채점표 합격선)', 'motion-qc (모션 검수)']) assert.ok(r.includes(t), t);
  for (const l of ['flubber MIT', 'opentype.js MIT', 'Pretendard SIL OFL']) assert.ok(r.includes(l), l);
  assert.ok(r.includes('| `/motion-harness2:mv-new` | `/motion-harness:mv-new` |'));
  assert.ok(r.includes('**v1 과 나란히 설치할 수 있습니다.**'));
});
test('lens2d doc names both rack spellings', () => {
  assert.match(read('harness/modules/lens2d.md'), /`lens\.rack\(`[^\n]*`\.rack\(`|`\.rack\(`[^\n]*`lens\.rack\(`/);
});
