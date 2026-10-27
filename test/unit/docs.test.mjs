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
  for (const s of [
    '상시 비용은 스킬 소개문뿐', '작업 중 문서는 필요한 것만', '품질에 필요한 코드는 런타임에 아낌없이', '저해상도 미리보기', '움직임 strip `motion_N.png`',
    '2.2 **근거표 확정**', '`→ 근거 칸:`', '(ev_<id>_<t0>.png)', '`evidence_2.png`', 'analyze-ref.mjs strip P ref/<파일> <t0> <t1>', '`ev_mNN.png`',
    '**근거 이미지 없는 ② 금지**', '이미지 레퍼런스는 ② 근거가 없어 ③(brief 효과 지정)만',
    '`이미지 추가 완료` / `일부만 넣고 진행` / `이미지 없이 진행', '"바로 만들어"면 목록만 보이고 계속',
    '**코드 캐릭터**', '**파츠 시트**', 'rig.json 회전 중심 수정', '코드 캐릭터로 바꾸고 알린다',
    '| 효과 id | 단계 | 근거 | 사용 위치 |', '| <id> | ③ | 사용자 지정 | s4 |', '`over`(오버슈트 비율)·`hold`(정지 초)는 analysis.md', '`ant`(예비동작 비율)', '`squash`(최대 늘어남)', '`window.DNA.motion`',
    '<dom|canvas|three|stage>', '**`cam.onetake`·`trans.shared` 근거가 있을 때만**', '`<id>-beats`',
    'MH.move(t,t0,a,b,{dur,ant,over,settle})', 'MH.follow(t,fn,{lag,damp})', 'MH.sim(t,step,init,update)', 'MH.phys.body({pos,vel,spin,g,bounce,floor}).at(t)', 'MH.gsapSpring(name,', 'MH.screenSize()', 'MH.easeOf(',
    '**② 모듈은 효과 표에 켜진 것만 `modules/<이름>.md` 를 읽는다**', '(`cam`·`trans`·`lens`·`fx`·`time`·`morph`)',
    '(오디오→검사→게이트→렌더→검수→모션 검수)', '모션 검수 ✔/✗ 한 줄', '**게이트**(`gate.mjs`, HyperFrames 검사 다음, `--check` 도)',
    '**모션 검수**(`motion-qc.mjs`, 렌더 뒤, 초안 제외)', '`work/motion-qc.json` + `work/qc-motion.png`', '`lens.mblur` 행 = 렌더 약 4배', 'flubber MIT, opentype.js MIT',
  ]) assert.ok(g.includes(s), s);
  assert.ok(!g.includes('lens.dof 만'), 'R20');
});
test('skills carry the v2 steps', () => {
  const plan = read('skills/mv-plan/SKILL.md'), make = read('skills/mv-make/SKILL.md');
  assert.ok(plan.includes('**측정 → 근거표 확정 → 소스 점검 → DNA + 효과 표 → 장면/무대 선택 → 장면 → 스토리보드 → 검토 요청**'));
  assert.ok(plan.includes('표에 판정 한 줄(코드 캐릭터 / 파츠 시트)'));
  assert.ok(make.includes('**게이트 위반**(✖ 효과 id — 파일:줄)'));
  assert.ok(make.includes('`node "${CLAUDE_PLUGIN_ROOT}/harness/tools/analyze-ref.mjs" strip <P> ref/<파일> <시작초> <끝초>`'));
  assert.ok(make.includes('모션 검수 한 줄'));
  assert.ok(make.includes('GUIDE.md` (2. 순서 7~8, 5. 사운드, 7. 검수)'));
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
  for (const t of ['gate (3단계 게이트)', 'motion-qc (모션 검수)']) assert.ok(r.includes(t), t);
  for (const l of ['flubber MIT', 'opentype.js MIT', 'Pretendard SIL OFL']) assert.ok(r.includes(l), l);
  assert.ok(r.includes('| `/motion-harness2:mv-new` | `/motion-harness:mv-new` |'));
  assert.ok(r.includes('**v1 과 나란히 설치할 수 있습니다.**'));
});
test('lens2d doc names both rack spellings', () => {
  assert.match(read('harness/modules/lens2d.md'), /`lens\.rack\(`[^\n]*`\.rack\(`|`\.rack\(`[^\n]*`lens\.rack\(`/);
});
