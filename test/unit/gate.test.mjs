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
