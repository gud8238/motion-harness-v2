// 모션 검수: 렌더한 우리 영상에 레퍼런스와 같은 감지기를 돌려, 효과 표의 ②·③ 효과가 계획한 자리에 실제로 나타나는지 확인한다
//   node motion-qc.mjs 모션1   → work/motion-qc.json, work/qc-motion.png (효과 행마다 위: 레퍼런스 근거 구간 6프레임, 아래: 우리 영상 같은 길이 6프레임)
// ✔ 계획한 자리에서 감지됨 · ✗ 감지 안 됨 · ? 감지기가 없거나 위치를 해석할 수 없음(눈으로 확인). ⚠ 계획에 없는 ② 효과, 딱딱한 움직임(등속·급정지).
// 프로젝트 폴더나 out/<폴더이름>.mp4 가 없을 때만 종료 2, 그 밖에는 항상 0 (make.mjs 가 경고로만 다룬다).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA, hosts, probe, chromium, board, writeJSON, readJSON } from './_common.mjs';
import { measureSeries, buildCandidates, stripImage, TH, vivid } from './lib/evidence.mjs';
import { parseEffectTable, readBeats, resolveWhere } from './lib/plan.mjs';
import { loadCatalog } from './lib/catalog.mjs';

// 딱딱한 움직임 문턱 (전역 움직임 gm, 1프레임 = 1/12초 걸음의 속력, 시계열 px)
export const STIFF = { linearSpeed: 2, linearDur: 0.5, linearCv: 0.05, stopFrom: 4, stopTo: 0.3 };
export const MIN_OVERLAP = 0.5, MIN_TOUCH = 0.05;   // 계획한 구간과 같은 id 후보가 이만큼(초) 겹쳐야 통과 · 짧은 후보·구간도 MIN_TOUCH 는 겹쳐야(길이 0 으로 닿기만 한 것 제외)
const EPS = 1e-6;

const catalogById = catalog => new Map((catalog || loadCatalog()).map(e => [e.id, e]));
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// 효과 행마다 { id, where, ok }: 같은 id 후보가 행의 구간 중 하나와 0.5초 이상 겹치면 true(구간이나 후보가 0.5초보다 짧으면 짧은 쪽이 완전히 겹칠 때), 없으면 false.
// 감지기가 없는 효과(detect null)·카탈로그에 없는 id·해석된 구간이 없는 행은 null (눈 확인).
// 맞닿거나 겹치는 구간 합치기 ('st1 b5, s2' = 12.2–14.5 + 14.5–21 → 12.2–21)
const mergeTouching = rs => {
  const out = [];
  for (const [a, b] of [...rs].sort((p, q) => p[0] - q[0])) { const l = out[out.length - 1]; if (l && a <= l[1] + EPS) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out;
};
// opts.cuts: 우리 영상의 컷 — trans.shared 는 컷이 TH.sharedCuts 개 미만이면 감지기가 돌지 않으므로 null.
export function qcCompare(rows, ranges, found, catalog, opts = {}) {
  const byId = catalogById(catalog);
  return rows.map(row => {
    const e = byId.get(row.id), rs = mergeTouching((ranges && ranges[row.where]) || []), base = { id: row.id, where: row.where };
    if (!e || !e.detect || !rs.length) return { ...base, ok: null };
    if (row.id === 'trans.shared' && opts.cuts && opts.cuts.length < TH.sharedCuts) return { ...base, ok: null, why: `컷 ${opts.cuts.length}개 — 감지에 ${TH.sharedCuts}개↑ 필요` };
    const same = found.filter(c => c.id === row.id);
    for (const [r0, r1] of rs) for (const c of same) if (overlap(c.t0, c.t1, r0, r1) >= Math.max(MIN_TOUCH, Math.min(MIN_OVERLAP, r1 - r0, c.t1 - c.t0)) - EPS) return { ...base, ok: true, at: [Math.max(c.t0, r0), Math.min(c.t1, r1)] };
    return { ...base, ok: false };
  });
}

// 우리 영상의 강조색 = scene/index.html 의 window.DNA 에 적힌 HEX 중 채도 높은 것(Lab C* ≥ accentChroma). 사용자 지정 색 캐릭터는 레퍼런스 강조색과 다르다
export function dnaAccents(html) {
  const m = /(?:^|[^\w$.])window\.DNA\s*=\s*\{([\s\S]*?)\}\s*;/.exec(String(html || '')); if (!m) return [];
  return [...new Set((m[1].match(/#[0-9a-fA-F]{6}\b/g) || []).map(h => h.toUpperCase()))].filter(vivid);
}

// 효과 표에 없는 ② 효과 후보 (표에는 단계와 상관없이 id 가 있으면 계획한 것으로 본다)
export function unplanned(found, rows, catalog) {
  const byId = catalogById(catalog), planned = new Set(rows.map(r => r.id));
  return found.filter(c => byId.get(c.id)?.tier === 2 && !planned.has(c.id));
}

// 딱딱한 움직임. 전역 움직임 gm(1프레임) 의 속력 hypot(dx, dy):
//   linear   = 속력 > 2px/프레임 이 ≥0.5초 이어지고 변동계수(표준편차/평균) < 0.05 — 이징 없는 등속
//   hardstop = 이전 프레임 속력 > 4px 인데 지금 < 0.3px — 감속 없이 멈춤
// opts.cuts: 컷(초) 을 지나는 걸음은 무시 (컷은 움직임이 아니다). 반환 구간은 [움직임 시작, 끝] 초.
export function stiffness(series, opts = {}) {
  const S = series || [], n = S.length, cuts = opts.cuts || [];
  if (n < 2) return [];
  const fps = (n - 1) / ((S[n - 1].t - S[0].t) || (n - 1) / TH.fps), half = 0.5 / fps;
  const sp = S.map((s, i) => {
    const m = s.gm;
    if (!m || m.n < TH.minBlocks || !Number.isFinite(m.dx) || !Number.isFinite(m.dy) || i + 1 >= n) return null;
    if (cuts.some(c => c > s.t - half && c <= S[i + 1].t + half)) return null;
    return Math.hypot(m.dx, m.dy);
  });
  const end = i => S[i + 1]?.t ?? S[i].t + 1 / fps, need = Math.max(2, Math.ceil(STIFF.linearDur * fps - EPS));
  const cv = (a, b) => {                                          // 걸음 a..b(포함) 의 변동계수
    let s = 0, s2 = 0; for (let i = a; i <= b; i++) { s += sp[i]; s2 += sp[i] * sp[i]; }
    const k = b - a + 1, mean = s / k;
    return Math.sqrt(Math.max(0, s2 / k - mean * mean)) / mean;
  };
  const out = [];
  for (let i = 0; i < n;) {                                       // 빠른 걸음의 연속 구간 안에서 변동이 작은 가장 긴 창
    if (!(sp[i] > STIFF.linearSpeed)) { i++; continue; }
    let e = i; while (e + 1 < n && sp[e + 1] > STIFF.linearSpeed) e++;
    for (let a = i; a + need - 1 <= e;) {
      if (cv(a, a + need - 1) >= STIFF.linearCv) { a++; continue; }
      let b = a + need - 1; while (b + 1 <= e && cv(a, b + 1) < STIFF.linearCv) b++;
      out.push({ kind: 'linear', t0: S[a].t, t1: end(b) });
      a = b + 1;
    }
    i = e + 1;
  }
  for (let k = 1; k < n; k++) if (sp[k - 1] > STIFF.stopFrom && sp[k] != null && sp[k] < STIFF.stopTo) out.push({ kind: 'hardstop', t0: S[k].t, t1: end(k) });
  return out.sort((a, b) => a.t0 - b.t0 || (a.kind < b.kind ? -1 : 1));
}

// ── CLI ──
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const fx = n => (+n).toFixed(2);
const inside = (base, p) => p.startsWith(base + path.sep);

// 레퍼런스 영상 경로: 효과 행 근거 {ref: 레퍼런스 이름} → work/ref-<이름>/evidence.json 의 ref (프로젝트 기준 상대 경로). 없으면 null.
function refVideo(proj, row) {
  const ev = row.evidence;
  if (!ev || ev.user || ev.invalid || !ev.ref) return null;
  const work = path.join(proj, 'work'), base = path.resolve(work, 'ref-' + ev.ref);
  if (!inside(work, base)) return null;
  const j = readJSON(path.join(base, 'evidence.json')), f = j?.ref ? path.resolve(proj, j.ref) : null;
  return f && fs.existsSync(f) ? f : null;
}

export async function runMotionQc(projDir, { log = console.log } = {}) {
  const proj = path.resolve(projDir), work = path.join(proj, 'work'), name = path.basename(proj);
  const video = path.join(proj, 'out', `${name}.mp4`);
  const P = probe(video), catalog = loadCatalog(), byId = catalogById(catalog);

  const idx = read(path.join(proj, 'scene', 'index.html'));
  const hs = hosts(idx).filter(h => h.track !== 'captions').sort((a, b) => a.start - b.start);
  const cuts = [...new Set(hs.map(h => h.start).filter(s => s > 0))];
  const beats = {};
  for (const h of hs.filter(x => x.kind === 'stage')) {
    const f = [h.src && path.join(proj, 'scene', h.src), path.join(proj, 'scene', 'compositions', h.id + '.html')].find(c => c && fs.existsSync(c) && fs.statSync(c).isFile());
    beats[h.id] = f ? readBeats(read(f), h.id) : [];
  }
  const accents = new Set(dnaAccents(idx));                      // 우리 DNA 색 + 레퍼런스 강조색
  for (const d of fs.existsSync(work) ? fs.readdirSync(work) : []) {
    if (!d.startsWith('ref-')) continue;
    for (const a of readJSON(path.join(work, d, 'analysis.json'))?.color?.accents || []) accents.add(a);
  }

  const rows = parseEffectTable(read(path.join(work, 'PLAN.md'))).filter(r => (r.tier === 2 || r.tier === 3) && byId.has(r.id));
  const ranges = {};
  for (const r of rows) ranges[r.where] = resolveWhere(r.where, hs, beats);

  const series = measureSeries(video, P, { cuts, accents: [...accents] });
  const found = buildCandidates(series, cuts, P.duration);
  const cmp = qcCompare(rows, ranges, found, catalog, { cuts });
  const result = {
    rows: cmp.map(c => ({ ...c, found: found.filter(f => f.id === c.id) })),
    unplanned: unplanned(found, parseEffectTable(read(path.join(work, 'PLAN.md'))), catalog),
    stiffness: stiffness(series, { cuts }),
  };
  writeJSON(path.join(work, 'motion-qc.json'), result);

  for (const r of result.rows) {
    const where = ranges[r.where]?.map(([a, b]) => `${fx(a)}–${fx(b)}s`).join(', ');
    if (r.ok === true) log(`✔ ${r.id} (${r.where}) — 계획한 자리에서 감지됨`);
    else if (r.ok === false) log(`✗ ${r.id} (${r.where} = ${where}) — 그 자리에서 감지되지 않음${r.found.length ? ' · 다른 자리: ' + r.found.map(f => `${fx(f.t0)}–${fx(f.t1)}s`).join(', ') : ''}`);
    else log(`? ${r.id} (${r.where}) — ${r.why || (byId.get(r.id).detect ? '사용 위치를 읽지 못해' : '감지기가 없어')} 눈으로 확인`);
  }
  if (!result.rows.length) log('· 검사할 효과 행(② ③ 단계)이 없습니다');
  for (const c of result.unplanned) log(`⚠ 계획에 없는 효과 ${c.id} ${fx(c.t0)}–${fx(c.t1)}s — ${c.signal}`);
  for (const s of result.stiffness) log(`⚠ 딱딱한 움직임 ${s.kind === 'linear' ? '(이징 없는 등속)' : '(감속 없이 멈춤)'} ${fx(s.t0)}–${fx(s.t1)}s`);

  await qcImage(proj, P, video, rows, ranges, result, log);
  return result;
}

// work/qc-motion.png — 행마다 한 칸: 위 = 레퍼런스 근거 구간 6프레임, 아래 = 우리 영상의 같은 길이 6프레임 (사용 위치의 처음부터)
async function qcImage(proj, P, video, rows, ranges, result, log) {
  const out = path.join(proj, 'work', 'qc-motion.png');
  if (!fs.existsSync(path.join(DATA, 'node_modules', 'playwright', 'index.mjs'))) { log('⚠ Chromium(playwright)이 없어 work/qc-motion.png 를 만들지 않았습니다 (setup.mjs 로 설치)'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-qcm-')), portrait = P.width < P.height;
  let browser;
  try {
    browser = await chromium();
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], r = result.rows[i], ev = row.evidence, pair = [];
      const label = `${r.ok === true ? '✔' : r.ok === false ? '✗' : '?'} ${row.id} · ${row.where}`;
      const ref = refVideo(proj, row);
      if (ref) {
        const f = path.join(tmp, `ref${i}.png`);
        await stripImage(ref, probe(ref), ev.t0, ev.t1, f, { browser });
        pair.push({ img: f, cap: `레퍼런스 ${ev.ref} ${fx(ev.t0)}–${fx(ev.t1)}s` });
      }
      const rg = ranges[row.where]?.[0];
      if (rg) {
        const len = ref ? ev.t1 - ev.t0 : rg[1] - rg[0], f = path.join(tmp, `our${i}.png`);
        // 감지된 자리가 있으면 그 가운데를 중심으로 같은 길이, 없으면 사용 위치 처음부터
        const s0 = r.at ? Math.max(0, Math.min(P.duration - len, (r.at[0] + r.at[1]) / 2 - len / 2)) : rg[0], t1 = r.at ? Math.min(P.duration, s0 + len) : Math.min(rg[1], rg[0] + len);
        await stripImage(video, P, s0, t1, f, { browser });
        pair.push({ img: f, cap: `우리 영상 ${fx(s0)}–${fx(t1)}s${r.at ? ' (감지된 자리)' : ''}` });
      }
      items.push(pair.length ? { pair, stack: true, label, sub: ev?.user ? '사용자 지정(③) — 레퍼런스 없음' : '' } : { label, sub: '보여줄 프레임이 없습니다 (사용 위치를 읽지 못했고 레퍼런스 근거 영상도 없음)' });
    }
    if (!items.length) items.push({ label: '검사할 효과 행이 없습니다' });
    await board(items, out, { cols: 1, cellW: portrait ? 860 : 1340, browser, title: `${path.basename(proj)} — 모션 검수`, note: '효과 행마다 위: 레퍼런스 근거 구간, 아래: 우리 영상 (6프레임씩)' });
  } catch (e) { log('⚠ work/qc-motion.png 를 만들지 못했습니다: ' + e.message); }
  finally { if (browser) await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  const dir = path.resolve(process.argv[2] || '.');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error('✖ 프로젝트 폴더를 찾을 수 없습니다: ' + dir); process.exit(2); }
  const video = path.join(dir, 'out', `${path.basename(dir)}.mp4`);
  if (!fs.existsSync(video)) { console.error(`✖ 렌더한 영상이 없습니다: ${video} — 먼저 make.mjs 로 렌더하세요`); process.exit(2); }
  try { await runMotionQc(dir); }
  catch (e) { console.error('⚠ 모션 검수를 끝까지 하지 못했습니다: ' + e.message); }
  process.exit(0);
}
