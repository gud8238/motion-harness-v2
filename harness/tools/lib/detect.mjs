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

// 행 y 와 y+1 의 ±8px 가로 이동 중 평균 절대차 최소인 이동량 |s| (동률이면 작은 |s|). 모든 이동을 같은 겹침 [8, w−8) 로 비교한다
// (겹침이 이동마다 다르면 끝 열 몇 개로 엉뚱한 |s| 가 이긴다). 두 행 모두 텍스처가 있어야 한다(가로 기울기 평균 ≥ ROWTEX) — 한쪽이 평평하면 null
const ROWTEX = 1;
function rowTex(g, w, y, a, b) { let s = 0; for (let x = a + 1; x < b; x++) { const e = g[y * w + x] - g[y * w + x - 1]; s += e < 0 ? -e : e; } return s / Math.max(1, b - a - 1); }
function rowShift(g, w, y) {
  const R = 8, r0 = y * w, r1 = r0 + w, xa = R, xb = w - R; let best = Infinity, bs = 0, worst = -Infinity;
  if (xb - xa < 2 || rowTex(g, w, y, xa, xb) < ROWTEX || rowTex(g, w, y + 1, xa - R, xb + R) < ROWTEX) return null;
  for (let k = 0; k <= 2 * R; k++) {
    const s = k & 1 ? (k + 1) >> 1 : -(k >> 1);
    let d = 0; for (let x = xa; x < xb; x++) { const e = g[r0 + x] - g[r1 + x + s]; d += e < 0 ? -e : e; }
    d /= xb - xa;
    if (d < best) { best = d; bs = s; }
    if (d > worst) worst = d;
  }
  return worst - best >= 1 ? Math.abs(bs) : null;
}
// 인접 행 쌍마다 rowShift 의 평균(px), 텍스처 없는 쌍은 제외. 텍스처 있는 쌍이 minRows 개 미만이면 0 (거의 빈 화면의 몇 줄로는 어긋남을 말할 수 없다)
export function rowJitter(g, w, h, { minRows = 1 } = {}) {
  let sum = 0, cnt = 0;
  for (let y = 0; y + 1 < h; y++) { const s = rowShift(g, w, y); if (s != null) { sum += s; cnt++; } }
  return cnt >= Math.max(1, minRows) ? sum / cnt : 0;
}

// VHS 트래킹 띠: 행 y−1→y 에서 같은 부호로 step 이상 바뀌는 열의 비율이 가장 큰 행 = 화면 전체를 가로지르는 가로 경계.
// cover = 그 비율(0~1), y = 그 행, jitter = y ±near 행 쌍 rowShift 평균(px, 텍스처 있는 쌍이 없으면 null — 평평한 바탕 위 선은 띠가 아니다)
export function trackingBand(g, w, h, { step = 6, near = 4 } = {}) {
  let cover = 0, by = 0;
  for (let y = 1; y < h; y++) {
    let p = 0, m = 0; const r = y * w;
    for (let x = 0; x < w; x++) { const d = g[r + x] - g[r - w + x]; if (d >= step) p++; else if (d <= -step) m++; }
    const c = Math.max(p, m) / w; if (c > cover) { cover = c; by = y; }
  }
  if (!cover) return { cover: 0, y: 0, jitter: null };
  let sum = 0, cnt = 0;
  for (let y = Math.max(0, by - near); y <= Math.min(h - 2, by + near); y++) { const s = rowShift(g, w, y); if (s != null) { sum += s; cnt++; } }
  return { cover, y: by, jitter: cnt ? sum / cnt : null };
}

// ── 반지름 스펙트럼 크기비 (Fourier–Mellin 의 크기 부분) ──
// 화면 전체의 확대·축소는 공간 주파수를 1/s 배로 옮긴다. 파워 스펙트럼은 이동에 무관하므로, 로그 반지름 축의 파워 분포를 서로 밀어 맞추면
// 블록 매칭이 못 따라가는 큰 확대·축소(평평한 화면 위 글자, 프레임당 10%↑)도 잰다. 내용이 바뀌거나 물체 하나만 커져도 같은 값이 나오므로 corr 와 함께 쓴다.
const RB = 40, RLO = 0.025, RHI = 0.4, RQ = Math.pow(RHI / RLO, 1 / (RB - 1));   // 칸 수, 반지름 범위(주기/px), 칸 간격(배)
function fft1(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= N; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), hl = len >> 1;
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < hl; j++) {
        const p = i + j, q = p + hl, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// 프레임 → 로그 반지름 RB 칸의 로그 파워(직선 추세를 뺀 값). 평평한 화면이면 0 배열
export function radialProfile(g, w, h) {
  const NX = 1 << Math.ceil(Math.log2(w)), NY = 1 << Math.ceil(Math.log2(h)), re = new Float64Array(NX * NY), im = new Float64Array(NX * NY);
  let m = 0; for (let i = 0; i < w * h; i++) m += g[i]; m /= w * h;
  for (let y = 0; y < h; y++) { const wy = 0.5 - 0.5 * Math.cos(2 * Math.PI * (y + 0.5) / h); for (let x = 0; x < w; x++) re[y * NX + x] = (g[y * w + x] - m) * wy * (0.5 - 0.5 * Math.cos(2 * Math.PI * (x + 0.5) / w)); }
  const rr = new Float64Array(NX), ri = new Float64Array(NX), cr = new Float64Array(NY), ci = new Float64Array(NY);
  for (let y = 0; y < h; y++) { rr.set(re.subarray(y * NX, y * NX + NX)); ri.fill(0); fft1(rr, ri); re.set(rr, y * NX); im.set(ri, y * NX); }   // 0 으로 채운 행은 변환해도 0
  const P = new Float64Array(RB), C = new Float64Array(RB);
  for (let x = 0; x < NX; x++) {
    for (let y = 0; y < NY; y++) { cr[y] = re[y * NX + x]; ci[y] = im[y * NX + x]; }
    fft1(cr, ci);
    const fx = (x < NX / 2 ? x : x - NX) / NX;
    for (let y = 0; y < NY; y++) {
      const fy = (y < NY / 2 ? y : y - NY) / NY, r = Math.hypot(fx, fy); if (r < RLO || r > RHI) continue;
      const b = Math.round(Math.log(r / RLO) / Math.log(RQ)); P[b] += cr[y] * cr[y] + ci[y] * ci[y]; C[b]++;
    }
  }
  if (!P.some(v => v > 1e-6)) return new Float64Array(RB);
  const L = Array.from(P, (p, i) => Math.log(p / Math.max(C[i], 1) + 1e-6)), xm = (RB - 1) / 2, my = L.reduce((a, b) => a + b, 0) / RB;
  let sxx = 0, sxy = 0; for (let i = 0; i < RB; i++) { sxx += (i - xm) ** 2; sxy += (i - xm) * (L[i] - my); }
  return Float64Array.from(L, (v, i) => v - my - sxy / sxx * (i - xm));
}
// 두 radialProfile 을 ±maxShift 칸 밀어 정규 상관이 가장 큰 곳(포물선 보간) → { scale(b 가 a 의 몇 배 크기), corr(−1~1) }
export function profileScale(pa, pb, maxShift = 10) {
  const N = Math.min(pa.length, pb.length), cs = new Map();
  for (let j = -maxShift; j <= maxShift; j++) {
    let s = 0, na = 0, nb = 0, c = 0;
    for (let u = 0; u < N; u++) { const v = u + j; if (v < 0 || v >= N) continue; s += pa[u] * pb[v]; na += pa[u] * pa[u]; nb += pb[v] * pb[v]; c++; }
    if (c > N / 2 && na > 1e-9 && nb > 1e-9) cs.set(j, s / Math.sqrt(na * nb));
  }
  if (!cs.size) return { scale: 1, corr: 0 };
  let bj = 0, best = -Infinity; for (const [j, r] of cs) if (r > best || (r === best && Math.abs(j) < Math.abs(bj))) { best = r; bj = j; }
  const l = cs.get(bj - 1), r = cs.get(bj + 1), den = l != null && r != null ? l - 2 * best + r : 0;
  const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (l - r) / (2 * den))) : 0;
  return { scale: +Math.pow(RQ, -(bj + off)).toFixed(4), corr: +best.toFixed(3) };
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
