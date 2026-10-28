// analyze-ref 의 evidence 단계·strip 명령 (Chromium 이 필요 — MH_DATA 에 playwright 가 없으면 skip)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DATA, chromium } from '../../harness/tools/_common.mjs';
import { evidenceBoard } from '../../harness/tools/lib/evidence.mjs';
import { runGate } from '../../harness/tools/gate.mjs';
import { pattern } from '../helpers/frames.mjs';

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../harness/tools/analyze-ref.mjs');
const skip = !fs.existsSync(path.join(DATA, 'node_modules', 'playwright', 'index.mjs')) && `playwright 없음 (${DATA})`;
const run = (cwd, ...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8', cwd });
const ff = (...a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]); assert.equal(r.status, 0, String(r.stderr)); };

test('still reference in a Korean+space folder → exit 0, no candidates, evidence files, strip numbering', { skip }, () => {
  const proj = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-')), '모션 영상 2');
  fs.mkdirSync(path.join(proj, 'ref'), { recursive: true });
  const r0 = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=1.5', '-pix_fmt', 'yuv420p', path.join(proj, 'ref', '정지 화면.mp4')]);
  assert.equal(r0.status, 0, String(r0.stderr));
  const r = run(proj, '.', 'ref/정지 화면.mp4');
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(proj, 'work', 'ref-정지_화면');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'evidence.json'), 'utf8')), { ref: 'ref/정지 화면.mp4', label: '정지_화면', candidates: [] });
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

test('candidates: label in evidence.json, ready-to-paste 근거 cells that pass the gate, stable strip names on re-run', { skip }, () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-ev-')), ref = path.join(proj, 'ref');
  fs.mkdirSync(ref);
  const pgm = path.join(proj, 'pat.pgm'); fs.writeFileSync(pgm, Buffer.concat([Buffer.from('P5\n1280 360\n255\n'), Buffer.from(pattern(1280, 360, 7))]));
  // 무늬 위 2초 패닝(프레임당 3px @160폭) → 노란 단색 1초 (컷)
  ff('-loop', '1', '-framerate', '24', '-i', pgm, '-f', 'lavfi', '-i', 'color=c=0xF2C94C:s=640x360:r=24:d=1', '-filter_complex', "[0]crop=640:360:x='n*6':y=0,trim=duration=2,format=yuv420p,setsar=1[a];[1]format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1[v]", '-map', '[v]', '-pix_fmt', 'yuv420p', path.join(ref, 'b ref.mp4'));
  const r = run(proj, '.', 'ref/b ref.mp4');
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(proj, 'work', 'ref-b_ref'), ev = JSON.parse(fs.readFileSync(path.join(out, 'evidence.json'), 'utf8'));
  assert.equal(ev.label, 'b_ref'); assert.equal(ev.ref, 'ref/b ref.mp4');
  assert.ok(ev.candidates.some(c => c.id === 'cam.pan'), JSON.stringify(ev.candidates));
  const md = fs.readFileSync(path.join(out, 'analysis.md'), 'utf8'), cells = [];
  for (const c of ev.candidates) {
    assert.equal(c.strip, `ev_${c.id.replace(/\./g, '-')}_${c.t0.toFixed(2)}.png`); assert.ok(fs.existsSync(path.join(out, c.strip)));
    const cell = `b_ref ${c.t0.toFixed(2)}–${c.t1.toFixed(2)}s (${c.strip})`;
    assert.ok(md.includes(`→ 근거 칸: ${cell}`), cell); cells.push(`| ${c.id} | ② | ${cell} | s1 |`);
  }
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), `# 계획\n\n## 효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n${cells.join('\n')}\n`);
  const g = runGate(proj); assert.equal(g.ok, true, JSON.stringify(g.violations)); assert.equal(g.count, new Set(ev.candidates.map(c => c.id)).size);
  assert.match(md, /evidence\.png.*1쪽/);

  // 다시 분석: 같은 이름, 사라진 후보의 자동 strip 은 삭제, 수동 strip 은 유지 → 게이트 계속 통과
  fs.writeFileSync(path.join(out, 'ev_cam-push_9.99.png'), 'x'); fs.writeFileSync(path.join(out, 'ev_01.png'), 'x'); fs.writeFileSync(path.join(out, 'ev_m01.png'), 'x');
  fs.writeFileSync(path.join(out, 'ev_trans-whip_1.50.png'), 'x');                       // 효과 표가 인용한 자동 strip 은 후보에서 빠져도 남는다 (I2)
  fs.appendFileSync(path.join(proj, 'work', 'PLAN.md'), '| trans.whip | ② | b_ref 1.50–1.90s (ev_trans-whip_1.50.png) | s1 |\n');
  assert.equal(run(proj, '.', 'ref/b ref.mp4').status, 0);
  assert.ok(fs.existsSync(path.join(out, 'ev_trans-whip_1.50.png')));
  const ev2 = JSON.parse(fs.readFileSync(path.join(out, 'evidence.json'), 'utf8'));
  assert.deepEqual(ev2.candidates.map(c => c.strip), ev.candidates.map(c => c.strip));
  assert.ok(!fs.existsSync(path.join(out, 'ev_cam-push_9.99.png')) && !fs.existsSync(path.join(out, 'ev_01.png')) && fs.existsSync(path.join(out, 'ev_m01.png')));
  assert.equal(runGate(proj).ok, true);
});

test('evidence pages: 8 strips per page, stale pages removed', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-pg-')), img = path.join(dir, 's.png');
  ff('-f', 'lavfi', '-i', 'color=c=red:s=64x16', '-frames:v', '1', img);
  const cands = n => Array.from({ length: n }, (_, i) => ({ id: 'cam.pan', t0: i, t1: i + 1, score: 0.5, signal: 'x', strip: 's.png' }));
  const browser = await chromium();
  try {
    assert.deepEqual(await evidenceBoard(cands(17), dir, { browser, title: 't' }), ['evidence.png', 'evidence_2.png', 'evidence_3.png']);
    assert.ok(fs.existsSync(path.join(dir, 'evidence_3.png')));
    assert.deepEqual(await evidenceBoard(cands(8), dir, { browser, title: 't' }), ['evidence.png']);
    assert.ok(!fs.existsSync(path.join(dir, 'evidence_2.png')) && !fs.existsSync(path.join(dir, 'evidence_3.png')));
  } finally { await browser.close(); }
});
