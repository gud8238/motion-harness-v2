// 3단계 게이트: ② 스타일 효과는 레퍼런스 근거(효과 표)가 있어야 쓸 수 있다
//   node gate.mjs 모션1      → 위반 없으면 종료 0, 있으면 위반 목록과 해결책을 출력하고 종료 1
// 근거 = 효과 표의 "<ref> t0–t1s (<img>)" 와 work/ref-<ref>/<img> 파일, 또는 ③ 사용자 지정(brief.md "효과 지정"에 id·표현이 있을 때)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCatalog, findApiCalls } from './lib/catalog.mjs';
import { parseEffectTable, parseBriefEffects } from './lib/plan.mjs';

const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const inside = (base, p) => p.startsWith(base + path.sep);
const rel = (proj, f) => path.relative(proj, f).split(path.sep).join('/');

export function runGate(projDir) {
  const proj = path.resolve(projDir), work = path.join(proj, 'work');
  const catalog = loadCatalog(), byId = new Map(catalog.map(e => [e.id, e]));
  const rows = parseEffectTable(read(path.join(work, 'PLAN.md')));
  const brief = parseBriefEffects(read(path.join(proj, 'brief.md'))).join('\n').toLowerCase();
  const violations = [], warnings = [];

  // 행 하나의 근거 검사 → 위반 사유 또는 null
  const check = row => {
    const ev = row.evidence;
    if (row.tier == null || ev.invalid) return 'bad-evidence';
    if (ev.user) {
      const keys = [row.id, ...(byId.get(row.id).ko || [])].filter(Boolean).map(k => k.toLowerCase());   // 빈 문구는 모든 brief 와 일치하므로 제외
      return keys.some(k => brief.includes(k)) ? null : 'user-not-in-brief';
    }
    const base = path.resolve(work, 'ref-' + ev.ref), img = path.resolve(base, ev.img);
    if (!inside(work, base) || !inside(base, img)) return 'missing-image';        // .. 나 절대 경로로 폴더 밖을 가리키면 근거가 아니다
    try { return fs.statSync(img).isFile() ? null : 'missing-image'; } catch { return 'missing-image'; }
  };

  // 효과 표: ② 카탈로그 id 의 행은 장면에서 쓰지 않아도 검사한다 (lens.mblur 처럼 행만으로 켜지는 효과). ① 행·카탈로그에 없는 id 는 무시.
  const status = new Map();                                                       // row → 사유|null
  for (const row of rows) {
    const e = byId.get(row.id);
    if (!e) { warnings.push(`⚠ 효과 표의 '${row.id}' 는 카탈로그에 없는 id 라 검사하지 않습니다`); continue; }
    if (e.tier !== 2) continue;
    const reason = check(row);
    status.set(row, reason);
    if (reason && row.tier !== 1) violations.push({ id: row.id, file: 'work/PLAN.md', line: row.line, reason });
  }

  // 장면의 ② API 호출: 같은 api 를 공유하는 id 중 하나라도 근거가 있으면 통과
  const dir = path.join(proj, 'scene', 'compositions');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.html$/i.test(f)).sort() : [];
  for (const f of files) {
    const file = rel(proj, path.join(dir, f));
    for (const hit of findApiCalls(read(path.join(dir, f)), catalog)) {
      const mine = rows.filter(r => hit.ids.includes(r.id) && status.has(r));
      if (mine.some(r => status.get(r) === null)) continue;
      if (!mine.length) { violations.push({ id: hit.ids.join('/'), file, line: hit.line, reason: 'no-row' }); continue; }
      const open = mine.filter(r => r.tier === 1);                                // ② 행 위반은 이미 표에서 보고됨 — ① 로 적은 행만 여기서 보고
      if (open.length === mine.length) violations.push({ id: open[0].id, file, line: hit.line, reason: status.get(open[0]) });
    }
  }
  const count = new Set([...status].filter(([r, s]) => s === null && r.tier !== 1).map(([r]) => r.id)).size;
  return { ok: violations.length === 0, violations, warnings, count };
}

const WHY = { 'no-row': '효과 표에 이 효과의 행이 없음', 'bad-evidence': '근거 칸을 읽을 수 없음 (형식: <레퍼런스> 0–4.5s (ev_01.png)) 또는 단계 칸이 ①②③ 이 아님', 'missing-image': '근거 이미지 파일이 없음 (work/ref-<레퍼런스>/<이미지>)', 'user-not-in-brief': 'brief.md "효과 지정"에 이 효과가 없음' };

// 직접 실행일 때만 CLI 동작. Node 는 import.meta.url 을 realpath 로 주지만 argv[1] 은 심볼릭 링크 그대로라 둘 다 realpath 로 비교한다.
const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  const dir = path.resolve(process.argv[2] || '.');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error('✖ 프로젝트 폴더를 찾을 수 없습니다: ' + dir); process.exit(2); }
  const r = runGate(dir);
  for (const w of r.warnings) console.log(w);
  if (r.ok) { console.log(`✔ 게이트 통과 (② ${r.count}개)`); process.exit(0); }
  for (const v of r.violations) console.log(`✖ ${v.id} — ${v.file}:${v.line} — ${WHY[v.reason]}`);
  console.log(`\n② 스타일 효과는 레퍼런스 근거가 있어야 합니다. 아래 셋 중 하나로 해결하세요.
  1) 근거 추가: node harness/tools/analyze-ref.mjs strip 으로 해당 구간 이미지를 만들고, work/PLAN.md 효과 표에 "<레퍼런스> 0–4.5s (ev_01.png)" 를 적기
  2) 사용자 지정: 정말 넣고 싶은 효과면 brief.md 의 "효과 지정"에 효과 이름을 적고, 효과 표에 단계 ③ · 근거 "사용자 지정" 으로 적기
  3) 효과 제거: 장면에서 해당 효과 호출을 지우기`);
  process.exit(1);
}
