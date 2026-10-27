// e2e: 우리 런타임 fx.vhs 를 실제 HyperFrames 로 렌더한 영상에서 fx.vhs 감지기가 찾는가 (밝은 단색·어두운 단색 바탕, Task 17b)
// MH2_E2E=1 일 때만 실행 (setup 완료 필요, 설치 폴더는 MH_DATA 또는 ~/.motion-harness2). 실행법: test/e2e/README.md
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
let tmp;
const tool = (name, args, cwd) => { const r = spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const ok = (r, what) => assert.equal(r.status, 0, `${what} 실패:\n${r.out.slice(-3000)}`);

before(() => { if (!skip) { assert.ok(fs.existsSync(path.join(DATA, 'installed.json')), `setup 이 끝나지 않았습니다 (${DATA})`); tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2 vhs-')); } });
after(() => { if (tmp && !process.env.MH2_E2E_KEEP) fs.rmSync(tmp, { recursive: true, force: true }); });

test('fx.vhs 오버레이(밝은 바탕 0–3s, 어두운 바탕 3–6s) → 렌더 영상에서 두 장면 모두 fx.vhs 후보', { skip, timeout: 15 * 60 * 1000 }, () => {
  const proj = path.join(tmp, 'VHS 테스트');
  fs.mkdirSync(proj);
  ok(tool('new.mjs', ['.'], proj), 'new.mjs');
  for (const id of ['vhs-light', 'vhs-dark']) { ok(tool('scene.mjs', ['add', '.', id, 'dom', '--dur', '3'], proj), 'scene add ' + id); fs.copyFileSync(path.join(FIX, id + '.html'), path.join(proj, 'scene', 'compositions', id + '.html')); }
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), '# 계획\n\n효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| fx.vhs | ③ | 사용자 지정 | vhs-light, vhs-dark |\n');
  const bf = path.join(proj, 'brief.md'); fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace(/^- \(예: VHS 화면, 화면 채움 전환\)$/m, '- VHS 화면'));
  ok(tool('make.mjs', ['.', '--draft'], proj), 'make --draft');
  const mp4 = path.join(proj, 'out', 'draft.mp4'), P = probe(mp4), cuts = [3];
  const c = buildCandidates(measureSeries(mp4, P, { cuts }), cuts, P.duration).filter(x => x.id === 'fx.vhs');
  const show = c.map(x => `${x.t0}–${x.t1}`).join(', ');
  const covers = (a, b) => c.some(x => x.t0 <= a && x.t1 >= b);
  assert.ok(covers(1, 2), `밝은 바탕(0–3s) fx.vhs 없음: ${show}`);
  assert.ok(covers(4, 5), `어두운 바탕(3–6s) fx.vhs 없음: ${show}`);
});
