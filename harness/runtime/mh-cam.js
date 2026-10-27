/* MH.cam / MH.trans2d — 2D 가상 카메라와 연결 전환 (클래식 스크립트, mh.js 다음에 불러온다 → window.MH.cam · window.MH.trans2d)
 * 카메라 상태 {x, y, zoom, rot}: x,y = 화면 중심에 오는 월드 점, rot = 도(°, 월드가 시계방향으로 도는 각). 기본 = {x:W/2, y:H/2, zoom:1, rot:0} (항등).
 * 깊이 d 레이어: 중심 c_d = C + (xy − C)·d, 배율 k = 1 + (zoom − 1)·d, 회전 rot·d, 화면 = R(rot·d)·(p − c_d)·k + C  (C = 화면 중심).
 *   d=0 화면 고정 · d=1 월드(카메라 그대로) · d>1 전경. 모든 값은 장면 로컬 시간 t 의 순수 함수.
 * 렌더: cam.render(t) 가 등록 레이어(cam.layers)에 style.transform = matrix(…) · transformOrigin = '0 0' 을 쓴다. */
(function () {
'use strict';
const MH = window.MH;
if (!MH) throw new Error('mh-cam.js 는 mh.js 다음에 불러와야 합니다.');
const { clamp, lerp, E, noise } = MH;

const PROPS = ['x', 'y', 'zoom', 'rot'];
const FADE = 0.1;                                       // 흔들림 페이드 인·아웃(초)
const nz = v => v + 0;                                  // -0 → 0
const fmt = v => String(nz(+v.toFixed(5)));
const easeOf = e => {
  if (typeof e === 'function') return e;
  if (e === 'dna' || e == null) return (window.DNA && window.DNA.easeFn) || E.inOut;
  return E[e] || E.inOut;
};

function cam(worldEl, o = {}) {
  const dna = (typeof window !== 'undefined' && window.DNA) || {};
  const W = o.W ?? dna.W ?? 1920, H = o.H ?? dna.H ?? 1080, CX = W / 2, CY = H / 2;
  const keys = [], shakes = [], layers = [];
  let tracks = null;                                    // 키 접기 결과 (키가 바뀌면 다시 만든다)

  // 키 → 속성별 구간 목록. (t, 삽입 순)으로 접어, 각 구간의 from 은 '앞선 키들이 만든 그 시각의 값'.
  const build = () => {
    const sorted = keys.map((k, i) => [k, i]).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(p => p[0]);
    tracks = { x: [], y: [], zoom: [], rot: [] };
    for (const k of sorted) for (const p of PROPS) if (k.props[p] != null) {
      tracks[p].push({ t0: k.t, dur: k.dur, ease: k.ease, from: evalTrack(p, k.t), to: k.props[p] });
    }
  };
  const dflt = { x: CX, y: CY, zoom: 1, rot: 0 };
  const evalTrack = (p, t) => {
    const segs = tracks[p]; let s = null;
    for (const g of segs) if (g.t0 <= t) s = g; else break;      // 정렬돼 있으므로 t0 ≤ t 인 마지막 구간
    if (!s) return dflt[p];
    if (s.dur <= 0 || t >= s.t0 + s.dur) return s.to;
    return lerp(s.from, s.to, easeOf(s.ease)((t - s.t0) / s.dur));
  };
  const base = t => { if (!tracks) build(); return { x: evalTrack('x', t), y: evalTrack('y', t), zoom: evalTrack('zoom', t), rot: evalTrack('rot', t) }; };

  const shakeAt = t => {
    let dx = 0, dy = 0;
    for (const s of shakes) {
      if (t < s.t0 || t > s.t1) continue;
      const env = E.smooth(Math.min((t - s.t0) / FADE, (s.t1 - t) / FADE, 1)), ph = s.hz * (t - s.t0), a = s.amp * W * env;
      dx += a * noise(ph + s.sx); dy += a * noise(ph + s.sy);
    }
    return [dx, dy];
  };
  const state = t => { const b = base(t), [dx, dy] = shakeAt(t); b.x += dx; b.y += dy; return b; };

  // 깊이 d 의 변환: matrix = [a,b,c,d,e,f]  (screen = [a c; b d]·p + [e f])
  const params = (t, d) => {
    const s = state(t), k = Math.max(1e-3, 1 + (s.zoom - 1) * d), th = s.rot * d * Math.PI / 180;
    return { cx: CX + (s.x - CX) * d, cy: CY + (s.y - CY) * d, k, th };
  };
  const matrix = (t, d = 1) => {
    const { cx, cy, k, th } = params(t, d), a = k * Math.cos(th), b = k * Math.sin(th);
    return [a, b, -b, a, CX - (a * cx - b * cy), CY - (b * cx + a * cy)].map(nz);
  };
  const toScreen = (t, [wx, wy], d = 1) => {
    const { cx, cy, k, th } = params(t, d), c = Math.cos(th), s = Math.sin(th), px = (wx - cx) * k, py = (wy - cy) * k;
    return [nz(c * px - s * py + CX), nz(s * px + c * py + CY)];
  };
  const toWorld = (t, [sx, sy], d = 1) => {
    const { cx, cy, k, th } = params(t, d), c = Math.cos(th), s = Math.sin(th), qx = sx - CX, qy = sy - CY;
    return [nz(cx + (c * qx + s * qy) / k), nz(cy + (-s * qx + c * qy) / k)];
  };

  const self = {
    W, H, layers,
    // key(t, {x?,y?,zoom?,rot?}, {dur=0, ease='dna'}) — 준 속성만 t 에서 dur 동안 (그 시각의 값 → 새 값). dur 0 = 컷
    key(t, props = {}, { dur = 0, ease = 'dna' } = {}) {
      const p = {}; for (const n of PROPS) if (props[n] != null) p[n] = props[n];
      keys.push({ t, props: p, dur: Math.max(0, dur), ease }); tracks = null; return self;
    },
    // shake(t0, t1, amp, hz) — amp = 화면 너비 비율, hz = 흔들리는 속도. 양 끝 0.1초 페이드
    shake(t0, t1, amp, hz) { shakes.push({ t0, t1, amp, hz, sx: 17.3 + shakes.length * 31.7, sy: 91.9 + shakes.length * 13.1 }); return self; },
    layer(el, depth = 1) { layers.push({ el, depth }); return self; },
    base, state, matrix, toScreen, toWorld,
    render(t) {
      for (const l of layers) { l.el.style.transform = `matrix(${matrix(t, l.depth).map(fmt).join(',')})`; l.el.style.transformOrigin = '0 0'; }
      return self;
    },
  };
  if (worldEl) layers.push({ el: worldEl, depth: 1 });
  return self;
}

// ───────────── 전환: 카메라·도형·위치 이어 붙이기 ─────────────
const rectOf = r => (Array.isArray(r) ? r : [r.x ?? r.left, r.y ?? r.top, r.w ?? r.width, r.h ?? r.height]);
const _fills = new WeakMap();                           // el → { [t0]: 오버레이 }
const trans2d = {
  // fill(t, el, {t0, dur=0.8, color}) — el 의 중심에서 시작한 원이 화면 전체를 덮는다. el 의 형제로 오버레이를 1회 만들어 clip-path 만 쓴다. 반환: 진행도 0..1(선형)
  fill(t, el, { t0 = 0, dur = 0.8, color = '#000' } = {}) {
    let byT = _fills.get(el); if (!byT) _fills.set(el, byT = {});
    const parent = el.parentNode;
    let ov = byT[t0];
    if (!ov) {
      ov = byT[t0] = document.createElement('div');
      Object.assign(ov.style, { position: 'absolute', inset: '0', zIndex: '9999', pointerEvents: 'none', display: 'none' });
      parent.appendChild(ov);
    }
    ov.style.background = color;
    const p = clamp((t - t0) / dur);
    if (t < t0) { ov.style.display = 'none'; return 0; }
    ov.style.display = '';
    if (t >= t0 + dur) { ov.style.clipPath = 'none'; return 1; }
    const r = el.getBoundingClientRect(), pr = parent.getBoundingClientRect(), cx = r.left - pr.left + r.width / 2, cy = r.top - pr.top + r.height / 2;
    const r0 = Math.min(r.width, r.height) / 2, r1 = Math.hypot(Math.max(cx, pr.width - cx), Math.max(cy, pr.height - cy));
    ov.style.clipPath = `circle(${lerp(r0, r1, E.inOut(p)).toFixed(2)}px at ${cx.toFixed(2)}px ${cy.toFixed(2)}px)`;
    return p;
  },
  // zoomThrough(cam, [x,y,w,h], {t0, dur=0.7}) — 월드 사각형 rect 가 화면을 꽉 채울 때까지 들어간다
  zoomThrough(cam, rect, { t0 = 0, dur = 0.7 } = {}) {
    const [x, y, w, h] = rectOf(rect);
    cam.key(t0, { x: x + w / 2, y: y + h / 2, zoom: Math.max(cam.W / w, cam.H / h) }, { dur });
  },
  // whip(cam, {t0, dir='left', dur=0.35, dist=1.2}) — 카메라가 dir 쪽으로 화면 너비(위·아래는 높이)의 dist 배를 휙 지나간다(E.inOut). vel(t) = 화면 중심 점의 화면 속도 [vx,vy] px/s (스미어용)
  whip(cam, { t0 = 0, dir = 'left', dur = 0.35, dist = 1.2 } = {}) {
    const b = cam.base(t0), horiz = dir === 'left' || dir === 'right', sign = dir === 'left' || dir === 'up' ? -1 : 1;
    cam.key(t0, horiz ? { x: b.x + sign * dist * cam.W } : { y: b.y + sign * dist * cam.H }, { dur, ease: E.inOut });
    return {
      vel(t) {
        const h = 1 / 240, s = cam.state(t), q = [s.x, s.y], a = cam.toScreen(t - h, q), c = cam.toScreen(t + h, q);
        return [(c[0] - a[0]) / (2 * h) + 0, (c[1] - a[1]) / (2 * h) + 0];
      },
    };
  },
  // match(rectA, rectB) — rectB 의 상자를 rectA 에 (중심끼리, 균일 배율 A.w/B.w) 맞추는 CSS transform. 요소는 transform-origin: 0 0 (왼쪽 위) 이어야 한다. rect = [x,y,w,h] 또는 {x,y,w,h}/DOMRect
  match(rectA, rectB) {
    const [ax, ay, aw, ah] = rectOf(rectA), [bx, by, bw, bh] = rectOf(rectB), s = bw ? aw / bw : 1;
    const dx = ax + aw / 2 - (bx + s * bw / 2), dy = ay + ah / 2 - (by + s * bh / 2), f = v => nz(+v.toFixed(4));
    return `translate(${f(dx)}px, ${f(dy)}px) scale(${f(s)})`;
  },
};

MH.cam = cam;
MH.trans2d = trans2d;
})();
