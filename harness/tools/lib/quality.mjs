// 품질 계획 검사 (plan-check.mjs·make.mjs 가 사용하는 순수 함수)
//   checkPlan   : PLAN.md 의 소스 해부·동작·연기·전환 표 (GUIDE 3절)
//   checkReview : work/review/round-N.md 의 채점표 합격선 (GUIDE 6절)
import { parseTable, briefSection } from './plan.mjs';

export const QUALITY_MARK = '<!-- quality: 2.1 -->';   // 이 표시가 있는 brief 의 프로젝트만 계획 검사를 강제한다 (이전 프로젝트 호환)
export const KINDS = ['관절 기계', '캐릭터', '사람', '제품', '유연체', '장소', '화면', '로고', '기타'];
export const REBUILDS = ['다시 그리기', '레이어 분리', '3D', '사진 그대로', '미사용'];
export const PHOTO_REASONS = ['실사 매체', '실물 공개', '레이어 분리'];
export const ITEMS = ['스타일 일치', '소스 활용', '내용 전달', '움직임', '카메라·전환', '캐릭터·연기', '타이포', '사운드', '기술 품질', '효율'];
export const CORE = new Set(ITEMS.slice(0, 5));         // ★ 핵심 항목 = 5점
export const MIN_OTHER = 4.5;

const blank = s => !String(s ?? '').replace(/[—–\-\s]/g, '');
const norm = s => String(s ?? '').replace(/[★\s]/g, '');
// 화면 동작 칸이 라벨·자막·문구만으로 처리됐는가
const LABEL_ONLY = /^(라벨|자막|문구|글자|텍스트|태그|캡션)|(라벨|자막|문구|글자|텍스트|태그|캡션)\s*(으로|로)\s*만?\s*(표시|처리|설명|보여|안내)/;
const CUT_LIKE = /(하드\s*컷|페이드|^컷$|^컷\s|디졸브)/;

export const hasQualityMark = brief => String(brief).includes(QUALITY_MARK);

// md = PLAN.md, opt = { brief: brief.md 문자열, scenes: ['s1', …] (장면 id, 없으면 장면 대조 생략) }
// 반환 { errors: [{ table, line, msg }], warnings: [같은 형식] }
export function checkPlan(md, opt = {}) {
  const errors = [], warnings = [];
  const err = (table, line, msg) => errors.push({ table, line, msg });
  const warn = (table, line, msg) => warnings.push({ table, line, msg });
  const scenes = opt.scenes || null;
  const sceneOk = cell => !scenes || String(cell).split(/[\s,·/→]+/).some(tk => scenes.includes(tk));
  const need = (title, cols) => {
    const t = parseTable(md, title);
    if (!t.found) { err(title, 0, `'${title}' 이 없습니다 (GUIDE 3절 PLAN 틀)`); return null; }
    if (!t.rows.length) { err(title, 0, `'${title}' 에 행이 없습니다`); return null; }
    for (const r of t.rows) if (r.cells.length < cols) err(title, r.line, `칸이 ${cols}개여야 합니다 (지금 ${r.cells.length}개)`);
    return t.rows.filter(r => r.cells.length >= cols);
  };

  // 소스 해부 표: | 소스 | 종류 | 움직임 단위 | 재구성 | 예외 사유 |
  for (const { cells: [src, kind, units, rebuild, reason], line } of need('소스 해부 표', 5) || []) {
    const T = '소스 해부 표';
    if (blank(src)) err(T, line, '소스 칸이 비었습니다');
    if (!KINDS.some(k => kind.includes(k))) warn(T, line, `종류 '${kind}' — ${KINDS.join('/')} 중 하나로`);
    const rb = REBUILDS.find(k => rebuild.includes(k));
    if (!rb) { err(T, line, `재구성 '${rebuild}' — ${REBUILDS.join('/')} 중 하나`); continue; }
    if (rb !== '미사용' && rb !== '사진 그대로' && blank(units)) err(T, line, `움직임 단위가 비었습니다 — 소스를 부품·레이어로 나눠 적으세요`);
    if (rb === '사진 그대로' && !PHOTO_REASONS.some(k => reason.includes(k)))
      err(T, line, `사진 그대로는 예외 사유(${PHOTO_REASONS.join(' / ')})가 필요합니다 — 아니면 다시 그리기·레이어 분리로`);
  }

  // 동작 표: | 동사 | 주체 | 화면 동작 | 물리·연결 | 결과 | 장면 |
  const acts = need('동작 표', 6);
  for (const { cells, line } of acts || []) {
    const T = '동작 표', names = ['동사', '주체', '화면 동작', '물리·연결', '결과', '장면'];
    cells.slice(0, 6).forEach((c, k) => { if (blank(c)) err(T, line, `${names[k]} 칸이 비었습니다`); });
    if (LABEL_ONLY.test(cells[2].trim())) err(T, line, `화면 동작 '${cells[2]}' — 라벨·자막만으로는 안 됩니다. 주체가 직접 하는 동작을 적으세요`);
    if (!blank(cells[5]) && !sceneOk(cells[5])) warn(T, line, `장면 '${cells[5]}' 을 장면 목록에서 찾지 못했습니다`);
  }
  if (acts && opt.brief != null) {
    const msgs = briefSection(opt.brief, '전달할 내용');
    if (msgs.length > acts.length) warn('동작 표', 0, `브리프 "전달할 내용" ${msgs.length}줄인데 동작 표는 ${acts.length}행 — 동사가 빠지지 않았는지 확인`);
  }

  // 연기 표: | 레퍼런스 연기 | 우리 피사체 | 표현 | 장면 |
  for (const { cells, line } of need('연기 표', 4) || []) {
    const T = '연기 표';
    if (/해당\s*없음/.test(cells[0])) { if (blank(cells[2])) err(T, line, '해당 없음이면 표현 칸에 사유를 적으세요'); else warn(T, line, `연기 없음 — ${cells[2]}`); continue; }
    ['레퍼런스 연기', '우리 피사체', '표현', '장면'].forEach((n, k) => { if (blank(cells[k])) err(T, line, `${n} 칸이 비었습니다`); });
  }

  // 전환 표: | 경계 | 이어주는 요소 | 방식 | 근거 |
  const trs = need('전환 표', 4);
  if (trs) {
    const T = '전환 표', count = new Map();
    for (const { cells: [edge, link, how, ev], line } of trs) {
      if (blank(edge)) err(T, line, '경계 칸이 비었습니다');
      if (blank(link)) err(T, line, '이어주는 요소가 비었습니다 — 앞 장면의 무엇이 다음 장면의 무엇이 되는지');
      if (blank(how)) { err(T, line, '방식 칸이 비었습니다'); continue; }
      if (CUT_LIKE.test(how.trim()) && blank(ev)) err(T, line, `'${how}' 는 레퍼런스가 그럴 때만 — 근거 칸을 채우세요`);
      const k = norm(how); count.set(k, (count.get(k) || 0) + 1);
    }
    for (const [k, n] of count) if (n > 3) err(T, 0, `같은 전환 '${k}' 이 ${n}번 — 3번 이하로`);
    if (scenes && scenes.length > 1 && trs.length < scenes.length - 1) warn(T, 0, `장면 ${scenes.length}개인데 전환 표 ${trs.length}행 — 경계마다 한 행`);
  }
  return { errors, warnings };
}

// md = round-N.md. 반환 { errors: [문구], scores: { 항목: { score, base } } }
export function checkReview(md) {
  const t = parseTable(md, '채점표'), errors = [], scores = {};
  if (!t.found || !t.rows.length) return { errors: ['채점표가 없습니다 (GUIDE 6절 형식)'], scores };
  const col = name => t.header.findIndex(h => norm(h) === norm(name));
  const ci = col('항목'), cs = col('점수'), cb = col('기준선');
  if (ci < 0 || cs < 0) return { errors: ['채점표 머리에 "항목"·"점수" 칸이 필요합니다'], scores };
  for (const { cells } of t.rows) {
    const name = ITEMS.find(n => norm(n) === norm(cells[ci]));
    if (!name) continue;
    const num = s => { const m = /(\d+(?:\.\d+)?)/.exec(String(s ?? '')); return m ? +m[1] : null; };
    scores[name] = { score: num(cells[cs]), base: cb >= 0 ? num(cells[cb]) : null };
  }
  for (const n of ITEMS) {
    const s = scores[n];
    if (!s || s.score == null) { errors.push(`${n}: 점수가 없습니다`); continue; }
    const need = Math.max(CORE.has(n) ? 5 : MIN_OTHER, s.base != null ? Math.min(5, s.base + 1) : 0);
    if (s.score < need) errors.push(`${n}: ${s.score}점 < 합격선 ${need}${s.base != null ? ` (기준선 ${s.base})` : ''}`);
  }
  return { errors, scores };
}

// 파일 이름 목록 → 가장 큰 round-N.md (없으면 null)
export function latestRound(files) {
  let best = null, n = -1;
  for (const f of files) { const m = /^round-(\d+)\.md$/.exec(f); if (m && +m[1] > n) { n = +m[1]; best = f; } }
  return best;
}
