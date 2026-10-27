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
test('GUIDE ≤ 15000 bytes and lists every module doc', () => {
  const g = fs.readFileSync(path.join(ROOT, 'harness/GUIDE.md')); assert.ok(g.length <= 15000, String(g.length));
  for (const m of MODULES) assert.ok(g.includes(`modules/${m}.md`), m);
});
test('GUIDE keeps the v2 flow: evidence, gate, motion-qc, stage, source-check options', () => {
  const g = read('harness/GUIDE.md');
  for (const s of ['evidence.png', 'analyze-ref.mjs strip', 'gate', 'motion-qc', 'qc-motion.png', '효과 표', '이미지 추가 완료', '일부만 넣고 진행', '이미지 없이 진행', 'stage', 'ant', 'squash', 'MH.move', 'MH.follow', 'MH.sim', 'MH.gsapSpring', 'MH.phys']) assert.ok(g.includes(s), s);
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
  for (const f of ['mh-rig', 'mh-cam', 'mh-lens', 'mh-fx', 'mh-morph', 'mh-stage']) assert.ok(r.includes(f), f);
  for (const t of ['gate', 'motion-qc']) assert.ok(r.includes(t), t);
  for (const l of ['flubber MIT', 'opentype.js MIT', 'Pretendard']) assert.ok(r.includes(l), l);
});
test('lens2d doc names both rack spellings', () => {
  assert.match(read('harness/modules/lens2d.md'), /`lens\.rack\(`[^\n]*`\.rack\(`|`\.rack\(`[^\n]*`lens\.rack\(`/);
});
