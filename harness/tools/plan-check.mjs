// 계획 검사: PLAN.md 의 소스 해부·동작·연기·전환 표(GUIDE 3절)와, --review 면 최신 채점표의 합격선(GUIDE 6절)
//   node plan-check.mjs 모션1            → 표 검사. 오류가 있으면 종료 1
//   node plan-check.mjs 모션1 --review   → 표 검사 + work/review/round-N.md(가장 큰 N) 채점표 합격선
// brief.md 에 품질 표시(<!-- quality: 2.1 -->)가 없는 이전 프로젝트는 검사를 건너뛰고 알린다.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkPlan, checkReview, latestRound, hasQualityMark, QUALITY_MARK } from './lib/quality.mjs';
import { hosts } from './_common.mjs';

const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// 반환 { skipped, ok, plan: {errors,warnings}, review: {file, errors}|null }
export function runPlanCheck(projDir, { review = false } = {}) {
  const proj = path.resolve(projDir), work = path.join(proj, 'work');
  const brief = read(path.join(proj, 'brief.md')) ?? '';
  if (!hasQualityMark(brief)) return { skipped: true, ok: true, plan: { errors: [], warnings: [] }, review: null };
  const md = read(path.join(work, 'PLAN.md'));
  if (md == null) return { skipped: false, ok: false, plan: { errors: [{ table: 'PLAN.md', line: 0, msg: 'work/PLAN.md 가 없습니다' }], warnings: [] }, review: null };
  const idx = read(path.join(proj, 'scene', 'index.html'));
  const scenes = idx ? hosts(idx).filter(h => h.track !== 'captions').map(h => h.id) : null;
  const plan = checkPlan(md, { brief, scenes: scenes && scenes.length ? scenes : null });
  let rv = null;
  if (review) {
    const dir = path.join(work, 'review');
    const f = fs.existsSync(dir) ? latestRound(fs.readdirSync(dir)) : null;
    rv = f ? { file: `work/review/${f}`, ...checkReview(read(path.join(dir, f))) } : { file: null, errors: ['채점표가 없습니다 — work/review/round-1.md 부터 (GUIDE 2절 5·6절)'], scores: {} };
  }
  return { skipped: false, ok: plan.errors.length === 0 && (!rv || rv.errors.length === 0), plan, review: rv };
}

const at = x => `${x.table}${x.line ? `:${x.line}` : ''}`;
const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  const args = process.argv.slice(2), review = args.includes('--review');
  const dir = path.resolve(args.find(a => !a.startsWith('--')) || '.');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error('✖ 프로젝트 폴더를 찾을 수 없습니다: ' + dir); process.exit(2); }
  const r = runPlanCheck(dir, { review });
  if (r.skipped) { console.log(`· brief.md 에 품질 표시(${QUALITY_MARK})가 없는 이전 프로젝트 — 계획 검사를 건너뜁니다`); process.exit(0); }
  for (const w of r.plan.warnings) console.log(`⚠ ${at(w)} — ${w.msg}`);
  for (const e of r.plan.errors) console.log(`✖ ${at(e)} — ${e.msg}`);
  if (r.review) {
    for (const e of r.review.errors) console.log(`✖ 채점표${r.review.file ? ` (${r.review.file})` : ''} — ${e}`);
    if (!r.review.errors.length) console.log(`✔ 채점표 합격 (${r.review.file})`);
  }
  if (r.ok) { console.log(`✔ 계획 검사 통과${r.plan.warnings.length ? ` (경고 ${r.plan.warnings.length}개)` : ''}`); process.exit(0); }
  console.log('\nGUIDE 3절(PLAN 표)·6절(채점표)대로 고친 뒤 다시 실행하세요. 채점이 루프 상한을 넘겨도 미달이면 사용자에게 묻고, 받아들이면 make.mjs --accept "<사유>".');
  process.exit(1);
}
