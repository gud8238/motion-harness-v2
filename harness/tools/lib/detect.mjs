// 레퍼런스·렌더 프레임 감지기 (순수 함수, 의존성 없음)
// 프레임: Gray = Uint8Array(w·h), Rgb = Uint8Array(w·h·3), 행 우선. 좌표는 화면 좌표(x 오른쪽, y 아래), 화소 중심 = 정수 좌표.
// 각도 규약: 도 단위, 0° = +x(오른쪽), 양수 = 화면에서 시계 방향(y 아래이므로 +y 쪽으로 도는 방향).
import { toLab, dE, hex as toHex } from '../_common.mjs';

const ID = () => ({ dx: 0, dy: 0, scale: 1, rot: 0, parallax: 0, res: 0, n: 0 });
const GX = 8, GY = 6, TEX = 2, RMAX = 12;   // 격자, 텍스처 판정(화소당 SAD 최소·최대 차), 탐색 반경 상한(px)

// 블록 하나의 ±M 정수 SAD 표 → 최소점 + 등각(V자) 보간 이동. 텍스처 없으면 null
function matchBlock(a, b, w, x0, y0, x1, y1, M) {
  const S = 2 * M + 1, sad = new Float64Array(S * S), n = (x1 - x0) * (y1 - y0);
  let mn = Infinity, mx = -Infinity, bi = 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const off = (j - M) * w + (i - M); let s = 0;
    for (let y = y0; y < y1; y++) { const r = y * w; for (let x = x0 + r, e = x1 + r; x < e; x++) { s += Math.abs(a[x] - b[x + off]); } }
    const k = j * S + i; sad[k] = s;
    if (s < mn || (s === mn && Math.abs(i - M) + Math.abs(j - M) < Math.abs(bi % S - M) + Math.abs((bi / S | 0) - M))) { mn = s; bi = k; }
    if (s > mx) mx = s;
  }
  if ((mx - mn) / n < TEX) return null;
  const bx = bi % S, by = bi / S | 0;
  // SAD 는 최소점 근처에서 V자 → 등각 보간 (l = −1, r = +1 쪽 SAD)
  const vfit = (l, c, r) => { const m = Math.max(l, r) - c; return m > 0 ? Math.max(-0.5, Math.min(0.5, (l - r) / (2 * m))) : 0; };
  const fx = bx > 0 && bx < S - 1 ? vfit(sad[bi - 1], mn, sad[bi + 1]) : 0;
  const fy = by > 0 && by < S - 1 ? vfit(sad[bi - S], mn, sad[bi + S]) : 0;
  return [bx - M + fx, by - M + fy];
}

// 유사 변환 최소제곱: X = A·u − B·v + tx, Y = B·u + A·v + ty (X,Y = 옮겨진 위치 − c), A = s·cosθ, B = s·sinθ — 무게중심 정리 후 닫힌 해
function fitSim(P) {
  let su = 0, sv = 0, sX = 0, sY = 0; const n = P.length;
  for (const p of P) { su += p.u; sv += p.v; sX += p.u + p.vx; sY += p.v + p.vy; }
  su /= n; sv /= n; sX /= n; sY /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (const p of P) { const u = p.u - su, v = p.v - sv, X = p.u + p.vx - sX, Y = p.v + p.vy - sY; num1 += u * X + v * Y; num2 += u * Y - v * X; den += u * u + v * v; }
  const A = den ? num1 / den : 1, B = den ? num2 / den : 0;
  return { A, B, tx: sX - A * su + B * sv, ty: sY - B * su - A * sv };
}
const resid = (p, f) => [p.u + p.vx - (f.A * p.u - f.B * p.v + f.tx), p.v + p.vy - (f.B * p.u + f.A * p.v + f.ty)];

// 전역 카메라 움직임: a 의 내용이 b 에서 p_b = s·R(rot)·(p_a − c) + c + (dx, dy) 로 옮겨졌다고 보고 적합 (c = 화면 중심).
// opts.range = 블록 탐색 반경 px (기본 6, 1~12 로 제한). 이보다 큰 프레임 간 이동은 약 range 로 포화된다.
// 적합: 전체 최소제곱 → 잔차 큰 25% 블록을 빼고 한 번 더 적합(자막·로고 같은 고정 요소 배제).
// parallax = 위 절반·아래 절반 블록 잔차 평균 이동 차의 크기(px), res = 블록 잔차 평균(px) — 둘 다 모든 유효 블록을 최종 적합에 대해 계산.
// n = 유효(텍스처 있는) 블록 수. n < 6 이면 측정 불가 → 항등 결과 + n: 0 (정지와 구분하려면 n 을 볼 것).
export function globalMotion(a, b, w, h, opts = {}) {
  const M = Math.max(1, Math.min(RMAX, Math.round(opts.range ?? 6)));
  const bw = Math.floor(w / GX), bh = Math.floor(h / GY), cx = (w - 1) / 2, cy = (h - 1) / 2, P = [];
  for (let r = 0; r < GY; r++) for (let c = 0; c < GX; c++) {
    const x0 = Math.max(c * bw, M), x1 = Math.min(c * bw + bw, w - M), y0 = Math.max(r * bh, M), y1 = Math.min(r * bh + bh, h - M);
    if (x1 - x0 < 4 || y1 - y0 < 3) continue;
    const v = matchBlock(a, b, w, x0, y0, x1, y1, M);
    if (v) P.push({ u: (x0 + x1 - 1) / 2 - cx, v: (y0 + y1 - 1) / 2 - cy, vx: v[0], vy: v[1], top: r < GY / 2 });
  }
  const n = P.length;
  if (n < 6) return ID();
  let f = fitSim(P);
  const keep = Math.max(6, Math.ceil(n * 0.75));
  if (keep < n) f = fitSim(P.map(p => [Math.hypot(...resid(p, f)), p]).sort((x, y) => x[0] - y[0]).slice(0, keep).map(x => x[1]));
  let res = 0; const half = { t: [0, 0, 0], b: [0, 0, 0] };
  for (const p of P) { const [ex, ey] = resid(p, f), q = p.top ? half.t : half.b; res += Math.hypot(ex, ey); q[0] += ex; q[1] += ey; q[2]++; }
  const parallax = half.t[2] && half.b[2] ? Math.hypot(half.t[0] / half.t[2] - half.b[0] / half.b[2], half.t[1] / half.t[2] - half.b[1] / half.b[2]) : 0;
  return { dx: f.tx, dy: f.ty, scale: Math.hypot(f.A, f.B), rot: Math.atan2(f.B, f.A) * 180 / Math.PI, parallax, res: res / n, n };
}

// 칸별 4-이웃 라플라시안 분산. 순서 = 행 우선(index = row·gx + col)
export function sharpness(g, w, h, grid = [4, 3]) {
  const [gx, gy] = grid, N = gx * gy, s1 = new Float64Array(N), s2 = new Float64Array(N), cnt = new Float64Array(N), out = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) {
    const row = Math.floor(y * gy / h) * gx;
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, L = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w], k = row + Math.floor(x * gx / w);
      s1[k] += L; s2[k] += L * L; cnt[k]++;
    }
  }
  for (let k = 0; k < N; k++) if (cnt[k]) { const m = s1[k] / cnt[k]; out[k] = Math.max(0, s2[k] / cnt[k] - m * m); }
  return out;
}

// 방향 흐림: 수평·수직·대각(↘ 45°, ↙ 135°) 화소당 그라디언트 에너지(대각은 거리² 로 나눔).
// ratio = (최대+1)/(최소+1) (+1 은 거의 평평한 화면에서 비가 튀지 않게), angle = 에너지가 가장 작은(번진) 방향.
export function directionalBlur(g, w, h) {
  const E = [0, 0, 0, 0], C = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = g[i];
    if (x + 1 < w) { const d = g[i + 1] - v; E[0] += d * d; C[0]++; }
    if (y + 1 < h) {
      const d = g[i + w] - v; E[1] += d * d; C[1]++;
      if (x + 1 < w) { const e = g[i + w + 1] - v; E[2] += e * e / 2; C[2]++; }
      if (x > 0) { const e = g[i + w - 1] - v; E[3] += e * e / 2; C[3]++; }
    }
  }
  const m = E.map((e, k) => C[k] ? e / C[k] : 0);
  let lo = 0, hi = 0; for (let k = 1; k < 4; k++) { if (m[k] < m[lo]) lo = k; if (m[k] > m[hi]) hi = k; }
  return { ratio: (m[hi] + 1) / (m[lo] + 1), angle: [0, 90, 45, 135][lo] };
}

// 채널마다 32단계 양자화 후 최빈 색의 화면 비율, hex = 그 칸 화소들의 평균색
export function fillRatio(rgb, w, h) {
  const n = w * h; if (!n) return { ratio: 0, hex: '#000000' };
  const cnt = new Uint32Array(32768); let best = 0;
  for (let i = 0; i < n; i++) { const k = (rgb[i * 3] >> 3) << 10 | (rgb[i * 3 + 1] >> 3) << 5 | rgb[i * 3 + 2] >> 3; if (++cnt[k] > cnt[best]) best = k; }
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < n; i++) if (((rgb[i * 3] >> 3) << 10 | (rgb[i * 3 + 1] >> 3) << 5 | rgb[i * 3 + 2] >> 3) === best) { r += rgb[i * 3]; gg += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; }
  const c = cnt[best];
  return { ratio: c / n, hex: toHex([r / c, gg / c, b / c]) };
}

// 인접 행 쌍마다 ±8px 가로 이동 중 평균 절대차 최소인 이동량 |s| 의 평균(px). 동률이면 작은 |s|, 텍스처 없는 쌍은 제외
export function rowJitter(g, w, h) {
  const R = 8; let sum = 0, cnt = 0;
  for (let y = 0; y + 1 < h; y++) {
    const r0 = y * w, r1 = r0 + w; let best = Infinity, bs = 0, worst = -Infinity;
    for (let k = 0; k <= 2 * R; k++) {
      const s = k & 1 ? (k + 1) >> 1 : -(k >> 1), xa = Math.max(0, -s), xb = Math.min(w, w - s);
      if (xb - xa < 1) continue;
      let d = 0; for (let x = xa; x < xb; x++) { const e = g[r0 + x] - g[r1 + x + s]; d += e < 0 ? -e : e; }
      d /= xb - xa;
      if (d < best) { best = d; bs = s; }
      if (d > worst) worst = d;
    }
    if (worst - best >= 1) { sum += Math.abs(bs); cnt++; }
  }
  return cnt ? sum / cnt : 0;
}

// 강조색 덩어리: 강조색과 Lab ΔE < 18 인 화소의 4-연결 성분 중 면적 ≥ 0.2%.
// area = 화면 대비 비율(0~1), cx·cy·bbox 는 px(bbox 는 끝 포함), sig[k] = 중심에서 k·22.5° 방향 가장 먼 성분 화소까지 거리 / 최대
export function accentBlobs(rgb, w, h, accents = []) {
  const n = w * h, out = []; if (!n || !accents.length) return out;
  const cache = new Map(), lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const key = rgb[i * 3] << 16 | rgb[i * 3 + 1] << 8 | rgb[i * 3 + 2];
    let L = cache.get(key); if (!L) { L = toLab([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]); cache.set(key, L); }
    lab[i * 3] = L[0]; lab[i * 3 + 1] = L[1]; lab[i * 3 + 2] = L[2];
  }
  const minArea = 0.002 * n, label = new Int32Array(n), stack = new Int32Array(n);
  for (const ah of accents) {
    const v = parseInt(String(ah).replace('#', ''), 16), A = toLab([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = dE(A, [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]]) < 18 ? 1 : 0;
    label.fill(0); let id = 0;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || label[s]) continue;
      id++; let top = 0, area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      stack[top++] = s; label[s] = id;
      while (top) {
        const p = stack[--top], x = p % w, y = (p - x) / w;
        area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[top++] = p - 1; }
        if (x + 1 < w && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[top++] = p + 1; }
        if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[top++] = p - w; }
        if (y + 1 < h && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[top++] = p + w; }
      }
      if (area < minArea) continue;
      const cx = sx / area, cy = sy / area, rMax = Math.hypot(x1 - x0 + 1, y1 - y0 + 1), sig = new Float32Array(16);
      for (let k = 0; k < 16; k++) {
        const t = k * Math.PI / 8, c = Math.cos(t), si = Math.sin(t);
        for (let d = 0; d <= rMax; d += 0.5) {
          const x = Math.round(cx + d * c), y = Math.round(cy + d * si);
          if (x >= 0 && x < w && y >= 0 && y < h && label[y * w + x] === id) sig[k] = d;
        }
      }
      let mx = 0; for (const d of sig) if (d > mx) mx = d;
      if (mx) for (let k = 0; k < 16; k++) sig[k] /= mx;
      out.push({ hex: ah, cx, cy, area: area / n, bbox: [x0, y0, x1, y1], sig });
    }
  }
  return out;
}

// 모양 서명 유사도: 16 순환 회전 중 (1 − 평균 절대차) 의 최대, 0~1
export function sigSimilarity(a, b) {
  const N = Math.min(a.length, b.length); if (!N) return 0;
  let best = 0;
  for (let r = 0; r < N; r++) { let d = 0; for (let k = 0; k < N; k++) d += Math.abs(a[k] - b[(k + r) % N]); best = Math.max(best, 1 - d / N); }
  return Math.max(0, Math.min(1, best));
}
