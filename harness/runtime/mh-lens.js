/* MH.lens — 렌즈: 심도(dof)·래크 포커스(rack)·단일 요소 스미어(smear) (클래식 스크립트, mh.js·mh-cam.js 다음에 불러온다 → window.MH.lens)
 * 변수 이름은 항상 `lens` (const lens = MH.lens;) — 게이트가 `lens.dof(`·`lens.rack(`·`lens.smear(` 호출을 찾는다.
 * dof(cam, {focus, aperture}) → Lens.  레이어 깊이 d 의 흐림 = min(24, |d − focus|·aperture) px.
 *   Lens.rack(keys) · lens.rack(Lens, keys)  [[t, focus], …] 키 사이는 선형, 첫 키 앞·마지막 키 뒤는 그 값 유지. 체인 가능.
 *   Lens.render(t)   cam.layers 마다 style.filter = 'blur(Npx)' (0.05px 미만은 ''). 반드시 cam.render(t) 다음에 부른다 — filter 와 transform 은 서로 다른 속성이라 겹치지 않는다.
 *                    레이어에 처음 render 때 붙어 있던 인라인 filter 는 보존하고 그 뒤에 blur 를 덧붙인다(`${원래} blur(Npx)`). 그 뒤에 바뀐 filter 는 반영되지 않는다.
 * smear(el, vx, vy, {k, max}) — 요소 하나의 속도(화면 px/s)에 비례해 이동 방향으로 번진다. SVG feGaussianBlur 를 요소당 1회 만들고 stdDeviation 만 갱신한다.
 *   축 정렬(x 와 y 를 따로 흐림) — 대각선 이동의 회전된 번짐은 지원하지 않는다.
 * 모션 블러(lens.mblur)는 API 가 없다: 효과 표의 행으로 켜며 make 가 렌더 때 4배 프레임으로 합성한다.
 * 모든 값은 t 와 입력 속도의 순수 함수(난수·타이머 없음). */
(function () {
'use strict';
const MH = window.MH;
if (!MH) throw new Error('mh-lens.js 는 mh.js 다음에 불러와야 합니다.');

const MAXBLUR = 24, MIN = 0.05;
const fmt = v => +v.toFixed(2);

// 깊이 → 흐림 반경(px)
const blurFor = (depth, focus, aperture) => Math.min(MAXBLUR, Math.abs(depth - focus) * aperture);

function dof(cam, { focus = 1, aperture = 6 } = {}) {
  let keys = null;
  const bases = new WeakMap();                                       // 레이어 el → 처음 render 때 본 원래 인라인 filter                                                   // [[t, focus, E.linear], …] 정렬·중복 t 제거
  const focusAt = t => (keys ? MH.kf(t, keys) : focus);
  const self = {
    rack(list) {
      const sorted = list.map((k, i) => [k, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(p => p[0]);
      keys = [];
      for (const [t, f] of sorted) {
        if (keys.length && keys[keys.length - 1][0] === t) keys.pop();    // 같은 t 는 나중 키가 이긴다 (kf 의 0 나누기 방지)
        keys.push([t, f, MH.E.linear]);
      }
      if (!keys.length) keys = null;
      return self;
    },
    focusAt,
    render(t) {
      const f = focusAt(t);
      for (const l of cam.layers) {
        let base = bases.get(l.el); if (base === undefined) bases.set(l.el, base = l.el.style.filter || '');
        const b = blurFor(l.depth, f, aperture), blur = b < MIN ? '' : `blur(${fmt(b)}px)`;
        l.el.style.filter = [base, blur].filter(Boolean).join(' ');   // 원래 filter 뒤에 흐림을 덧붙인다
      }
      return self;
    },
  };
  return self;
}

// ───────────── 스미어 ─────────────
const NS = 'http://www.w3.org/2000/svg';
const _smears = new WeakMap();                                       // el → { fe, url }
let _n = 0;
function smear(el, vx, vy, { k = 0.02, max = 40 } = {}) {
  if (!el) throw new Error('lens.smear: 요소가 필요합니다.');
  let s = _smears.get(el);
  if (!s) {
    const doc = el.ownerDocument || document, host = doc.body || el.parentNode;
    if (!host) throw new Error('lens.smear: 요소가 문서에 붙어 있지 않습니다. 요소를 DOM 에 넣은 뒤 부르세요.');
    const id = 'mh-smear-' + (++_n);
    const svg = doc.createElementNS(NS, 'svg'), filter = doc.createElementNS(NS, 'filter'), fe = doc.createElementNS(NS, 'feGaussianBlur');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    filter.setAttribute('id', id); fe.setAttribute('stdDeviation', '0 0');
    filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%'); filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');   // 기본 영역(±10%)이면 큰 번짐이 사각형으로 잘린다
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.appendChild(fe); svg.appendChild(filter); host.appendChild(svg);
    _smears.set(el, s = { fe, url: `url(#${id})` });
  }
  const sx = Math.min(max, Math.abs(vx) * k), sy = Math.min(max, Math.abs(vy) * k);
  if (sx < MIN && sy < MIN) { el.style.filter = ''; return; }
  s.fe.setAttribute('stdDeviation', `${fmt(sx)} ${fmt(sy)}`);
  el.style.filter = s.url;
}

// rack(dof, keys) — dof.rack(keys) 와 같다. 게이트가 `lens.rack(` 표기를 찾으므로 문서·장면은 이 형태를 쓴다
const rack = (l, keys) => l.rack(keys);

MH.lens = { blurFor, dof, rack, smear };
})();
