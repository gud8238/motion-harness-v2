// analyze-ref 의 evidence 단계·strip 명령 (Chromium 이 필요 — MH_DATA 에 playwright 가 없으면 skip)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DATA } from '../../harness/tools/_common.mjs';

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../harness/tools/analyze-ref.mjs');
const skip = !fs.existsSync(path.join(DATA, 'node_modules', 'playwright', 'index.mjs')) && `playwright 없음 (${DATA})`;
const run = (cwd, ...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8', cwd });

test('still reference in a Korean+space folder → exit 0, no candidates, evidence files, strip numbering', { skip }, () => {
  const proj = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-')), '모션 영상 2');
  fs.mkdirSync(path.join(proj, 'ref'), { recursive: true });
  const r0 = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=1.5', '-pix_fmt', 'yuv420p', path.join(proj, 'ref', '정지 화면.mp4')]);
  assert.equal(r0.status, 0, String(r0.stderr));
  const r = run(proj, '.', 'ref/정지 화면.mp4');
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(proj, 'work', 'ref-정지_화면');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'evidence.json'), 'utf8')), { ref: 'ref/정지 화면.mp4', candidates: [] });
  assert.ok(fs.statSync(path.join(out, 'evidence.png')).size > 0);
  const md = fs.readFileSync(path.join(out, 'analysis.md'), 'utf8');
  assert.match(md, /\| ① 기본기 강도\(추정\) \| 동작 [\d.]+s · 오버슈트 [\d.]+ · 정지 [\d.]+s \|/);
  assert.match(md, /자동 감지 후보 없음/);
  const A = JSON.parse(fs.readFileSync(path.join(out, 'analysis.json'), 'utf8'));
  assert.deepEqual(Object.keys(A.motionStrength).sort(), ['dur', 'hold', 'over']);

  const s1 = run(proj, 'strip', '.', 'ref/정지 화면.mp4', '0.2', '0.9'), s2 = run(proj, 'strip', '.', 'ref/정지 화면.mp4', '0', '1.4');
  assert.equal(s1.status, 0, s1.stderr); assert.equal(s2.status, 0, s2.stderr);
  assert.equal(s1.stdout.split('\n')[0], 'work/ref-정지_화면/ev_m01.png');
  assert.equal(s2.stdout.split('\n')[0], 'work/ref-정지_화면/ev_m02.png');
  assert.ok(fs.existsSync(path.join(out, 'ev_m02.png')));
  assert.match(s1.stdout, /정지_화면 0\.20–0\.90s \(ev_m01\.png\)/);
  assert.notEqual(run(proj, 'strip', '.', 'ref/정지 화면.mp4', '1', '0.5').status, 0);

  const again = run(proj, '.', 'ref/정지 화면.mp4');   // 다시 분석해도 수동 strip 은 남는다
  assert.equal(again.status, 0, again.stderr); assert.ok(fs.existsSync(path.join(out, 'ev_m01.png')));
});
