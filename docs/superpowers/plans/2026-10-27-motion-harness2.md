# motion-harness2 (v2) 공통 기반 + 2D 트랙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v1 하네스를 `motion-harness2` 로 옮기고, 레퍼런스 근거 게이트·근거표 감지·모션 검수·① 기본기 런타임·2D 리그/카메라/렌즈/특수효과/모핑·무대 모드를 더해 레퍼런스 B형 영상의 자연스러운 움직임을 코드만으로 재현한다.

**Architecture:** v1 구조(Claude Code 스킬 5개 → `harness/tools/*.mjs` Node 도구 → HyperFrames 장면 HTML + 브라우저 런타임 `window.MH`)를 그대로 유지한다. 새 Node 로직은 순수 함수 라이브러리(`harness/tools/lib/*.mjs`)로 분리해 `node:test` 로 검증하고, 새 브라우저 런타임은 v1처럼 클래식 스크립트(IIFE, `window.MH.*`)로 만들되 계산부(`pose`·`state`·`compile` 등)를 DOM 없이 호출할 수 있게 나눠 `vm` 으로 테스트한다. ② 효과 사용은 `catalog.json` 의 API 문자열을 장면 코드에서 찾아 PLAN.md 효과 표의 근거와 대조하는 `gate.mjs` 가 강제한다.

**Tech Stack:** Node 22+ (ESM, `node:test`, `node:vm`), ffmpeg/ffprobe, HyperFrames 0.8.202, GSAP 3.14.2 (+CustomEase), three 0.159.0(v1 그대로), Playwright(보드 합성), flubber 0.4.2, opentype.js 1.3.4, Pretendard 1.3.9 OTF(Bold·ExtraBold).

**Spec:** `docs/superpowers/specs/2026-10-27-motion-harness2-design.md`

## Global Constraints

- 플러그인 이름 `motion-harness2`, 명령어 접두사 `/motion-harness2:`, 스킬 5개 이름 `mv-setup`·`mv-new`·`mv-refs`·`mv-plan`·`mv-make` (v1과 동일).
- 설치 폴더 기본값 `~/.motion-harness2` (환경변수 `MH_DATA` 로 덮어쓰기 유지).
- 버전 고정: hyperframes `0.8.202`, three `0.159.0`, gsap `3.14.2`, playwright `^1.48.0`, flubber `0.4.2`, opentype.js `1.3.4`, Pretendard `1.3.9`.
- 런타임 결정성: 모든 런타임 계산은 장면 로컬 시간 `t` 의 순수 함수. `Math.random`·`Date`·타이머·`repeat:-1` 금지. 불규칙 값은 `MH.hash`/`MH.rng`.
- 런타임 파일은 클래식 스크립트(IIFE)이며 `window.MH` 에 붙는다. ES 모듈 금지(3D 트랙 전까지).
- 3단계: ① 기본기(게이트 없음) · ② 스타일 효과(효과 표의 레퍼런스 근거 필수) · ③ 사용자 지정(brief.md "효과 지정" 칸에 id 또는 카탈로그 `ko` 표현).
- 상시 비용: 자동 선택 스킬(mv-new·mv-refs·mv-plan) frontmatter `description` UTF-8 합계 ≤ 2,270바이트 (v1 측정 1,624바이트 ≈ 500토큰 → 약 700토큰 상당).
- 문서 크기: `harness/GUIDE.md` ≤ 15,000바이트, `harness/modules/*.md` 각 ≤ 3,072바이트.
- 사용자에게 보이는 도구 출력·문서는 한국어. 코드 식별자는 영어.
- 레퍼런스 A·B 영상은 저장소에 커밋하지 않는다. 테스트는 환경변수 `MH2_REF_A`·`MH2_REF_B` 가 있을 때만 사용.
- 모든 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 와 `Claude-Session: https://claude.ai/code/session_01FyGYKBKifhYLxxvKTX4dSZ` 두 줄.

## Review Focus

1. **Windows 경로(한글·공백)** — 사용자는 `바탕화면/모션 영상 2/` 같은 폴더에서 작업한다. gate·motion-qc·analyze-ref strip 이 경로 결합·출력에서 깨지면 안 된다. → Task 4, Task 7 에 한글+공백 경로 픽스처 테스트.
2. **v1 프로젝트(효과 표 없음)** — PLAN.md 에 효과 표가 없고 ② API 도 쓰지 않으면 게이트는 통과해야 한다. → Task 4 테스트.
3. **사람이 고친 효과 표 표기 차이** — `–`/`-`/`~`, `s` 생략, 공백 차이, `0.0-4.5` 와 `0–4.5s` 가 같은 근거로 읽혀야 한다. → Task 3 테스트.
4. **세로(9:16) 프로젝트** — 카메라·무대·감지기는 W×H 를 컴포지션에서 읽어야 하며 1920×1080 을 가정하면 안 된다. → Task 10, Task 15 테스트.
5. **짧거나 움직임 없는 레퍼런스** — 2초 미만, 컷 0개, 정지 화면 레퍼런스에서 감지기가 예외 없이 빈 후보를 내야 한다. → Task 5, Task 6 테스트.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` (저장소 루트, 개발용) | `npm test` = `node --test test/` |
| `test/helpers/runtime.mjs` | 브라우저 런타임을 `vm` 컨텍스트로 불러오는 테스트 도우미 |
| `test/helpers/frames.mjs` | 합성 프레임(무늬·이동·확대·흐림·채움·행 어긋남) 생성기 |
| `harness/catalog.json` | 효과 카탈로그 |
| `harness/tools/lib/catalog.mjs` | 카탈로그 읽기, 장면 코드에서 API 호출 찾기 |
| `harness/tools/lib/plan.mjs` | PLAN 효과 표·brief 효과 지정·사용 위치 해석 |
| `harness/tools/lib/detect.mjs` | 프레임 단위 감지기(순수 함수) |
| `harness/tools/lib/evidence.mjs` | 감지 시계열 → 효과 후보, ① 강도 추정 |
| `harness/tools/gate.mjs` | 게이트 CLI |
| `harness/tools/motion-qc.mjs` | 모션 검수 CLI |
| `harness/runtime/mh.js` | v1 + ① 기본기 |
| `harness/runtime/mh-rig.js` · `mh-cam.js` · `mh-lens.js` · `mh-fx.js` · `mh-morph.js` · `mh-stage.js` | 2D 모듈 |
| `harness/template/scene/compositions/_stage.html` | 무대 장면 템플릿 |
| `harness/modules/*.md` | 모듈 문서(rig2d·camera2d·lens2d·fx2d·morph·transitions·stage) |
| 수정: `analyze-ref.mjs`·`make.mjs`·`scene.mjs`·`board.mjs`·`new.mjs`·`setup.mjs`·`_common.mjs`·`config.json`·`template/scene/index.html`·`GUIDE.md`·`PLAN-example.md`·`skills/*/SKILL.md`·`README.md`·`.claude-plugin/*` | |

---

### Task 1: v1 이전과 이름 변경

**Files:**
- Create: v1 v0.4.0 전체 복사 (`.claude-plugin/`, `skills/`, `harness/`, `LICENSE`, `.gitignore`, `README.md`)
- Create: `package.json`, `test/unit/identity.test.mjs`
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `harness/tools/_common.mjs:12`, `skills/*/SKILL.md`, `harness/tools/*.mjs` 안내 문구, `README.md`

**Interfaces:**
- Produces: `DATA` 기본값 `path.join(os.homedir(), '.motion-harness2')`; 개발용 `npm test`.

- [ ] **Step 1: v1 복사**

```bash
git clone --depth 1 https://github.com/gud8238/motion-harness-v1 /tmp/mh1
cp -r /tmp/mh1/{.claude-plugin,skills,harness,LICENSE,.gitignore,README.md} .
```

- [ ] **Step 2: 실패하는 테스트 작성** — `test/unit/identity.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
test('plugin name is motion-harness2', () => {
  const p = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'));
  assert.equal(p.name, 'motion-harness2');
  assert.equal(p.repository, 'https://github.com/gud8238/motion-harness-v2');
  const m = JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json', 'utf8'));
  assert.equal(m.name, 'motion-harness2');
  assert.equal(m.plugins[0].name, 'motion-harness2');
});
test('default data dir is ~/.motion-harness2', async () => {
  delete process.env.MH_DATA;
  const { DATA } = await import('../../harness/tools/_common.mjs');
  assert.ok(DATA.endsWith('.motion-harness2'));
});
test('no v1 command prefix left in skills and tools', () => {
  const files = [...fs.readdirSync('skills').map(d => `skills/${d}/SKILL.md`), ...fs.readdirSync('harness/tools').filter(f => f.endsWith('.mjs')).map(f => `harness/tools/${f}`)];
  for (const f of files) assert.ok(!/\/motion-harness:/.test(fs.readFileSync(f, 'utf8')), f);
});
```

`package.json`: `{"name":"motion-harness2-dev","private":true,"type":"module","scripts":{"test":"node --test test/"}}`

- [ ] **Step 3: 실패 확인** — Run: `npm test` / Expected: 3개 FAIL.

- [ ] **Step 4: 이름 변경** — plugin.json(name·displayName "Motion Harness 2"·version "2.0.0-alpha.1"·repository), marketplace.json(name·plugins[0].name), `_common.mjs` DATA 기본 폴더명, 모든 `/motion-harness:` → `/motion-harness2:`, setup.mjs 의 `motion-harness-data` → `motion-harness2-data`, README 의 설치 명령을 `claude plugin marketplace add gud8238/motion-harness-v2` / `claude plugin install motion-harness2@motion-harness2` 로.

- [ ] **Step 5: 통과 확인** — Run: `npm test` / Expected: PASS 3.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: v1 v0.4.0 이전, motion-harness2 로 이름 변경"`

---

### Task 2: 효과 카탈로그

**Files:**
- Create: `harness/catalog.json`, `harness/tools/lib/catalog.mjs`, `test/unit/catalog.test.mjs`

**Interfaces:**
- Produces:
  - `loadCatalog(): Entry[]` — `Entry = { id: string, tier: 1|2, module: string|null, api: string[], detect: string|null, desc: string, ko: string[] }`
  - `findApiCalls(code: string, catalog: Entry[]): { ids: string[], api: string, line: number }[]` — tier 2 항목의 `api` 문자열이 나오는 모든 위치. 같은 api 문자열을 여러 id 가 공유하면 `ids` 에 모두 담는다. 주석(`//`, `/* */`, `<!-- -->`) 안은 무시.

카탈로그 내용(스펙 5.2 표 그대로, tier 1 항목 포함). tier 2 `api` 값:

| id | api |
|---|---|
| cam.pan · cam.push · cam.rotate | `["MH.cam("]` (셋이 공유) |
| cam.shake | `[".shake("]` |
| cam.parallax | `[".layer("]` |
| cam.onetake · trans.shared | `["MH.stage2d("]` (둘이 공유) |
| lens.dof | `["lens.dof("]` |
| lens.rack | `["lens.rack("]` |
| lens.smear | `["lens.smear("]` |
| lens.mblur | `[]` (렌더 단계, 효과 표 행으로만 켜짐) |
| fx.vhs · fx.glitch | `["fx.vhs("]` · `["fx.glitch("]` |
| time.remap | `["time.remap("]` |
| morph.shape · morph.text | `["morph.shape("]` · `["morph.text("]` |
| trans.fill · trans.zoomThrough · trans.whip · trans.match | `["trans.fill("]` · `["trans.zoomThrough("]` · `["trans.whip("]` · `["trans.match("]` |

`ko` 예: trans.fill `["화면 채움","채움 전환"]`, cam.push `["줌인","줌아웃","밀고 들어가기"]`, fx.vhs `["VHS","비디오테이프"]`, lens.dof `["심도","배경 흐림","보케"]`, lens.mblur `["모션 블러"]`, morph.shape `["모핑","모양 변형"]`, cam.onetake `["원테이크"]`, trans.shared `["공유 요소","캐릭터 연결"]`. 나머지도 2~3개씩.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('catalog has every spec 5.2 id with valid tier', () => {
  const ids = loadCatalog().map(e => e.id);
  for (const id of ['cam.pan','cam.push','cam.rotate','cam.shake','cam.parallax','cam.onetake','lens.dof','lens.rack','lens.smear','lens.mblur','fx.vhs','fx.glitch','time.remap','morph.shape','morph.text','trans.fill','trans.zoomThrough','trans.whip','trans.match','trans.shared','move','follow','spring','phys','rig.actor'])
    assert.ok(ids.includes(id), id);
  for (const e of loadCatalog()) { assert.ok([1,2].includes(e.tier)); assert.ok(Array.isArray(e.ko)); }
});
test('findApiCalls finds lines and shared ids, ignores comments', () => {
  const code = 'a\n  const cam = MH.cam(world, {W, H});\n// trans.fill(t)\n  trans.fill(t, el, {t0: 4})';
  const r = findApiCalls(code, loadCatalog());
  assert.deepEqual(r.map(x => x.line), [2, 4]);
  assert.deepEqual(r[0].ids.sort(), ['cam.pan','cam.push','cam.rotate']);
});
test('tier 1 api never reported', () => {
  assert.deepEqual(findApiCalls('MH.move(t,0,0,1)', loadCatalog()), []);
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/unit/catalog.test.mjs` → FAIL (모듈 없음).
- [ ] **Step 3: 구현** — `catalog.json` 작성, `catalog.mjs` 에 두 함수. 주석 제거는 같은 길이의 공백으로 치환해 줄 번호를 유지한다.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS.
- [ ] **Step 5: Commit** — `feat: 효과 카탈로그와 API 호출 탐지`

---

### Task 3: 효과 표·brief·사용 위치 해석

**Files:**
- Create: `harness/tools/lib/plan.mjs`, `test/unit/plan.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `parseEffectTable(md: string): Row[]` — `Row = { id, tier: 1|2|3, evidence: { ref: string, t0: number, t1: number, img: string } | { user: true } | { invalid: string }, where: string, line: number }`. "효과 표" 제목 다음의 첫 마크다운 표만 읽는다. 단계 칸 `②`/`2`/`②단계` → 2, `③`/`3` → 3, `①`/`1` → 1. 표가 없으면 `[]`.
  - 근거 칸 문법: `<ref> <t0><구분자><t1>[s] (<img>)`, 구분자 `–`·`-`·`~`·`—`, 공백 임의, 소수점 선택. `사용자 지정` → `{user:true}`. 그 외 → `{invalid: 원문}`.
  - `parseBriefEffects(md: string): string[]` — brief.md 의 `## 효과 지정` 절 본문(다음 `## ` 전까지)의 모든 줄을 `-`·공백 제거 후 반환. 절이 없으면 `[]`.
  - `readBeats(html: string, id: string): { id, t0, t1, title, note }[]` — 장면 파일의 `<script type="application/json" id="<id>-beats">` JSON. 없거나 깨졌으면 `[]`.
  - `resolveWhere(where: string, hosts: {id,start,dur}[], beats: Record<string, {id,t0,t1}[]>): [number, number][]` — `s4` → 장면 전역 구간, `st1 b1–b3` → 무대 st1 의 비트 b1 시작~b3 끝 전역 구간, `st1 b2` → 해당 비트, 쉼표로 여러 개. 해석 불가 토큰은 무시.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const MD = `# 계획\n효과 표 (② 는 근거 필수)\n| 효과 id | 단계 | 근거 | 사용 위치 |\n|---|---|---|---|\n| cam.onetake | ② | b 0.0–4.5s (ev_01.png) | st1 b1–b3 |\n| trans.fill | 2 | b 4.6-5.4 (ev_03.png) | st1 b2 |\n| fx.vhs | ③ | 사용자 지정 | s4 |\n| lens.dof | ② | 레퍼런스에 있음 | s2 |\n`;
test('parses rows with dash variants', () => {
  const r = parseEffectTable(MD);
  assert.deepEqual(r[0].evidence, { ref: 'b', t0: 0, t1: 4.5, img: 'ev_01.png' });
  assert.deepEqual(r[1].evidence, { ref: 'b', t0: 4.6, t1: 5.4, img: 'ev_03.png' });
  assert.equal(r[1].tier, 2);
  assert.deepEqual(r[2].evidence, { user: true });
  assert.ok(r[3].evidence.invalid);
  assert.equal(r[3].line, 8);
});
test('tilde and em dash and spaces', () => {
  const r = parseEffectTable('효과 표\n| a | b | c | d |\n|-|-|-|-|\n| cam.pan | ② | ref-1 1 ~ 2 s ( ev_02.png ) | s1 |');
  assert.deepEqual(r[0].evidence, { ref: 'ref-1', t0: 1, t1: 2, img: 'ev_02.png' });
});
test('no table → []', () => assert.deepEqual(parseEffectTable('# v1 계획\n| # | 항목 |'), []));
test('brief effects', () => {
  assert.deepEqual(parseBriefEffects('## 효과 지정\n- VHS\n- trans.fill\n\n## 꼭 넣을 것\n- x'), ['VHS', 'trans.fill']);
});
test('readBeats', () => {
  assert.deepEqual(readBeats('<script type="application/json" id="st1-beats">[{"id":"b1","t0":0,"t1":4}]</script>', 'st1').map(b => b.id), ['b1']);
  assert.deepEqual(readBeats('<div></div>', 'st1'), []);
});
test('resolveWhere', () => {
  const hosts = [{ id: 's4', start: 20, dur: 4 }, { id: 'st1', start: 2, dur: 15 }];
  const beats = { st1: [{ id: 'b1', t0: 0, t1: 4 }, { id: 'b2', t0: 4, t1: 6 }, { id: 'b3', t0: 6, t1: 9 }] };
  assert.deepEqual(resolveWhere('st1 b1–b3', hosts, beats), [[2, 11]]);
  assert.deepEqual(resolveWhere('s4, st1 b2', hosts, beats), [[20, 24], [6, 8]]);
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/unit/plan.test.mjs` → FAIL.
- [ ] **Step 3: 구현** — 세 함수.
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 효과 표·brief 효과 지정·비트·사용 위치 해석`

---

### Task 4: 게이트 CLI, make 연결, brief 갱신

**Files:**
- Create: `harness/tools/gate.mjs`, `harness/tools/lib/brief.mjs`, `test/unit/gate.test.mjs`, `test/fixtures/gate/` (아래 4개 프로젝트)
- Modify: `harness/tools/make.mjs` (검사 단계 직후 gate 실행), `harness/tools/new.mjs` (brief 템플릿)

**Interfaces:**
- Consumes: `loadCatalog`, `findApiCalls` (Task 2), `parseEffectTable`, `parseBriefEffects` (Task 3)
- Produces:
  - `runGate(projDir: string): { ok: boolean, violations: { id: string, file: string, line: number, reason: 'no-row'|'bad-evidence'|'missing-image'|'user-not-in-brief' }[] }` (export, CLI 와 테스트 공용)
  - CLI: `node gate.mjs <P>` → 위반 없으면 `✔ 게이트 통과 (② N개)` 종료 0, 있으면 위반마다 `✖ <id> — <file>:<line> — <사유>` 와 해결책 3줄(근거 추가 `analyze-ref.mjs strip` / brief "효과 지정"에 추가 / 효과 제거) 후 종료 1.
  - 근거 이미지 경로 규칙: `work/ref-<ref>/<img>` 가 존재해야 한다.
  - 효과 표의 ② 행은 장면에서 쓰지 않아도 근거를 검사한다(lens.mblur 처럼 행만으로 켜지는 효과 때문).
  - `briefTemplate(name: string, aspect: string): string` (`lib/brief.mjs`, new.mjs 가 사용) — brief.md 템플릿: 첫 줄 위에 `<!-- harness: v2 -->`, `## 꼭 넣을 것 / 피할 것` 앞에 `## 효과 지정 (선택 — 레퍼런스에 없어도 넣고 싶은 효과)\n- (예: VHS 화면, 화면 채움 전환)\n` 절.

픽스처(각 폴더에 `scene/compositions/*.html`, `work/PLAN.md`, `brief.md`, 필요 시 `work/ref-b/ev_01.png`):
- `ok/` — `MH.stage2d(` 사용, 효과 표 `cam.onetake | ② | b 0–4.5s (ev_01.png)`, 이미지 있음
- `missing/` — `trans.fill(` 사용, 효과 표 없음
- `user/` — `fx.vhs(` 사용, 표 `fx.vhs | ③ | 사용자 지정`, brief 효과 지정에 `VHS`
- `v1 프로젝트 폴더/` (한글+공백 이름) — v1 dom 장면만, PLAN 에 효과 표 없음

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const F = p => path.join('test/fixtures/gate', p);
test('ok project passes', () => assert.equal(runGate(F('ok')).ok, true));
test('missing row blocks with file and line', () => {
  const r = runGate(F('missing'));
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].id, 'trans.fill');
  assert.equal(r.violations[0].reason, 'no-row');
  assert.ok(r.violations[0].line > 0);
});
test('user-specified passes only when brief lists it', () => {
  assert.equal(runGate(F('user')).ok, true);
  // brief 에서 VHS 를 지운 복사본 → user-not-in-brief
});
test('missing evidence image blocks', () => { /* ok 복사본에서 ev_01.png 삭제 → reason 'missing-image' */ });
test('v1 project with Korean+space path passes', () => assert.equal(runGate(F('v1 프로젝트 폴더')).ok, true));
test('CLI exit codes', () => {
  assert.equal(spawnSync(process.execPath, ['harness/tools/gate.mjs', F('ok')]).status, 0);
  assert.equal(spawnSync(process.execPath, ['harness/tools/gate.mjs', F('missing')]).status, 1);
});
```

복사본이 필요한 두 테스트는 `fs.cpSync` 로 `os.tmpdir()` 아래에 만든다.

- [ ] **Step 2: 실패 확인** — `node --test test/unit/gate.test.mjs` → FAIL.
- [ ] **Step 3: 구현** — `gate.mjs`(runGate export + `import.meta.url` 이 실행 파일일 때만 CLI 동작), make.mjs 검사 통과 직후 `spawnSync(gate.mjs)` 하고 종료 코드 1이면 `die('게이트 위반 — 위 안내대로 고친 뒤 다시 실행')`, new.mjs 의 인라인 brief 템플릿을 `briefTemplate` 호출로 교체.
- [ ] **Step 4: 통과 확인** → PASS. 추가로 `node harness/tools/new.mjs` 를 임시 폴더에서 실행하지 않고 템플릿 문자열만 테스트: `test('brief template has v2 header and 효과 지정')` — `lib/brief.mjs` 의 `briefTemplate('t', '16:9')` 결과에 `<!-- harness: v2 -->` 와 `## 효과 지정` 포함.
- [ ] **Step 5: Commit** — `feat: 3단계 게이트 검사와 brief 효과 지정 칸`

---

### Task 5: 감지기 라이브러리

**Files:**
- Create: `harness/tools/lib/detect.mjs`, `test/helpers/frames.mjs`, `test/unit/detect.test.mjs`

**Interfaces:**
- Produces (모두 순수 함수, 프레임은 행 우선 `Uint8Array`):
  - `globalMotion(a: Gray, b: Gray, w, h): { dx, dy, scale, rot, parallax, res }` — 8×6 격자 블록(블록 크기 `floor(w/8)`×`floor(h/6)`)마다 ±6px SAD 블록 매칭 → 블록 벡터들에 유사 변환(이동·균일 확대·회전) 최소제곱 적합. `parallax` = 위 절반 블록 잔차 평균 이동과 아래 절반 잔차 평균 이동의 차 크기(px). `res` = 잔차 평균(px). 단위: dx·dy px, rot 도.
  - `sharpness(g: Gray, w, h, grid = [4, 3]): Float32Array` — 칸별 4-이웃 라플라시안 분산.
  - `directionalBlur(g: Gray, w, h): { ratio, angle }` — 수평·수직·두 대각 방향 그라디언트 에너지의 최대/최소 비, angle 은 최소 에너지 방향(도).
  - `fillRatio(rgb: Rgb, w, h): { ratio, hex }` — 각 채널 32단계 양자화 후 최빈 색의 화면 비율.
  - `rowJitter(g: Gray, w, h): number` — 인접 행 쌍마다 ±8px 가로 이동 중 SAD 최소 이동량의 평균(px).
  - `accentBlobs(rgb: Rgb, w, h, accents: string[]): Blob[]` — `Blob = { hex, cx, cy, area, bbox: [x0,y0,x1,y1], sig: Float32Array(16) }`. 강조색과 Lab ΔE < 18 인 픽셀의 4-연결 성분 중 면적 ≥ 0.2% 인 것. `sig` = 중심에서 16방향 경계까지 거리 / 최대 거리.
  - `sigSimilarity(a: Float32Array, b: Float32Array): number` — 0~1 (1 − 평균 절대차, 회전 순환 최대값).
- `test/helpers/frames.mjs` 생성기: `pattern(w,h,seed)`(결정적 무늬), `shift(g,w,h,dx,dy)`, `zoom(g,w,h,s)`, `blurRegion(g,w,h,rect,r)`, `hBlur(g,w,h,r)`, `flood(w,h,hex,ratio)`(RGB), `jitterRows(g,w,h,amp,seed)`, `disk(w,h,hex,cx,cy,r)`·`rect(...)`(RGB).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const w = 160, h = 90, P = pattern(w, h, 1);
test('globalMotion recovers shift', () => { const m = globalMotion(P, shift(P, w, h, 4, -2), w, h); assert.ok(Math.abs(m.dx - 4) < 0.6 && Math.abs(m.dy + 2) < 0.6 && Math.abs(m.scale - 1) < 0.02); });
test('globalMotion recovers zoom', () => { const m = globalMotion(P, zoom(P, w, h, 1.06), w, h); assert.ok(Math.abs(m.scale - 1.06) < 0.02); });
test('static frames → zero motion', () => { const m = globalMotion(P, P, w, h); assert.ok(Math.abs(m.dx) < 0.1 && Math.abs(m.scale - 1) < 0.005); });
test('flat frames do not throw', () => { const z = new Uint8Array(w * h).fill(128); assert.doesNotThrow(() => globalMotion(z, z, w, h)); });
test('sharpness: blurred edges lower than sharp center', () => { const s = sharpness(blurRegion(P, w, h, 'edges', 4), w, h); assert.ok(s[5] > 2 * s[0]); });
test('directionalBlur detects horizontal smear', () => { const d = directionalBlur(hBlur(P, w, h, 6), w, h); assert.ok(d.ratio > 2.5); });
test('fillRatio', () => { assert.ok(Math.abs(fillRatio(flood(w, h, '#F2C94C', 0.95), w, h).ratio - 0.95) < 0.03); });
test('rowJitter', () => { assert.ok(rowJitter(jitterRows(P, w, h, 4, 2), w, h) > 1.5 && rowJitter(P, w, h) < 0.5); });
test('accentBlobs + sigSimilarity', () => {
  const a = accentBlobs(disk(w, h, '#F2C94C', 80, 45, 20), w, h, ['#F2C94C'])[0];
  const b = accentBlobs(rect(w, h, '#F2C94C', 60, 25, 40, 40), w, h, ['#F2C94C'])[0];
  assert.ok(sigSimilarity(a.sig, a.sig) > 0.99 && sigSimilarity(a.sig, b.sig) < 0.9);
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/unit/detect.test.mjs` → FAIL.
- [ ] **Step 3: 구현** — 위 시그니처. 유사 변환 적합: 블록 중심 `p` 와 이동 `v` 에서 `p+v ≈ s·R(θ)·(p−c)+c+t` (c = 화면 중심) 를 선형화한 4변수 최소제곱(a=s·cosθ, b=s·sinθ, tx, ty). 텍스처 없는 블록(SAD 최소·최대 차가 작음)은 제외, 남은 블록이 6개 미만이면 `{dx:0,dy:0,scale:1,rot:0,parallax:0,res:0}`.
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 레퍼런스 감지기 라이브러리`

---

### Task 6: 근거표(evidence)와 analyze-ref 연결

**Files:**
- Create: `harness/tools/lib/evidence.mjs`, `test/unit/evidence.test.mjs`, `test/ref/refs.test.mjs`
- Modify: `harness/tools/analyze-ref.mjs` (analyzeVideo 끝에 evidence 단계, `strip` 하위 명령, analysis.md 에 ① 강도 줄)

**Interfaces:**
- Consumes: Task 5 전부
- Produces:
  - `measureSeries(file: string, P: probe, opts?): Series` — ffmpeg 원시 프레임(움직임 160×(비율) 12fps 회색, 색 96×(비율) 12fps RGB)으로 프레임별 `{t, gm, sharp, dblur, fill, jitter, blobs}` 배열. 강조색은 `analysis.json` 의 `color.accents`.
  - `buildCandidates(series: Series, cuts: number[], dur: number, W: number, H: number): Candidate[]` — `Candidate = { id, t0, t1, score, signal }`, 같은 id 의 0.3초 이내 인접 후보는 병합, score 내림차순 id 당 최대 3개.
  - `estimateStrength(energy: number[], fps: number, peaks: number[]): { dur: number, over: number, hold: number }` — 피크 전후 10%→90% 상승 시간 평균(dur, 초), 피크 이후 0.3초 안 2차 상승 높이 / 1차 높이(over, 0~1), analysis 의 holds 평균(hold, 초).
  - 판정 규칙(초기값, 상수 객체 `TH` 로 export — Task 17 에서 A·B 로 보정):

| id | 규칙 |
|---|---|
| cam.push | 무컷 구간 ≥0.8s 동안 누적 scale >1.15 또는 <0.87 |
| cam.pan | 무컷 ≥0.8s 동안 누적 \|dx\| 또는 \|dy\| > 0.25·w, 누적 scale 변화 <8% |
| cam.rotate | 무컷 구간 누적 \|rot\| > 4° |
| cam.shake | 0.5s 창에서 dx·dy 부호 변화 ≥3회 & 진폭 0.3~3% w |
| cam.parallax | parallax 평균 >1.0px 가 ≥0.6s |
| cam.onetake | 무컷 구간 ≥6s 이고 그 중 \|gm\| 움직임 프레임 ≥60% |
| lens.dof | 중앙 2칸 / 가장자리 칸 선명도 비 >2.5 가 ≥1s |
| lens.rack | 최대 선명 칸이 무컷 1.5s 안에서 ≥2칸 이동 |
| lens.mblur | 움직임 큰 프레임(\|dx\|+\|dy\| >3px) 중 dblur.ratio >2.2 비율 ≥30% |
| lens.smear | 전역 움직임 작음(<1px) & dblur.ratio >2.2 프레임 ≥4개 연속 |
| fx.vhs | jitter >1.2 가 ≥1s 지속 |
| fx.glitch | jitter >2.0 짧은 폭발(<0.5s) ≥2회 |
| trans.fill | fill.ratio 가 1.0s 안에 <0.4 → >0.9 |
| trans.zoomThrough | 컷 직전 0.5s scale 증가율 >1.5배/s |
| trans.whip | 컷 ±0.4s 에 \|dx\| 속도 >0.5·w/s & dblur.ratio >2.2 |
| trans.match | 컷 전후 같은 hex 블롭: 중심 거리 <0.08·대각선, sig 유사도 >0.85, 면적비 0.5~2 |
| trans.shared | 같은 hex 블롭이 컷 ≥2개를 넘어 프레임 ≥80% 에 존재 |
| morph.shape | 무컷, 같은 hex 블롭 유지, t 와 t+0.5s sig 유사도 <0.6 |

  - analyze-ref 산출물: `work/ref-<base>/evidence.json` (`{ ref, candidates: [{ ...Candidate, strip: 'ev_NN.png' }] }`), 후보마다 구간을 6등분한 프레임 strip `ev_NN.png`(board, cols 6), 전체 묶음 `evidence.png`(후보 strip 을 세로로, 라벨 `ev_NN · <id> · t0–t1s · <signal>`). 후보 0개면 evidence.png 는 "자동 감지 후보 없음 — 필요하면 strip 명령으로 근거를 만드세요" 한 칸.
  - `node analyze-ref.mjs strip <P> ref/<파일> <t0> <t1>` → 다음 번호 `ev_mNN.png` 생성, 경로 출력.
  - analysis.md 에 `| ① 기본기 강도(추정) | 동작 <dur>s · 오버슈트 <over> · 정지 <hold>s |` 행, analysis.json 에 `motionStrength`.
  - 감지기 하나가 예외를 던지면 그 신호만 비우고 analysis.md 에 `감지 실패: <이름>` 기록.

- [ ] **Step 1: 실패하는 테스트 작성** — `evidence.test.mjs` 는 합성 Series 로 규칙 검증:

```js
const S = (n, f) => Array.from({ length: n }, (_, i) => ({ t: i / 12, gm: { dx: 0, dy: 0, scale: 1, rot: 0, parallax: 0 }, sharp: new Float32Array(12).fill(10), dblur: { ratio: 1 }, fill: { ratio: 0.1, hex: '#ffffff' }, jitter: 0, blobs: [], ...f(i) }));
test('zoom-out series → cam.push', () => { const c = buildCandidates(S(24, () => ({ gm: { dx: 0, dy: 0, scale: 0.985, rot: 0, parallax: 0 } })), [], 2, 160, 90); assert.ok(c.some(x => x.id === 'cam.push')); });
test('fill series → trans.fill with time', () => { const c = buildCandidates(S(24, i => ({ fill: { ratio: i < 10 ? 0.2 : 0.95, hex: '#f2c94c' } })), [], 2, 160, 90).find(x => x.id === 'trans.fill'); assert.ok(c && c.t0 >= 0.5 && c.t1 <= 1.2); });
test('static series → no candidates', () => assert.deepEqual(buildCandidates(S(24, () => ({})), [], 2, 160, 90), []));
test('very short series (<2s, 1 frame) → []', () => assert.deepEqual(buildCandidates(S(1, () => ({})), [], 0.08, 160, 90), []));
test('estimateStrength overshoot', () => { const e = [0, .2, .6, 1, .6, .2, .05, .35, .1, 0, 0, 0]; const s = estimateStrength(e, 12, [3 / 12]); assert.ok(s.over > 0.2 && s.dur > 0); });
```

`test/ref/refs.test.mjs` — `MH2_REF_B` 가 없으면 `test.skip`. 있으면 임시 프로젝트에 복사 후 analyze-ref 실행, evidence.json 에 cam.push(0~4s 안), trans.fill(4~6.5s 안), morph.shape(30~36s 안), trans.shared 가 있는지. `MH2_REF_A` 는 lens.dof, fx.vhs.

- [ ] **Step 2: 실패 확인** — `node --test test/unit/evidence.test.mjs` → FAIL.
- [ ] **Step 3: 구현** — evidence.mjs + analyze-ref 연결.
- [ ] **Step 4: 통과 확인** — 단위 PASS. 정지 이미지 영상 스모크: `ffmpeg -f lavfi -i color=c=gray:s=320x180:d=1.5 -pix_fmt yuv420p /tmp/still.mp4` 로 만든 1.5초 무움직임 영상을 임시 프로젝트 ref/ 에 넣고 analyze-ref 실행 → 종료 0, evidence.json candidates `[]`.
- [ ] **Step 5: Commit** — `feat: 레퍼런스 효과 근거표(evidence)와 strip 명령`

---

### Task 7: 모션 검수와 make 연결

**Files:**
- Create: `harness/tools/motion-qc.mjs`, `test/unit/motion-qc.test.mjs`
- Modify: `harness/tools/make.mjs` (검수 단계 뒤 motion-qc 실행, `--draft` 때는 생략)

**Interfaces:**
- Consumes: `measureSeries`, `buildCandidates` (Task 6), `parseEffectTable`, `resolveWhere`, `readBeats` (Task 3), `hosts` (`_common.mjs`), `board`
- Produces:
  - `qcCompare(rows: Row[], ranges: Record<string, [number,number][]>, found: Candidate[]): { id, where, ok: boolean }[]` — 행의 사용 위치 구간과 0.5s 이상 겹치는 같은 id 후보가 있으면 ok. 감지기 없는 효과(`detect: null`)는 `ok: null`(눈 확인).
  - `unplanned(found: Candidate[], rows: Row[]): Candidate[]` — 효과 표에 없는 ② id 후보.
  - `stiffness(series: Series): { kind: 'linear'|'hardstop', t0, t1 }[]` — linear: 전역 속도 > 2px/frame 이 ≥0.5s 동안 변동계수 <0.05. hardstop: 한 프레임 사이 속도가 >4px → <0.3px.
  - CLI `node motion-qc.mjs <P>`: 결과 `work/motion-qc.json`, `work/qc-motion.png`(효과 행·시그니처마다 위: 레퍼런스 근거 구간 6프레임, 아래: 우리 영상 같은 길이 6프레임, board pair). 항상 종료 0, 콘솔에 `✔/✗/?` 목록과 경고.
  - 무대 비트는 `readBeats` 로 읽는다. 없으면 장면 단위만.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('qcCompare matches overlapping candidate', () => {
  const rows = [{ id: 'trans.fill', tier: 2, where: 'st1 b2' }, { id: 'time.remap', tier: 2, where: 's4' }];
  const r = qcCompare(rows, { 'st1 b2': [[6, 8]], s4: [[20, 24]] }, [{ id: 'trans.fill', t0: 6.4, t1: 7.2 }]);
  assert.deepEqual(r.map(x => x.ok), [true, null]);
});
test('unplanned flags tier-2 not in table', () => {
  assert.deepEqual(unplanned([{ id: 'lens.dof', t0: 1, t1: 2 }], [{ id: 'trans.fill' }]).map(x => x.id), ['lens.dof']);
});
test('stiffness finds linear segment and hard stop', () => { /* 합성 series: 12프레임 dx=3 일정 → linear, 다음 프레임 dx=0 → hardstop */ });
test('Korean+space project path', () => { /* 임시 '모션 영상 2' 폴더에 PLAN·index.html 만 두고 resolve 단계 함수가 예외 없이 동작 */ });
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — 세 함수 export + CLI, make.mjs 연결(실패해도 렌더 결과는 유지하고 경고만).
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 모션 검수(motion-qc)`

---

### Task 8: ① 기본기 런타임

**Files:**
- Create: `test/helpers/runtime.mjs`, `test/unit/mh-basics.test.mjs`
- Modify: `harness/runtime/mh.js` (export 객체에 추가), `harness/template/scene/index.html` (DNA.motion)

**Interfaces:**
- Produces:
  - `loadUMD(file: string): object` (테스트 도우미) — UMD 빌드를 `vm` 에서 실행해 `module.exports` 또는 전역에 붙은 객체 반환.
  - `loadRuntime(files: string[], globals?: object): window` (테스트 도우미) — `vm.createContext({ window, console, ...globals })`, `window.window = window`, `document` 는 `createElement` 만 있는 최소 스텁.
  - `MH.motion(): { ant, over, settle, hold, squash }` — 기본 `{ ant: 0.12, over: 0.08, settle: 0.35, hold: 0.4, squash: 1.25 }` 에 `window.DNA.motion` 덮어쓰기.
  - `MH.move(t, t0, a, b, o = {}): number | number[]` — `o.dur` 기본 0.6. 구간: [t0, t0+0.2·dur] 예비동작(목표 반대로 `ant·(b−a)`), [.., t0+dur] 본 이동(E.inOut) 끝에서 `over·(b−a)` 지나침, [t0+dur, t0+dur+settle] 감쇠 진동으로 b 에 안착. 배열이면 성분별.
  - `MH.follow(t, fn, o = {}): number` — `o.lag` 0.08, `o.damp` 0.6, `o.step` 1/120. 목표 `fn(τ − lag)` 를 쫓는 감쇠 스프링(주파수 3Hz)을 `MH.sim` 으로 적분.
  - `MH.sim(t, step, init, update): any` — `update` 함수 객체를 키로 `WeakMap` 메모 `{ t, state }`. 요청 t ≥ 메모 t 면 이어서 적분, 아니면 0부터. `update(state, τ, step)` 는 새 상태를 반환해야 한다(제자리 수정 금지 — 문서 주석으로 명시).
  - `MH.gsapSpring(name, preset = 'playful'): string` — preset 은 `SPRING` 키 또는 `{f, z}`. 스프링을 0~정착시간(진폭 <0.001)에서 60점 샘플해 `CustomEase.create(name, "M0,0 L…")` 등록, 이름 반환. CustomEase 없으면 `'back.out(1.7)'` 반환.
  - `MH.phys.body({ pos, vel, spin = 0, rot = 0, g = 2400, bounce = 0.4, floor = null, t0 = 0 }): { at(t): { x, y, rot } }` — 해석적 탄도. floor 가 있으면 충돌 시각을 구해 vy·(−bounce) 로 반사를 반복, 반사 후 |vy| < 60 이면 floor 에 정지. 회전은 spin·Δt (정지 후 고정).
  - index.html `window.DNA` 에 `motion: { ant: 0.12, over: 0.08, settle: 0.35, hold: 0.4, squash: 1.25 }` 추가.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const W = loadRuntime(['harness/runtime/mh.js']), MH = W.MH;
test('move endpoints and phases', () => {
  assert.equal(MH.move(0.9, 1, 0, 100), 0);
  assert.equal(MH.move(3, 1, 0, 100), 100);
  const xs = Array.from({ length: 200 }, (_, i) => MH.move(1 + i * 0.01, 1, 0, 100));
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 100);
  const flat = Array.from({ length: 200 }, (_, i) => MH.move(1 + i * 0.01, 1, 0, 100, { ant: 0, over: 0 }));
  assert.ok(flat.every((v, i) => i === 0 || v >= flat[i - 1] - 1e-9));
});
test('DNA.motion overrides defaults', () => { const W2 = loadRuntime(['harness/runtime/mh.js'], {}); W2.DNA = { motion: { over: 0 } }; assert.equal(W2.MH.motion().over, 0); });
test('sim/follow deterministic under random seek order', () => {
  const f = t => (t > 1 ? 100 : 0), ts = [2.5, 0.3, 1.7, 1.1, 2.9, 0.8];
  const fresh = ts.map(t => loadRuntime(['harness/runtime/mh.js']).MH.follow(t, f));
  const seq = ts.map(t => MH.follow(t, f));
  assert.deepEqual(seq.map(v => v.toFixed(6)), fresh.map(v => v.toFixed(6)));
  assert.ok(Math.abs(MH.follow(3, f) - 100) < 1);
});
test('phys body', () => {
  const b = MH.phys.body({ pos: [0, 0], vel: [100, -800], floor: 300 });
  assert.deepEqual([b.at(0).x, b.at(0).y], [0, 0]);
  for (let t = 0; t < 4; t += 0.01) assert.ok(b.at(t).y <= 300 + 1e-6);
  assert.equal(b.at(10).y, 300);
});
test('gsapSpring registers path with overshoot', () => {
  let path = ''; const W3 = loadRuntime(['harness/runtime/mh.js'], { CustomEase: { create: (n, p) => (path = p) }, gsap: { registerPlugin() {} } });
  assert.equal(W3.MH.gsapSpring('pop'), 'pop');
  assert.ok(path.startsWith('M0,0') && path.split(/[ ,L]+/).map(Number).some(v => v > 1));
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/unit/mh-basics.test.mjs` → FAIL.
- [ ] **Step 3: 구현** — 위 함수들을 mh.js 에 추가하고 `window.MH` 에 `motion, move, follow, sim, gsapSpring, phys` 를 export.
- [ ] **Step 4: 통과 확인** → PASS. v1 기존 export 이름이 모두 남아 있는지 `test('v1 exports intact')` 로 `['tween','kf','springAt','drive','load','gsapEase','trans','txtIn']` 확인.
- [ ] **Step 5: Commit** — `feat: ① 기본기 런타임 (move·follow·sim·gsapSpring·phys)`

---

### Task 9: 2D 캐릭터 리그 — 코드 캐릭터

**Files:**
- Create: `harness/runtime/mh-rig.js`, `test/unit/rig.test.mjs`
- Modify: `harness/template/scene/index.html` (`<script src="assets/lib/mh-rig.js">` 를 mh.js 뒤에), `harness/tools/new.mjs` (libs 목록에 추가)

**Interfaces:**
- Consumes: `MH.move`, `MH.follow`, `MH.motion`, `MH.hash`, `MH.springAt`
- Produces (`window.MH.rig`):
  - `normalize(design): Design` — 기본값: `body { shape: 'roundRect', w: 200, h: 160, r: 48, color: '#F2C94C' }`, `eyes { shape: 'oval', gap: 0.32, size: 0.12, y: -0.05, color: '#111' }`, `mouth { shape: 'none' }`, `cheeks: null`, `limbs: []`, `extras: []`. shape 허용값: body `roundRect|blob|capsule`, eyes `dot|oval|line`, mouth `none|line|smile|open|o`.
  - `pose(design, actions, t, o = { seed: 1, life: true }): Pose` — `Pose = { x, y, sx, sy, rot, eyes: { open: 0..1, lx, ly, shape }, mouth: { shape, open }, face, limbs: number[], sweat: 0..1, anchor: 0..1 }`. actions = `[t, name, opts][]` 시간순 정렬 후 적용.
    - `blink` (0.12s), `look {x,y}` (−1..1, MH.move), `face '<name>'` (idle|happy|sweat|squint|star|sad|surprise — 눈·입 shape 매핑 표를 파일 상단 상수 `FACES` 로), `hop {to:[x,y], h=120}` (예비 웅크림 sy=1−0.2·ant 배율, 비행 포물선, 착지 squash 후 follow 흔들림), `squash {amt}`·`stretch {x, y}` (opts 의 `x`/`y`/`amt` 가 있으면 그 배율, 없으면 `MH.motion().squash`), `nod`, `shake`, `walk {to, steps}`, `talk {dur}` (입 열림 6Hz), `enter {from, at}`, `exit {to}`, `grow {fill: 'screen', dur}` (anchor 0→1, 크기 화면 대각선까지), `anchor {to: 'world'|'screen'}`.
    - life: 깜빡임 간격 `2.2 + 2.3·hash(seed, k)` 초, 호흡 sy `1 ± 0.015`(0.25Hz), 미세 흔들림 rot `±0.6°`(noise).
  - `geometry(design, pose): { part: string, d: string, fill: string, transform: string }[]` — 몸통·눈·입·볼·팔다리·땀 SVG path 와 transform. 순수 함수.
  - `actor(target, design, o = {}): Actor` — `Actor = { act(list), pose(t), render(t), life(on: boolean), design }`. target 이 SVG 요소면 `<g>` 아래 `<path>` 를 갱신, `CanvasRenderingContext2D` 면 `Path2D` 로 그림.
  - `load(name): Promise<Design|RigJson>` — `fetch('assets/actors/' + name + '.json')`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const MH = loadRuntime(['harness/runtime/mh.js', 'harness/runtime/mh-rig.js']).MH, D = MH.rig.normalize({});
test('blink closes eyes briefly', () => {
  const A = [[1, 'blink']];
  assert.ok(MH.rig.pose(D, A, 1.06, { life: false }).eyes.open < 0.2);
  assert.equal(MH.rig.pose(D, A, 1.5, { life: false }).eyes.open, 1);
});
test('hop anticipates then lands at target', () => {
  const A = [[0, 'hop', { to: [300, 0] }]], ys = Array.from({ length: 60 }, (_, i) => MH.rig.pose(D, A, i * 0.03, { life: false }));
  assert.ok(ys.slice(0, 5).some(p => p.sy < 1));         // 웅크림
  assert.ok(Math.min(...ys.map(p => p.y)) < -50);           // 비행
  assert.equal(MH.rig.pose(D, A, 5, { life: false }).x, 300);
});
test('stretch respects opts', () => assert.ok(Math.abs(MH.rig.pose(D, [[0, 'stretch', { x: 2.2 }]], 0.6, { life: false }).sx - 2.2) < 0.05));
test('life blinks deterministically by seed', () => {
  const opens = s => Array.from({ length: 300 }, (_, i) => MH.rig.pose(D, [], i / 30, { seed: s }).eyes.open);
  assert.deepEqual(opens(3), opens(3));
  assert.ok(opens(3).some(v => v < 0.2));
});
test('geometry returns paths for body and two eyes', () => {
  const g = MH.rig.geometry(D, MH.rig.pose(D, [], 0, { life: false }));
  assert.ok(g.find(p => p.part === 'body').d.startsWith('M'));
  assert.equal(g.filter(p => p.part.startsWith('eye')).length, 2);
});
test('face sets eye/mouth shapes', () => assert.equal(MH.rig.pose(D, [[0, 'face', 'squint']], 0.5, { life: false }).face, 'squint'));
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — mh-rig.js, index.html·new.mjs 연결.
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 2D 캐릭터 리그 (코드 캐릭터)`

---

### Task 10: 2D 캐릭터 리그 — 파츠 시트

**Files:**
- Modify: `harness/runtime/mh-rig.js`, `test/unit/rig.test.mjs`
- Create: `harness/modules/rig2d.md`, `test/fixtures/rig/parts.json`

**Interfaces:**
- Consumes: Task 9 `pose`, `actor`
- Produces:
  - `RigJson = { kind: 'parts', size: [w, h], parts: { name, src, pivot: [px, py], parent: string|null, at: [x, y], z }[], faces: Record<face, { eyes: string, mouth: string }>, eyesClosed: string }` — 좌표는 시트 기준 px.
  - `layout(rig: RigJson, pose: Pose): { name, src, transform: string, z, visible: boolean }[]` — 순수. 같은 pose 를 코드 캐릭터와 공유(blink → `eyesClosed` 파츠로 교체, face → faces 표의 파츠만 visible).
  - `actor()` 가 `kind: 'parts'` 를 받으면 SVG `<image>` / 캔버스 `drawImage` 로 렌더(이미지 로드는 `window.__hf.buildReady` 에 등록).
  - `modules/rig2d.md` (≤3,072B): 두 방식 고르는 기준(스펙 10.1), design 필드표, 동작 목록 한 줄씩, 파츠 시트 프롬프트 틀(영문): 투명 배경, 같은 축척 격자, 몸통 1 · 눈 뜸/감음 · 입 7종(FACES 이름) · 팔다리, 파츠 사이 여백 ≥10%, 회전 중심 표시 금지(Claude 가 rig.json 에 기록), `no text, no watermark`, 스타일 문구 고정 꼬리. rig.json 작성 예 1개.
- 9:16 대응: `grow {fill:'screen'}` 의 목표 크기는 `o.W`, `o.H`(actor 옵션, 기본 `window.DNA.W/H` → 없으면 1920×1080)에서 계산.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const R = JSON.parse(fs.readFileSync('test/fixtures/rig/parts.json', 'utf8'));
test('layout hides open eyes during blink', () => {
  const L = MH.rig.layout(R, MH.rig.pose(D, [[1, 'blink']], 1.06, { life: false }));
  assert.equal(L.find(p => p.name === R.eyesClosed).visible, true);
  assert.equal(L.find(p => p.name === 'eyes_open').visible, false);
});
test('child part follows parent transform', () => { /* 몸통 rot 10° 일 때 팔 transform 문자열이 몸통 transform 으로 시작 */ });
test('grow fills portrait screen', () => {
  const p = MH.rig.pose(D, [[0, 'grow', { fill: 'screen', dur: 0.8 }]], 2, { life: false, W: 1080, H: 1920 });
  assert.ok(p.sx * D.body.w >= Math.hypot(1080, 1920) * 0.99);
});
test('rig2d.md size', () => assert.ok(fs.statSync('harness/modules/rig2d.md').size <= 3072));
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 파츠 시트 리그와 rig2d 모듈 문서`

---

### Task 11: 2D 카메라와 전환

**Files:**
- Create: `harness/runtime/mh-cam.js`, `harness/modules/camera2d.md`, `harness/modules/transitions.md`, `test/unit/cam.test.mjs`
- Modify: index.html·new.mjs 에 mh-cam.js 추가

**Interfaces:**
- Consumes: `MH.kf`, `MH.E`, `MH.noise`, `MH.move`
- Produces:
  - `MH.cam(worldEl: Element|null, { W, H }): Cam` — worldEl 이 있으면 깊이 1 레이어로 등록.
  - `Cam.key(t, { x?, y?, zoom?, rot? }, { dur = 0, ease = 'dna' }): Cam` — dur 0 은 순간 이동(컷). 키 사이 값은 이전 키 값에서 이어짐. `ease` 문자열은 `'dna'`(DNA.easeFn) · `MH.E` 키 · 함수.
  - `Cam.shake(t0, t1, amp, hz): Cam` — amp 는 화면 너비 비율.
  - `Cam.layer(el, depth): Cam` — depth 0 = 화면 고정, 1 = 월드, >1 전경.
  - `Cam.layers: { el: Element, depth: number }[]` (공개 속성, Task 12 렌즈가 사용)
  - `Cam.state(t): { x, y, zoom, rot }` · `Cam.matrix(t, depth = 1): [a, b, c, d, e, f]` (CSS matrix; 월드 점 (x,y) 가 화면 중심에 오고 zoom^depth 대신 `1 + (zoom − 1)·depth` 배율, 이동은 depth 배) · `Cam.toScreen(t, [wx, wy], depth = 1): [sx, sy]` · `Cam.render(t)` (등록 레이어에 `style.transform`).
  - `MH.trans2d.fill(t, el, { t0, dur = 0.8, color }): number` — el 의 화면 사각형에서 화면 전체를 덮는 원까지 커지는 `clip-path` 를 오버레이(`el` 의 형제로 1회 생성, z-index 최상)에 적용, 진행도 반환.
  - `MH.trans2d.zoomThrough(cam, rect: [x, y, w, h], { t0, dur = 0.7 }): void` — rect 가 화면을 꽉 채우는 zoom 으로 키 추가.
  - `MH.trans2d.whip(cam, { t0, dir = 'left', dur = 0.35, dist = 1.2 }): { vel(t): [vx, vy] }` — 화면 너비 dist 배 이동 키 + 속도 함수(스미어용).
  - `MH.trans2d.match(rectA, rectB): string` — rectB 를 rectA 에 맞추는 CSS transform.
  - 장면 코드에서는 `const trans = MH.trans2d;` 로 줄여 쓴다(게이트 API 문자열 `trans.fill(` 등과 일치).
  - 문서: camera2d.md(≤3KB: key/shake/layer/깊이 규칙/9:16 주의), transitions.md(≤3KB: 네 전환 사용 예, 무대 안·장면 사이 쓰는 법).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const MH = loadRuntime(['harness/runtime/mh.js', 'harness/runtime/mh-cam.js']).MH;
test('keys interpolate and cut', () => {
  const c = MH.cam(null, { W: 1920, H: 1080 }).key(0, { x: 0, zoom: 3 }).key(0, { zoom: 1 }, { dur: 3.5 }).key(5, { x: 800 });
  assert.equal(c.state(0).zoom, 3); assert.equal(c.state(3.6).zoom, 1);
  assert.equal(c.state(4.99).x, 0); assert.equal(c.state(5).x, 800);
});
test('toScreen centers camera target, portrait aware', () => {
  const c = MH.cam(null, { W: 1080, H: 1920 }).key(0, { x: 100, y: 200, zoom: 2 });
  assert.deepEqual(c.toScreen(0, [100, 200]).map(Math.round), [540, 960]);
  assert.deepEqual(c.toScreen(0, [110, 200]).map(Math.round), [560, 960]);
});
test('depth 0 ignores camera', () => assert.deepEqual(MH.cam(null, { W: 100, H: 100 }).key(0, { x: 50, zoom: 2 }).matrix(0, 0), [1, 0, 0, 1, 0, 0]));
test('shake deterministic and bounded', () => {
  const c = MH.cam(null, { W: 1000, H: 1000 }).shake(0, 1, 0.01, 8);
  const xs = Array.from({ length: 30 }, (_, i) => c.state(i / 30).x);
  assert.ok(xs.every(x => Math.abs(x) <= 10.0001) && xs.some(x => x !== 0));
});
test('zoomThrough fills screen with rect', () => {
  const c = MH.cam(null, { W: 1920, H: 1080 }); MH.trans2d.zoomThrough(c, [900, 500, 120, 80], { t0: 1 });
  const s = c.state(2); assert.ok(Math.abs(s.x - 960) < 1 && s.zoom >= 1920 / 120 - 0.01);
});
test('module docs size', () => { for (const f of ['camera2d', 'transitions']) assert.ok(fs.statSync(`harness/modules/${f}.md`).size <= 3072); });
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 2D 가상 카메라와 연결 전환`

---

### Task 12: 렌즈와 모션 블러 렌더

**Files:**
- Create: `harness/runtime/mh-lens.js`, `harness/tools/lib/render.mjs`, `harness/modules/lens2d.md`, `test/unit/lens.test.mjs`
- Modify: `harness/tools/make.mjs` (lens.mblur), index.html·new.mjs

**Interfaces:**
- Consumes: Task 11 `Cam` 레이어 목록(`cam.layers: { el, depth }[]` 를 Task 11 에서 공개 속성으로 둔다), `parseEffectTable`
- Produces:
  - `MH.lens.blurFor(depth, focus, aperture): number` — `min(24, |depth − focus| · aperture)` px.
  - `MH.lens.dof(cam, { focus = 1, aperture = 6 }): Lens` · `Lens.rack(keys: [t, focus][]): Lens` · `Lens.render(t)` — cam 레이어마다 `filter: blur(Npx)`.
  - `MH.lens.smear(el, vx, vy, { k = 0.02, max = 40 }): void` — 요소에 1회 생성한 SVG `feGaussianBlur` 필터의 `stdDeviation="sx sy"` 를 속도 비례로 갱신.
  - make.mjs: 효과 표에 `lens.mblur` ② 또는 ③ 행이 있으면(게이트 통과 후) `base = root data-fps || 30` 으로 `--fps base·4` 렌더 → `ffmpeg -i tmp.mp4 -vf "tmix=frames=4,fps=<base>" -c:a copy final.mp4`. 렌더 전 `· 모션 블러: 렌더 시간 약 4배` 출력. `--draft` 에서는 생략.
  - lens2d.md (≤3KB).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('blurFor', () => { assert.equal(MH.lens.blurFor(1, 1, 6), 0); assert.equal(MH.lens.blurFor(3, 1, 6), 12); assert.equal(MH.lens.blurFor(9, 1, 6), 24); });
test('rack interpolates focus', () => { /* fake cam {layers:[{el:{style:{}},depth:2}]}, rack([[0,1],[1,2]]) → render(1) 후 filter 'blur(0px)' */ });
test('mblur args', () => { assert.deepEqual(mblurArgs(30), { fps: 120, vf: 'tmix=frames=4,fps=30' }); });
test('lens2d.md size', () => assert.ok(fs.statSync('harness/modules/lens2d.md').size <= 3072));
```

`mblurArgs(base: number): { fps, vf }` 는 `lib/render.mjs` 에 두고 make.mjs 가 사용한다.

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `feat: 렌즈(심도·랙포커스·스미어)와 모션 블러 렌더`

---

### Task 13: 특수효과와 시간 재매핑

**Files:**
- Create: `harness/runtime/mh-fx.js`, `harness/modules/fx2d.md`, `test/unit/fx.test.mjs`
- Modify: index.html·new.mjs

**Interfaces:**
- Consumes: `MH.hash`, `MH.noise`
- Produces:
  - `MH.time.remap(keys: [tOut, tIn][]): (t: number) => number` — 구간 선형, 범위 밖은 끝값 유지. 같은 tIn 이 이어지면 정지, 감소하면 되감기.
  - `MH.fx.vhs(el, { label = '', timecode = true, t0 = 0, t1 = Infinity, seed = 1 }): { render(t) }` — el 안에 오버레이(주사선 반복 그라디언트, 트래킹 띠 하나가 seed 기반으로 위아래 이동, 좌상단 라벨 `II PAUSE`/`<< REWIND`/`PLAY ▶`, 좌하단 `FRI 17:59` 형식 타임코드는 `timecode` 가 문자열이면 그 값).
  - `MH.fx.glitch(t, el, { amount = 1, seed = 1 }): void` — hash 기반으로 `clip-path` 가로 띠 2~4개 이동 + `filter: drop-shadow` RGB 분리.
  - `MH.fx.vhsLabel(t, keys: [t, label][]): string` 순수 도우미.
  - fx2d.md (≤3KB): remap 으로 되감기 만드는 법(`MH.drive(tl, DUR, t => draw(remap(t)))`, 무대는 `st.remap(fn)`).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('remap forward, hold, rewind', () => {
  const f = MH.time.remap([[0, 0], [2, 2], [3, 2], [4, 0.5]]);
  assert.equal(f(1), 1); assert.equal(f(2.5), 2); assert.equal(f(3.5), 1.25); assert.equal(f(9), 0.5);
});
test('vhsLabel picks latest', () => assert.equal(MH.fx.vhsLabel(2.1, [[0, 'II PAUSE'], [2, '<< REWIND']]), '<< REWIND'));
test('glitch deterministic', () => { /* 같은 t·seed 로 두 번 → 같은 style 문자열 */ });
test('fx2d.md size', () => assert.ok(fs.statSync('harness/modules/fx2d.md').size <= 3072));
```

- [ ] **Step 2–4: 실패 확인 → 구현 → 통과 확인.**
- [ ] **Step 5: Commit** — `feat: VHS·글리치·시간 재매핑`

---

### Task 14: 모핑과 설치 의존성

**Files:**
- Create: `harness/runtime/mh-morph.js`, `harness/modules/morph.md`, `test/unit/morph.test.mjs`
- Modify: `harness/config.json` (`"flubber": "0.4.2"`, `"opentype.js": "1.3.4"`, `"pretendard": "1.3.9"`), `harness/tools/setup.mjs` ([2/6] 패키지에 flubber·opentype.js, [5/6] 폰트에 `Pretendard-Bold.otf`·`Pretendard-ExtraBold.otf` — URL `https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/<파일>`), `harness/tools/new.mjs` (libs: `flubber/build/flubber.min.js` → `flubber.min.js`, `opentype.js/dist/opentype.min.js` → `opentype.min.js`, OTF 2개 → `assets/fonts/`), index.html (flubber·opentype·mh-morph 스크립트)

**Interfaces:**
- Consumes: 전역 `window.flubber`, `window.opentype`
- Produces:
  - `MH.morph.roundRect(x, y, w, h, r): string` · `MH.morph.blob(cx, cy, rx, ry, k = 0.55): string` · `MH.morph.circle(cx, cy, r): string`
  - `MH.morph.shape(t, a: string, b: string, { t0 = 0, dur = 0.6, ease = 'dna' }): string` — `flubber.interpolate(a, b, { maxSegmentLength: 4 })` 를 `a+'|'+b` 키로 캐시, t0 이전 a, 이후 b 그대로 반환.
  - `MH.morph.text(str, { weight = 'extrabold', size = 200, x = 0, y = 0 }): Promise<string[]>` — `assets/fonts/Pretendard-ExtraBold.otf`(또는 Bold) 를 `fetch` → `opentype.parse` → 글자별 `getPath(...).toPathData(2)`. 폰트는 한 번만 로드. 장면은 결과를 `window.__hf.buildReady[key]` 로 기다린다.
  - morph.md (≤3KB): 눈 2개 → 글자 `oo` 예시, 모핑 대상 경로는 닫힌 단일 경로여야 함.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const flubber = loadUMD('node_modules/flubber/build/flubber.min.js');   // 테스트에서 npm i -D flubber@0.4.2 opentype.js@1.3.4
const MH = loadRuntime(['harness/runtime/mh.js', 'harness/runtime/mh-morph.js'], { flubber }).MH;
test('shape endpoints', () => {
  const a = MH.morph.circle(50, 50, 20), b = MH.morph.roundRect(20, 20, 60, 60, 10);
  assert.equal(MH.morph.shape(0, a, b, { t0: 1 }), a);
  assert.equal(MH.morph.shape(5, a, b, { t0: 1 }), b);
  assert.notEqual(MH.morph.shape(1.3, a, b, { t0: 1 }), a);
});
test('text paths from OTF', async () => { /* globals.fetch 를 로컬 OTF 읽기로 스텁, text('oo') → 길이 2, 각 'M' 시작 */ });
test('config pins', () => { const c = JSON.parse(fs.readFileSync('harness/config.json')); assert.equal(c.flubber, '0.4.2'); assert.equal(c['opentype.js'], '1.3.4'); });
test('morph.md size', () => assert.ok(fs.statSync('harness/modules/morph.md').size <= 3072));
```

개발 의존성: 저장소 `package.json` 에 `devDependencies` 로 flubber·opentype.js·pretendard(OTF 테스트용) 고정.

- [ ] **Step 2–4: 실패 확인 → 구현 → 통과 확인.**
- [ ] **Step 5: Commit** — `feat: 모핑(flubber·opentype.js)과 설치 의존성`

---

### Task 15: 무대 모드

**Files:**
- Create: `harness/runtime/mh-stage.js`, `harness/template/scene/compositions/_stage.html`, `harness/modules/stage.md`, `test/unit/stage.test.mjs`
- Modify: `harness/tools/scene.mjs` (`stage` 종류), `harness/tools/board.mjs` (비트), index.html·new.mjs

**Interfaces:**
- Consumes: `MH.cam` (Task 11), `MH.rig.actor` (Task 9), `MH.drive`, `MH.time.remap` (Task 13)
- Produces:
  - `MH.stage2d(rootEl, { W, H, dur }): Stage` — rootEl 안에 `.world` 생성, 내부 `cam = MH.cam(world, {W, H})`.
  - `Stage.set(name, el, { at: [x, y], depth = 1 }): Stage` · `Stage.actor(name, actor, { anchor = 'world' }): Stage` · `Stage.beats(json: { id, t0, t1, title, note }[]): Stage` · `Stage.cues(list: [t, target, action, opts?][]): Stage` · `Stage.remap(fn): Stage` · `Stage.render(t)` · `Stage.cam`.
  - cue target: `'cam'`(action = 키 객체, opts `{dur, ease}` 는 action 안의 `dur`·`ease` 키로도 허용), 배우 이름(action = rig 동작 이름, opts = 동작 옵션), `'set:<name>'`(action `'in'|'out'`, opts `{dur = 0.5, from = 'below'|'above'|'left'|'right'|'fade'|'scale'}`, MH.move 로 등장).
  - `MH.stage2d.compile(cues): { cam: [t, keyObj, opts][], actors: Record<string, [t, name, opts][]>, sets: Record<string, [t, 'in'|'out', opts][]> }` — 순수, 시간순 정렬, 알 수 없는 target 은 `console.warn` 후 무시.
  - 배우 anchor: 'world' 면 cam 변환을 받은 좌표, 'screen' 이면 화면 좌표. pose.anchor(0..1) 로 두 좌표를 섞는다(`grow` 가 0→1 로 만든다).
  - `_stage.html`: v1 템플릿 형식(`<template>`·루트 id·`window.__timelines[id]`) + `<script type="application/json" id="__ID__-beats">[{"id":"b1","t0":0,"t1":__DUR__,"title":"","note":""}]</script>` + 예시 세트 1개·배우 1개(`MH.rig.load('main')` 를 buildReady 로) + `MH.drive(tl, DUR, t => st.render(t))`.
  - scene.mjs: `['dom','canvas','three','stage']`, 사용법 주석 갱신.
  - board.mjs: 장면 kind 가 `stage` 면 `readBeats`(Task 3)로 compositions 파일의 비트를 읽어 비트마다 한 칸(대표 시점 = 비트 길이의 60%), 라벨 `#<n> <stage>·<beat> <title>`.
  - stage.md (≤3KB): 구성 요소 표, 큐시트 예(스펙 9절), 25초 넘으면 나누기, 배우 파일 규칙.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('compile groups and sorts cues', () => {
  const c = MH.stage2d.compile([[2.8, 'boo', 'enter', { at: 'list:c2' }], [0, 'cam', { zoom: 3 }], [0, 'cam', { zoom: 1, dur: 3.5 }], [5.4, 'set:phone', 'in'], [1, 'ghost', 'x']]);
  assert.equal(c.cam.length, 2); assert.equal(c.cam[1][2].dur, 3.5);
  assert.deepEqual(c.actors.boo.map(a => a[1]), ['enter']);
  assert.deepEqual(c.sets.phone[0].slice(0, 2), [5.4, 'in']);
});
test('scene.mjs add stage creates composition with beats JSON', () => { /* 임시 프로젝트(new.mjs 대신 template 복사) 에서 scene.mjs add . st1 stage --dur 12 → 파일에 'st1-beats' 와 'MH.stage2d(' 포함 */ });
test('template beats parse', () => { /* _stage.html 을 id st1, DUR 12 로 치환 → readBeats(html, 'st1') → [{id:'b1',t0:0,t1:12,…}] */ });
test('portrait stage uses composition size', () => { /* readBeats 와 별개로 _stage.html 치환 결과에 data-width="1080" data-height="1920" */ });
test('stage.md size', () => assert.ok(fs.statSync('harness/modules/stage.md').size <= 3072));
```

- [ ] **Step 2–4: 실패 확인 → 구현 → 통과 확인.**
- [ ] **Step 5: Commit** — `feat: 무대 모드(stage2d)와 비트 스토리보드`

---

### Task 16: 가이드·스킬·예시 문서

**Files:**
- Modify: `harness/GUIDE.md`, `harness/PLAN-example.md`, `skills/mv-new/SKILL.md`, `skills/mv-refs/SKILL.md`, `skills/mv-plan/SKILL.md`, `skills/mv-make/SKILL.md`, `skills/mv-setup/SKILL.md`, `README.md`
- Create: `test/unit/docs.test.mjs`

**Interfaces:**
- Consumes: 모든 API 이름(Task 2~15), catalog id
- Produces: 문서 규칙
  - GUIDE.md 변경점: 1절 "가볍게" 를 스펙 D7 세 줄로 · 2절 순서에 "2.2 근거표 확정(evidence.png 한 장 → 확정/기각, 놓친 효과는 strip)" · 2.5 소스 점검에 캐릭터 판정 한 줄, 파츠 시트는 `modules/rig2d.md` 참조, 파츠 정렬이 안 맞으면 rig.json 회전 중심 수정 → 그래도 안 되면 코드 캐릭터로 전환하고 사용자에게 알림(스펙 11) · 3절 PLAN 틀에 효과 표와 DNA 5번 ① 강도 숫자 · 4절 엔진에 `stage` 종류, ① 기본기 API 요약 5줄, "② 모듈은 효과 표에 켜진 것만 `modules/<이름>.md` 를 읽는다" 와 모듈 표(id → 문서) · 8절 검수에 gate·motion-qc. ≤15,000바이트.
  - mv-plan SKILL.md: 단계 순서(측정 → 근거표 확정 → 소스 점검 → DNA+효과 표 → 장면/무대 선택 → 장면 → 스토리보드 → 검토 요청), 소스 점검 멈춤 문구는 v1 그대로.
  - mv-make SKILL.md: gate 위반 시 고치는 법 한 줄, 납품 메시지에 motion-qc ✔/✗ 요약 한 줄.
  - 자동 선택 스킬 3개 description 에 "motion-harness2(v2)" 와 "v2 프로젝트(brief.md 맨 위 harness: v2)이거나 v2 를 언급할 때" 포함.
  - PLAN-example.md: 효과 표 3행(②·②·③) 포함, 무대 비트 행 예.
  - README: v1 과 나란히 설치, 명령어 표(접두사만 다름), 새 기능 요약, 라이선스에 flubber MIT·opentype.js MIT·Pretendard OFL.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const desc = f => (fs.readFileSync(f, 'utf8').match(/^description:\s*(.*)$/m) || [])[1] || '';
test('always-on description budget ≤ 2270 bytes', () => {
  const total = ['mv-new', 'mv-refs', 'mv-plan'].reduce((s, d) => s + Buffer.byteLength(desc(`skills/${d}/SKILL.md`)), 0);
  assert.ok(total <= 2270, String(total));
});
test('mv-setup and mv-make are command-only', () => { for (const d of ['mv-setup', 'mv-make']) assert.match(fs.readFileSync(`skills/${d}/SKILL.md`, 'utf8'), /disable-model-invocation: true/); });
test('v2 marker in auto skills', () => { for (const d of ['mv-new', 'mv-refs', 'mv-plan']) assert.match(desc(`skills/${d}/SKILL.md`), /v2/); });
test('GUIDE ≤ 15000 bytes and lists every module doc', () => {
  const g = fs.readFileSync('harness/GUIDE.md'); assert.ok(g.length <= 15000);
  for (const m of ['rig2d', 'camera2d', 'lens2d', 'fx2d', 'morph', 'transitions', 'stage']) assert.ok(g.includes(`modules/${m}.md`), m);
});
test('every tier-2 catalog module has a doc', () => { for (const e of loadCatalog().filter(e => e.tier === 2)) assert.ok(fs.existsSync(`harness/modules/${e.module}.md`), e.id); });
test('source check pause options kept', () => { const p = fs.readFileSync('skills/mv-plan/SKILL.md', 'utf8'); for (const s of ['이미지 추가 완료', '일부만 넣고 진행', '이미지 없이 진행']) assert.ok(p.includes(s)); });
test('PLAN-example parses', () => assert.equal(parseEffectTable(fs.readFileSync('harness/PLAN-example.md', 'utf8')).length, 3));
```

- [ ] **Step 2–4: 실패 확인 → 문서 작성 → 통과 확인.**
- [ ] **Step 5: Commit** — `docs: v2 가이드·모듈 문서·스킬 갱신`

---

### Task 17: 통합 검증과 합격 테스트

**Files:**
- Create: `test/e2e/smoke.test.mjs`, `test/e2e/README.md`, `docs/superpowers/acceptance/2026-10-27-acceptance.md`
- Modify: `harness/tools/lib/evidence.mjs` (`TH` 보정 결과만)

**Interfaces:**
- Consumes: 전체
- Produces: e2e 테스트(환경변수 `MH2_E2E=1` 일 때만 실행, setup 완료 필요), 합격 기록 문서.

- [ ] **Step 1: e2e 스모크 테스트 작성** — `smoke.test.mjs`:
  1. 임시 폴더 `모션 테스트 1/` 에서 `new.mjs .` → `scene.mjs add . st1 stage --dur 6` → st1 에 배우(코드 캐릭터) 1, `cam.key` 줌아웃, `trans.fill` 1회를 넣은 고정 픽스처 HTML(`test/fixtures/e2e/st1.html`)로 교체 → PLAN.md 에 근거 없는 효과 표 → `make.mjs . --check` 가 **게이트로 실패**(종료 1).
  2. 효과 표를 ③ 사용자 지정 + brief 효과 지정으로 고침 → `make.mjs . --draft` 성공, `out/draft.mp4` 존재.
  3. 결정성: `npx hyperframes snapshot scene --at 0.5,3.1,1.7,4.9` 와 `--at 0.5,1.7,3.1,4.9` 의 같은 시각 프레임 PNG 바이트 해시가 같다.
  4. v1 호환: v1 저장소의 예시와 같은 dom 장면 3개 프로젝트(`test/fixtures/e2e/v1-project/`)를 `make.mjs --draft` → 성공, 게이트 통과.
- [ ] **Step 2: 실행** — Run: `MH2_E2E=1 node --test test/e2e/` / Expected: PASS 4.
- [ ] **Step 3: 감지기 보정** — `MH2_REF_A=<A 경로> MH2_REF_B=<B 경로> node --test test/ref/` 를 돌리고, 스펙 13.2 기대 감지가 모두 나올 때까지 `TH` 값만 조정. 레퍼런스 B 의 오탐(계획에 없는 ② 후보)은 3개 이하를 목표로 하고 결과 수치를 acceptance 문서에 기록.
- [ ] **Step 4: 합격 제작** — 같은 B형 레퍼런스·소스로 v1(`/motion-harness:`)과 v2(`/motion-harness2:`)를 각각 제작. 스펙 13.3 의 7개 기준을 acceptance 문서 표에 ✔/✗ 와 근거(qc-motion.png 경로, motion-qc.json 발췌, description 바이트 수)로 기록. 기준 7(사용자 판단)은 사용자에게 두 영상을 보내고 답을 기록.
- [ ] **Step 5: Commit** — `test: e2e 스모크·감지기 보정·합격 기록`

---

## 스펙 대응표

| 스펙 절 | 태스크 |
|---|---|
| 2 D1~D10 | D3·D9 → 1, D2 → 2·3·4, D5 → 9·10·16, D6 → 15, D7 → 16, D8 → (변경 없음 확인) 16, D10 → 14 |
| 4 구조·4.1 흐름·4.2 불러오기 | 1, 4, 6, 7, 9~15(index.html·new.mjs) |
| 5 카탈로그·게이트·효과 표 | 2, 3, 4 |
| 6 근거표 | 5, 6 |
| 7 ① 기본기 | 8 |
| 8.1~8.5 2D 모듈 | 9, 10, 11, 12, 13, 14 |
| 9 무대 | 15 |
| 10 스킬·문서·설치 | 4(brief), 14(설치), 16 |
| 11 오류 처리 | 4(게이트 안내), 6(감지 실패·짧은 영상), 10(파츠 시트 → GUIDE 안내), 12(mblur 안내) |
| 12 모션 검수 | 7 |
| 13 검증 | 각 태스크 단위 테스트, 6(ref), 17 |
| 14 구현 순서 | 태스크 순서 |
