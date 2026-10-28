// e2e: 우리 런타임 lens.dof + lens.rack 을 실제 HyperFrames 로 렌더한 영상에서 lens.rack 감지기가 초점 이동을 찾는가
// 장면 1개(3초): 먼 글자 벽(깊이 0.4)과 앞 카드(깊이 1.4), 초점 1.4 → 0.4 (0.8–1.8s, 기본 aperture 6). MH2_E2E=1 일 때만 실행. 실행법: test/e2e/README.md
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

before(() => { if (!skip) { assert.ok(fs.existsSync(path.join(DATA, 'installed.json')), `setup 이 끝나지 않았습니다 (${DATA})`); tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2 rack-')); } });
after(() => { if (tmp && !process.env.MH2_E2E_KEEP) fs.rmSync(tmp, { recursive: true, force: true }); });

test('lens.dof + lens.rack 렌더 → 초점 이동 구간(0.8–1.8s)에 lens.rack 후보, 그 밖에는 없음', { skip, timeout: 15 * 60 * 1000 }, () => {
  const proj = path.join(tmp, '초점 테스트');
  fs.mkdirSync(proj);
  ok(tool('new.mjs', ['.'], proj), 'new.mjs');
  ok(tool('scene.mjs', ['add', '.', 'rack', 'dom', '--dur', '3'], proj), 'scene add rack');
  fs.copyFileSync(path.join(FIX, 'rack.html'), path.join(proj, 'scene', 'compositions', 'rack.html'));
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), '# 계획\n\n효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| lens.dof | ③ | 사용자 지정 | rack |\n| lens.rack | ③ | 사용자 지정 | rack |\n| cam.parallax | ③ | 사용자 지정 | rack |\n');   // cam.layer( = cam.parallax
  const bf = path.join(proj, 'brief.md'); fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace(/^- \(예: VHS 화면, 화면 채움 전환\)$/m, '- 배경 흐림\n- 초점 이동\n- 시차'));
  ok(tool('make.mjs', ['.', '--draft'], proj), 'make --draft');
  const mp4 = path.join(proj, 'out', 'draft.mp4'), P = probe(mp4);
  const c = buildCandidates(measureSeries(mp4, P), [], P.duration), rack = c.filter(x => x.id === 'lens.rack'), show = JSON.stringify(rack);
  assert.ok(rack.length, `lens.rack 후보 없음: ${c.map(x => `${x.id} ${x.t0}–${x.t1}`).join(', ')}`);
  assert.ok(rack.every(x => x.t0 >= 0.6 && x.t1 <= 2.0), show);
  assert.ok(rack.some(x => /→/.test(x.signal)), `앞 카드는 선명해지고 벽은 흐려지는 두 방향 변화여야: ${show}`);
});
