// e2e: 우리 런타임 fx.vhs 를 실제 HyperFrames 로 렌더한 영상에서 fx.vhs 감지기가 찾는가 (Task 17b)
// 장면 3개: 밝은 단색 + 어두운 글자색(0–3s) · 어두운 단색(3–6s) · 밝은 단색 + 기본 글자색 = 흰 글자·어두운 판(6–9s), seed 두 개.
// make --draft 가 끝나면 HyperFrames 검사(대비 포함)를 통과한 것이다. MH2_E2E=1 일 때만 실행 (setup 완료 필요). 실행법: test/e2e/README.md
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA, probe } from '../../harness/tools/_common.mjs';
import { measureSeries, buildCandidates } from '../../harness/tools/lib/evidence.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS = path.join(REPO, 'harness', 'tools'), FIX = path.join(REPO, 'test', 'fixtures', 'e2e');
const skip = process.env.MH2_E2E !== '1' && 'MH2_E2E=1 일 때만 실행';
const SCENES = [['vhs-light', 0, 3], ['vhs-dark', 3, 6], ['vhs-plain', 6, 9]];
let tmp;
const tool = (name, args, cwd) => { const r = spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const ok = (r, what) => assert.equal(r.status, 0, `${what} 실패:\n${r.out.slice(-3000)}`);
// motion-qc 와 같은 기준: 계획 구간과 0.5초 이상 겹치는 후보
const overlap = (c, a, b) => Math.min(c.t1, b) - Math.max(c.t0, a);

before(() => { if (!skip) { assert.ok(fs.existsSync(path.join(DATA, 'installed.json')), `setup 이 끝나지 않았습니다 (${DATA})`); tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2 vhs-')); } });
after(() => { if (tmp && !process.env.MH2_E2E_KEEP) fs.rmSync(tmp, { recursive: true, force: true }); });

for (const seed of [1, 2]) test(`fx.vhs 오버레이 seed ${seed} → 검사 통과(대비 오류 없음), 렌더 영상의 세 장면 모두 fx.vhs 후보`, { skip, timeout: 15 * 60 * 1000 }, () => {
  const proj = path.join(tmp, `VHS 테스트 ${seed}`);
  fs.mkdirSync(proj);
  ok(tool('new.mjs', ['.'], proj), 'new.mjs');
  for (const [id] of SCENES) {
    ok(tool('scene.mjs', ['add', '.', id, 'dom', '--dur', '3'], proj), 'scene add ' + id);
    fs.writeFileSync(path.join(proj, 'scene', 'compositions', id + '.html'), fs.readFileSync(path.join(FIX, id + '.html'), 'utf8').replace('seed: 4', `seed: ${seed}`));
  }
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), `# 계획\n\n효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| fx.vhs | ③ | 사용자 지정 | ${SCENES.map(s => s[0]).join(', ')} |\n`);
  const bf = path.join(proj, 'brief.md'); fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace(/^- \(예: VHS 화면, 화면 채움 전환\)$/m, '- VHS 화면'));
  ok(tool('make.mjs', ['.', '--draft'], proj), 'make --draft (HyperFrames 검사 포함)');
  const chk = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'check.json'), 'utf8'));
  assert.deepEqual([...chk.errors, ...chk.warnings].filter(f => /contrast/.test(f.code || f.area || '')), [], '대비 검사 결과가 없어야 한다');
  const mp4 = path.join(proj, 'out', 'draft.mp4'), P = probe(mp4), cuts = [3, 6];
  const c = buildCandidates(measureSeries(mp4, P, { cuts }), cuts, P.duration).filter(x => x.id === 'fx.vhs');
  const show = c.map(x => `${x.t0}–${x.t1}`).join(', ');
  for (const [id, a, b] of SCENES) assert.ok(c.some(x => overlap(x, a, b) >= 0.5), `${id} (${a}–${b}s) 와 0.5초 이상 겹치는 fx.vhs 없음: ${show}`);
});
