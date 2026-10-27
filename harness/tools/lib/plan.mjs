// PLAN.md 효과 표·brief.md 효과 지정·장면 비트·사용 위치 해석 (gate·motion-qc·storyboard 가 사용하는 순수 파서)

const NUM = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
const SEP = '[–—~-]';
const EVIDENCE = new RegExp(`^(\\S+)\\s+${NUM}\\s*s?\\s*${SEP}\\s*${NUM}\\s*s?\\s*\\(\\s*([^()]*?)\\s*\\)$`);
const TIERS = { '①': 1, '②': 2, '③': 3, 1: 1, 2: 2, 3: 3 };

const isRow = l => l.trim().startsWith('|');
const cellsOf = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

function parseEvidence(cell) {
  const s = cell.replace(/\s+/g, ' ').trim();
  if (/^사용자 ?지정$/.test(s)) return { user: true };
  const m = EVIDENCE.exec(s);
  const raw = cell.trim() || '(비어 있음)';                        // invalid 는 항상 비어 있지 않은 문자열
  if (!m || !m[4]) return { invalid: raw };
  const t0 = parseFloat(m[2]), t1 = parseFloat(m[3]);
  if (!(t1 > t0)) return { invalid: raw };                        // 역순·길이 0 구간
  return { ref: m[1], t0, t1, img: m[4] };
}

function parseTier(cell) {
  const m = /^([①②③123])\s*(?:단계)?$/.exec(cell.trim());
  return m ? TIERS[m[1]] : null;
}

// "효과 표" 가 있는 표 밖의 줄 다음의 첫 마크다운 표(헤더·구분선 제외)를 행으로 읽는다. 없으면 [].
// 표 칸 안의 "효과 표"(예: DNA 칸 "(효과 표 참고)")는 제목이 아니다. 열이 헤더보다 많거나 첫 칸이 `#`·`효과 id` 인 행(붙어 있는 다음 표)에서 멈춘다.
// 열이 모자란 행은 사람이 칸을 빠뜨린 효과 행으로 보고 읽는다(근거 칸 invalid → 게이트가 보고).
export function parseEffectTable(md) {
  const lines = String(md).split(/\r?\n/);
  const h = lines.findIndex(l => !isRow(l) && l.includes('효과 표'));
  if (h < 0) return [];
  let i = h + 1;
  while (i < lines.length && !isRow(lines[i])) i++;
  const rows = [];
  let width = 0;
  for (; i < lines.length && isRow(lines[i]); i++) {
    const c = cellsOf(lines[i]);
    if (!width) { width = c.length; continue; }                   // 헤더 행
    if (c.length > width || /^(#|효과 ?id)$/i.test((c[0] || '').replace(/`/g, '').trim())) break;   // 다른 표가 붙어 있음
    if (c.every(x => /^:?-+:?$/.test(x))) continue;               // 구분선
    const id = (c[0] || '').replace(/`/g, '').trim();
    if (!id) continue;
    rows.push({ id, tier: parseTier(c[1] || ''), evidence: parseEvidence(c[2] || ''), where: c[3] || '', line: i + 1 });
  }
  return rows;
}

// brief.md 의 "## 효과 지정" 절 본문(다음 "## " 전까지)의 비어 있지 않은 줄을 "- " 제거 후 반환한다.
export function parseBriefEffects(md) {
  const lines = String(md).split(/\r?\n/);
  const s = lines.findIndex(l => /^##\s+효과 지정(?:[\s(]|$)/.test(l));
  if (s < 0) return [];
  const out = [];
  for (let i = s + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const t = lines[i].replace(/^[\s-]+/, '').trim();
    if (t && !/^\(.*\)$/.test(t)) out.push(t);                    // 템플릿 안내문 "(예: ...)" 제외
  }
  return out;
}

// 장면 파일의 <script type="application/json" id="<id>-beats"> JSON → 비트 배열. 없거나 깨졌으면 [].
export function readBeats(html, id) {
  const esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<script\\b[^>]*?(?:^|\\s)id=["']${esc}-beats["'][^>]*>([\\s\\S]*?)</script>`, 'i').exec(String(html));
  if (!m) return [];
  try {
    const a = JSON.parse(m[1]);
    if (!Array.isArray(a)) return [];
    return a.filter(b => b && typeof b.id === 'string' && Number.isFinite(b.t0) && Number.isFinite(b.t1))
      .map(b => ({ id: b.id, t0: b.t0, t1: b.t1, title: b.title ?? '', note: b.note ?? '' }));
  } catch { return []; }
}

// 사용 위치 문자열 → 전역 시간 구간들. "s4" 장면 전체, "st1 b2" 무대 st1 의 비트, "st1 b1–b3" 비트 범위. 해석 불가 토큰은 무시.
export function resolveWhere(where, hosts, beats) {
  const out = [];
  for (const part of String(where).split(',')) {
    const m = /^(\S+)(?:\s+(.+))?$/.exec(part.trim());
    const host = m && hosts.find(h => h.id === m[1]);
    if (!host) continue;
    if (!m[2]) { out.push([host.start, host.start + host.dur]); continue; }
    const bs = (beats && beats[host.id]) || [];
    const rest = m[2].trim();
    const find = id => bs.find(b => b.id === id.trim());
    let a = find(rest), b = a;                                    // 비트 id 자체에 '-' 가 있어도 단일 비트로 먼저 해석
    if (!a) {
      const p = rest.split(new RegExp(`\\s*${SEP}\\s*`));
      if (p.length === 2) { a = find(p[0]); b = find(p[1]); }
    }
    if (a && b) out.push([host.start + a.t0, host.start + b.t1]);
  }
  return out;
}
