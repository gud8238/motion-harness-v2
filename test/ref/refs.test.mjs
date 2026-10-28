// 실제 레퍼런스 A·B 검증 — 영상은 저장소에 없다. MH2_REF_A / MH2_REF_B 가 있을 때만 실행 (없으면 skip)
// 시각은 프레임을 직접 보고 확인한 값 (Task 17b, docs/superpowers/acceptance/2026-10-27-acceptance.md "감지기 보정")
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DATA } from '../../harness/tools/_common.mjs';

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../harness/tools/analyze-ref.mjs');
function analyze(src, name) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-ref-'));
  fs.mkdirSync(path.join(proj, 'ref'));
  const rel = `ref/${name}${path.extname(src)}`;
  fs.copyFileSync(src, path.join(proj, rel));
  const r = spawnSync(process.execPath, [TOOL, proj, rel], { encoding: 'utf8', cwd: proj });
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(proj, 'work', `ref-${name}`), ev = JSON.parse(fs.readFileSync(path.join(out, 'evidence.json'), 'utf8'));
  for (const c of ev.candidates) assert.ok(fs.existsSync(path.join(out, c.strip)), c.strip);
  return { cs: ev.candidates, cuts: JSON.parse(fs.readFileSync(path.join(out, 'analysis.json'), 'utf8')).cuts.times };
}
// analyze-ref 는 Chromium(playwright, MH_DATA)이 있어야 끝까지 돈다 — 없으면 실패 대신 skip
const noBrowser = !fs.existsSync(path.join(DATA, 'node_modules', 'playwright', 'index.mjs')) && `playwright 없음 (${DATA})`;
const skipFor = env => (!process.env[env] && `${env} 없음`) || noBrowser;
// 후보 구간이 실제 효과 구간 [a, b] 와 겹치고, 효과가 들어 있는 샷 [lo, hi] 밖으로 나가지 않는가
const near = (cs, id, a, b, lo = 0, hi = Infinity) => cs.some(c => c.id === id && c.t0 <= b && c.t1 >= a && c.t0 >= lo && c.t1 <= hi);
const show = cs => cs.map(c => `${c.id} ${c.t0}–${c.t1}`).join(', ');
const hasCut = (cuts, t, tol = 0.1) => cuts.some(c => Math.abs(c - t) <= tol);

test('reference B: hard cuts between flat screens; push, fill, morph, shared, dof', { skip: skipFor('MH2_REF_B') }, () => {
  const { cs, cuts } = analyze(process.env.MH2_REF_B, 'b');
  for (const t of [7.33, 7.98, 12.93, 13.32, 22.4, 25.02, 25.2, 26.93, 28.68]) assert.ok(hasCut(cuts, t), `컷 ${t}s 없음: ${cuts.join(', ')}`);   // ffmpeg scene 0.3 은 0개 (R7); 25.02·25.2 = 검은 띠가 닫혔다 열림
  assert.ok(!cuts.some(c => c > 0.1 && c < 6.5), `첫 샷(0–6.7s 줌아웃 원테이크) 안의 컷: ${cuts.join(', ')}`);
  assert.ok(near(cs, 'cam.push', 0, 3, 0, 6.8), show(cs));          // 할 일 목록에서 글자 벽으로 줌아웃 0–3s
  assert.ok(near(cs, 'trans.fill', 6.58, 6.75, 6.3, 7.8), show(cs)); // 노란 덩어리가 화면을 채움 ~6.7s
  assert.ok(near(cs, 'morph.shape', 34.0, 34.25, 33, 35.5), show(cs)); // 눈 → boon 로고 ~34.1s
  assert.ok(cs.some(c => c.id === 'trans.shared'), show(cs));          // 노란 덩어리가 여러 샷을 잇는다
  assert.ok(cs.some(c => c.id === 'lens.dof'), show(cs));              // 흐린 글자 배경
  assert.ok(near(cs, 'lens.rack', 2.9, 3.5, 2.5, 4.2), show(cs));     // 글자 벽이 통째로 흐려짐(초점이 작은 캐릭터로) 2.9–3.5s
  assert.ok(near(cs, 'lens.rack', 18.85, 19.1, 18.7, 19.4), show(cs)); // 쪽지 'Dan owes you' 흐려지고 'Mom loves tulips' 선명해짐
  for (const id of ['cam.rotate', 'trans.whip']) assert.ok(!cs.some(c => c.id === id), `영상에 없는 ${id}: ${show(cs)}`);   // 휴대폰 안 스크롤·흐린 배경의 빛 / 눈 감기며 어두워짐
});

test('reference A: depth of field, VHS rewinds, long take between cuts', { skip: skipFor('MH2_REF_A') }, () => {
  const { cs, cuts } = analyze(process.env.MH2_REF_A, 'a');
  for (const t of [2.07, 16.98]) assert.ok(hasCut(cuts, t), `컷 ${t}s 없음: ${cuts.join(', ')}`);
  assert.ok(!cuts.some(c => c > 2.2 && c < 16.8), `끊김 없는 카메라 2.1–16.9s 안의 컷 (깜빡임·빠른 이동·되감기 띠는 컷이 아니다): ${cuts.join(', ')}`);
  assert.ok(cs.some(c => c.id === 'lens.dof'), show(cs));
  assert.ok(near(cs, 'fx.vhs', 1.17, 2.25, 0, 3), show(cs));     // 일시정지·되감기 1.2–2.2s
  assert.ok(near(cs, 'fx.vhs', 11.67, 13.0, 10.5, 14), show(cs)); // 되감기 11.7–13.0s
  assert.ok(near(cs, 'cam.rotate', 9.4, 10.4, 2.1, 16.9), show(cs));    // 카메라 롤 9.4–10.4s
  assert.ok(near(cs, 'cam.rotate', 17.8, 18.4, 17, 19.05), show(cs));  // 기울어진 마지막 샷
  for (const id of ['lens.rack', 'trans.whip']) assert.ok(!cs.some(c => c.id === id), `영상에 없는 ${id}: ${show(cs)}`);
});
