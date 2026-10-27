import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEffectTable, parseBriefEffects, readBeats, resolveWhere } from '../../harness/tools/lib/plan.mjs';

const MD = `# 계획\n효과 표 (② 는 근거 필수)\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| cam.onetake | ② | b 0.0–4.5s (ev_01.png) | st1 b1–b3 |\n| trans.fill | 2 | b 4.6-5.4 (ev_03.png) | st1 b2 |\n| fx.vhs | ③ | 사용자 지정 | s4 |\n| lens.dof | ② | 레퍼런스에 있음 | s2 |\n`;
test('parses rows with dash variants', () => {
  const r = parseEffectTable(MD);
  assert.deepEqual(r[0].evidence, { ref: 'b', t0: 0, t1: 4.5, img: 'ev_01.png' });
  assert.deepEqual(r[1].evidence, { ref: 'b', t0: 4.6, t1: 5.4, img: 'ev_03.png' });
  assert.equal(r[1].tier, 2);
  assert.deepEqual(r[2].evidence, { user: true });
  assert.ok(r[3].evidence.invalid);
  assert.equal(r[3].line, 8);
  assert.equal(r.length, 4);
  assert.equal(r[0].where, 'st1 b1–b3');
  assert.equal(r[2].tier, 3);
});
test('tilde and em dash and spaces', () => {
  const r = parseEffectTable('효과 표\n| a | b | c | d |\n|-|-|-|-|\n| cam.pan | ② | ref-1 1 ~ 2 s ( ev_02.png ) | s1 |');
  assert.deepEqual(r[0].evidence, { ref: 'ref-1', t0: 1, t1: 2, img: 'ev_02.png' });
});
test('notation variants read as the same evidence', () => {
  const rows = ['0.0-4.5', '0–4.5s', '0 s ~ 4.5 s', '0—4.5', '.0 - 4.50s'].map(t => `| e | ② | b ${t} (x.png) | s1 |`);
  const r = parseEffectTable('효과 표\n| a | b | c | d |\n|---|---|---|---|\n' + rows.join('\n'));
  for (const x of r) assert.deepEqual(x.evidence, { ref: 'b', t0: 0, t1: 4.5, img: 'x.png' });
  assert.equal(r.length, 5);
  const h = parseEffectTable('효과 표\n| a | b | c | d |\n|---|---|---|---|\n| e | ② | b .5-2 (x.png) | s1 |');
  assert.deepEqual(h[0].evidence, { ref: 'b', t0: 0.5, t1: 2, img: 'x.png' });
});
test('tier variants and unknown tier', () => {
  const t = c => parseEffectTable(`효과 표\n| a | b | c | d |\n|---|---|---|---|\n| e | ${c} | b 1-2 (x.png) | s1 |`)[0];
  assert.equal(t('②단계').tier, 2);
  assert.equal(t('③ 단계').tier, 3);
  assert.equal(t('1').tier, 1);
  assert.equal(t('①').tier, 1);
  const u = t('높음');
  assert.equal(u.tier, null);
  assert.deepEqual(u.evidence, { ref: 'b', t0: 1, t1: 2, img: 'x.png' });
});
test('stops at first non-table line, only first table, CRLF', () => {
  const md = '효과 표\r\n\r\n| a | b | c | d |\r\n|---|---|---|---|\r\n| e1 | ② | b 1-2 (x.png) | s1 |\r\n끝\r\n| e2 | ② | b 1-2 (x.png) | s1 |\r\n';
  const r = parseEffectTable(md);
  assert.deepEqual(r.map(x => x.id), ['e1']);
  assert.equal(r[0].line, 5);
});
test('table before the heading is ignored', () => {
  const md = '| z | y | x | w |\n|---|---|---|---|\n| nope | ② | b 1-2 (x.png) | s1 |\n\n효과 표\n| a | b | c | d |\n|---|---|---|---|\n| yes | ② | b 1-2 (x.png) | s1 |';
  assert.deepEqual(parseEffectTable(md).map(x => x.id), ['yes']);
});
test('no table → []', () => assert.deepEqual(parseEffectTable('# v1 계획\n| # | 항목 |'), []));
test('heading without table → []', () => assert.deepEqual(parseEffectTable('효과 표\n(없음)\n'), []));
test('brief effects', () => {
  assert.deepEqual(parseBriefEffects('## 효과 지정\n- VHS\n- trans.fill\n\n## 꼭 넣을 것\n- x'), ['VHS', 'trans.fill']);
  assert.deepEqual(parseBriefEffects('## 꼭 넣을 것\n- x'), []);
  assert.deepEqual(parseBriefEffects('## 효과 지정\r\n-  필름 그레인 \r\n### 하위\r\n- 가'), ['필름 그레인', '### 하위', '가']);
});
test('readBeats', () => {
  assert.deepEqual(readBeats('<script type="application/json" id="st1-beats">[{"id":"b1","t0":0,"t1":4}]</script>', 'st1').map(b => b.id), ['b1']);
  assert.deepEqual(readBeats('<div></div>', 'st1'), []);
  assert.deepEqual(readBeats('<script type="application/json" id="st1-beats">[{broken</script>', 'st1'), []);
  assert.deepEqual(readBeats('<script type="application/json" id="st2-beats">[{"id":"b1","t0":0,"t1":4}]</script>', 'st1'), []);
  assert.deepEqual(readBeats('<script type="application/json" id="st1-beats">[{"id":"b1","t0":0,"t1":4,"title":"T","note":"N"}]</script>', 'st1'),
    [{ id: 'b1', t0: 0, t1: 4, title: 'T', note: 'N' }]);
});
test('resolveWhere', () => {
  const hosts = [{ id: 's4', start: 20, dur: 4 }, { id: 'st1', start: 2, dur: 15 }];
  const beats = { st1: [{ id: 'b1', t0: 0, t1: 4 }, { id: 'b2', t0: 4, t1: 6 }, { id: 'b3', t0: 6, t1: 9 }] };
  assert.deepEqual(resolveWhere('st1 b1–b3', hosts, beats), [[2, 11]]);
  assert.deepEqual(resolveWhere('s4, st1 b2', hosts, beats), [[20, 24], [6, 8]]);
  assert.deepEqual(resolveWhere('st1 b1 - b2', hosts, beats), [[2, 8]]);
  assert.deepEqual(resolveWhere('st1 b1~b3', hosts, beats), [[2, 11]]);
  assert.deepEqual(resolveWhere('s9, st1 b7, 전체, st1 b3', hosts, beats), [[8, 11]]);
  assert.deepEqual(resolveWhere('', hosts, beats), []);
});
