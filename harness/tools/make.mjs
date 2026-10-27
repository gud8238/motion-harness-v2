// 제작: 오디오 믹스 → HyperFrames 검사 → 렌더 → 검수(시트·검은 화면·빈 화면·LUFS·포스터·자막)
//   node make.mjs .                → (지금 연 폴더가 프로젝트) out/<폴더이름>.mp4
//   node make.mjs 모션1            → out/모션1.mp4, out/poster.jpg, (자막 있으면) out/모션1.srt, work/qc.jpg, work/render.json
//   node make.mjs 모션1 --draft    → out/draft.mp4 (빠른 확인용, 15fps 저화질)
//   node make.mjs 모션1 --check    → 검사 + 게이트만 (렌더 안 함)
// 모션 검수: 렌더 뒤 같은 감지기를 우리 영상에 돌려 효과 표의 효과가 계획한 자리에 나타나는지 확인 (work/motion-qc.json, work/qc-motion.png, --draft 는 생략, 실패해도 빌드는 유지)
// 게이트: 장면이 ② 스타일 효과를 쓰는데 효과 표에 레퍼런스 근거가 없으면 렌더 전에 멈춘다 (gate.mjs)
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { projectDir, parseArgs, die, hf, hfJSON, hosts, ffmpeg, run, rawFrames, writeJSON, readJSON, HARNESS, ROOT } from './_common.mjs';

const { pos, opt } = parseArgs();
const proj = projectDir(pos[0]), name = path.basename(proj);
const sceneDir = path.join(proj, 'scene'), work = path.join(proj, 'work'), outDir = path.join(proj, 'out');
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

// 0) source → scene/assets/source 동기화 (바뀐 파일만)
fs.mkdirSync(path.join(sceneDir, 'assets', 'source'), { recursive: true });
for (const f of fs.existsSync(path.join(proj, 'source')) ? fs.readdirSync(path.join(proj, 'source')) : []) {
  const s = path.join(proj, 'source', f), d = path.join(sceneDir, 'assets', 'source', f);
  if (fs.statSync(s).isFile() && (!fs.existsSync(d) || fs.statSync(d).mtimeMs < fs.statSync(s).mtimeMs)) fs.copyFileSync(s, d);
}

// 1) 오디오
if (!opt['skip-audio'] && (fs.existsSync(path.join(work, 'sound.json')) || fs.existsSync(path.join(work, 'narration.timing.json')))) {
  const r = spawnSync(process.execPath, [path.join(HARNESS, 'tools', 'audio.mjs'), proj], { stdio: 'inherit' });
  if (r.status !== 0) die('오디오 믹스 실패');
} else if (!opt['skip-audio']) console.log('· work/sound.json 이 없어 소리 없이 렌더합니다');

// 2) 검사
console.log('검사 중…');
const chk = hfJSON(['check', sceneDir]);
const findings = Object.entries(chk).filter(([, v]) => v && typeof v === 'object' && Array.isArray(v.findings)).flatMap(([k, v]) => v.findings.map(f => ({ area: k, ...f })))
  .filter(f => !(f.code === 'console_warning' && /deprecated with r150|GPU stall|GL Driver/.test(f.message)));
const errors = findings.filter(f => f.severity === 'error'), warns = findings.filter(f => f.severity === 'warning');
for (const f of [...errors, ...warns].slice(0, 20)) console.log(`  ${f.severity === 'error' ? '✖' : '⚠'} [${f.area}] ${f.code}: ${String(f.message).slice(0, 220)}${f.fixHint ? '\n      → ' + String(f.fixHint).slice(0, 200) : ''}`);
writeJSON(path.join(work, 'check.json'), { ok: chk.ok, errors, warnings: warns });
if (errors.length) die(`검사 오류 ${errors.length}개 — 고친 뒤 다시 실행 (work/check.json)`);
console.log(`  검사 통과 (경고 ${warns.length}개) ${sec()}`);

// 2b) 게이트: ② 스타일 효과는 레퍼런스 근거 필수 (--check 에서도 검사)
const gate = spawnSync(process.execPath, [path.join(HARNESS, 'tools', 'gate.mjs'), proj], { stdio: 'inherit' });
if (gate.status !== 0) die('게이트 위반 — 위 안내대로 고친 뒤 다시 실행');
if (opt.check) process.exit(0);

// 3) 렌더
const draft = !!opt.draft, final = path.join(outDir, draft ? 'draft.mp4' : `${name}.mp4`);
console.log(`렌더 중… (${draft ? '초안 15fps' : '최종'})`);
const args = ['render', sceneDir, '-o', final, '--quiet', ...(draft ? ['--quality', 'draft', '--fps', '15'] : ['--quality', 'looks'])];
const r = hf(args);   // 로그는 Claude 가 읽지 않도록 숨기고, 실패할 때만 끝부분을 보여준다
if (r.status !== 0 || !fs.existsSync(final)) { console.error(String((r.stderr || '') + (r.stdout || '')).split('\n').filter(l => !/GPU stall|GL Driver|deprecated with r150/.test(l)).slice(-25).join('\n')); die('렌더 실패 (위 로그)'); }
console.log(`  렌더 완료 ${sec()}`);

// 4) 검수
const idx = fs.readFileSync(path.join(sceneDir, 'index.html'), 'utf8');
const sc = hosts(idx).filter(h => h.track !== 'captions').sort((a, b) => a.start - b.start);
const pr = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate,codec_type', '-show_entries', 'format=duration', '-of', 'json', final]).stdout);
const v = pr.streams.find(s => s.codec_type === 'video'), dur = +pr.format.duration, W = v.width, H = v.height;
const cols = W >= H ? 6 : 8, rows = Math.ceil(Math.ceil(dur) / cols), qc = path.join(work, draft ? 'qc_draft.jpg' : 'qc.jpg');
ffmpeg(['-i', final, '-vf', `fps=1,scale=${W >= H ? 320 : 180}:-2,tile=${cols}x${rows}:padding=4:color=0x16181c`, '-frames:v', '1', '-q:v', '3', qc]);
const bd = ffmpeg(['-i', final, '-vf', 'blackdetect=d=0.15:pix_th=0.06', '-an', '-f', 'null', '-'], { loglevel: 'info', allowFail: true });
const blacks = [...(bd.stderr || '').matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => [+m[1], +m[2]]);
let lufs = null;
if (pr.streams.some(s => s.codec_type === 'audio')) { const ld = ffmpeg(['-i', final, '-af', 'ebur128', '-f', 'null', '-'], { loglevel: 'info', allowFail: true }); const m = [...(ld.stderr || '').matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop(); lufs = m ? +m[1] : null; }
// 내용이 거의 없는 구간 (0.25초 간격, 밝기 분산이 영상 중앙값의 25% 미만)
const gw = 64, gh = Math.max(2, Math.round(64 * H / W / 2) * 2), gray = rawFrames(final, { w: gw, h: gh, fps: 4, gray: true }), fsz = gw * gh, sds = [], flat = [];
for (let i = 0; i < Math.floor(gray.length / fsz); i++) { let s = 0, s2 = 0; for (let j = 0; j < fsz; j++) { const x = gray[i * fsz + j]; s += x; s2 += x * x; } sds.push(Math.sqrt(Math.max(0, s2 / fsz - (s / fsz) ** 2))); }
const med = [...sds].sort((a, b) => a - b)[Math.floor(sds.length / 2)] || 0, lim = Math.min(8, med * 0.25);
sds.forEach((sd, i) => { if (sd < lim) { const t = i / 4, last = flat[flat.length - 1]; if (last && t - last[1] <= 0.26) last[1] = t; else flat.push([t, t]); } });
flat.forEach(x => { x[1] = +(x[1] + 0.25).toFixed(2); });
if (!draft) {
  const mid = sc[Math.floor(sc.length / 2)], pt = mid ? mid.start + (mid.key != null && !isNaN(+mid.key) ? +mid.key : mid.dur * 0.6) : dur / 2;
  ffmpeg(['-ss', String(Math.min(pt, dur - 0.05)), '-i', final, '-frames:v', '1', '-q:v', '2', path.join(outDir, 'poster.jpg')]);
  const nt = readJSON(path.join(work, 'narration.timing.json'));
  if (nt?.lines?.length) {
    const ts = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
    fs.writeFileSync(path.join(outDir, `${name}.srt`), nt.lines.map((l, i) => `${i + 1}\n${ts(l.t0)} --> ${ts(Math.max(l.t1 + 0.4, l.t0 + 1.5))}\n${l.sub ?? l.text}\n`).join('\n'));
  }
}
const report = { file: path.relative(proj, final), seconds: +dur.toFixed(2), size: `${W}x${H}`, fps: v.r_frame_rate, totalSec: Math.round((Date.now() - t0) / 1000), lufs, blackFrames: blacks, emptyRanges: flat, checkWarnings: warns.length, qcSheet: path.relative(proj, qc) };
writeJSON(path.join(work, draft ? 'render_draft.json' : 'render.json'), report);
console.log('✔ 완료 ' + JSON.stringify(report));
if (blacks.length) console.warn('⚠ 검은 화면:', blacks.map(b => b.join('–')).join(', '));
if (flat.length) console.warn('⚠ 내용이 거의 없는 구간(초):', flat.map(x => x.join('–')).join(', '), '— 의도한 여백이 아니면 board.mjs --times 로 확인');
if (lufs != null && Math.abs(lufs + 14) > 2) console.warn(`⚠ 음량 ${lufs} LUFS (목표 −14)`);
// 5) 모션 검수 (효과가 계획한 자리에 있는지 · 계획에 없는 ② 효과 · 딱딱한 움직임). 실패해도 렌더 결과는 그대로 둔다
if (!draft) {
  const mq = spawnSync(process.execPath, [path.join(HARNESS, 'tools', 'motion-qc.mjs'), proj], { stdio: 'inherit' });
  if (mq.status !== 0) console.warn('⚠ 모션 검수를 실행하지 못했습니다 (렌더 결과에는 영향 없음)');
}
