/* MH.rig — 코드로 그린 2D 캐릭터 리그 (클래식 스크립트, mh.js 다음에 불러온다 → window.MH.rig)
 * 캐릭터 = 디자인(몸통·눈·입·볼·팔다리·땀) + 동작 목록 [t, name, opts][]. 자세 pose(t) 는 장면 로컬 시간 t 의 순수 함수.
 * 좌표: pose.x/y = 몸통 중심(부모 좌표, px), sx/sy/rot(도) 는 몸통 중심 기준. geometry() 는 루트 변환 전의 로컬 좌표(0,0 = 몸통 중심).
 * 렌더: actor(svg 요소 | 캔버스 2D 컨텍스트, design).act([...]).render(t) — 루트 변환 translate(x,y) rotate(rot) scale(sx,sy).
 * anchor(0 = 월드, 1 = 화면) 는 무대·카메라가 읽는 값이다 (grow 는 x/y 를 화면 좌표의 중앙으로 보낸다). */
(function () {
'use strict';
const MH = window.MH;
if (!MH) throw new Error('mh-rig.js 는 mh.js 다음에 불러와야 합니다.');
const { clamp, lerp, E, move, motion, hash, noise } = MH;

// 표정 → 눈·입 모양 (face 는 즉시 바뀌고 다음 face 까지 유지). idle 은 디자인 자신의 눈·입으로 돌아간다 (기본 디자인 = 아래 값).
const FACES = {
  idle: { eyes: 'oval', mouth: 'none' },
  happy: { eyes: 'arc', mouth: 'smile' },
  sweat: { eyes: 'oval', mouth: 'line', sweat: 1 },
  squint: { eyes: 'line', mouth: 'line' },
  star: { eyes: 'star', mouth: 'open' },
  sad: { eyes: 'arcDown', mouth: 'line' },
  surprise: { eyes: 'dot', mouth: 'o' },
};
const SHAPES = { body: ['roundRect', 'blob', 'capsule'], eyes: ['dot', 'oval', 'line', 'arc', 'arcDown', 'star'], mouth: ['none', 'line', 'smile', 'open', 'o'] };
const DEF = {
  body: { shape: 'roundRect', w: 200, h: 160, r: 48, color: '#F2C94C' },
  eyes: { shape: 'oval', gap: 0.32, size: 0.12, y: -0.05, color: '#111' },
  mouth: { shape: 'none' },
};
const BLINK = 0.12, SWEAT = '#7EC8F0', CHEEK = '#F4A3A3', SVGNS = 'http://www.w3.org/2000/svg';
const warned = new Set();
const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); console.warn(msg); } };

// ───────────── 디자인 ─────────────
function normalize(d) {
  d = d || {};
  const pick = k => {
    const v = Object.assign({}, DEF[k], d[k]);
    if (!SHAPES[k].includes(v.shape)) { warnOnce(k + ':' + v.shape, `MH.rig: ${k}.shape '${v.shape}' 는 지원하지 않습니다 (${SHAPES[k].join('|')}) — '${DEF[k].shape}' 로 그립니다.`); v.shape = DEF[k].shape; }
    return v;
  };
  const body = pick('body'), eyes = pick('eyes'), mouth = pick('mouth');
  const cheeks = d.cheeks ? Object.assign({ color: CHEEK, size: 0.1, gap: 0.62, y: 0.1 }, d.cheeks === true ? null : d.cheeks) : null;
  // 팔다리: at = 붙는 점(몸통 w·h 비율, 0 = 중심), len·w px, angle 도(0 = 아래로)
  const limbs = (d.limbs || []).map(l => Object.assign({ at: [0, 0.5], len: 40, w: 18, angle: 0, color: body.color }, l));
  const extras = (d.extras || []).map(e => Object.assign({}, e));   // { d, fill, stroke?, width?, x?, y? } 몸통 위·얼굴 아래에 그린다
  const out = Object.assign({}, d, { body, eyes, mouth, cheeks, limbs, extras });
  Object.defineProperty(out, '_rig', { value: true });
  return out;
}
const norm = d => (d && d._rig ? d : normalize(d));
const screenSize = o => { const dna = (typeof window !== 'undefined' && window.DNA) || {}; return [o.W ?? dna.W ?? 1920, o.H ?? dna.H ?? 1080]; };
const blinkOpen = p => (p <= 0 || p >= 1 ? 1 : 1 - clamp(1.25 * Math.sin(Math.PI * p)));   // 가운데 40% 는 완전히 감김

// ───────────── 자세 ─────────────
// 채널(x, y, sx, sy, rot, anchor, lx, ly, swing)은 동작 시간순으로 접힌다: 각 동작은 시작 시각에 앞 동작들이 남긴 값에서 출발한다.
function pose(design, actions, t, o = {}) {
  const D = norm(design), seed = o.seed ?? 1, life = o.life !== false, [W, H] = screenSize(o), M = motion();
  const k = v => () => v;
  const ch = { x: k(o.x ?? 0), y: k(o.y ?? 0), sx: k(1), sy: k(1), rot: k(0), anchor: k(0), lx: k(0), ly: k(0), swing: k(0) };
  const blinks = [];
  let face = null, talk = null;
  const list = (actions || []).filter(a => a && a[0] <= t).sort((a, b) => a[0] - b[0]);
  for (const [ta, name, op] of list) {
    const opts = op && typeof op === 'object' ? op : {};
    const at = key => ch[key](ta);
    const mo = (dur, extra) => Object.assign({ dur, ant: opts.ant, over: opts.over, settle: opts.settle }, extra);
    const ease = (key, to, dur, extra) => { const a = at(key), m = mo(dur, extra); ch[key] = tt => move(tt, ta, a, to, m); };
    const flat = { ant: 0, over: 0, settle: 0 };
    switch (name) {
      case 'blink': blinks.push([ta, opts.dur ?? BLINK]); break;
      case 'look': ease('lx', clamp(opts.x ?? 0, -1, 1), opts.dur ?? 0.3); ease('ly', clamp(opts.y ?? 0, -1, 1), opts.dur ?? 0.3); break;
      case 'face': {
        const f = typeof op === 'string' ? op : opts.name;
        if (FACES[f]) face = f; else warnOnce('face:' + f, `MH.rig: 표정 '${f}' 은 없습니다 (${Object.keys(FACES).join('|')}) — 무시합니다.`);
        break;
      }
      case 'squash': case 'stretch': {   // R3: 0.3초에 목표 배율로, 다음 squash/stretch/hop 까지 유지
        const amt = opts.amt ?? M.squash;
        let tx, ty;
        if (opts.x != null || opts.y != null) { tx = opts.x ?? 1 / opts.y; ty = opts.y ?? 1 / opts.x; }
        else if (name === 'squash') { tx = amt; ty = 1 / amt; } else { tx = 1 / amt; ty = amt; }
        ease('sx', tx, opts.dur ?? 0.3); ease('sy', ty, opts.dur ?? 0.3);
        break;
      }
      case 'hop': {
        const f = hopFn(ta, opts, at, D.body.h, M);
        ch.x = tt => f(tt).x; ch.y = tt => f(tt).y; ch.sx = tt => f(tt).sx; ch.sy = tt => f(tt).sy;
        break;
      }
      case 'walk': {
        const to = opts.to || [at('x'), at('y')], steps = opts.steps ?? 4, dur = opts.dur ?? 0.3 * steps, bob = opts.bob ?? 0.06 * D.body.h;
        const x0 = at('x'), y0 = at('y'), r0 = at('rot'), w0 = at('swing'), m = mo(dur);
        const st = tt => { const p = (tt - ta) / dur; return p >= 1 ? 0 : Math.sin(Math.PI * steps * clamp(p)); };   // 걸음마다 부호가 바뀐다, 끝에서 정확히 0
        ch.x = tt => move(tt, ta, x0, to[0], m);
        ch.y = tt => move(tt, ta, y0, to[1], m) - bob * Math.abs(st(tt));
        ch.rot = tt => r0 + 3 * st(tt);
        ch.swing = tt => w0 * (1 - clamp((tt - ta) / dur)) + 20 * st(tt);
        break;
      }
      case 'talk': talk = [ta, typeof op === 'number' ? op : opts.dur ?? 1]; break;
      case 'nod': { const a = at('rot'), dur = opts.dur ?? 0.4, amp = opts.amt ?? 8; ch.rot = tt => { const s = (tt - ta) / dur; return s >= 1 ? a : a + amp * Math.sin(Math.PI * s) ** 2; }; break; }
      case 'shake': { const a = at('rot'), dur = opts.dur ?? 0.5, amp = opts.amt ?? 6; ch.rot = tt => { const s = (tt - ta) / dur; return s >= 1 ? a : a + amp * Math.sin(6 * Math.PI * s) * (1 - s); }; break; }
      case 'enter': case 'exit': {
        const here = [at('x'), at('y')], dir = (name === 'enter' ? opts.from : opts.to) ?? 'below', dur = opts.dur ?? 0.6;
        const off = p => dir === 'below' ? [p[0], p[1] + H] : dir === 'above' ? [p[0], p[1] - H] : dir === 'left' ? [p[0] - W, p[1]] : dir === 'right' ? [p[0] + W, p[1]] : p;
        if (name === 'enter') {
          const dest = opts.at || here;
          if (dir === 'scale') {
            const fx = at('sx') > 0.01 ? at('sx') : 1, fy = at('sy') > 0.01 ? at('sy') : 1, m = mo(dur, { ant: opts.ant ?? 0 });   // 0 에서 커질 때 예비동작은 음수 배율이 되므로 기본 0
            ch.x = k(dest[0]); ch.y = k(dest[1]); ch.sx = tt => move(tt, ta, 0, fx, m); ch.sy = tt => move(tt, ta, 0, fy, m);
          } else { const s = off(dest), m = mo(dur); ch.x = tt => move(tt, ta, s[0], dest[0], m); ch.y = tt => move(tt, ta, s[1], dest[1], m); }
        } else if (dir === 'scale') { ease('sx', 0, dur, { settle: 0 }); ease('sy', 0, dur, { settle: 0 }); }
        else { const e = off(here); ease('x', e[0], dur); ease('y', e[1], dur); }
        break;
      }
      case 'grow': {   // 몸통 너비가 화면 대각선을 덮을 때까지, 화면 중앙으로, anchor 0→1
        const dur = opts.dur ?? 0.8, S = opts.scale ?? Math.hypot(W, H) / D.body.w;
        ease('sx', S, dur); ease('sy', S, dur); ease('x', W / 2, dur); ease('y', H / 2, dur); ease('anchor', 1, dur, flat);
        break;
      }
      case 'anchor': ease('anchor', opts.to === 'screen' ? 1 : 0, opts.dur ?? 0.4, flat); break;
      default: warnOnce('action:' + name, `MH.rig: 알 수 없는 동작 '${name}' — 무시합니다.`);
    }
  }
  let sy = ch.sy(t), rot = ch.rot(t), open = 1;
  for (const [tb, d] of blinks) if (t < tb + d) open = Math.min(open, blinkOpen((t - tb) / d));
  if (life) {   // 숨쉬기·흔들림·깜빡임 — x/y 는 건드리지 않는다
    sy *= 1 + 0.015 * Math.sin(2 * Math.PI * 0.25 * t);
    rot += 0.6 * noise(t * 0.5 + seed * 7.31);
    for (let i = 1, T = 0; i < 1e5; i++) { T += 2.2 + 2.3 * hash(seed, i); if (T > t) break; if (t < T + BLINK) open = Math.min(open, blinkOpen((t - T) / BLINK)); }
  }
  const F = face && face !== 'idle' ? FACES[face] : { eyes: D.eyes.shape, mouth: D.mouth.shape };
  const talking = talk && t < talk[0] + talk[1], sw = ch.swing(t);
  return {
    x: ch.x(t), y: ch.y(t), sx: ch.sx(t), sy, rot,
    eyes: { open, lx: ch.lx(t), ly: ch.ly(t), shape: F.eyes },
    mouth: talking ? { shape: 'open', open: 0.5 + 0.5 * Math.sin(2 * Math.PI * 6 * (t - talk[0])) } : { shape: F.mouth, open: 1 },
    face: face || 'idle',
    limbs: D.limbs.map((_, i) => (i % 2 ? -sw : sw)),
    sweat: F.sweat || 0,
    anchor: ch.anchor(t),
  };
}
// 깡충: 웅크림 0.15초(sy → 1−clamp(2·ant, 0, .3)) → 포물선 비행(꼭대기 −h, sy 1.08 늘어남) → 착지 찌그러짐 0.15초 → 흔들림 0.35초.
//   땅에 닿아 있는 동안은 발이 붙도록 중심을 (1−sy)·h/2 만큼 내린다. 시작 배율(이전 squash 등)은 웅크림 동안 1 로 풀린다.
function hopFn(ta, opts, at, bh, M) {
  const x0 = at('x'), y0 = at('y'), sx0 = at('sx'), sy0 = at('sy'), to = opts.to || [x0, y0], h = opts.h ?? 120;
  const dur = Math.max(opts.dur ?? 0.7, 0.4), C = 0.15, L = 0.15, F = dur - C - L, WOB = 0.35;
  const dip = clamp(2 * (opts.ant ?? M.ant), 0, 0.3), land = 1 / (opts.squash ?? M.squash);
  let last = NaN, val = null;
  return tt => {
    if (tt === last) return val;
    const s = tt - ta;
    let x = to[0], y = to[1], sy = 1, gnd = 1;
    if (s >= dur + WOB) val = { x, y, sx: 1, sy: 1 };
    else {
      if (s < C) { const c = s / C; x = x0; y = y0; sy = c < 0.7 ? lerp(1, 1 - dip, E.out(c / 0.7)) : lerp(1 - dip, 1.08, E.in((c - 0.7) / 0.3)); }
      else if (s < C + F) { const u = (s - C) / F; x = lerp(x0, to[0], u); y = lerp(y0, to[1], u) - 4 * h * u * (1 - u); gnd = Math.abs(2 * u - 1); sy = 1 + 0.08 * gnd; }
      else if (s < dur) { const l = (s - C - F) / L; sy = l < 0.4 ? lerp(1.08, land, E.out(l / 0.4)) : lerp(land, 1, E.inOut((l - 0.4) / 0.6)); }
      else { const p = (s - dur) / WOB; sy = 1 + 0.06 * (1 - p) * (1 - p) * Math.sin(4 * Math.PI * p); }
      const w0 = 1 - E.out(clamp(s / C));
      val = { x, y: y + (1 - sy) * bh / 2 * gnd, sx: 1 / sy + (sx0 - 1) * w0, sy: sy + (sy0 - 1) * w0 };
    }
    last = tt; return val;
  };
}

// ───────────── 모양 ─────────────
const r3 = v => Math.round(v * 1000) / 1000;
const P = (strs, ...vals) => strs.reduce((s, x, i) => s + x + (i < vals.length ? r3(vals[i]) : ''), '');
const ellipse = (rx, ry) => P`M${-rx} 0A${rx} ${ry} 0 1 0 ${rx} 0A${rx} ${ry} 0 1 0 ${-rx} 0Z`;
function bodyPath(B) {
  const w = B.w / 2, h = B.h / 2;
  if (B.shape === 'blob') { const k = 0.82; return P`M0 ${-h}C${k * w} ${-h} ${w} ${-k * h} ${w} 0C${w} ${k * h} ${k * w} ${h} 0 ${h}C${-k * w} ${h} ${-w} ${k * h} ${-w} 0C${-w} ${-k * h} ${-k * w} ${-h} 0 ${-h}Z`; }
  const r = Math.min(B.shape === 'capsule' ? Infinity : B.r, w, h);
  return P`M${-w + r} ${-h}H${w - r}A${r} ${r} 0 0 1 ${w} ${-h + r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${-w + r}A${r} ${r} 0 0 1 ${-w} ${h - r}V${-h + r}A${r} ${r} 0 0 1 ${-w + r} ${-h}Z`;
}
function eyePath(shape, s, color) {
  const sw = { stroke: color, width: Math.max(2, s * 0.18) };
  switch (shape) {
    case 'dot': return { d: ellipse(s * 0.35, s * 0.35), fill: color };
    case 'line': return { d: P`M${-s * 0.4} 0L${s * 0.4} 0`, ...sw };
    case 'arc': return { d: P`M${-s * 0.42} ${s * 0.15}Q0 ${-s * 0.45} ${s * 0.42} ${s * 0.15}`, ...sw };
    case 'arcDown': return { d: P`M${-s * 0.42} ${-s * 0.15}Q0 ${s * 0.45} ${s * 0.42} ${-s * 0.15}`, ...sw };
    case 'star': {
      let d = '';
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, R = s * (i % 2 ? 0.25 : 0.58); d += (i ? 'L' : 'M') + r3(R * Math.cos(a)) + ' ' + r3(R * Math.sin(a)); }
      return { d: d + 'Z', fill: color };
    }
    default: return { d: ellipse(s * 0.375, s * 0.55), fill: color };   // oval
  }
}
function mouthPath(shape, open, mw, color, width) {
  const sw = { stroke: color, width };
  switch (shape) {
    case 'line': return { d: P`M${-mw * 0.35} 0L${mw * 0.35} 0`, ...sw };
    case 'smile': return { d: P`M${-mw / 2} ${-mw * 0.1}Q0 ${mw * 0.45} ${mw / 2} ${-mw * 0.1}`, ...sw };
    case 'open': return { d: ellipse(mw * 0.4, mw * 0.32 * (0.2 + 0.8 * clamp(open))), fill: color };
    case 'o': return { d: ellipse(mw * 0.18, mw * 0.22), fill: color };
    default: return null;
  }
}
const tf = ([x, y, r, sx, sy]) => [x || y ? P`translate(${x} ${y})` : '', r ? P`rotate(${r})` : '', sx !== 1 || sy !== 1 ? P`scale(${sx} ${sy})` : ''].filter(Boolean).join(' ');
// 그리는 순서 = 배열 순서: 팔다리(몸통 뒤) → 몸통 → extras → 볼 → 눈 → 입 → 땀. m = [tx, ty, rot(도), sx, sy] (transform 과 같은 값)
function geometry(design, p) {
  const D = norm(design), B = D.body, w = B.w, h = B.h, out = [], eyes = p.eyes || {}, mouth = p.mouth || {};
  const add = (part, shape, m) => { if (shape) out.push(Object.assign({ part, d: shape.d, fill: shape.fill || 'none' }, shape.stroke ? { stroke: shape.stroke, width: shape.width } : null, { transform: tf(m), m })); };
  D.limbs.forEach((l, i) => {
    const lw = l.w, r = lw / 2;
    add('limb' + i, { d: P`M${-r} 0V${l.len - r}A${r} ${r} 0 0 0 ${r} ${l.len - r}V${-r}H${-r}Z`, fill: l.color }, [l.at[0] * w, l.at[1] * h, l.angle + ((p.limbs || [])[i] || 0), 1, 1]);
  });
  add('body', { d: bodyPath(B), fill: B.color }, [0, 0, 0, 1, 1]);
  D.extras.forEach((e, i) => add(e.part || 'extra' + i, e, [e.x || 0, e.y || 0, 0, 1, 1]));
  const lx = (eyes.lx || 0) * (D.eyes.look ?? 0.1) * w, ly = (eyes.ly || 0) * 0.08 * h;
  if (D.cheeks) { const C = D.cheeks, cs = C.size * w; for (const [n, sg] of [['cheekL', -1], ['cheekR', 1]]) add(n, { d: ellipse(cs * 0.5, cs * 0.3), fill: C.color }, [sg * C.gap * w / 2 + lx * 0.3, C.y * h + ly * 0.3, 0, 1, 1]); }
  const s = D.eyes.size * w, open = Math.max(0.08, eyes.open ?? 1);
  for (const [n, sg] of [['eyeL', -1], ['eyeR', 1]]) add(n, eyePath(eyes.shape || D.eyes.shape, s, D.eyes.color), [sg * D.eyes.gap * w / 2 + lx, D.eyes.y * h + ly, 0, 1, open]);
  const Mo = D.mouth, mw = (Mo.w ?? 0.2) * w;
  add('mouth', mouthPath(mouth.shape || Mo.shape, mouth.open ?? 1, mw, Mo.color ?? D.eyes.color, Mo.width ?? Math.max(3, w * 0.025)), [lx * 0.5, (Mo.y ?? 0.2) * h + ly * 0.5, 0, 1, 1]);
  if (p.sweat > 0) { const ds = 0.09 * w; add('sweat', { d: P`M0 ${-ds}C${ds * 0.6} ${-ds * 0.2} ${ds * 0.6} ${ds * 0.6} 0 ${ds * 0.6}C${-ds * 0.6} ${ds * 0.6} ${-ds * 0.6} ${-ds * 0.2} 0 ${-ds}Z`, fill: (D.sweat && D.sweat.color) || SWEAT }, [0.5 * w, -0.4 * h, 0, p.sweat, p.sweat]); }
  return out;
}
const partNames = D => [...D.limbs.map((_, i) => 'limb' + i), 'body', ...D.extras.map((e, i) => e.part || 'extra' + i), ...(D.cheeks ? ['cheekL', 'cheekR'] : []), 'eyeL', 'eyeR', 'mouth', 'sweat'];

// ───────────── 배우 (렌더러) ─────────────
function actor(target, design, o = {}) {
  const D = normalize(design), opt = Object.assign({ seed: 1, life: true }, o);
  const isSVG = !!target && target.namespaceURI === SVGNS;
  const ctx = !target || isSVG ? null : typeof target.drawImage === 'function' ? target : typeof target.getContext === 'function' ? target.getContext('2d') : null;
  if (!isSVG && !ctx) throw new Error('MH.rig.actor: SVG 요소나 캔버스 2D 컨텍스트를 넘겨 주세요.');
  let actions = [], svg = null;
  const cache = new Map();   // 캔버스 Path2D (d 문자열 → Path2D)
  const set = (el, k, v) => { const c = el.__mh || (el.__mh = {}); if (c[k] !== v) { c[k] = v; el.setAttribute(k, v); } };
  const root = p => P`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.sx} ${p.sy})`;
  function drawSVG(p, geo) {
    if (!svg) {   // 처음 한 번만 <g> 와 부위별 <path> 를 만든다. 이후에는 속성만 바꾼다.
      const doc = target.ownerDocument || document, g = doc.createElementNS(SVGNS, 'g'), parts = new Map();
      for (const n of partNames(D)) { const el = doc.createElementNS(SVGNS, 'path'); el.setAttribute('data-part', n); g.appendChild(el); parts.set(n, el); }
      target.appendChild(g); svg = { g, parts };
    }
    set(svg.g, 'transform', root(p));
    const seen = new Set();
    for (const q of geo) {
      const el = svg.parts.get(q.part); if (!el) continue;
      seen.add(q.part);
      set(el, 'display', 'inline'); set(el, 'd', q.d); set(el, 'fill', q.fill); set(el, 'transform', q.transform);
      set(el, 'stroke', q.stroke || 'none'); if (q.stroke) { set(el, 'stroke-width', String(r3(q.width))); set(el, 'stroke-linecap', 'round'); set(el, 'stroke-linejoin', 'round'); }
    }
    for (const [n, el] of svg.parts) if (!seen.has(n)) set(el, 'display', 'none');
  }
  function drawCanvas(p, geo) {
    if (cache.size > 256) cache.clear();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180); ctx.scale(p.sx, p.sy);
    for (const q of geo) {
      let path = cache.get(q.d); if (!path) cache.set(q.d, path = new Path2D(q.d));
      const [x, y, r, sx, sy] = q.m;
      ctx.save(); ctx.translate(x, y); if (r) ctx.rotate(r * Math.PI / 180); ctx.scale(sx, sy);
      if (q.fill !== 'none') { ctx.fillStyle = q.fill; ctx.fill(path); }
      if (q.stroke) { ctx.strokeStyle = q.stroke; ctx.lineWidth = q.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path); }
      ctx.restore();
    }
    ctx.restore();
  }
  const A = {
    design: D,
    act(list) { actions = (list || []).slice().sort((a, b) => a[0] - b[0]); return A; },
    pose: t => pose(D, actions, t, opt),
    render(t) { const p = A.pose(t), geo = geometry(D, p); if (isSVG) drawSVG(p, geo); else drawCanvas(p, geo); return p; },
    life(on) { opt.life = !!on; return A; },
  };
  return A;
}

// assets/actors/<name>.json 의 디자인(또는 리그 JSON)을 불러온다.
function load(name) {
  const url = 'assets/actors/' + name + '.json';
  return fetch(url).then(r => { if (!r.ok) throw new Error(`캐릭터 파일을 불러오지 못했습니다: ${url} (HTTP ${r.status})`); return r.json(); });
}

MH.rig = { FACES, normalize, pose, geometry, actor, load };
})();
