// 렌더 보조 (순수 함수, make.mjs 가 사용): 모션 블러(lens.mblur) — 4배 프레임으로 렌더한 뒤 4장씩 평균해 원래 fps 로 줄인다 · hyperframes check 결과 정리
import { parseEffectTable } from './plan.mjs';

const SUB = 4;                                                    // 한 프레임당 하위 프레임 수

// 효과 표에 lens.mblur ② 또는 ③ 행이 있으면 true (근거 검증은 게이트가 이미 끝냈다)
export function wantsMotionBlur(planMd) {
  return parseEffectTable(planMd ?? '').some(r => r.id === 'lens.mblur' && (r.tier === 2 || r.tier === 3));
}

export function mblurArgs(base) {
  return { fps: base * SUB, vf: `tmix=frames=${SUB},fps=${base}` };
}

// 임시 mp4 → 최종 mp4 ffmpeg 인자 (소리는 그대로, 영상은 H.264 로 다시 인코딩)
export function mblurMixArgs(tmp, final, base) {
  return ['-i', tmp, '-vf', mblurArgs(base).vf, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'copy', final];
}

// scene/index.html 의 #root data-fps (없거나 이상하면 30)
export function rootFps(html) {
  const tag = /<[^>]*(?<![\w-])id=["']root["'][^>]*>/.exec(String(html ?? ''));
  const m = tag && /\bdata-fps=["']([\d.]+)["']/.exec(tag[0]);
  const n = m ? parseFloat(m[1]) : NaN;
  return n > 0 ? n : 30;
}

// hyperframes check --json → 보고할 findings [{area, ...}]. 알려진 소음(three r150 경고·GPU 로그)과
// trans.fill 오버레이(id mh-fill-…)가 덮은 글자(text_occluded)는 뺀다 — 화면 채움은 일부러 모든 것을 가린다
export function checkFindings(chk) {
  return Object.entries(chk ?? {}).filter(([, v]) => v && typeof v === 'object' && Array.isArray(v.findings)).flatMap(([k, v]) => v.findings.map(f => ({ area: k, ...f })))
    .filter(f => !(f.code === 'console_warning' && /deprecated with r150|GPU stall|GL Driver/.test(f.message)))
    .filter(f => !(f.code === 'text_occluded' && /^#mh-fill-/.test(f.containerSelector || '')));
}
