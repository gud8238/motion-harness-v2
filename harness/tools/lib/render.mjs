// 렌더 보조: 모션 블러(lens.mblur) — 4배 프레임으로 렌더한 뒤 4장씩 평균해 원래 fps 로 줄인다 (순수 함수, make.mjs 가 사용)
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
  const tag = /<[^>]*\bid=["']root["'][^>]*>/.exec(String(html ?? ''));
  const m = tag && /\bdata-fps=["']([\d.]+)["']/.exec(tag[0]);
  const n = m ? parseFloat(m[1]) : NaN;
  return n > 0 ? n : 30;
}
