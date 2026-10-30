import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { parseTable, briefSection } from '../../harness/tools/lib/plan.mjs';
import { checkPlan, checkReview, latestRound, ITEMS, QUALITY_MARK } from '../../harness/tools/lib/quality.mjs';
import { runPlanCheck } from '../../harness/tools/plan-check.mjs';
import { briefTemplate } from '../../harness/tools/lib/brief.mjs';

const SRC = rows => `소스 해부 표\n| 소스 | 종류 | 움직임 단위 | 재구성 | 예외 사유 |\n${rows}\n`;
const ACT = rows => `동작 표 (브리프 동사마다 한 행)\n| 동사 | 주체 | 화면 동작 | 물리·연결 | 결과 | 장면 |\n${rows}\n`;
const ACTING = rows => `연기 표\n| 레퍼런스 연기 | 우리 피사체 | 표현 | 장면 |\n${rows}\n`;
const TRANS = rows => `전환 표\n| 경계 | 이어주는 요소 | 방식 | 근거 |\n${rows}\n`;
const GOOD = [
  SRC('| arm.png | 관절 기계 | 받침·위팔·집게 | 다시 그리기 | — |\n| team.jpg | 사람 | 한 장 | 사진 그대로 | 실물 공개 |'),
  ACT('| 집는다 | 집게팔 | 팔이 내려가 집게가 닫힘 | 관절 체인 | 공이 들림 | s2 |'),
  ACTING('| 통통 걷기 | 집게팔 | 받침이 들썩이며 등장 | s1 |'),
  TRANS('| s1→s2 | 화면 → 배경 | 줌 통과 | ev_m01.png |'),
].join('\n');
const msgs = r => r.errors.map(e => e.msg).join('\n');

test('parseTable reads the first table after a heading, header first, separators skipped, CRLF', () => {
  const t = parseTable('x\r\n## 동작 표 (설명)\r\n\r\n| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n끝\r\n| 3 | 4 |', '동작 표');
  assert.equal(t.found, true);
  assert.deepEqual(t.header, ['a', 'b']);
  assert.deepEqual(t.rows.map(r => r.cells), [['1', '2']]);
  assert.equal(t.rows[0].line, 6);
  assert.equal(parseTable('| 동작 표 | x |', '동작 표').found, false);   // 표 칸 안의 글자는 제목이 아니다
  assert.equal(parseTable('동작 표들\n| a |\n| 1 |', '동작 표').found, false);
});

test('briefSection skips template hints', () => {
  assert.deepEqual(briefSection('## 전달할 내용\n(핵심 메시지 3~5줄)\n- 하나\n- 둘\n## 형식\n- x', '전달할 내용'), ['하나', '둘']);
});

test('good plan passes', () => {
  const r = checkPlan(GOOD, { scenes: ['s1', 's2'] });
  assert.deepEqual(r.errors, []);
});

test('missing tables are errors', () => {
  const r = checkPlan('# 계획\n효과 표\n| a | b | c | d |');
  for (const t of ['소스 해부 표', '동작 표', '연기 표', '전환 표']) assert.ok(r.errors.some(e => e.table === t), t);
});

test('photo as-is needs an exception reason; rebuilt sources need movement units', () => {
  const r = checkPlan(GOOD.replace('| 실물 공개 |', '| — |').replace('| 받침·위팔·집게 |', '| — |'));
  assert.match(msgs(r), /예외 사유/);
  assert.match(msgs(r), /움직임 단위가 비었습니다/);
  assert.match(msgs(checkPlan(GOOD.replace('다시 그리기', '카드로 붙이기'))), /재구성 '카드로 붙이기'/);
});

test('label-only actions and empty cells are errors', () => {
  for (const how of ['라벨로 표시', '자막', '문구로만 설명', '텍스트 태그']) {
    const r = checkPlan(GOOD.replace('팔이 내려가 집게가 닫힘', how));
    assert.match(msgs(r), /라벨·자막만으로는 안 됩니다/, how);
  }
  assert.match(msgs(checkPlan(GOOD.replace('| 관절 체인 |', '| — |'))), /물리·연결 칸이 비었습니다/);
});

test('action rows fewer than brief messages warn; unknown scene warns', () => {
  const brief = '## 전달할 내용\n- 조종한다\n- 집는다\n## 형식';
  const r = checkPlan(GOOD.replace('| s2 |', '| s9 |'), { brief, scenes: ['s1', 's2'] });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some(w => /2줄인데 동작 표는 1행/.test(w.msg)));
  assert.ok(r.warnings.some(w => /장면 's9'/.test(w.msg)));
});

test('acting table: 해당 없음 needs a reason', () => {
  assert.match(msgs(checkPlan(GOOD.replace('| 통통 걷기 | 집게팔 | 받침이 들썩이며 등장 | s1 |', '| 해당 없음 | — | — | — |'))), /사유/);
  const r = checkPlan(GOOD.replace('| 통통 걷기 | 집게팔 | 받침이 들썩이며 등장 | s1 |', '| 해당 없음 | — | 레퍼런스에 주인공 없음 | — |'));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some(w => /연기 없음/.test(w.msg)));
});

test('transitions: cuts need evidence, the same method at most 3 times, empty link is an error', () => {
  assert.match(msgs(checkPlan(GOOD.replace('| 줌 통과 | ev_m01.png |', '| 하드컷 | — |'))), /근거 칸/);
  assert.deepEqual(checkPlan(GOOD.replace('| 줌 통과 | ev_m01.png |', '| 하드컷 | ev_m02.png |')).errors, []);
  const many = Array.from({ length: 4 }, (_, i) => `| s${i}→s${i + 1} | 공 → 공 | 원형 | — |`).join('\n');
  assert.match(msgs(checkPlan(GOOD.replace('| s1→s2 | 화면 → 배경 | 줌 통과 | ev_m01.png |', many))), /같은 전환 '원형' 이 4번/);
  assert.match(msgs(checkPlan(GOOD.replace('| 화면 → 배경 |', '| — |'))), /이어주는 요소/);
});

const CARD = (score, base) => `채점표\n| 항목 | 점수 | 기준선 | 근거 |\n|---|---|---|---|\n${ITEMS.map((n, i) => `| ${i < 5 ? n + ' ★' : n} | ${typeof score === 'function' ? score(n, i) : score} | ${base ?? ''} | x |`).join('\n')}\n`;

test('review: core items need 5, others 4.5, baseline + 1', () => {
  assert.deepEqual(checkReview(CARD(5)).errors, []);
  assert.deepEqual(checkReview(CARD((n, i) => (i < 5 ? 5 : 4.5))).errors, []);
  const low = checkReview(CARD((n, i) => (i === 3 ? 4.5 : 5)));
  assert.equal(low.errors.length, 1);
  assert.match(low.errors[0], /움직임: 4.5점 < 합격선 5/);
  const base = checkReview(CARD((n, i) => (i < 5 ? 5 : 4.5), 4));
  assert.ok(base.errors.some(e => /타이포: 4.5점 < 합격선 5 \(기준선 4\)/.test(e)));
  assert.match(checkReview(CARD(5).split('\n').filter(l => !l.includes('사운드')).join('\n')).errors.join(), /사운드: 점수가 없습니다/);
  assert.match(checkReview('없음').errors[0], /채점표가 없습니다/);
});

test('latestRound picks the highest number', () => {
  assert.equal(latestRound(['round-2.md', 'round-10.md', 'round-3.md', 'x.md']), 'round-10.md');
  assert.equal(latestRound(['notes.md']), null);
});

test('new briefs carry the quality mark and the auto source mode', () => {
  const b = briefTemplate('x', '16:9');
  assert.ok(b.includes('<!-- quality: 2.2 -->'));
  assert.match(b, /- 방식: 자동/);
});

test('runPlanCheck: old projects skip, marked projects are checked, --review reads the latest round', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
  fs.mkdirSync(path.join(d, 'work', 'review'), { recursive: true });
  fs.writeFileSync(path.join(d, 'brief.md'), '<!-- harness: v2 -->\n');
  assert.equal(runPlanCheck(d).skipped, true);
  fs.writeFileSync(path.join(d, 'brief.md'), `<!-- harness: v2 -->\n${QUALITY_MARK}\n`);
  assert.equal(runPlanCheck(d).ok, false);                                   // PLAN.md 없음
  fs.writeFileSync(path.join(d, 'work', 'PLAN.md'), GOOD);
  assert.equal(runPlanCheck(d).ok, true);
  assert.equal(runPlanCheck(d, { review: true }).ok, false);                 // 채점표 없음
  fs.writeFileSync(path.join(d, 'work', 'review', 'round-1.md'), CARD(5));
  fs.writeFileSync(path.join(d, 'work', 'review', 'round-2.md'), CARD(4));
  const r = runPlanCheck(d, { review: true });
  assert.equal(r.ok, false);
  assert.equal(r.review.file, 'work/review/round-2.md');
  fs.writeFileSync(path.join(d, 'work', 'review', 'round-3.md'), CARD(5));
  assert.equal(runPlanCheck(d, { review: true }).ok, true);
  const cli = spawnSync(process.execPath, ['harness/tools/plan-check.mjs', d, '--review'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /채점표 합격 \(work\/review\/round-3\.md\)/);
});
