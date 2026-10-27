// motion-qc: 순수 함수(qcCompare·unplanned·stiffness) + CLI (한글+공백 경로, 합성 영상). 이미지 합성은 Chromium 이 있을 때만 확인.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DATA } from '../../harness/tools/_common.mjs';
import { qcCompare, unplanned, stiffness, STIFF, dnaAccents } from '../../harness/tools/motion-qc.mjs';
import { pattern } from '../helpers/frames.mjs';

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../harness/tools/motion-qc.mjs');
const hasPw = fs.existsSync(path.join(DATA, 'node_modules', 'playwright', 'index.mjs'));
const ff = (...a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]); assert.equal(r.status, 0, String(r.stderr)); };
const run = (cwd, ...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8', cwd });

test('qcCompare matches overlapping candidate', () => {
  const rows = [{ id: 'trans.fill', tier: 2, where: 'st1 b2' }, { id: 'time.remap', tier: 2, where: 's4' }];
  const r = qcCompare(rows, { 'st1 b2': [[6, 8]], s4: [[20, 24]] }, [{ id: 'trans.fill', t0: 6.4, t1: 7.2 }]);
  assert.deepEqual(r.map(x => x.ok), [true, null]);
  assert.deepEqual(r.map(x => [x.id, x.where]), [['trans.fill', 'st1 b2'], ['time.remap', 's4']]);
});
test('qcCompare: overlap rules (0.5 s, short ranges, other ids, missing ranges)', () => {
  const row = (id, where) => ({ id, tier: 2, where });
  const f = (id, t0, t1) => ({ id, t0, t1 });
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [[0, 4]] }, [f('cam.pan', 3.7, 5)])[0].ok, false);      // 0.3 s 만 겹침
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [[0, 4]] }, [f('cam.pan', 3.5, 5)])[0].ok, true);       // 정확히 0.5 s
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [[2, 2.3]] }, [f('cam.pan', 1, 3)])[0].ok, true);       // 구간이 0.5 s 보다 짧으면 완전히 겹치면 통과
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [[2, 2.3]] }, [f('cam.pan', 2.1, 3)])[0].ok, false);
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [[0, 4]] }, [f('cam.push', 0, 4)])[0].ok, false);       // 다른 id
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [[0, 1], [8, 10]] }, [f('cam.pan', 8.5, 9.5)])[0].ok, true);   // 여러 구간 중 하나
  assert.equal(qcCompare([row('cam.pan', 'a')], {}, [f('cam.pan', 0, 4)])[0].ok, null);                    // 해석 불가 위치
  assert.equal(qcCompare([row('cam.pan', 'a')], { a: [] }, [f('cam.pan', 0, 4)])[0].ok, null);
  assert.equal(qcCompare([row('no.such', 'a')], { a: [[0, 4]] }, [f('no.such', 0, 4)])[0].ok, null);         // 카탈로그에 없음
});
test('unplanned flags tier-2 not in table', () => {
  assert.deepEqual(unplanned([{ id: 'lens.dof', t0: 1, t1: 2 }], [{ id: 'trans.fill' }]).map(x => x.id), ['lens.dof']);
  assert.deepEqual(unplanned([{ id: 'lens.dof', t0: 1, t1: 2 }], [{ id: 'lens.dof' }]), []);
  assert.deepEqual(unplanned([{ id: 'zzz', t0: 1, t1: 2 }], []), []);                                         // ② 가 아닌 id 는 무시
});

// 합성 시계열: 프레임마다 gm = {dx, dy, n}. 마지막 프레임은 gm null.
const mk = dxs => Object.assign(dxs.map((dx, i) => ({ t: +(i / 12).toFixed(3), gm: dx == null ? null : { dx, dy: 0, scale: 1, rot: 0, n: 20 } })), { size: [160, 90] });
test('stiffness finds linear segment and hard stop', () => {
  const s = mk([...Array(12).fill(5), 0, 0, 0, 0, null]);
  const r = stiffness(s);
  assert.deepEqual(r.map(x => x.kind), ['linear', 'hardstop']);
  assert.equal(r[0].t0, 0); assert.ok(Math.abs(r[0].t1 - 1) < 0.01, JSON.stringify(r));
  assert.ok(Math.abs(r[1].t0 - 1) < 0.01);
  assert.equal(STIFF.linearSpeed, 2); assert.equal(STIFF.stopFrom, 4); assert.equal(STIFF.stopTo, 0.3);
});
test('stiffness: eased move, short run, slow drift and cut are not flagged', () => {
  const ease = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1];                                              // 가속·감속 — 변동계수 큼, 멈춤은 부드러움
  assert.deepEqual(stiffness(mk([...ease, 0, null])), []);
  assert.deepEqual(stiffness(mk([5, 5, 5, 0, 0, 0, null])).map(x => [x.kind, x.t0]), [['hardstop', 0.25]]);      // 0.5초 미만 등속은 제외, 급정지만
  assert.deepEqual(stiffness(mk([...Array(12).fill(1.5), null])), []);                                    // 느린 등속
  const cutAt = 5 / 12 + 0.04;                                                                            // 5→6 프레임 사이에 컷: 그 걸음은 건너뜀
  assert.deepEqual(stiffness(mk([0, 0, 0, 0, 0, 9, 0, 0, 0, null]), { cuts: [cutAt] }), []);
  assert.deepEqual(stiffness([]), []);
  assert.deepEqual(stiffness(mk([null, null, null])), []);
});

const projWith = (name = '모션 영상 2') => {
  const proj = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mh2-qc-')), name);
  for (const d of ['scene/compositions', 'work/ref-r_a', 'ref', 'out']) fs.mkdirSync(path.join(proj, d), { recursive: true });
  return proj;
};
const host = (id, start, dur, extra = '') => `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${dur}" data-track-index="1"${extra}></div>`;

test('CLI in a Korean+space folder: ② row found where planned, stiffness + json, optional board', async () => {
  const proj = projWith(), name = path.basename(proj);
  const pgm = path.join(proj, 'pat.pgm'); fs.writeFileSync(pgm, Buffer.concat([Buffer.from('P5\n1280 360\n255\n'), Buffer.from(pattern(1280, 360, 7))]));
  // 우리 영상: 2초 패닝(프레임당 6px @640) → 노란 단색 1초. 호스트 s1 = 0–2, s2 = 2–3 (컷 2초)
  ff('-loop', '1', '-framerate', '24', '-i', pgm, '-f', 'lavfi', '-i', 'color=c=0xF2C94C:s=640x360:r=24:d=1', '-filter_complex', "[0]crop=640:360:x='n*6':y=0,trim=duration=2,format=yuv420p,setsar=1[a];[1]format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1[v]", '-map', '[v]', '-pix_fmt', 'yuv420p', path.join(proj, 'out', `${name}.mp4`));
  ff('-f', 'lavfi', '-i', 'testsrc=s=320x180:r=24:d=2', '-pix_fmt', 'yuv420p', path.join(proj, 'ref', 'r a.mp4'));
  fs.writeFileSync(path.join(proj, 'scene', 'index.html'), `<html><body><div id="root" data-width="640" data-height="360">${host('s1', 0, 2)}${host('s2', 2, 1)}</div></body></html>`);
  fs.writeFileSync(path.join(proj, 'work', 'ref-r_a', 'evidence.json'), JSON.stringify({ ref: 'ref/r a.mp4', label: 'r_a', candidates: [] }));
  fs.writeFileSync(path.join(proj, 'work', 'ref-r_a', 'ev_01.png'), 'x');
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), `# 계획\n\n## 효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| cam.pan | ② | r_a 0.20–1.80s (ev_01.png) | s1 |\n| fx.glitch | ② | r_a 0.00–1.00s (ev_01.png) | s2 |\n| time.remap | ② | r_a 0.00–1.00s (ev_01.png) | s2 |\n| move | ① | - | s1 |\n`);

  const r = run(proj, '.');
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'motion-qc.json'), 'utf8'));
  assert.deepEqual(j.rows.map(x => [x.id, x.where, x.ok]), [['cam.pan', 's1', true], ['fx.glitch', 's2', false], ['time.remap', 's2', null]]);
  assert.ok(j.rows[0].found.some(c => c.id === 'cam.pan'), JSON.stringify(j.rows[0]));
  assert.deepEqual(j.rows[1].found, []);
  assert.ok(Array.isArray(j.unplanned) && Array.isArray(j.stiffness));
  assert.ok(j.stiffness.some(x => x.kind === 'linear'), JSON.stringify(j.stiffness));
  assert.match(r.stdout, /✔ cam\.pan/); assert.match(r.stdout, /✗ fx\.glitch/); assert.match(r.stdout, /\? time\.remap/); assert.match(r.stdout, /⚠/);
  assert.doesNotMatch(r.stdout, /move/);
  if (hasPw) assert.ok(fs.statSync(path.join(proj, 'work', 'qc-motion.png')).size > 0);
  else assert.match(r.stdout + r.stderr, /Chromium|playwright/);
});

test('CLI: no checked rows → exit 0, empty json, single-cell image; missing project/out → exit 2', () => {
  const proj = projWith('모션 영상 3'), name = path.basename(proj);
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=1.5', '-pix_fmt', 'yuv420p', path.join(proj, 'out', `${name}.mp4`));
  fs.writeFileSync(path.join(proj, 'scene', 'index.html'), `<html><body><div id="root">${host('s1', 0, 1.5)}</div></body></html>`);
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), '# 계획\n');   // v1 프로젝트: 효과 표 없음
  const r = run(proj, '.');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /효과 표가 없어\(v1 프로젝트\) 계획에 없는 효과 검사는 건너뜁니다/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'motion-qc.json'), 'utf8')), { rows: [], unplanned: [], stiffness: [] });
  if (hasPw) assert.ok(fs.statSync(path.join(proj, 'work', 'qc-motion.png')).size > 0);
  fs.rmSync(path.join(proj, 'out', `${name}.mp4`));
  const m = run(proj, '.'); assert.equal(m.status, 2); assert.match(m.stderr, /✖/);
  const n = run(proj, path.join(proj, '없는 폴더')); assert.equal(n.status, 2);
});

// 17c: 우리 영상의 덩어리(공유 요소·모핑)는 우리 DNA 색이다. 레퍼런스 강조색(노랑)만 찾으면 사용자 색(코랄) 캐릭터는 영영 감지되지 않는다.
test('dnaAccents: vivid hex colours of window.DNA in scene/index.html (dark ink and pastels excluded)', () => {
  const html = `<script>\n window.DNA = {\n bg: "#ECEEEB", paper: "#FFFFFF", ink: "#0F242E", accent: "#FF7A59", muted: "#AEB8B6",\n pink: "#F1C3D5", sky: "#2D7FF9",\n ease: [0.2, 1, 0.3, 1], bpm: 75 };\n</script>\n<style>:root { --x: #00FF00; }</style>`;
  assert.deepEqual(dnaAccents(html), ['#FF7A59', '#2D7FF9']);
  assert.deepEqual(dnaAccents('<html>no dna</html>'), []);
  assert.deepEqual(dnaAccents("window.DNA = { accent: '#e8442e' };"), ['#E8442E']);
});
// 17c: 컷·채움 감지기는 0.1~0.2 초짜리 후보를 낸다(B 의 채움 6.67–6.75). 후보가 0.5 초보다 짧으면 후보 전체가 구간 안에 있을 때 통과
test('qcCompare: a short candidate (instant fill/match cut) fully inside the range passes', () => {
  const row = { id: 'trans.fill', tier: 2, where: 'a' }, f = (t0, t1) => ({ id: 'trans.fill', t0, t1 });
  assert.equal(qcCompare([row], { a: [[6.6, 7.9]] }, [f(7.0, 7.17)])[0].ok, true);
  assert.equal(qcCompare([row], { a: [[6.6, 7.9]] }, [f(7.8, 8.0)])[0].ok, false);    // 절반만 안
  assert.equal(qcCompare([row], { a: [[6.6, 7.9]] }, [f(8.0, 8.1)])[0].ok, false);
});
// 17c: trans.shared 감지기는 컷이 2개 이상이어야 돈다. 원테이크 무대 + 장면 하나(컷 1개)인 우리 영상에서는 ✗ 가 아니라 ? (눈 확인)
test('qcCompare: trans.shared with fewer cuts than the detector needs is ? not ✗', () => {
  const row = { id: 'trans.shared', tier: 2, where: 'a' };
  assert.equal(qcCompare([row], { a: [[0, 21]] }, [], undefined, { cuts: [14.5] })[0].ok, null);
  assert.equal(qcCompare([row], { a: [[0, 21]] }, [], undefined, { cuts: [5, 14.5] })[0].ok, false);
  assert.equal(qcCompare([row], { a: [[0, 21]] }, [])[0].ok, false);   // 컷 정보가 없으면 예전대로
});
// 17c: 사용 위치 'st1 b5, s2' 처럼 맞닿은 구간은 한 구간 — 컷을 가로지르는 짧은 후보(매치 컷 14.42–14.58)가 두 쪽에 나뉘어 떨어지지 않게
test('qcCompare: touching ranges of one row are merged (cut-straddling short candidate passes)', () => {
  const row = { id: 'trans.match', tier: 2, where: 'a' }, f = (t0, t1) => ({ id: 'trans.match', t0, t1 });
  assert.equal(qcCompare([row], { a: [[12.2, 14.5], [14.5, 21]] }, [f(14.42, 14.58)])[0].ok, true);
  assert.equal(qcCompare([row], { a: [[12.2, 14.4], [14.6, 21]] }, [f(14.42, 14.58)])[0].ok, false);
});
// 17c: qc-motion.png 의 '우리 영상' 줄은 감지된 자리를 보여야 한다(사용 위치 처음이 아니라) — 행에 at = 맞은 후보 구간(사용 위치 안으로 자름)
test('qcCompare: a matched row carries the matched candidate span (clipped to the range)', () => {
  const row = { id: 'morph.shape', tier: 2, where: 's2' };
  const r = qcCompare([row], { s2: [[14.5, 21]] }, [{ id: 'morph.shape', t0: 16.92, t1: 17.75 }])[0];
  assert.equal(r.ok, true); assert.deepEqual(r.at, [16.92, 17.75]);
  assert.deepEqual(qcCompare([row], { s2: [[14.5, 21]] }, [{ id: 'morph.shape', t0: 14, t1: 15 }])[0].at, [14.5, 15]);
  assert.equal(qcCompare([row], { s2: [[14.5, 21]] }, [])[0].at, undefined);
});
// 17c 리뷰: 길이 0 으로 닿기만 한 후보(끝점이 구간 시작과 같음)는 통과하지 않는다 — 최소 0.05초 겹침
test('qcCompare: a zero-length touch does not pass (≥ 0.05 s overlap)', () => {
  const row = { id: 'trans.fill', tier: 2, where: 'a' }, f = (t0, t1) => ({ id: 'trans.fill', t0, t1 });
  assert.equal(qcCompare([row], { a: [[6.6, 7.9]] }, [f(6.5, 6.6)])[0].ok, false);
  assert.equal(qcCompare([row], { a: [[6.6, 7.9]] }, [f(7.9, 7.9)])[0].ok, false);
  assert.equal(qcCompare([row], { a: [[6.6, 7.9]] }, [f(6.6, 6.68)])[0].ok, true);
});
test('dnaAccents: only the window.DNA object literal, not a later DNA-like name', () => {
  assert.deepEqual(dnaAccents('window.DNAX = { a: "#FF0000" };'), []);
  assert.deepEqual(dnaAccents('mywindow.DNA = { a: "#FF0000" };'), []);
});

// I4: v1 프로젝트(효과 표 없음)를 v2 로 렌더하면 패닝이 감지돼도 '계획에 없는 효과'로 보고하지 않는다. 효과 표가 있으면(행 0개라도) 보고한다.
test('CLI: no effect table (v1) → unplanned check skipped with one line; a table with no rows still flags', () => {
  const proj = projWith('모션 영상 4'), name = path.basename(proj);
  const pgm = path.join(proj, 'pat.pgm'); fs.writeFileSync(pgm, Buffer.concat([Buffer.from('P5\n1280 360\n255\n'), Buffer.from(pattern(1280, 360, 7))]));
  ff('-loop', '1', '-framerate', '24', '-i', pgm, '-vf', "crop=640:360:x='n*6':y=0,trim=duration=2,format=yuv420p,setsar=1", '-pix_fmt', 'yuv420p', path.join(proj, 'out', `${name}.mp4`));
  fs.writeFileSync(path.join(proj, 'scene', 'index.html'), `<html><body><div id="root" data-width="640" data-height="360">${host('s1', 0, 2)}</div></body></html>`);
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), '# 계획\n\n## 장면 표\n| # | 내용 |\n|---|---|\n| s1 | 목록 |\n');
  const r = run(proj, '.');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'motion-qc.json'), 'utf8')).unplanned, []);
  assert.match(r.stdout, /건너뜁니다/); assert.doesNotMatch(r.stdout, /⚠ 계획에 없는 효과/);
  fs.writeFileSync(path.join(proj, 'work', 'PLAN.md'), '# 계획\n\n## 효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n');
  const r2 = run(proj, '.');
  assert.ok(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'motion-qc.json'), 'utf8')).unplanned.some(c => c.id === 'cam.pan'));
  assert.match(r2.stdout, /⚠ 계획에 없는 효과 cam\.pan/); assert.doesNotMatch(r2.stdout, /건너뜁니다/);
});
