import {completePlan} from '../helpers/plan-fixture.mjs';
// e2e 스모크: 실제 HyperFrames 로 게이트·초안 렌더·순서 바꾼 프레임 결정성·v1 프로젝트 호환을 확인한다.
// MH2_E2E=1 일 때만 실행 (setup 완료 필요, 설치 폴더는 MH_DATA 또는 ~/.motion-harness2). 실행법: test/e2e/README.md
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA, hf, probe } from '../../harness/tools/_common.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS = path.join(REPO, 'harness', 'tools'), FIX = path.join(REPO, 'test', 'fixtures', 'e2e');
const skip = process.env.MH2_E2E !== '1' && 'MH2_E2E=1 일 때만 실행';
const LONG = { skip, timeout: 15 * 60 * 1000 };

let tmp, proj;
const tool = (name, args, cwd) => {
  const r = spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const ok = (r, what) => assert.equal(r.status, 0, `${what} 실패:\n${r.out.slice(-3000)}`);
const write = (f, s) => fs.writeFileSync(f, s);
const TABLE = rows => `# 계획\n\n효과 표 (② 는 근거 필수, ③ 은 brief "효과 지정")\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}\n`;

before(() => {
  if (skip) return;
  assert.ok(fs.existsSync(path.join(DATA, 'installed.json')), `setup 이 끝나지 않았습니다 (${DATA}) — node harness/tools/setup.mjs 를 먼저 실행하세요`);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2 e2e 한글-'));
  proj = path.join(tmp, '모션 테스트 1');                                         // 한글 + 공백 경로
  fs.mkdirSync(proj);
});
after(() => { if (tmp && !process.env.MH2_E2E_KEEP) fs.rmSync(tmp, { recursive: true, force: true }); });

test('1. 근거 없는 ② 효과 표 → make --check 가 게이트로 실패(종료 1)', LONG, () => {
  ok(tool('new.mjs', ['.'], proj), 'new.mjs');
  ok(tool('scene.mjs', ['add', '.', 'st1', 'stage', '--dur', '6'], proj), 'scene.mjs add');
  fs.copyFileSync(path.join(FIX, 'st1.html'), path.join(proj, 'scene', 'compositions', 'st1.html'));
  write(path.join(proj, 'work', 'PLAN.md'), TABLE([
    ['cam.onetake', '②', 'b 0–4.5s (ev_cam-onetake_0.00.png)', 'st1 b1'],                // 근거 이미지가 없다
    ['trans.fill', '②', 'b 6.67–7.42s (ev_trans-fill_6.67.png)', 'st1 b2'],
  ]));
  completePlan(proj);
  const r = tool('make.mjs', ['.', '--check'], proj);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /검사 통과/, 'HyperFrames 검사가 먼저 통과해야 게이트 실패가 의미 있다:\n' + r.out);
  assert.match(r.out, /✖ cam\.onetake — work\/PLAN\.md:\d+ — 근거 이미지 파일이 없음/);
  assert.match(r.out, /✖ trans\.fill — work\/PLAN\.md:\d+ — 근거 이미지 파일이 없음/);
  assert.match(r.out, /게이트 위반/);
  assert.ok(!fs.existsSync(path.join(proj, 'out', 'draft.mp4')));
});

test('2. ③ 사용자 지정 + brief 효과 지정 → make --draft 성공, out/draft.mp4', LONG, () => {
  write(path.join(proj, 'work', 'PLAN.md'), TABLE([['cam.onetake', '③', '사용자 지정', 'st1 b1'], ['trans.fill', '③', '사용자 지정', 'st1 b2']]));
  const bf = path.join(proj, 'brief.md');
  write(bf, fs.readFileSync(bf, 'utf8').replace(/^- \(예: VHS 화면, 화면 채움 전환\)$/m, '- 원테이크\n- 화면 채움'));
  completePlan(proj);
  const r = tool('make.mjs', ['.', '--draft'], proj);
  ok(r, 'make --draft');
  assert.match(r.out, /✔ 게이트 통과/);
  const mp4 = path.join(proj, 'out', 'draft.mp4');
  assert.ok(fs.existsSync(mp4));
  const p = probe(mp4);
  assert.ok(Math.abs(p.duration - 6) < 0.2, `길이 ${p.duration}`); assert.equal(p.width, 1920); assert.equal(p.height, 1080);
});

test('3. 결정성: 순서를 바꿔 찍어도 같은 시각의 프레임 PNG 바이트가 같다', LONG, () => {
  const shoot = (at, dir) => {
    const r = hf(['snapshot', 'scene', '--at', at, '--no-end', '-o', dir], { cwd: proj });
    assert.equal(r.status, 0, `snapshot ${at} 실패:\n${String((r.stderr || '') + (r.stdout || '')).slice(-2000)}`);
    const byT = {};
    for (const f of fs.readdirSync(dir)) { const m = /^frame-\d+-at-([\d.]+)s\.png$/.exec(f); if (m) byT[+m[1]] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'); }
    return byT;
  };
  const a = shoot('0.5,3.1,1.7,4.9', path.join(tmp, 'snap a')), b = shoot('0.5,1.7,3.1,4.9', path.join(tmp, 'snap b'));
  assert.deepEqual(Object.keys(a).map(Number).sort(), [0.5, 1.7, 3.1, 4.9]);
  for (const t of [0.5, 1.7, 3.1, 4.9]) assert.equal(a[t], b[t], `${t}s 프레임이 찍는 순서에 따라 다르다`);
  assert.equal(new Set(Object.values(a)).size, 4, '네 시각의 프레임이 모두 달라야 한다 (움직임이 있는지)');
});

test('4. v1 프로젝트(효과 표 없음, dom 장면 3개) → 게이트 통과, make --draft 성공', LONG, () => {
  const v1 = path.join(tmp, 'v1 예시 프로젝트');
  fs.cpSync(path.join(FIX, 'v1-project'), v1, { recursive: true });
  const plan = fs.readFileSync(path.join(v1, 'work', 'PLAN.md'), 'utf8');
  ok(tool('new.mjs', ['.'], v1), 'new.mjs (라이브러리 갱신)');
  const g = tool('gate.mjs', [v1], v1);
  ok(g, 'gate'); assert.match(g.out, /✔ 게이트 통과 \(② 0개\)/); assert.ok(!/⚠/.test(g.out), g.out);
  const r = tool('make.mjs', ['.', '--draft'], v1);
  ok(r, 'make --draft');
  const p = probe(path.join(v1, 'out', 'draft.mp4'));
  assert.ok(Math.abs(p.duration - 12) < 0.2, `길이 ${p.duration}`);
  assert.equal(fs.readFileSync(path.join(v1, 'work', 'PLAN.md'), 'utf8'), plan, 'v1 PLAN.md 를 건드리지 않는다');
});
