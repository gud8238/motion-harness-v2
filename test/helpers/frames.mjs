// 감지기 테스트용 합성 프레임 생성기 (결정적, 시드 고정). Gray = Uint8Array(w·h), Rgb = Uint8Array(w·h·3), 행 우선.
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const rgbOf = hex => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// 바이리니어 샘플(가장자리 고정)
function sample(g, w, h, x, y) {
  x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1), fx = x - x0, fy = y - y0;
  const top = g[y0 * w + x0] * (1 - fx) + g[y0 * w + x1] * fx, bot = g[y1 * w + x0] * (1 - fx) + g[y1 * w + x1] * fx;
  return top * (1 - fy) + bot * fy;
}
// 출력 좌표 → 입력 좌표 역사상으로 다시 샘플
function remap(g, w, h, inv) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [sx, sy] = inv(x, y); o[y * w + x] = Math.round(sample(g, w, h, sx, sy)); }
  return o;
}
function boxBlur(src, w, h, r, horiz, vert) {
  let a = Float32Array.from(src);
  const pass = (dx, dy) => {
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[clamp(y + k * dy, 0, h - 1) * w + clamp(x + k * dx, 0, w - 1)];
      o[y * w + x] = s / (2 * r + 1);
    }
    a = o;
  };
  if (r > 0 && horiz) pass(1, 0);
  if (r > 0 && vert) pass(0, 1);
  return a;
}
const toU8 = f => Uint8Array.from(f, v => clamp(Math.round(v), 0, 255));

// 결정적 비주기 무늬: 여러 크기로 흐린 잡음의 합 + 무작위 사각형 가장자리
export function pattern(w, h, seed = 1) {
  const R = rng(seed), acc = new Float32Array(w * h);
  for (const [r, amp] of [[1, 0.5], [3, 1], [7, 1.6]]) {
    const n = boxBlur(Float32Array.from({ length: w * h }, () => R() - 0.5), w, h, r, true, true);
    let sd = 0; for (const v of n) sd += v * v; sd = Math.sqrt(sd / n.length) || 1;
    for (let i = 0; i < acc.length; i++) acc[i] += amp * n[i] / sd;
  }
  for (let k = 0; k < 14; k++) {
    const x0 = Math.floor(R() * w), y0 = Math.floor(R() * h), rw = 3 + Math.floor(R() * w / 5), rh = 3 + Math.floor(R() * h / 5), v = (R() - 0.5) * 2.4;
    for (let y = y0; y < Math.min(h, y0 + rh); y++) for (let x = x0; x < Math.min(w, x0 + rw); x++) acc[y * w + x] += v;
  }
  let lo = Infinity, hi = -Infinity; for (const v of acc) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return toU8(Array.from(acc, v => 20 + 215 * (v - lo) / (hi - lo || 1)));
}
// 내용을 (dx, dy) 만큼 이동
export const shift = (g, w, h, dx, dy) => remap(g, w, h, (x, y) => [x - dx, y - dy]);
// 화면 중심 기준 s 배 확대
export function zoom(g, w, h, s) { const cx = (w - 1) / 2, cy = (h - 1) / 2; return remap(g, w, h, (x, y) => [cx + (x - cx) / s, cy + (y - cy) / s]); }
// 화면 중심 기준 deg 도 회전 (y 아래 화면 좌표에서 + = 시계 방향)
export function rotate(g, w, h, deg) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2, t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return remap(g, w, h, (x, y) => { const u = x - cx, v = y - cy; return [cx + c * u + s * v, cy - s * u + c * v]; });
}
// rect=[x0,y0,x1,y1] 영역만 흐림. 'edges' = 가운데 띠(4×3 격자의 가운데 행 1~2열)만 선명하게 두고 나머지 흐림
export function blurRegion(g, w, h, rect, r) {
  const b = toU8(boxBlur(g, w, h, r, true, true)), o = Uint8Array.from(g);
  const inR = rect === 'edges'
    ? (() => { const x0 = Math.floor(w / 4), x1 = Math.floor(3 * w / 4), y0 = Math.floor(h / 3), y1 = Math.floor(2 * h / 3); return (x, y) => !(x >= x0 && x < x1 && y >= y0 && y < y1); })()
    : (x, y) => x >= rect[0] && x < rect[2] && y >= rect[1] && y < rect[3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inR(x, y)) o[y * w + x] = b[y * w + x];
  return o;
}
export const hBlur = (g, w, h, r) => toU8(boxBlur(g, w, h, r, true, false));
// hex 색이 화면의 ratio 만큼(래스터 순서 앞쪽) 차지하고 나머지는 무작위 색인 RGB
export function flood(w, h, hex, ratio, seed = 3) {
  const R = rng(seed), [r, g, b] = rgbOf(hex), n = Math.round(ratio * w * h), o = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const c = i < n ? [r, g, b] : [R() * 256, R() * 256, R() * 256];
    o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2];
  }
  return o;
}
// 행마다 [-amp, amp] 정수 가로 이동(가장자리 고정)
export function jitterRows(g, w, h, amp, seed = 2) {
  const R = rng(seed), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const s = Math.round((R() * 2 - 1) * amp); for (let x = 0; x < w; x++) o[y * w + x] = g[y * w + clamp(x - s, 0, w - 1)]; }
  return o;
}
const BG = [32, 34, 40];
function paint(w, h, hex, inside) {
  const c = rgbOf(hex), o = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = inside(x, y) ? c : BG, i = (y * w + x) * 3; o[i] = p[0]; o[i + 1] = p[1]; o[i + 2] = p[2]; }
  return o;
}
// 어두운 배경 위 원 (중심 cx,cy 반지름 r)
export const disk = (w, h, hex, cx, cy, r) => paint(w, h, hex, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
// 어두운 배경 위 사각형 (왼쪽 위 x,y, 너비 rw, 높이 rh)
export const rect = (w, h, hex, x, y, rw, rh) => paint(w, h, hex, (px, py) => px >= x && px < x + rw && py >= y && py < y + rh);
