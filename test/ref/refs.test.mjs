// 실제 레퍼런스 A·B 검증 — 영상은 저장소에 없다. MH2_REF_A / MH2_REF_B 가 있을 때만 실행 (없으면 skip)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DATA } from '../../harness/tools/_common.mjs';

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../harness/tools/analyze-ref.mjs');
function evidenceOf(src, name) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-ref-'));
  fs.mkdirSync(path.join(proj, 'ref'));
  const rel = `ref/${name}${path.extname(src)}`;
  fs.copyFileSync(src, path.join(proj, rel));
  const r = spawnSync(process.execPath, [TOOL, proj, rel], { encoding: 'utf8', cwd: proj });
  assert.equal(r.status, 0, r.stderr);
  const ev = JSON.parse(fs.readFileSync(path.join(proj, 'work', `ref-${name}`, 'evidence.json'), 'utf8'));
  for (const c of ev.candidates) assert.ok(fs.existsSync(path.join(proj, 'work', `ref-${name}`, c.strip)), c.strip);
  return ev.candidates;
}
// analyze-ref 는 Chromium(playwright, MH_DATA)이 있어야 끝까지 돈다 — 없으면 실패 대신 skip
const noBrowser = !fs.existsSync(path.join(DATA, 'node_modules', 'playwright', 'index.mjs')) && `playwright 없음 (${DATA})`;
const skipFor = env => (!process.env[env] && `${env} 없음`) || noBrowser;
const within = (cs, id, a, b) => cs.some(c => c.id === id && c.t0 >= a && c.t1 <= b);
const show = cs => cs.map(c => `${c.id} ${c.t0}–${c.t1}`).join(', ');

test('reference B: push, fill, morph, shared', { skip: skipFor('MH2_REF_B') }, () => {
  const cs = evidenceOf(process.env.MH2_REF_B, 'b');
  assert.ok(within(cs, 'cam.push', 0, 4), show(cs));
  assert.ok(within(cs, 'trans.fill', 4, 6.5), show(cs));
  assert.ok(within(cs, 'morph.shape', 30, 36), show(cs));
  assert.ok(cs.some(c => c.id === 'trans.shared'), show(cs));
});

test('reference A: depth of field, VHS', { skip: skipFor('MH2_REF_A') }, () => {
  const cs = evidenceOf(process.env.MH2_REF_A, 'a');
  assert.ok(cs.some(c => c.id === 'lens.dof'), show(cs));
  assert.ok(cs.some(c => c.id === 'fx.vhs'), show(cs));
});
