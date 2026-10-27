// 스토리보드 칸 계산 (순수 함수 — HyperFrames 없이 시험한다)
//   일반 장면: 한 칸, 대표 시점 = data-mh-key (없으면 길이의 60%)
//   무대(kind 'stage'): 비트마다 한 칸, 대표 시점 = 비트 시작 + 비트 길이의 60%, 라벨 `#<n> <무대>·<비트> <제목>`
const r3 = n => Math.round(n * 1000) / 1000;

export function sceneShot(s, n) {
  const key = s.key != null && !isNaN(+s.key) ? +s.key : s.dur * 0.6;
  return { t: r3(s.start + key), id: s.id, dur: s.dur, label: `#${n} ${s.title || s.id}   ${s.start.toFixed(1)}–${(s.start + s.dur).toFixed(1)}s  [${s.kind || 'scene'}]`, sub: s.note };
}

// stageShots(host, beats, n0 = 1) → 비트 시작 시각 순으로 칸 목록 (번호는 n0 부터)
export function stageShots(host, beats, n0 = 1) {
  return beats.slice().sort((a, b) => a.t0 - b.t0).map((b, i) => ({
    t: r3(host.start + b.t0 + 0.6 * (b.t1 - b.t0)), id: host.id, beat: b.id, dur: b.t1 - b.t0,
    label: `#${n0 + i} ${host.id}·${b.id}${b.title ? ' ' + b.title : ''}`, sub: b.note,
  }));
}

// storyboardShots(scenes, beatsOf) — scenes 는 시작 순. beatsOf(host) 는 무대의 비트 목록(없으면 []) → 비트가 없는 무대는 일반 장면처럼 한 칸
export function storyboardShots(scenes, beatsOf) {
  const out = [];
  for (const s of scenes) {
    const bs = s.kind === 'stage' ? beatsOf(s) || [] : [];
    out.push(...(bs.length ? stageShots(s, bs, out.length + 1) : [sceneShot(s, out.length + 1)]));
  }
  return out;
}
