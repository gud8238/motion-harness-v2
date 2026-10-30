# motion-harness2 (v2) 설계 — 공통 기반 + 2D 트랙

- 작성일: 2026-10-27
- 상태: 설계 승인 완료, 문서 검토 대기
- 기반: [motion-harness-v1](https://github.com/gud8238/motion-harness-v1) v0.4.0
- 범위: **공통 기반 + 2D 트랙**. 3D 트랙(레퍼런스 A형)은 이 작업이 끝난 뒤 별도 설계 문서로 진행한다.

---

## 1. 배경과 목표

v1은 레퍼런스 영상을 측정해 스타일 DNA(구도·색·질감·타이포·모션·리듬·전환·카메라·정보장치·사운드·소스처리)로 옮기고, HyperFrames로 렌더하는 하네스다. 색·구도·타이포·질감 재현은 충분하고, 부족한 이미지를 생성 프롬프트와 함께 요청하는 소스 점검 흐름도 실사용에서 불편이 없다.

부족한 것은 **움직임의 자연스러움**이다. 레퍼런스 두 편(이하 A, B)을 분석한 결과 다음이 v1으로는 재현되지 않는다.

| 레퍼런스 | 핵심 요소 | v1의 한계 |
|---|---|---|
| A (19초, 3D 큐브 캐릭터·키보드) | 표정 연기, 늘어남(squash & stretch), 예비동작·착지, 키캡 물리, 심도·보케·빛 번짐, VHS PAUSE/REWIND | 캐릭터가 정지 이미지 교체, 3D 후처리 없음 |
| B (40초, 노란 눈 캐릭터·앱 홍보) | 캐릭터 하나가 모든 장면을 잇는 연속성, 눈→글자 모핑, 거대한 목록 위 원테이크 카메라, 배경 흐림·모션 블러, 스프링 말풍선 | 장면 분할 구조, 2D 카메라·블러·모핑 도구 없음 |

**목표**: 레퍼런스 B형 영상을 v2로 만들었을 때 캐릭터 연속 연기·모핑·원테이크 카메라가 실제로 보이는 것. A형은 3D 트랙에서 다룬다.

## 2. 확정된 결정 사항

| # | 결정 | 내용 |
|---|---|---|
| D1 | 코드만으로 구현 | AI 영상 클립·3D 모델 파일을 소스로 쓰지 않는다. 이미지(배경·질감·파츠 시트)는 v1처럼 GPT 등으로 받아 `source/` 에 넣는다 |
| D2 | 레퍼런스 근거 원칙 + 3단계 | ① 기본기 = 항상 사용(강도만 레퍼런스에서) · ② 스타일 효과 = 레퍼런스 근거(시각)가 있을 때만 · ③ 사용자 지정 = brief 의 "효과 지정"에 적으면 근거 없이 사용 |
| D3 | 배포 형태 | 별도 플러그인 `motion-harness2`, 저장소 `gud8238/motion-harness-v2`, 설치 폴더 `~/.motion-harness2`. v1과 나란히 설치 가능 |
| D4 | 진행 순서 | 공통 기반 → 2D 트랙 → (별도 설계) 3D 트랙 |
| D5 | 2D 캐릭터 | 레퍼런스 캐릭터 복잡도에 따라 자동 선택: 도형형 = 코드(SVG)로 그림, 일러스트형 = GPT 파츠 시트 요청. 소스 점검 표에 판정 표시 |
| D6 | 원테이크 구현 | 접근 1 — "무대(stage)" 장면 종류 추가, 기존 장면 모드와 혼용 |
| D7 | "가볍게" 원칙 재정의 | 상시 비용(스킬 소개문) v2 단독 약 700토큰 이하 · 작업 중 문서는 필요한 것만 · 품질에 필요한 코드는 런타임에 아낌없이 |
| D8 | 검토 방식 | v1과 같음 — 스토리보드 정지 이미지. 저해상도 미리보기 영상은 만들지 않는다 |
| D9 | 명령어 | v1과 같은 5개(mv-setup·mv-new·mv-refs·mv-plan·mv-make), 접두사만 `/motion-harness2:` |
| D10 | 모핑 라이브러리 | flubber(MIT). GSAP MorphSVG 도 무료지만 공개 배포 하네스라 Webflow 경쟁 금지 조항 여지를 없앤다. 글자 윤곽은 opentype.js(MIT) |

## 3. 범위

**포함**: v1 전체 기능 이전 · 효과 카탈로그 · 레퍼런스 근거표 · 게이트 검사 · 모션 검수 · ① 기본기 런타임 · 2D 캐릭터 리그 · 2D 카메라 · 렌즈(심도·랙포커스·스미어·모션 블러) · 특수효과(VHS·글리치·시간 되감기) · 모핑 · 2D 연결 전환 · 무대 모드.

**제외(3D 트랙에서)**: three.js 불러오기 방식 변경(ES 모듈), 3D 후처리(보케·블룸), 3D 캐릭터 리그, 3D 카메라 경로. 이번 범위에서 `mh-three.js` 는 v1 그대로 둔다. 단, 카탈로그·게이트·근거표는 3D 항목을 나중에 추가만 하면 되도록 만든다.

## 4. 전체 구조

```
.claude-plugin/     plugin.json (name: motion-harness2) · marketplace.json
skills/             mv-setup · mv-new · mv-refs · mv-plan · mv-make
harness/
  GUIDE.md          핵심 가이드 (항상 읽음, v1 수준 이하 크기)
  catalog.json      효과 카탈로그
  modules/          모듈 문서 — 효과 표에 켜진 것만 읽음
    rig2d.md  camera2d.md  lens2d.md  fx2d.md  morph.md  transitions.md  stage.md
  runtime/
    mh.js           v1 + ① 기본기 (move·follow·gsapSpring·phys·sim)
    mh-rig.js       2D 캐릭터 리그
    mh-cam.js       2D 가상 카메라 + 2D 전환
    mh-lens.js      심도·랙포커스·스미어 (모션 블러는 렌더 단계)
    mh-fx.js        VHS·글리치·시간 되감기
    mh-morph.js     모핑 (flubber·opentype.js 사용)
    mh-stage.js     무대 모드 (월드·세트·배우·비트·큐시트)
    mh-three.js     v1 그대로
  template/scene/compositions/  _dom · _canvas · _three · _stage (신규)
  tools/
    analyze-ref.mjs 측정 + 근거표 후보(evidence) + strip 하위 명령
    gate.mjs        게이트 검사 (신규)
    motion-qc.mjs   모션 검수 (신규)
    scene.mjs       stage 종류 추가
    board.mjs       무대 비트별 칸 지원
    make.mjs        gate·motion-qc·모션 블러 단계 추가
    그 외 v1 도구    setup · new · refs · assets · audio · tts · compare
  PLAN-example.md   효과 표가 포함된 예시로 갱신
```

### 4.1 데이터 흐름

1. `analyze-ref` → `work/ref-*/analysis.md`·`card.png`(v1과 같음) + `evidence.json`·`evidence.png`(신규)
2. Claude 가 `evidence.png` 한 장을 보고 후보 확정·기각. 감지가 놓친 효과는 `analyze-ref strip` 으로 근거 프레임을 만든 뒤 추가
3. 확정 효과를 `work/PLAN.md` 의 **효과 표**에 기록
4. Claude 는 효과 표에 있는 모듈의 `modules/*.md` 만 읽고 장면 작성
5. `make.mjs` 검사 단계에서 `gate.mjs` 가 장면 코드를 검사 → 위반 시 중단
6. 렌더 후 `motion-qc.mjs` → `work/qc-motion.png` + 리포트

### 4.2 런타임 불러오기

모든 런타임 파일은 `scene/index.html` 에서 항상 불러온다(브라우저 실행만, 토큰 비용 없음). 막는 것은 "사용"이며, 사용 여부는 게이트가 코드 검사로 판정한다.

## 5. 효과 카탈로그와 3단계 게이트

### 5.1 catalog.json 항목 형식

```json
{
  "id": "trans.fill",
  "tier": 2,
  "module": "transitions",
  "api": ["trans.fill("],
  "detect": "compositeFill",
  "desc": "도형이 커져 화면을 채우고 다음 배경이 된다",
  "ko": ["화면 채움", "채움 전환"]
}
```

- `tier`: 1(기본기) 또는 2(스타일 효과). 3단계(사용자 지정)는 효과 표의 근거 칸으로 표현한다.
- `api`: 게이트가 장면 코드에서 찾는 호출 문자열 목록. 큐시트 액션 이름도 포함한다(예: `"\"grow\", { fill:"`).
- `detect`: analyze-ref 감지기 이름. 감지기가 없는 효과는 `null`(Claude 확인 + strip 근거만 가능).
- `ko`: 사용자가 brief 의 "효과 지정"에 쓸 수 있는 한국어 표현 목록(게이트의 ③ 판정에 사용).

### 5.2 2D 트랙 효과 목록

| id | 단계 | 모듈 | 감지 신호 |
|---|---|---|---|
| move · follow · spring · phys | ① | (mh.js) | — (강도만 DNA.motion) |
| rig.actor (기본 연기·생명감, 늘어남 최대치는 DNA.motion.squash) | ① | rig2d | — |
| cam.pan · cam.push · cam.rotate | ② | camera2d | globalMotion (cam.push 는 + radialProfile) |
| cam.shake | ② | camera2d | globalMotion 고주파 |
| cam.parallax | ② | camera2d | residualDepth |
| cam.onetake | ② | stage | 긴 무컷 구간 + globalMotion |
| lens.dof | ② | lens2d | sharpnessMap |
| lens.rack | ② | lens2d | sharpnessShift |
| lens.smear | ② | lens2d | directionalBlur (요소 단위) |
| lens.mblur | ② | lens2d | directionalBlur (전체) |
| fx.vhs · fx.glitch | ② | fx2d | trackingBand · rowJitter |
| time.remap | ② | fx2d | Claude 확인 |
| morph.shape · morph.text | ② | morph | blobContour |
| trans.fill | ② | transitions | compositeFill |
| trans.zoomThrough | ② | transitions | scaleSpike |
| trans.whip | ② | transitions | blurSpike + globalMotion |
| trans.match | ② | transitions | blobAcrossCut |
| trans.shared | ② | stage | blobAcrossCut (지속) |

### 5.3 게이트 규칙 (gate.mjs)

- 장면 파일(`scene/compositions/*.html`)에서 catalog 의 tier 2 `api` 문자열을 찾는다.
- 찾은 효과마다 PLAN 효과 표에 같은 id 의 행이 있어야 하며, 근거 칸이 다음 중 하나여야 한다.
  - 레퍼런스 근거: `<레퍼런스> <t0>–<t1>s (<근거 이미지>)` 형식이고 근거 이미지 파일이 실제로 존재
  - 사용자 지정: `사용자 지정` 이고 brief.md 의 "효과 지정" 칸에 해당 id 또는 카탈로그 `ko` 목록의 표현 중 하나가 그대로 있음
- 위반 시 효과 id·파일·줄과 해결책 3가지(근거 추가 / brief 에 사용자 지정 / 효과 제거)를 출력하고 종료 코드 1.
- tier 1 은 검사하지 않는다.

### 5.4 PLAN.md 효과 표 (v1 PLAN 틀에 추가)

```markdown
효과 표 (② 는 근거 필수, ③ 은 brief "효과 지정")
| 효과 id | 단계 | 근거 | 사용 위치 |
| cam.onetake | ② | B 0.0–4.5s (ev_01.png) | st1 b1–b3 |
| trans.fill | ② | B 4.6–5.4s (ev_03.png) | st1 b2 |
| fx.vhs | ③ | 사용자 지정 | s4 |
```

DNA 5번(모션) 행에는 ① 기본기 강도를 숫자로 적는다: `ant`(예비동작 비율) · `over`(오버슈트 비율) · `settle`(안착 시간 초) · `hold`(평균 정지 초) · `squash`(최대 늘어남 배율).

## 6. 레퍼런스 근거표 (analyze-ref 확장)

### 6.1 감지기

레퍼런스를 축소 프레임(움직임 12fps·후보 strip 24fps)으로 읽어 다음을 계산한다. 모두 Node + ffmpeg 원시 프레임으로 구현하고 외부 영상 분석 라이브러리를 쓰지 않는다.

| 감지기 | 방법 | 출력 |
|---|---|---|
| globalMotion | 프레임을 격자 칸으로 나눠 칸별 이동을 블록 매칭 → 이동·확대·회전 근사 | 시간별 dx·dy·scale·rot 곡선 |
| residualDepth | globalMotion 을 뺀 잔여 움직임의 영역(위/아래, 중앙/가장자리) 차이 | 패럴랙스 점수 |
| sharpnessMap · sharpnessShift | 영역별 라플라시안 분산 지도, 선명 영역의 이동 | 심도·랙포커스 점수 |
| directionalBlur | 그라디언트 방향 비대칭 + 이동 방향 일치 | 모션 블러·스미어 점수 |
| compositeFill | 단일 색 영역 비율이 짧은 시간에 100% 근처까지 증가 | 채움 전환 후보 |
| scaleSpike · blurSpike | 컷 전후 구간의 확대·번짐 급증 | 줌 스루·휩팬 후보 |
| blobAcrossCut | 강조색 덩어리 추적, 컷 전후 모양·색 유사도 | 매치컷·공유 요소 후보 |
| blobContour | 컷 없이 같은 색 덩어리의 윤곽이 크게 변함 | 모핑 후보 |
| rowJitter | 행 단위 가로 어긋남·주사선 주기성 | 글리치 후보 |
| trackingBand | 화면 폭을 가로지르는 경계 + 그 근처 행 어긋남, 프레임마다 옮겨 감 (Task 17b) | VHS 후보 |
| radialProfile | 반지름 스펙트럼 크기비 — 블록 매칭이 못 따라가는 빠른 확대·축소 (Task 17b) | 줌 누적 |

추가로 움직임 피크 구간의 곡선에서 ① 기본기 강도(동작 길이, 오버슈트 유무와 크기, 정지 시간)를 추정해 `analysis.md` 에 적는다.

### 6.2 evidence.json 형식

```json
{
  "ref": "ref/b.mp4",
  "candidates": [
    { "id": "trans.fill", "t0": 4.6, "t1": 5.4, "score": 0.82,
      "signal": "단색 영역 12% → 98%", "strip": "ev_03.png" }
  ]
}
```

- 후보마다 구간 프레임 6장 strip(`ev_NN.png`)을 만들고, 전체를 `evidence.png` 한 장으로 모은다(Claude 는 이 한 장만 본다).
- `analyze-ref.mjs strip P ref/<파일> <t0> <t1>` → 놓친 효과의 근거 strip 생성.
- 확정된 ② 효과는 근거 strip 파일이 반드시 있어야 한다(게이트가 확인).
- 이미지 레퍼런스: 움직임 감지기는 비우고, 정적 효과(lens.dof)만 이미지 부분 잘라내기로 근거를 인정한다.

## 7. ① 기본기 런타임 (mh.js 추가분)

모든 함수는 장면 로컬 시간 `t` 의 순수 함수다(HyperFrames 는 프레임을 임의 순서로 찾아 렌더한다).

| 함수 | 동작 |
|---|---|
| `MH.move(t, t0, a, b, {dur, ant, over, settle})` | 예비동작 → 이동 → 오버슈트 → 안착. 옵션 생략 시 `DNA.motion` 값 |
| `MH.follow(t, fn, {lag, damp})` | 주동작 `fn(t)` 를 지연·감쇠해 따라감(여운·겹침) |
| `MH.gsapSpring(name, preset)` | 스프링 응답을 샘플링해 GSAP CustomEase 로 등록 |
| `MH.phys.body({pos, vel, spin, g, bounce, floor})` | `.at(t)` → 위치·회전. 탄도·바닥 튕김을 해석적으로 계산 |
| `MH.sim(t, step, init, update)` | 0초부터 고정 간격 결정적 시뮬레이션. 같은 `t` 의 결과를 메모해 연속 프레임 비용을 줄임 |

결정성 규칙: `Math.random`·`Date` 금지(v1과 같음). 불규칙해 보이는 값은 `MH.hash(seed)`.

## 8. 2D 모듈

### 8.1 캐릭터 리그 (mh-rig.js)

- 생성: `MH.rig.actor(target, design | rigJson)` — `target` 은 SVG 요소(DOM·무대) 또는 캔버스 컨텍스트. 같은 기하를 SVG 경로와 Path2D 로 모두 그린다.
- **코드 캐릭터 design**: `body`(roundRect·blob·capsule + 크기·색·모서리), `eyes`(dot·oval·line + 간격), `mouth`, `cheeks`, `limbs`(팔·다리 캡슐 수·위치), `extras`(땀방울 등).
- **파츠 시트 rigJson**: 파츠별 이미지 경로·회전 중심·부모 파츠·기본 위치. Claude 가 시트 이미지를 보고 작성.
- 동작: `actor.act([[t, 동작, 옵션], …])` — `blink` · `look` · `face`(표정 세트: idle·happy·sweat·squint·star·sad·surprise) · `hop` · `squash` · `stretch` · `nod` · `shake` · `walk` · `talk` · `enter` · `exit` · `grow`.
- 기본 생명감(자동): 불규칙 간격 깜빡임, 호흡, 미세 흔들림. `actor.life(false)` 로 끔.
- 렌더: 매 프레임 `actor.render(t)`.
- 배우 파일: `scene/assets/actors/<이름>.json` 에 design 또는 rigJson 을 저장해 모든 장면·무대가 같은 캐릭터를 쓴다.

### 8.2 2D 카메라·전환 (mh-cam.js)

- `const cam = MH.cam(worldEl, {W, H})` · `cam.key(t, {x, y, zoom, rot}, {dur, ease})` · `cam.shake(t0, t1, amp, hz)` · `cam.layer(el, depth)`(패럴랙스·심도용 깊이) · `cam.render(t)`.
- 전환: `trans.fill(t, el, {dur, color})` · `trans.zoomThrough(t, el, {dur})` · `trans.whip(t, {dir, dur})` · `trans.match(t, elA, elB)`.

### 8.3 렌즈 (mh-lens.js)

- `lens.dof({focus, aperture})` — 레이어 깊이와 초점 차이에 비례한 블러(CSS filter / 캔버스 filter).
- `lens.rack(t, [[t, focus], …])` — 초점 키프레임.
- `lens.smear(el, vx, vy)` — 속도 방향 SVG 가우시안 블러(요소 단위, 렌더 비용 거의 없음).
- `lens.mblur` — 효과 표에 있으면 make.mjs 가 4배 프레임레이트로 렌더한 뒤 ffmpeg `tmix` 로 4장씩 섞어 원래 프레임레이트로 되돌린다. 렌더 전 "렌더 시간 약 4배" 안내. 요소 하나만 번지면 smear 를 먼저 쓴다.

### 8.4 특수효과 (mh-fx.js)

- `fx.vhs(el, {label, timecode})` — 주사선·트래킹 노이즈·색 번짐·PAUSE/REWIND 라벨 오버레이.
- `fx.glitch(t, el, {amount})` — 행 어긋남·RGB 분리.
- `time.remap([[출력t, 입력t], …])` — 장면·무대 시간 재매핑(되감기·정지·슬로).

### 8.5 모핑 (mh-morph.js)

- `morph.shape(t, pathA, pathB, {dur})` — flubber 보간.
- `morph.text(str, {font, size})` → 글자 윤곽 경로(opentype.js, Pretendard). 예: 두 눈 → "boon" 의 `oo`.
- 기본 도형 경로 생성: `morph.roundRect`, `morph.blob`, `morph.circle`.

## 9. 무대 모드 (mh-stage.js, `_stage.html`)

- 생성: `scene.mjs add P <id> stage --dur <초> --title … --note …`. HyperFrames 에는 일반 장면 하나로 보인다. dom·canvas·three 장면과 한 영상 안에서 혼용 가능.
- 선택 조건: 효과 표에 `cam.onetake` 또는 `trans.shared` 가 확정됐을 때(② 효과로 게이트 적용).
- 구성
  - **월드**: 화면보다 큰 DOM 세계, 레이어별 깊이
  - **세트**: 월드 안 내용 묶음(목록 벽·폰·잠금화면·단어 카드), 비트별 등장·퇴장
  - **카메라**: mh-cam, 무대 안 하드컷(카메라 순간 이동) 허용
  - **배우**: mh-rig, `anchor('world' | 'screen')` 를 시간에 따라 전환(월드에 붙었다가 화면을 채우는 동작)
  - **비트**: `stage.beat(id, t0, t1, {title, note})` — PLAN 장면 표의 한 행, 스토리보드 한 칸
- 연출은 큐시트 한 덩어리: `stage.cues([[t, 대상, 동작, 옵션], …])`. 세트 내부 작은 움직임은 GSAP 로 쓰고 무대 메인 타임라인이 함께 구동.
- 권장 길이 25초 이하. 넘으면 무대를 나누고 같은 배우 파일·같은 위치로 경계를 잇는다.
- `board.mjs` 는 무대의 `data-mh-beats` 를 읽어 비트별 대표 프레임을 그린다.

## 10. 스킬·문서·설치

### 10.1 스킬

| 스킬 | 자동 선택 | v1 대비 변경 |
|---|---|---|
| mv-setup | 아니오(명령어만) | `~/.motion-harness2` 설치, flubber·opentype.js 추가 |
| mv-new | 예 | brief.md 맨 위 `harness: v2`, "효과 지정" 칸 추가 |
| mv-refs | 예 | 변경 없음 |
| mv-plan | 예 | 근거표 확정 → 소스 점검(캐릭터 판정·파츠 시트 프롬프트 포함) → DNA + 효과 표 → 장면/무대 선택 → 장면 → 스토리보드 → 검토 요청 |
| mv-make | 아니오(명령어만) | 검사에 gate 추가, 검수에 motion-qc 추가, lens.mblur 처리 |

- 소스 점검(v1 2.5절)은 그대로 유지한다: ASSETS.md(파일 이름·용도·규격·레퍼런스 프레임·영문 프롬프트) → "이미지 추가 완료 / 일부만 넣고 진행 / 이미지 없이 진행" 질문 → 동기화 후 계속.
- 캐릭터 판정 기준: 레퍼런스 캐릭터가 기본 도형 조합(몸통 1개 + 눈·입 단순 도형)이면 코드, 윤곽선·명암·질감이 그림체를 이루면 파츠 시트.
- 파츠 시트 프롬프트: 몸통·눈(뜬 눈/감은 눈)·입(표정 세트)·팔다리를 투명 배경 격자에 같은 축척으로 배치, 회전 중심 표시용 여백 규칙 포함.
- 상시 비용: 자동 선택 스킬 3개의 소개문 합계 약 700토큰 이하. 소개문에 "v2 프로젝트(brief.md `harness: v2`)이거나 v2 를 언급할 때" 문구 포함.

### 10.2 문서 읽기 규칙

| 문서 | 시점 | 크기 목표 |
|---|---|---|
| GUIDE.md | mv-plan·mv-make 시작 시 | v1 수준(약 15KB) 이하 |
| modules/*.md | 효과 표에 켜진 모듈만 | 모듈당 1~3KB |
| modules/stage.md | 무대 선택 시 | 약 3KB |

### 10.3 설치

필요 조건은 v1과 같다(Node 22+, ffmpeg, git). `config.json` 에 hyperframes·three·gsap·playwright(v1 값 유지)와 flubber·opentype.js 버전을 고정한다. mv-new 가 프로젝트 `scene/assets/lib` 로 런타임을 복사한다.

## 11. 오류 처리

| 상황 | 처리 |
|---|---|
| 게이트 위반 | 효과 id·파일·줄 + 해결책 3가지 출력, make 중단 |
| 레퍼런스가 짧거나 이미지 | 움직임 근거 없음. 정적 효과만 잘라낸 근거 인정, 나머지는 사용자 지정만 |
| 파츠 시트 정렬 불량 | Claude 가 rig.json 회전 중심 수정, 실패 시 코드 캐릭터로 전환하고 알림 |
| lens.mblur | 렌더 전 시간 증가 안내 |
| 렌더 실패 | v1과 같은 검사 → 수정 → 재실행 |
| 감지기 예외 | 해당 감지기만 건너뛰고 analysis.md 에 "감지 실패: <이름>" 기록, 나머지 계속 |

## 12. 모션 검수 (motion-qc.mjs)

1. 렌더 결과에 같은 감지기를 실행한다.
2. 효과 표의 효과가 사용 위치(장면·비트 구간)에서 감지되는지 ✔/✗.
3. 계획에 없는 ② 신호(흐림·흔들림 등)가 나오면 경고.
4. 딱딱함 경고: 일정 속도 이동 구간, 감속 없는 정지.
5. 효과·시그니처 구간을 레퍼런스 같은 구간 strip 과 위아래로 붙여 `work/qc-motion.png` 한 장.
6. 수정은 한 번(v1과 같음). 남은 문제는 납품 메시지에 기록.

## 13. 검증

### 13.1 자동 테스트 (Node, 브라우저 없음)
- ① 기본기 결정성: 같은 `t` → 같은 값, 무작위 순서 탐색 결과 = 순차 결과.
- 리그 동작 목록의 시간 해석, 카메라 행렬 계산, 모핑 시작·끝 경로 일치.
- 게이트: 근거 있는/없는/사용자 지정 예시 장면으로 통과·차단.
- 근거 형식 파서: 효과 표 행 파싱, strip 파일 존재 확인.

### 13.2 감지기 시험
레퍼런스 A·B 를 로컬 시험 자료로 쓴다(저작권 때문에 저장소에 넣지 않음, 파일이 없으면 건너뜀). 기대 감지:
- B: 시작부 줌아웃(cam.push), 약 5초 노란 화면 채움(trans.fill), 끝부분 눈→oo(morph), 캐릭터 지속(trans.shared)
- A: 심도(lens.dof), VHS(fx.vhs)

### 13.3 합격 기준 (B형 레퍼런스로 v1·v2 나란히 제작)
1. 캐릭터 연속 연기(깜빡임·시선·점프)가 qc-motion.png 에 보인다
2. 채움 전환·모핑이 근거 시각 근처에 있다
3. v2 결과에서 원테이크 줌이 감지된다
4. 근거 없는 ② 효과 0개(게이트 통과, 검수 경고 없음)
5. 상시 비용 약 700토큰 이하
6. v1 프로젝트가 v2 에서 수정 없이 렌더된다
7. 사용자가 두 결과를 보고 판단

## 14. 구현 순서

1. v1 이전·이름 변경(motion-harness2, `~/.motion-harness2`), v1 호환 확인
2. catalog.json · gate.mjs · 효과 표 파서
3. analyze-ref 감지기 · evidence · strip · motion-qc
4. ① 기본기 런타임
5. mh-rig(코드 캐릭터 → 파츠 시트)
6. mh-cam · mh-lens · mh-fx · mh-morph
7. 무대 모드(mh-stage · _stage 템플릿 · scene/board 확장)
8. GUIDE·modules·스킬 문서, 소개문 토큰 측정
9. 합격 테스트

## 15. 이후 작업
- 3D 트랙 설계(별도 문서): three.js ES 모듈 전환, 후처리(보케·블룸·SSAO), 3D 리그, 물리, 3D 카메라 경로, 레퍼런스 A 합격 기준.
