// 스토리보드 칸 계산 (순수 함수 — HyperFrames 없이 시험한다)
//   일반 장면: 한 칸, 대표 시점 = data-mh-key (없으면 길이의 60%)
//   무대(kind 'stage'): 비트마다 한 칸, 대표 시점 = 비트 시작 + 비트 길이의 60%, 라벨 `#<n> <무대>·<비트> <제목>`
const r3 = n => Math.round(n * 1000) / 1000;

export function sceneShot(s, n) {
  const key = s.key != null && !isNaN(+s.key) ? +s.key : s.dur * 0.6;
  return { t: r3(s.start + key), id: s.id, dur: s.dur, label: `#${n} ${s.title || s.id}   ${s.start.toFixed(1)}–${(s.start + s.dur).toFixed(1)}s  [${s.kind || 'scene'}]`, sub: s.note };
}

const FRAME = 1 / 30;   // 무대 끝 시각은 다음 장면 몫 → 칸은 그보다 한 프레임 앞까지

// stageShots(host, beats, n0 = 1) → 비트 시작 시각 순으로 칸 목록 (번호는 n0 부터). 비트 구간은 [0, 무대 길이] 로 잘라 계산
export function stageShots(host, beats, n0 = 1) {
  const cl = v => Math.min(Math.max(v, 0), host.dur);
  return beats.slice().sort((a, b) => a.t0 - b.t0).map((b, i) => ({
    t: r3(host.start + Math.min(cl(b.t0) + 0.6 * (cl(b.t1) - cl(b.t0)), host.dur - FRAME)), id: host.id, beat: b.id, dur: b.t1 - b.t0,
    label: `#${n0 + i} ${host.id}·${b.id}${b.title ? ' ' + b.title : ''}`, sub: b.note,
  }));
}

// 무대 길이를 넘는 비트 → 경고 문구 목록 (board.mjs 가 출력)
export function beatWarnings(host, beats) {
  return beats.filter(b => b.t1 > host.dur || b.t0 >= host.dur).map(b => `⚠ ${host.id} 비트 ${b.id} (${b.t0}–${b.t1}s) 가 무대 길이 ${host.dur}s 를 넘습니다 — 비트 JSON 의 t0·t1 을 고치세요 (칸은 무대 끝 안쪽으로 잘라 그립니다).`);
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
