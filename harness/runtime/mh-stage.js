/* MH.stage2d — 무대 모드: 큰 DOM 월드 + 2D 카메라 + 세트 + 배우 + 비트, 연출은 큐시트 한 덩어리 (클래식 스크립트, mh.js·mh-rig.js·mh-cam.js 다음 → window.MH.stage2d)
 * st = MH.stage2d(rootEl, {W, H, dur}) — rootEl 안에 .mh-world(카메라 깊이 1 레이어)와 그 위 배우 오버레이 <svg class="mh-actors"> 를 만든다. W/H 기본 = MH.screenSize.
 *   st.set(name, el, {at:[x,y], depth=1})   el 을 월드(깊이 ≠ 1 이면 그 깊이의 레이어)의 at(월드 px)에 둔다. 첫 큐가 'in' 이면 그때까지 숨김.
 *   st.actor(name, actor|design, {anchor='world'|'screen', …rig 옵션})   배우 = MH.rig.actor(st.actorTarget(name), design, {W, H}) 또는 디자인(안에서 만든다).
 *   st.cues([[t, 대상, 동작, 옵션], …])   대상: 'cam' (동작 = 키 {x,y,zoom,rot, dur,ease,follow}) · 'set:<이름>' ('in'|'out', {dur=0.5, from}) · 배우 이름 (rig 동작)
 *   st.beats(json) / st.beatsFrom('#id-beats') · st.remap(fn) · st.render(t) · st.cam · st.world
 * 배우 래퍼 <g> 변환 = lerp(카메라 깊이 1 행렬, 항등, a) (성분별), a = anchor 'screen' 이면 1, 'world' 면 pose.anchor (grow 가 0→1).
 * render(t) 는 tt = remap(t) 의 순수 함수: cam → 세트 → 배우. 캐시는 DOM 쓰기 생략용뿐. */
(function () {
'use strict';
const MH = window.MH;
if (!MH || !MH.cam || !MH.rig) throw new Error('mh-stage.js 는 mh.js·mh-rig.js·mh-cam.js 다음에 불러와야 합니다.');
const { clamp, lerp, move } = MH;
const SVGNS = 'http://www.w3.org/2000/svg', MAXDUR = 25, OFF = 0.15, SCALE0 = 0.6;
const REST = 'translate(0px, 0px) scale(1)';
const DIRS = ['below', 'above', 'left', 'right', 'fade', 'scale'];
const CAMOPT = ['dur', 'ease', 'follow'];
const warned = new Set();
const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); console.warn(msg); } };
const r3 = v => +(+v.toFixed(3)) + 0;
const fmt = v => String(+(+v.toFixed(5)) + 0);
const fin = v => typeof v === 'number' && Number.isFinite(v);

// ───────────── 큐시트 컴파일 (순수) ─────────────
// [t, target, action, opts?][] → { cam: [t, keyObj, opts][], actors: {name: [t, action, opts?][]}, sets: {name: [t, 'in'|'out', {dur, from}][]} } — t 순 안정 정렬
function compile(cues) {
  const out = { cam: [], actors: {}, sets: {} };
  const list = (Array.isArray(cues) ? cues : []).map((c, i) => [c, i]);
  const ok = list.filter(([c, i]) => {
    if (!Array.isArray(c) || !fin(c[0])) { warnOnce('stage:t', `MH.stage2d: 큐 #${i} 는 [t(초), 대상, 동작, 옵션] 이어야 합니다 — 무시합니다.`); return false; }
    if (typeof c[1] !== 'string' || !c[1] || c[1] === 'set:') { warnOnce('stage:target', `MH.stage2d: 큐 #${i} 의 대상 ${JSON.stringify(c[1])} 을 알 수 없습니다('cam' | 'set:<이름>' | 배우 이름) — 무시합니다.`); return false; }
    if (c[1] === 'cam' && (!c[2] || typeof c[2] !== 'object')) { warnOnce('stage:cam', `MH.stage2d: 큐 #${i} 의 카메라 동작은 키 객체 {x,y,zoom,rot,dur,ease} 여야 합니다 — 무시합니다.`); return false; }
    if (c[1].startsWith('set:') && c[2] !== 'in' && c[2] !== 'out') { warnOnce('stage:set', `MH.stage2d: 큐 #${i} 의 세트 동작은 'in' | 'out' 입니다 (${JSON.stringify(c[2])}) — 무시합니다.`); return false; }
    return true;
  }).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(p => p[0]);
  for (const [t, target, action, opts] of ok) {
    if (target === 'cam') {
      const key = {}, o = Object.assign({}, opts);
      for (const [k, v] of Object.entries(action)) if (CAMOPT.includes(k)) o[k] = v; else key[k] = v;
      out.cam.push([t, key, o]);
    } else if (target.startsWith('set:')) {
      const o = Object.assign({}, opts), from = o.to ?? o.from ?? 'below';
      delete o.to;
      if (!DIRS.includes(from)) warnOnce('stage:dir:' + from, `MH.stage2d: 세트 방향 '${from}' 은 없습니다 (${DIRS.join('|')}) — below 로 봅니다.`);
      (out.sets[target.slice(4)] = out.sets[target.slice(4)] || []).push([t, action, Object.assign(o, { dur: o.dur ?? 0.5, from: DIRS.includes(from) ? from : 'below' })]);
    } else (out.actors[target] = out.actors[target] || []).push(opts === undefined ? [t, action] : [t, action, opts]);
  }
  return out;
}

// ───────────── 세트 상태 (순수) ─────────────
// 큐 목록과 시각 tt → { show, dx, dy, s, op }
function setState(list, tt, W, H) {
  let cur = null;
  for (const c of list) if (c[0] <= tt) cur = c; else break;
  if (!cur) return list.length && list[0][1] === 'in' ? { show: false } : { show: true, dx: 0, dy: 0, s: 1, op: 1 };
  const [t0, kind, { dur, from }] = cur, p = dur > 0 ? clamp((tt - t0) / dur) : 1;
  if (kind === 'out' && p >= 1) return { show: false };
  const off = from === 'below' ? [0, OFF * H] : from === 'above' ? [0, -OFF * H] : from === 'left' ? [-OFF * W, 0] : from === 'right' ? [OFF * W, 0] : [0, 0];
  const m = { dur }, inn = kind === 'in';
  const go = (a, b) => (dur > 0 ? move(tt, t0, inn ? a : b, inn ? b : a, m) : b);   // in: a→b, out: b→a
  const pos = dur > 0 ? [go(off[0], 0), go(off[1], 0)] : inn ? [0, 0] : off;
  const s = from === 'scale' ? (dur > 0 ? go(SCALE0, 1) : inn ? 1 : SCALE0) : 1;
  return { show: true, dx: pos[0], dy: pos[1], s, op: inn ? p : 1 - p };
}

// ───────────── 무대 ─────────────
function stage2d(rootEl, o = {}) {
  if (!rootEl) throw new Error('MH.stage2d: 루트 요소가 필요합니다.');
  const [W, H] = MH.screenSize(o), dur = o.dur;
  if (fin(dur) && dur > MAXDUR) console.warn(`MH.stage2d: 무대 길이 ${dur}초 — ${MAXDUR}초를 넘으면 무대를 나누고 같은 배우 파일·같은 위치로 경계를 잇습니다.`);
  const doc = rootEl.ownerDocument || document;
  const world = doc.createElement('div');
  world.className = 'mh-world';
  Object.assign(world.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', overflow: 'visible', transformOrigin: '0 0' });
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'mh-actors'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
  rootEl.appendChild(world); rootEl.appendChild(svg);
  const cam = MH.cam(world, { W, H });
  const layers = [{ depth: 1, el: world }];                     // 깊이 순 (작을수록 뒤)
  const sets = {}, actors = {}, wraps = {}, anchors = {};
  let all = [], C = compile([]), beats = [], remapFn = null;

  const layerFor = depth => {
    let l = layers.find(x => x.depth === depth);
    if (l) return l.el;
    const el = doc.createElement('div');
    el.className = 'mh-layer'; el.setAttribute('data-depth', depth);
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', overflow: 'visible', transformOrigin: '0 0' });
    const next = layers.find(x => x.depth > depth);
    rootEl.insertBefore(el, next ? next.el : svg);
    layers.push(l = { depth, el }); layers.sort((a, b) => a.depth - b.depth);
    cam.layer(el, depth);
    return el;
  };
  const css = (el, k, v) => { const c = el.__mhs || (el.__mhs = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } };
  const attr = (el, k, v) => { const c = el.__mhs || (el.__mhs = {}); if (c['@' + k] !== v) { c['@' + k] = v; el.setAttribute(k, v); } };
  const applyActs = name => { if (actors[name]) actors[name].act(C.actors[name] || []); };

  const st = {
    W, H, dur, cam, world, sets, actors,
    // 배우를 그릴 래퍼 <g> (이름별 하나). 두 단계: g = st.actorTarget('boo'); st.actor('boo', MH.rig.actor(g, design, {W, H}))
    actorTarget(name) {
      if (!wraps[name]) { const g = doc.createElementNS(SVGNS, 'g'); g.setAttribute('data-actor', name); svg.appendChild(g); wraps[name] = g; }
      return wraps[name];
    },
    set(name, el, { at = [0, 0], depth = 1 } = {}) {
      if (!el) throw new Error(`MH.stage2d.set: '${name}' 요소가 없습니다.`);
      layerFor(depth).appendChild(el);
      Object.assign(el.style, { position: 'absolute', left: at[0] + 'px', top: at[1] + 'px' });
      sets[name] = el;
      return st;
    },
    actor(name, a, o2 = {}) {
      const { anchor = 'world', ...rigOpt } = o2;
      if (anchor !== 'world' && anchor !== 'screen') throw new Error(`MH.stage2d.actor: anchor 는 'world' | 'screen' 입니다 (${anchor}).`);
      const g = st.actorTarget(name);
      if (!a || typeof a.render !== 'function' || typeof a.pose !== 'function' || typeof a.act !== 'function') a = MH.rig.actor(g, a, Object.assign({ W, H }, rigOpt));
      actors[name] = a; anchors[name] = anchor === 'screen' ? 1 : 0;
      applyActs(name);
      return st;
    },
    // 큐를 더한다(여러 번 불러도 된다). 카메라 키는 새로 준 큐만 cam.key 로 넣는다.
    cues(list) {
      const fresh = compile(list);
      for (const [t, key, op] of fresh.cam) cam.key(t, key, op);
      for (const n of Object.keys(fresh.actors)) if (!actors[n]) warnOnce('stage:actor:' + n, `MH.stage2d: 큐의 배우 '${n}' 가 등록되지 않았습니다 — st.actor('${n}', …) 를 cues 보다 먼저 부르세요.`);
      all = all.concat(Array.isArray(list) ? list : []); C = compile(all);
      for (const n of Object.keys(actors)) applyActs(n);
      return st;
    },
    beats(json) { if (json === undefined) return beats.slice(); beats = (Array.isArray(json) ? json : []).map(b => Object.assign({}, b)); return st; },
    // 비트 JSON <script type="application/json"> 을 읽는다. 없거나 깨져도 렌더는 계속(비트는 스토리보드·검수용) — 경고만
    beatsFrom(sel) {
      const el = typeof sel === 'string' ? (doc.querySelector ? doc.querySelector(sel) : null) : sel;
      if (!el) { console.warn(`MH.stage2d.beatsFrom: 비트 JSON(${sel}) 을 찾지 못했습니다.`); return st; }
      try { return st.beats(JSON.parse(el.textContent || '[]')); } catch (e) { console.warn(`MH.stage2d.beatsFrom: 비트 JSON(${sel}) 을 읽지 못했습니다 — ${e.message}`); return st; }
    },
    remap(fn) { remapFn = typeof fn === 'function' ? fn : null; return st; },
    render(t) {
      const tt = remapFn ? remapFn(t) : t;
      cam.render(tt);
      for (const [name, el] of Object.entries(sets)) {
        const s = setState(C.sets[name] || [], tt, W, H);
        css(el, 'visibility', s.show ? 'visible' : 'hidden'); css(el, 'opacity', s.show ? String(r3(s.op)) : '0');
        css(el, 'transform', s.show ? `translate(${r3(s.dx)}px, ${r3(s.dy)}px) scale(${r3(s.s)})` : REST);   // 숨김일 때도 써서 DOM 상태가 tt 만의 함수
      }
      const M = cam.matrix(tt, 1), I = [1, 0, 0, 1, 0, 0];
      for (const [name, a] of Object.entries(actors)) {
        const p = a.render(tt), k = clamp(anchors[name] + (p && fin(p.anchor) ? p.anchor : 0));
        attr(wraps[name], 'transform', `matrix(${M.map((v, i) => fmt(lerp(v, I[i], k))).join(' ')})`);
      }
      return st;
    },
  };
  return st;
}
stage2d.compile = compile;

MH.stage2d = stage2d;
})();
