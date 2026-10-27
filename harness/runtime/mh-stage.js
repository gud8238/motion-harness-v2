/* MH.stage2d — 무대 모드: 큰 DOM 월드 + 2D 카메라 + 세트 + 배우 + 비트, 연출은 큐시트 한 덩어리 (클래식 스크립트, mh.js·mh-rig.js·mh-cam.js 다음 → window.MH.stage2d)
 * st = MH.stage2d(rootEl, {W, H, dur}) — rootEl 안에 .mh-world(카메라 깊이 1 레이어)와 그 위 배우 오버레이 <svg class="mh-actors"> 를 만든다. W/H 기본 = MH.screenSize.
 *   st.set(name, el, {at:[x,y], depth=1})   el 을 월드(깊이 ≠ 1 이면 그 깊이의 레이어)의 at(월드 px)에 둔다. 첫 큐가 'in' 이면 그때까지 숨김.
 *   st.actor(name, actor|design, {anchor='world'|'screen', …rig 옵션})   배우 = MH.rig.actor(st.actorTarget(name), design, {W, H}) 또는 디자인(안에서 만든다).
 *   st.cues([[t, 대상, 동작, 옵션], …])   대상: 'cam' (동작 = 키 {x,y,zoom,rot, dur,ease,follow}) · 'set:<이름>' ('in'|'out', {dur=0.5, from}) · 배우 이름 (rig 동작)
 *   st.beats(json) / st.beatsFrom('#id-beats') · st.remap(fn) · st.render(t) · st.cam · st.world
 * 쌓는 순서(R15): 깊이 레이어는 깊이 오름차순(1 미만 = 월드 뒤, 1 초과 = 월드 앞) → 배우 오버레이 → 깊이 0 레이어(화면 고정 HUD, 맨 위).
 * 배우 위치(R16): a = anchor 'screen' 이면 1, 'world' 면 pose.anchor (grow 가 0→1). 래퍼 선형부 L = lerp(카메라 2×2, I, a).
 *   배우 중심의 화면 위치 = (1−e)·출발 틀(전환 시작 시각 t_s 의 자세 위치, 고정) + e·도착 틀(자세 위치), e = 도착 쪽 진행도.
 *   grow·anchor{to:'screen'}: 월드 → 화면, e = a, 도착 위치는 grow 의 이동·안착이 끝날 때(t_s + dur + settle)까지 그 끝값으로 고정 → 화면 중심으로 곧게 들어간다.
 *   anchor{to:'world'}: 화면 → 월드, e = 1 − a. 전환 큐가 없으면 a 는 상수 (0 = 카메라 그대로, 1 = 항등).
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
// 경고는 무대마다(또는 compile 호출마다) 한 번씩
const warner = () => { const seen = new Set(); return (key, msg) => { if (!seen.has(key)) { seen.add(key); console.warn(msg); } }; };
const HID = { show: false }, VIS = { show: true, dx: 0, dy: 0, s: 1, op: 1 };
const r3 = v => +(+v.toFixed(3)) + 0;
const fmt = v => String(+(+v.toFixed(5)) + 0);
const fin = v => typeof v === 'number' && Number.isFinite(v);

// ───────────── 큐시트 컴파일 (순수) ─────────────
// [t, target, action, opts?][] → { cam: [t, keyObj, opts][], actors: {name: [t, action, opts?][]}, sets: {name: [t, 'in'|'out', {dur, from}][]} } — t 순 안정 정렬
function compile(cues, warnOnce = warner()) {
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
// 큐 목록과 시각 tt → { show, dx, dy, s, op }. 각 큐는 그 시각의 상태(앞 큐들로 계산)에서 출발한다 → in 도중 out, out 도중 in 도 튀지 않는다.
function setState(list, tt, W, H) {
  let i = -1;
  for (let j = 0; j < list.length; j++) if (list[j][0] <= tt) i = j; else break;
  if (i < 0) return list.length && list[0][1] === 'in' ? HID : VIS;
  const [t0, kind, { dur, from }] = list[i], inn = kind === 'in';
  const off = from === 'below' ? [0, OFF * H] : from === 'above' ? [0, -OFF * H] : from === 'left' ? [-OFF * W, 0] : from === 'right' ? [OFF * W, 0] : [0, 0];
  const away = { show: true, dx: off[0], dy: off[1], s: from === 'scale' ? SCALE0 : 1, op: 0 };
  const prev = i === 0 ? (inn ? HID : VIS) : setState(list.slice(0, i), t0, W, H);
  if (!prev.show && !inn) return HID;
  const a = prev.show ? prev : away, b = inn ? VIS : away, p = dur > 0 ? clamp((tt - t0) / dur) : 1;
  if (!inn && p >= 1) return HID;
  if (p >= 1 && dur <= 0) return VIS;
  const m = { dur }, go = k => move(tt, t0, a[k], b[k], m);
  return { show: true, dx: go('dx'), dy: go('dy'), s: go('s'), op: lerp(a.op, b.op, p) };
}

// 마지막 위치 전환 큐(grow · anchor) ≤ tt → { t, screen, tm } (tm = 도착 위치를 고정하는 끝 시각)
function transitionAt(list, tt) {
  let tr = null;
  for (const [t, action, op] of list || []) {
    if (t > tt) break;
    const o = op && typeof op === 'object' ? op : {};
    if (action === 'grow') { const settle = o.settle ?? MH.motion().settle; tr = { t, screen: true, tm: t + (o.dur ?? 0.8) + Math.max(0, settle) }; }
    else if (action === 'anchor') tr = { t, screen: o.to === 'screen', tm: t };
  }
  return tr;
}

// ───────────── 무대 ─────────────
function stage2d(rootEl, o = {}) {
  if (!rootEl) throw new Error('MH.stage2d: 루트 요소가 필요합니다.');
  const [W, H] = MH.screenSize(o), dur = o.dur;
  const doc = rootEl.ownerDocument || document;
  const world = doc.createElement('div');
  world.className = 'mh-world';
  Object.assign(world.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', overflow: 'visible', transformOrigin: '0 0' });
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'mh-actors'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
  rootEl.appendChild(world); rootEl.appendChild(svg);
  const cam = MH.cam(world, { W, H });
  const layers = [{ depth: 1, el: world }];                     // 깊이 0 이 아닌 레이어, 깊이 순 (작을수록 뒤). 깊이 0 은 배우 위
  const sets = {}, actors = {}, wraps = {}, anchors = {};
  const warnOnce = warner();
  let all = [], C = compile([], warnOnce), beats = [], remapFn = null;
  if (fin(dur) && dur > MAXDUR) warnOnce('dur', `MH.stage2d: 무대 길이 ${dur}초 — ${MAXDUR}초를 넘으면 무대를 나누고 같은 배우 파일·같은 위치로 경계를 잇습니다.`);

  const hud = {};                                               // 깊이 0 레이어 (하나)
  const layerFor = depth => {
    if (depth === 0 && hud.el) return hud.el;
    let l = layers.find(x => x.depth === depth);
    if (l) return l.el;
    const el = doc.createElement('div');
    el.className = 'mh-layer'; el.setAttribute('data-depth', depth);
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', overflow: 'visible', transformOrigin: '0 0' });
    if (depth === 0) { rootEl.appendChild(el); hud.el = el; }     // R15: 화면 고정 = 맨 위
    else {
      const next = layers.find(x => x.depth > depth);
      rootEl.insertBefore(el, next ? next.el : svg);
      layers.push(l = { depth, el }); layers.sort((a, b) => a.depth - b.depth);
    }
    cam.layer(el, depth);
    return el;
  };
  const css = (el, k, v) => { const c = el.__mhs || (el.__mhs = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } };
  const attr = (el, k, v) => { const c = el.__mhs || (el.__mhs = {}); if (c['@' + k] !== v) { c['@' + k] = v; el.setAttribute(k, v); } };
  const applyActs = name => { if (actors[name]) actors[name].act(C.actors[name] || []); };

  const st = {
    W, H, dur, cam, world, sets, actors,
    // 배우를 그릴 래퍼 <g> (이름별 하나). 두 단계: g = st.actorTarget('boo'); st.actor('boo', MH.rig.actor(g, design, {W, H}))
    // 비동기로 등록할 배우도 먼저 actorTarget(name) 으로 자리를 잡아 두면 '모르는 배우' 경고가 나지 않는다.
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
    // 큐를 더한다(여러 번 불러도 된다). 카메라 키는 새로 준 큐만 cam.key 로 넣는다. 배우는 나중에 등록해도 된다.
    cues(list) {
      const fresh = compile(list, warnOnce);
      for (const [t, key, op] of fresh.cam) cam.key(t, key, op);
      all = all.concat(Array.isArray(list) ? list : []); C = compile(all, warnOnce);
      for (const n of Object.keys(actors)) applyActs(n);
      return st;
    },
    beats(json) { if (json === undefined) return beats.slice(); beats = (Array.isArray(json) ? json : []).map(b => Object.assign({}, b)); return st; },
    // 비트 JSON <script type="application/json"> 을 읽는다. 없거나 깨져도 렌더는 계속(비트는 스토리보드·검수용) — 경고만
    beatsFrom(sel) {
      const el = typeof sel === 'string' ? (doc.querySelector ? doc.querySelector(sel) : null) : sel;
      if (!el) { warnOnce('beats', `MH.stage2d.beatsFrom: 비트 JSON(${sel}) 을 찾지 못했습니다.`); return st; }
      try { return st.beats(JSON.parse(el.textContent || '[]')); } catch (e) { warnOnce('beats', `MH.stage2d.beatsFrom: 비트 JSON(${sel}) 을 읽지 못했습니다 — ${e.message}`); return st; }
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
      for (const n of Object.keys(C.actors)) if (!actors[n] && !wraps[n]) warnOnce('actor:' + n, `MH.stage2d: 큐의 배우 '${n}' 가 등록되지 않았습니다 — st.actor('${n}', …) (비동기면 먼저 st.actorTarget('${n}')).`);
      const M = cam.matrix(tt, 1);
      for (const [name, A] of Object.entries(actors)) {
        const p = A.render(tt), P = [p.x, p.y];
        attr(wraps[name], 'transform', `matrix(${wrapMatrix(M, A, P, anchors[name] ? 1 : clamp(fin(p.anchor) ? p.anchor : 0), anchors[name] ? null : transitionAt(C.actors[name], tt), tt).map(fmt).join(' ')})`);
      }
      return st;
    },
  };
  return st;
}
// 배우 래퍼 행렬 (R16, 위 머리말). M = 카메라 깊이 1 아핀 [a,b,c,d,e,f], P = 지금 자세 위치, a = 화면 쪽 정도
function wrapMatrix(M, A, P, a, tr, tt) {
  const W = q => [M[0] * q[0] + M[2] * q[1] + M[4], M[1] * q[0] + M[3] * q[1] + M[5]];
  const mix = (x, y, e) => (e <= 0 ? x : e >= 1 ? y : [lerp(x[0], y[0], e), lerp(x[1], y[1], e)]);
  const at = t => { const q = A.pose(t); return [q.x, q.y]; };
  let c;
  if (a <= 0 && (!tr || !tr.screen || tt <= tr.t)) c = W(P);                 // 월드: 카메라 그대로
  else if (a >= 1 && (!tr || (tr.screen && tt >= tr.tm))) c = P;              // 화면: 항등
  else if (!tr) c = mix(W(P), P, a);
  else if (tr.screen) c = mix(W(at(tr.t)), tt < tr.tm ? at(tr.tm) : P, a);    // 월드 → 화면 (출발 고정, 도착은 안착 끝값)
  else c = mix(at(tr.t), W(P), 1 - a);                                        // 화면 → 월드
  const L = [lerp(M[0], 1, a), lerp(M[1], 0, a), lerp(M[2], 0, a), lerp(M[3], 1, a)];
  return [L[0], L[1], L[2], L[3], c[0] - (L[0] * P[0] + L[2] * P[1]), c[1] - (L[1] * P[0] + L[3] * P[1])];
}
stage2d.compile = compile;

MH.stage2d = stage2d;
})();
