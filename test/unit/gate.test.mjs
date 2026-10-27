import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { runGate } from '../../harness/tools/gate.mjs';
import { briefTemplate } from '../../harness/tools/lib/brief.mjs';

const F = p => path.join('test/fixtures/gate', p);
const copy = name => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-')); fs.cpSync(F(name), d, { recursive: true }); return d; };
const planOf = d => path.join(d, 'work', 'PLAN.md');
const TABLE = rows => `# 계획\n\n## 효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n${rows}\n`;

test('ok project passes', () => assert.equal(runGate(F('ok')).ok, true));

test('missing row blocks with file and line', () => {
  const r = runGate(F('missing'));
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].id, 'trans.fill');
  assert.equal(r.violations[0].reason, 'no-row');
  assert.equal(r.violations[0].file, 'scene/compositions/s1.html');
  assert.ok(r.violations[0].line > 0);
});

test('user-specified passes only when brief lists it', () => {
  assert.equal(runGate(F('user')).ok, true);
  const d = copy('user');
  fs.writeFileSync(path.join(d, 'brief.md'), '## 효과 지정\n- (예: VHS 화면)\n\n## 꼭 넣을 것\n- VHS\n');
  const r = runGate(d);
  assert.equal(r.ok, false);
  assert.ok(r.violations.every(v => v.reason === 'user-not-in-brief'));
  assert.ok(r.violations.some(v => v.id === 'fx.vhs'));
});

test('user-specified matches id in brief, case-insensitively', () => {
  const d = copy('user');
  fs.writeFileSync(path.join(d, 'brief.md'), '## 효과 지정\n- FX.VHS 로 부탁\n');
  assert.equal(runGate(d).ok, true);
});

test('missing evidence image blocks', () => {
  const d = copy('ok');
  fs.rmSync(path.join(d, 'work', 'ref-b', 'ev_01.png'));
  const r = runGate(d);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some(v => v.reason === 'missing-image'));
});

test('evidence image path may not escape work/ref-<ref>/', () => {
  const d = copy('ok');
  fs.writeFileSync(path.join(d, 'secret.png'), 'x');
  fs.writeFileSync(planOf(d), TABLE('| cam.onetake | ② | b 0–4.5s (../../secret.png) | st1 |'));
  assert.equal(runGate(d).violations[0].reason, 'missing-image');
  fs.writeFileSync(planOf(d), TABLE(`| cam.onetake | ② | b 0–4.5s (${path.join(d, 'secret.png')}) | st1 |`));
  assert.equal(runGate(d).violations[0].reason, 'missing-image');
});

test('v1 project with Korean+space path passes', () => assert.equal(runGate(F('v1 프로젝트 폴더')).ok, true));

test('PLAN.md missing entirely: v1 passes, tier-2 call blocks', () => {
  const d = copy('v1 프로젝트 폴더');
  fs.rmSync(planOf(d));
  assert.equal(runGate(d).ok, true);
  const m = copy('missing');
  fs.rmSync(planOf(m));
  assert.equal(runGate(m).violations[0].reason, 'no-row');
});

test('row alone is validated even when no scene uses it (lens.mblur)', () => {
  const d = copy('v1 프로젝트 폴더');
  fs.writeFileSync(planOf(d), TABLE('| lens.mblur | ② | b 1–2s (nope.png) | s1 |'));
  let r = runGate(d);
  assert.equal(r.ok, false);
  assert.deepEqual([r.violations[0].id, r.violations[0].reason, r.violations[0].file, r.violations[0].line], ['lens.mblur', 'missing-image', 'work/PLAN.md', 6]);
  fs.writeFileSync(planOf(d), TABLE('| lens.mblur | ② | 레퍼런스에 있음 | s1 |'));
  assert.equal(runGate(d).violations[0].reason, 'bad-evidence');
  fs.writeFileSync(planOf(d), TABLE('| lens.mblur | 단계? | b 1–2s (nope.png) | s1 |'));
  assert.equal(runGate(d).violations[0].reason, 'bad-evidence');
  fs.writeFileSync(planOf(d), TABLE('| lens.mblur | ③ | 사용자 지정 | s1 |'));
  assert.equal(runGate(d).violations[0].reason, 'user-not-in-brief');
});

test('tier-1 rows and unknown ids are ignored (unknown id warns)', () => {
  const d = copy('v1 프로젝트 폴더');
  fs.writeFileSync(planOf(d), TABLE('| spring | ① | 기본기 | s1 |\n| my.custom | ② | 없음 | s1 |'));
  const r = runGate(d);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('my.custom')));
  assert.ok(!r.warnings.some(w => w.includes("spring")));
});

test('API hit is satisfied if any shared id has a satisfied row', () => {
  const d = copy('ok');
  fs.writeFileSync(planOf(d), TABLE('| trans.shared | ② | b 0–4.5s (ev_01.png) | st1 |'));
  assert.equal(runGate(d).ok, true);
});

test('comments do not count as calls', () => {
  const d = copy('missing');
  fs.writeFileSync(path.join(d, 'scene/compositions/s1.html'), '<script>\n// trans.fill(root)\n</script>\n');
  assert.equal(runGate(d).ok, true);
});

test('user phrase from catalog ko counts', () => {
  const d = copy('user');
  fs.writeFileSync(path.join(d, 'brief.md'), '## 효과 지정\n- 비디오테이프 느낌으로\n');
  assert.equal(runGate(d).ok, true);
});

test('CLI exit codes', () => {
  assert.equal(spawnSync(process.execPath, ['harness/tools/gate.mjs', F('ok')]).status, 0);
  assert.equal(spawnSync(process.execPath, ['harness/tools/gate.mjs', F('v1 프로젝트 폴더')]).status, 0);
  const bad = spawnSync(process.execPath, ['harness/tools/gate.mjs', F('missing')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ trans\.fill — scene\/compositions\/s1\.html:\d+ — /);
  const ok = spawnSync(process.execPath, ['harness/tools/gate.mjs', F('ok')], { encoding: 'utf8' });
  assert.match(ok.stdout, /✔ 게이트 통과 \(② 1개\)/);
});

test('importing gate.mjs does not run the CLI', () => {
  const r = spawnSync(process.execPath, ['-e', "import('./harness/tools/gate.mjs').then(()=>console.log('imported'))"], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), 'imported');
});

test('brief template has v2 header and 효과 지정', () => {
  const t = briefTemplate('t', '16:9');
  assert.ok(t.startsWith('<!-- harness: v2 -->\n'));
  assert.ok(t.includes('## 효과 지정'));
  assert.ok(t.indexOf('## 효과 지정') < t.indexOf('## 꼭 넣을 것 / 피할 것'));
  assert.ok(t.includes('# t — 브리프') && t.includes('- 화면: 16:9'));
});

test('CLI runs through a symlinked tools dir (entry guard must not fail open)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-link-'));
  const link = path.join(d, 'tools');
  fs.symlinkSync(path.resolve('harness/tools'), link, 'dir');
  const bad = spawnSync(process.execPath, [path.join(link, 'gate.mjs'), F('missing')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ trans\.fill/);
  assert.equal(spawnSync(process.execPath, [path.join(link, 'gate.mjs'), F('ok')]).status, 0);
});

test('briefTemplate golden text', () => {
  assert.equal(briefTemplate('t', '16:9'), `<!-- harness: v2 -->
# t — 브리프

> 비워 둔 칸은 Claude가 기본값으로 채웁니다. 채팅으로 말해도 됩니다.

## 주제
(한 줄)

## 전달할 내용
(핵심 메시지 3~5줄. 화면에 꼭 나올 문구가 있으면 따옴표로)

## 레퍼런스
- 주 레퍼런스: (ref/ 의 파일명, 라이브러리 ID(예: lemo:swiss-motion), jasonzhu.ai 링크, 또는 "추천해줘")
- 보조 레퍼런스(선택): (파일명 — 가져올 항목만. 예: "전환 방식만")

## 형식
- 길이: 20초        (기본 15~30초)
- 화면: 16:9      (16:9 / 9:16 / 1:1 / 4:5)
- 내레이션: 없음    (없음 / 한국어 TTS 여성 / 한국어 TTS 남성 / 직접 녹음 → source/ 에 파일)
- 자막: 내레이션이 있으면 자동
- 음악: 기본        (기본 = 효과음 + 간단한 비트 / 없음 / source/ 의 음악 파일명)

## 색 지정 (선택 — 비우면 레퍼런스 팔레트를 따름)
- 배경: (예: 남색 #1B2A4A / 그라데이션 / 종이 질감 / 3D 공간)
- 강조색: (예: 학교 상징색 #F2A900)
- 글자색:

## 소스 이미지 활용
- 방식: 혼합        (스타일로 다시 그리기 / 사진 그대로(배경 제거) / 3D 턴테이블(여러 각도 사진) / 혼합)
- 사진 사용 권리: 있음
- 메모: (예: 정면 사진이 메인, 학생 얼굴은 나오지 않게)

## 효과 지정 (선택 — 레퍼런스에 없어도 넣고 싶은 효과)
- (예: VHS 화면, 화면 채움 전환)

## 꼭 넣을 것 / 피할 것
-
`);
});

test('lens.rack: dof.rack( alone is caught (R12), reported once per call', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-rack-'));
  fs.mkdirSync(path.join(d, 'scene', 'compositions'), { recursive: true }); fs.mkdirSync(path.join(d, 'work'));
  fs.writeFileSync(path.join(d, 'scene', 'compositions', 's1.html'), '<script>\n  const dof = cam2.dof;\n  dof.rack([[0, 1], [2, 2]]);\n</script>\n');
  const r = runGate(d);
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations.map(v => [v.id, v.reason, v.line]), [['lens.rack', 'no-row', 3]]);
  fs.writeFileSync(path.join(d, 'scene', 'compositions', 's1.html'), '<script>\n  lens.rack(dof, [[0, 1]]);\n</script>\n');
  assert.deepEqual(runGate(d).violations.map(v => [v.id, v.reason, v.line]), [['lens.rack', 'no-row', 2]]);
});
test('lens.rack: no scene/template/runtime file outside modules trips .rack(', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const f of walk('harness/template').filter(f => /\.html$/.test(f))) assert.ok(!fs.readFileSync(f, 'utf8').includes('.rack('), f);
});

test('morph.many( alone is caught as morph.shape no-row (R14)', () => {
  const d = copy('missing');
  fs.writeFileSync(path.join(d, 'scene', 'compositions', 's1.html'), '<script>\n  const morph = MH.morph;\n  const ds = morph.many(t, eyes, oo, { t0: 3 });\n</script>\n');
  const r = runGate(d);
  assert.deepEqual(r.violations.map(v => [v.id, v.reason, v.line]), [['morph.shape', 'no-row', 3]]);
});

// R19: MH.cam( 는 cam.pan/push/rotate 뿐 아니라 cam.shake·cam.parallax·lens.dof·lens.rack 근거로도 통과한다
const camProject = (code, rows) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-cam-'));
  fs.mkdirSync(path.join(d, 'scene', 'compositions'), { recursive: true });
  fs.mkdirSync(path.join(d, 'work', 'ref-b'), { recursive: true });
  fs.writeFileSync(path.join(d, 'work', 'ref-b', 'ev_x.png'), 'x');
  fs.writeFileSync(path.join(d, 'brief.md'), '# b\n');
  fs.writeFileSync(path.join(d, 'scene', 'compositions', 's1.html'), `<template><script>\n${code}\n</script></template>\n`);
  fs.writeFileSync(planOf(d), rows == null ? '# 계획\n' : TABLE(rows));
  return d;
};
test('MH.cam( + lens.dof( with only a valid lens.dof row passes (R19)', () => {
  const d = camProject('const cam = MH.cam(world);\nconst lens = MH.lens;\nconst dof = lens.dof(cam, { focus: 1 });', '| lens.dof | ② | b 1–2s (ev_x.png) | s1 |');
  const r = runGate(d);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});
test('MH.cam( + cam.shake( with only a valid cam.shake row passes (R19)', () => {
  const d = camProject('const cam = MH.cam(world);\ncam.shake(2, 2.4, 0.01, 18);', '| cam.shake | ② | b 1–2s (ev_x.png) | s1 |');
  assert.equal(runGate(d).ok, true);
});
test('MH.cam( with no effect row is still no-row and names the new ids', () => {
  const r = runGate(camProject('const cam = MH.cam(world);', null));
  assert.equal(r.ok, false);
  const v = r.violations.find(v => v.reason === 'no-row');
  for (const id of ['cam.pan', 'cam.push', 'cam.rotate', 'cam.shake', 'cam.parallax', 'lens.dof', 'lens.rack']) assert.ok(v.id.split('/').includes(id), id);
});
// 17c: morph.md 의 '눈 두 개 → 로고 글자' 는 morph.text( 로 글자 윤곽을 불러와 morph.many 로 모핑한다.
// 감지기는 이 장면을 morph.shape 로만 제안하므로(blobContour), morph.shape 근거로 morph.text( 도 통과해야 한다.
test('morph.text( glyph loading passes with a morph.shape row (eyes → logo letters)', () => {
  const code = "const morph = MH.morph;\nmorph.text('moa', { size: 340 }).then(g => g);\nconst ds = morph.many(t, eyes, outers, { t0: 3 });";
  assert.equal(runGate(camProject(code, '| morph.shape | ② | b 33.25–34.42s (ev_x.png) | s1 |')).ok, true);
  assert.equal(runGate(camProject(code, '| morph.text | ② | b 33.25–34.42s (ev_x.png) | s1 |')).violations.filter(v => v.file !== 'work/PLAN.md').map(v => v.id).join(), 'morph.shape');
  const none = runGate(camProject(code, null));
  assert.deepEqual(none.violations.map(v => [v.id, v.line]), [['morph.shape/morph.text', 3], ['morph.shape', 4]]);
});
// I1: MH.trans2d.fill( 직접 호출도 trans.fill 근거가 필요하다
test('MH.trans2d.fill( with no row is blocked as no-row', () => {
  const r = runGate(camProject('MH.trans2d.fill(t, el, { t0: 1 });', null));
  assert.deepEqual(r.violations.map(v => [v.id, v.reason]), [['trans.fill', 'no-row']]);
  assert.equal(runGate(camProject('MH.trans2d.fill(t, el, { t0: 1 });', '| trans.fill | ② | b 1–2s (ev_x.png) | s1 |')).ok, true);
});
// R24: 배우 grow(몸통이 화면을 덮음)는 ② trans.fill — dom·stage 장면 모두
test('rig grow cue needs trans.fill evidence (R24)', () => {
  const dom = "const a = MH.rig.actor(svg, D);\na.act([[2, 'grow', { fill: 'screen' }]]);";
  assert.deepEqual(runGate(camProject(dom, null)).violations.map(v => [v.id, v.reason, v.line]), [['trans.fill', 'no-row', 3]]);
  assert.equal(runGate(camProject(dom, '| trans.fill | ② | b 1–2s (ev_x.png) | s1 |')).ok, true);
  const stage = 'st.cues([[4.6, "boo", "grow", { dur: 0.8 }]]);';
  assert.deepEqual(runGate(camProject(stage, null)).violations.map(v => [v.id, v.reason]), [['trans.fill', 'no-row']]);
});
test('③ brief match ignores spaces on both sides (모션블러 = 모션 블러)', () => {
  const d = camProject('', '| lens.mblur | ③ | 사용자 지정 | s1 |');
  fs.writeFileSync(path.join(d, 'brief.md'), '## 효과 지정\n- 모션블러\n');
  assert.equal(runGate(d).ok, true, JSON.stringify(runGate(d).violations));
  fs.writeFileSync(path.join(d, 'brief.md'), '## 효과 지정\n- 화면 흔 들림 정도\n');
  assert.equal(runGate(d).violations[0].reason, 'user-not-in-brief');
  fs.writeFileSync(path.join(d, 'brief.md'), '## 효과 지정\n- 모션 블 러\n');
  assert.equal(runGate(d).ok, true);
});
