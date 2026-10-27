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
test('reversed or zero-length range is invalid', () => {
  const ev = c => parseEffectTable(`효과 표\n| a | b | c | d |\n|---|---|---|---|\n| e | ② | ${c} | s1 |`)[0].evidence;
  assert.equal(ev('b 4.5-0 (x.png)').invalid, 'b 4.5-0 (x.png)');
  assert.equal(ev('b 3-3 (x.png)').invalid, 'b 3-3 (x.png)');
  assert.deepEqual(ev('b 3-3.5 (x.png)'), { ref: 'b', t0: 3, t1: 3.5, img: 'x.png' });
});
test('empty or missing evidence cell gives non-empty invalid', () => {
  const rows = parseEffectTable('효과 표\n| a | b | c | d |\n|---|---|---|---|\n| e | ② |  | s1 |\n| f | ② |');
  assert.equal(rows.length, 2);
  for (const r of rows) { assert.equal(typeof r.evidence.invalid, 'string'); assert.ok(r.evidence.invalid); }
});
test('brief heading with annotation, placeholder lines skipped', () => {
  const md = '## 효과 지정 (선택 — 레퍼런스에 없어도 넣고 싶은 효과)\n(예: VHS 화면, 화면 채움 전환)\n- VHS\n\n## 끝';
  assert.deepEqual(parseBriefEffects(md), ['VHS']);
  assert.deepEqual(parseBriefEffects('## 효과 지정\n- (예: x)\n- fx.vhs'), ['fx.vhs']);
  assert.deepEqual(parseBriefEffects('## 효과 지정자\n- x'), []);
});
test('readBeats ignores data-id', () => {
  assert.deepEqual(readBeats('<script type="application/json" data-id="st1-beats">[{"id":"b1","t0":0,"t1":4}]</script>', 'st1'), []);
  assert.deepEqual(readBeats('<script id="st1-beats" type="application/json">[{"id":"b1","t0":0,"t1":4}]</script>', 'st1').length, 1);
});
test('auto strip names with id and start time parse (dots, hyphens, underscores)', () => {
  const r = parseEffectTable('효과 표\n| a | b | c | d |\n|---|---|---|---|\n| trans.fill | ② | b_ref 6.67–7.67s (ev_trans-fill_6.67.png) | s1 |\n| cam.push | ② | b_ref 0.00–2.00s (ev_cam-push_0.00_2.png) | s1 |');
  assert.deepEqual(r[0].evidence, { ref: 'b_ref', t0: 6.67, t1: 7.67, img: 'ev_trans-fill_6.67.png' });
  assert.deepEqual(r[1].evidence, { ref: 'b_ref', t0: 0, t1: 2, img: 'ev_cam-push_0.00_2.png' });
});

test('"효과 표" inside a DNA cell does not hijack the effect table heading', () => {
  const md = `# 계획\n| # | 항목 | 레퍼런스 (근거) | 적용값 | 판정 |\n| 7 | 전환 | 채움 (효과 표 참고) | 채움 | 채택 |\n| 8 | 카메라 | 고정 | 고정 | 채택 |\n효과 표 (② 근거)\n| 효과 id | 단계 | 근거 | 사용 위치 |\n| trans.fill | ② | b 4.6–5.4s (ev.png) | s2 |\n`;
  const r = parseEffectTable(md);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'trans.fill');
});
test('a scene table directly after the effect table is not read', () => {
  const md = `효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| trans.fill | ② | b 4.6–5.4s (ev.png) | s2 |\n| # | 시간 | 종류 | 화면 | 소스 | DNA·시그니처 | 전환 | 효과음 | 문구 |\n| s2 | 4–8 | canvas | x | — | S1 | 컷 | tick | 글 |\n`;
  assert.deepEqual(parseEffectTable(md).map(r => r.id), ['trans.fill']);
  const same = `효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n| fx.vhs | ③ | 사용자 지정 | s4 |\n| # | a | b | c |\n| s1 | x | y | z |\n`;
  assert.deepEqual(parseEffectTable(same).map(r => r.id), ['fx.vhs']);
  const wider = `효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n| fx.vhs | ③ | 사용자 지정 | s4 |\n| s1 | 0–4 | dom | x | — | S1 |\n`;
  assert.deepEqual(parseEffectTable(wider).map(r => r.id), ['fx.vhs']);
  const second = `효과 표\n| 효과 id | 단계 | 근거 | 사용 위치 |\n| fx.vhs | ③ | 사용자 지정 | s4 |\n| 효과 id | 단계 | 근거 | 사용 위치 |\n| lens.dof | ② | b 1–2s (e.png) | s1 |\n`;
  assert.deepEqual(parseEffectTable(second).map(r => r.id), ['fx.vhs']);
});
