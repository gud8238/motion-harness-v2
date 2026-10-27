# motion-harness2 가이드 (이 한 파일이 기준)

레퍼런스 스타일을 **빠짐없이, 가볍게** 옮겨 사용자 이미지·주제로 15~40초 모션그래픽을 만든다(HyperFrames). 도구 `node "<플러그인>/harness/tools/<도구>.mjs"`(스킬의 전체 경로). `P` = `.`(연 폴더, 바로 아래 `ref/`·`source/`) 또는 하위 폴더 이름.
**3단계**: ① 기본기 항상(강도만 레퍼런스) · ② 스타일 효과는 **레퍼런스 근거 이미지가 있을 때만** · ③ brief "효과 지정"에 적힌 것.

## 1. 가볍게
- **상시 비용은 스킬 소개문뿐**(약 700토큰).
- **작업 중 문서는 필요한 것만**: 레퍼런스마다 `analysis.md`·`card.png`·`evidence.png`, 소스 `sources.png`(개별 이미지는 세부가 필요할 때만), 켜진 모듈·장면 종류 문서, 라이브러리 스타일은 STYLE.md 1~6절. 나머지는 막혔을 때만. 쓰는 것 `work/PLAN.md` **하나**(설명 최소), 보는 것 스토리보드 1장·qc.jpg·qc-motion.png.
- **품질에 필요한 코드는 런타임에 아낌없이**(`MH.*` 는 토큰 비용 없음).
- 안 함: 구조안 여러 개, 모델시트, 수정 2회 이상, 저해상도 미리보기, compare·움직임 strip `motion_N.png`(요청·의심 시만), HyperFrames 스킬 자체 절차(스토리라인 3개·SPEC·REVIEW). 질문은 처음 **한 번**(AskUserQuestion, 추천안 먼저), 브리프로 답이 되면 생략.

## 2. 순서
1. **입력**: `brief.md`, `ref/`, 소스는 `assets.mjs sheet P` → `work/sources.png`(크기·배경). 링크·ID 는 `refs.mjs fetch P <ID|링크>`. 레퍼런스 없음·"추천" → `/motion-harness2:mv-refs`.
2. **측정**: `analyze-ref.mjs P ref/<파일>` → `work/ref-<이름>/` 의 `analysis.md`·`card.png`(DNA 근거), `evidence.json`·`evidence.png`(효과 후보 8개씩, `evidence_2.png`…).
2.2 **근거표 확정**: evidence.png(쪽마다) 후보를 확정·기각(신호가 보이고 쓸 것인가). 확정분은 analysis.md `→ 근거 칸:` 문구(`<이름> <t0>–<t1>s (ev_<id>_<t0>.png)`)를 효과 표에. 놓친 효과는 `analyze-ref.mjs strip P ref/<파일> <t0> <t1>` → `ev_mNN.png`·근거 칸. **근거 이미지 없는 ② 금지** — 이미지 레퍼런스는 ② 근거가 없어 ③(brief 효과 지정)만.
2.5 **소스 점검**(2.5절) — 부족하면 ASSETS.md → **⏸** AskUserQuestion `이미지 추가 완료` / `일부만 넣고 진행` / `이미지 없이 진행(코드로 대체)` → `assets.mjs check P` + `new.mjs P`, 새 이미지만 확인. 부족한 게 없으면 "추가 이미지 불필요" 한 줄. "바로 만들어"면 목록만 보이고 계속.
3. **계획** `work/PLAN.md`(3절). 내레이션은 먼저 `work/narration.json` → `tts.mjs P`(시각이 장면 길이).
4. **장면**: 켜진 모듈 문서만(4절) `scene.mjs add P <id> <dom|canvas|three|stage> --dur 초 --title … --note …` → `scene/compositions/<id>.html`. DNA 는 `scene/index.html` 의 `window.DNA`·CSS 변수에만.
5. **스토리보드** `board.mjs P` → `work/storyboard.png`(무대는 비트마다 한 칸)를 card.png 와 나란히, 6절 기준 미달이면 한 번 보강.
6. **⏸ 검토 요청**("바로 만들어"면 생략): DNA 반영률 · 효과 표 · 시그니처→장면 · 장면 표 · storyboard.png 경로 · 자신 없는 점 1개 → 승인/장면 수정/스타일 조정.
7. **제작**: `work/sound.json` → `make.mjs P`(오디오→검사→게이트→렌더→검수→모션 검수). qc.jpg·qc-motion.png 에 문제가 있으면 한 번 고쳐 재실행(남은 문제는 납품 메시지에).
8. **납품**: `out/<폴더이름>.mp4`, 길이·해상도, 반영 DNA 한 줄, LUFS·문제 구간, 모션 검수 ✔/✗ 한 줄, 들어볼 것, 약점 1개. 수정 요청은 그 장면만 고쳐 make 재실행.

## 2.5 소스 점검
- **요소**: card.png(필요하면 shots.png)에서 구간별 화면 요소 — 배경·환경, 캐릭터 포즈·표정, 소품, 그래픽(일러스트·아이콘·UI), 질감 그림. 각각 핵심/보조.
- **판정**: ① 받은 소스로 충족 ② 코드로 충분(평면 도형·그리드·그라데이션·파티클·타이포·단순 아이콘·UI 테두리·3D 기본형) ③ **이미지 필요**(코드로는 느낌이 크게 떨어짐: 회화·사진·일러스트 질감 배경, 다른 포즈·표정의 캐릭터, 복잡한 오브젝트, 손그림·재질).
- **캐릭터**(점검 표에 판정 한 줄): 몸통 1개+단순 눈·입 → **코드 캐릭터** · 윤곽선·명암·질감의 그림체 → **파츠 시트** 요청(프롬프트 `modules/rig2d.md`). 파츠가 어긋나면 rig.json 회전 중심 수정, 안 되면 코드 캐릭터로 바꾸고 알린다.
- **요청**: ③ 중 핵심만 필수(최대 5), 나머지 선택(최대 3). 코드가 잘하는 것, 사용자 소스와 겹치거나 충돌하는 것은 뺀다.
- `work/assets.json` → `assets.mjs request P` → `work/ASSETS.md`(형식 `assets.mjs` 맨 위): 파일 이름 영문 소문자_밑줄 · `why` 레퍼런스 구간 · `ref` 그 구간 프레임(`work/ref-*/shot_NN.jpg`) · 캐릭터·제품은 `attach` 에 사용자 소스 · `size` 쓰일 크기(패럴랙스 배경은 넓게) · 오려 쓸 것 `transparent: true`.
- **프롬프트**(`prompt_en` 주, `prompt_ko` 설명): 대상+동작 / 구도·카메라 각도(레퍼런스 프레임과 같게) / DNA HEX / 매체·질감·조명 / 비율 / `no text, no watermark, no logo` + 끝에 **같은 스타일 문구**. 캐릭터는 "same character as the attached image", 레퍼런스 캐릭터·로고는 베끼지 않고 "in the style of the attached frame, original design".
- 온 이미지에 맞춰 계획, 안 온 것은 코드로 대체해 PLAN 11번에.
- **사진**: 여러 각도 = 같은 대상(턴테이블·각도 바꾸기·나란히). 단색 배경 사물 `cutout:true`(tol), 사람 `npx hyperframes remove-background source/x.jpg -o scene/assets/source/x.png`(인물 전용). 스타일 안의 프레임(종이 카드·그리드 칸·인쇄판·3D 공간)에 넣고 "다시 그리기"는 특징 3개 이상(색 배치·실루엣·부품) 유지. 권리가 없으면 가상 대체물, 학생 얼굴은 브리프대로.

## 3. PLAN.md 틀 (예시 `<플러그인>/harness/PLAN-example.md` — 형식만, 색·스타일은 따르지 않음)
```markdown
# P 계획
주 레퍼런스: <파일/ID> · 보조: <파일 — 항목 번호만> 또는 없음
한 줄 스타일: <예: 그리드 위 모든 것이 박자에 스냅, 빨간 요소 하나만 규칙을 깬다>
| # | 항목 | 레퍼런스 (근거) | 적용값 | 판정 |
| 1 | 구도·레이아웃 | 그리드/여백/피사체 크기%/글자 위치 | | 채택·변형·제외 |
| 2 | 색 | 바탕·잉크·강조 HEX+비중, 강조색의 의미 | | |
| 3 | 질감·재질 | 노이즈 σ, 그레인 움직임/고정, 그라데이션·비네트, 평면/2.5D/3D, 선·그림자 | | |
| 4 | 타이포 | 서체·굵기·크기(화면높이%)·자간·등장 | | |
| 5 | 모션 | 주 이징(스냅/스프링/선형), 1s/2s, 등장·퇴장 | + ant·over·settle·hold·squash | |
| 6 | 리듬 | BPM, 평균 샷, 홀드 비율, 가속·감속 | | |
| 7 | 전환 | 컷/와이프/푸시/모핑/원테이크 | | |
| 8 | 카메라 | 고정/푸시/팬/회전/패럴랙스/3D 궤도 | | |
| 9 | 정보 장치 | 캡션 줄·숫자·라벨·자막 | | |
| 10 | 사운드 | 음악 성격·BPM, 효과음, 무음 | | |
| 11 | 소스 처리 | — | 소스별 쓰임(다시 그리기/배경제거 합성/턴테이블/화면 속 화면/캐릭터) + 요청 이미지 받음·대체 | — |
반영률 (채택+변형)/10 = _
시그니처: S1 <동작> → #장면 · S2 … (2~5개, 전부 배정, 가장 강한 것은 정점)
효과 표 (② 는 근거 필수, ③ 은 brief "효과 지정")
| 효과 id | 단계 | 근거 | 사용 위치 |
| <id> | ② | <이름> <t0>–<t1>s (ev_….png) | st1 b1–b3 |
| <id> | ③ | 사용자 지정 | s4 |
장면 표
| # | 시간 | 종류 | 화면(구도·동작) | 소스 | DNA·시그니처 | 전환 | 효과음 | 문구 |
```
규칙: **주 레퍼런스 1개**(보조는 지정 항목만) · 근거는 측정값(추정은 "(추정)") · 이유 없는 제외 금지 · **반영률 ≥ 8/10** · 시그니처 전부 사용 · 이야기·구성·캐릭터·음악은 가져오지 않는다(문법만) · **사용자가 지정한 색·배경이 우선**(2·3번 '변형 — 사용자 지정').
- 5번 ① 강도 → `window.DNA.motion`: `over`(오버슈트 비율)·`hold`(정지 초)는 analysis.md "① 기본기 강도" 측정값, `ant`(예비동작 비율)·`settle`(안착 초)·`squash`(최대 늘어남)는 판단(추정).
- 효과 표: id 는 `catalog.json` 것. ② 근거 = 2.2 문구, ③ = `사용자 지정` + brief "## 효과 지정"에 그 id 나 `ko` 표현, ① 은 생략 가능. `lens.mblur` 행 = 렌더 약 4배(미리 알림).
- 질감 측정값 그대로: 노이즈 σ≥1 → `MH.grain`(움직이면 rate 12~24, 고정 0)·`MH.paper`, `MH.gradient`, `MH.vignette`.

## 4. 장면 엔진
**종류** — DNA를 가장 적은 코드로 재현하는 쪽:
- `dom` 타이포·레이아웃·카드·UI, 키네틱 타이포. GSAP `fromTo` + `ease: "dna"`.
- `canvas` 그리드·선 드로잉·하프톤·픽셀·종이/그레인·데이터, 사진 합성 → `modules/canvas.md`.
- `three` 여러 각도 사진 턴테이블, 공간 속 카드, 깊이 카메라, 파티클 → `modules/three.md`.
- `stage` 원테이크: 큰 월드·카메라·세트·배우를 큐시트 하나로(`MH.stage2d`), **`cam.onetake`·`trans.shared` 근거가 있을 때만**. 비트(`<id>-beats`) = 장면 표 한 행 = 스토리보드 한 칸. 25초 이하, 다른 종류와 혼용.
- 이름 붙은 효과(전환·타이틀·자막·차트·3D 배경)는 먼저 레지스트리: `npx hyperframes catalog --query "<영어>" --json` → `npx hyperframes add <이름> --json`(scene 폴더). 색·폰트는 DNA로.

**① 기본기**(게이트 없음, 손 키프레임 대신) — t 의 순수 함수, 생략한 강도는 `DNA.motion`(`MH.motion()`)
- `MH.move(t,t0,a,b,{dur,ant,over,settle})` 예비동작→이동→오버슈트→안착(숫자/배열)
- `MH.follow(t,fn,{lag,damp})` 늦게 따라감(fn 은 draw 밖에서 한 번 만듦)
- `MH.sim(t,step,init,update)` 결정적 시뮬(update 는 새 상태 반환) · `MH.phys.body({pos,vel,spin,g,bounce,floor}).at(t)` → {x,y,rot}
- `MH.gsapSpring(name,'snappy'|'smooth'|'heavy'|'playful'|{f,z})` → DOM 용 GSAP 이징 이름
- `MH.screenSize()` → [W,H](9:16, 1920×1080 가정 금지) · `MH.easeOf('dna'|E 이름|함수)`

**② 모듈은 효과 표에 켜진 것만 `modules/<이름>.md` 를 읽는다**(캐릭터가 있으면 rig2d 도). 게이트가 찾는 변수 이름(`cam`·`trans`·`lens`·`fx`·`time`·`morph`)은 문서 선언대로, 괄호 앞 공백 없이.
| 효과 id | 문서 |
|---|---|
| rig.actor ①(캐릭터, 배우 `scene/assets/actors/<이름>.json`) | `modules/rig2d.md` |
| cam.pan·push·rotate·shake·parallax | `modules/camera2d.md` |
| trans.fill·zoomThrough·whip·match | `modules/transitions.md` |
| lens.dof·rack·smear·mblur | `modules/lens2d.md` |
| fx.vhs·glitch, time.remap | `modules/fx2d.md` |
| morph.shape·text | `modules/morph.md` |
| cam.onetake·trans.shared (stage 종류) | `modules/stage.md` |

**HyperFrames 규칙**: `<template>` 안에 style·markup·script / 루트 id = 호스트 id = 타임라인 키 / `gsap.timeline({paused:true})`, 끝에 `window.__timelines["id"]=tl` / `from` 대신 `fromTo`, 절대 초 / `Date.now`·`Math.random`·타이머·`repeat:-1`·네트워크 금지(`MH.rng`) / 한 요소를 GSAP·CSS transform 으로 동시에 움직이지 않음 / 경로 `assets/…` / 한글은 Pretendard `@font-face`(템플릿) / 비동기 로드 `window.__hf.buildReady[key]=promise`.
**장면 전환**: 다음 장면 `--start` 를 앞당겨 겹치고(z-index 위) 들어오는 장면에서 와이프·푸시, 또는 레지스트리 전환 블록. 전환 중 빈 화면 금지.

**MH 시간·이징** (모든 종류) — `t` 는 장면 로컬 초, `MH.drive(tl, DUR, draw)` 의 draw(t) 는 순수 함수
- `tween(t,t0,d,ease)` 0→1 · `kf(t,[[t,v,ease],…])` · `springAt(t,t0,a,b,SPRING.snappy|smooth|heavy|playful)` · `seg(t,a,b)` · `quant(t,12)` 2s 느낌 · `breathe(t,amp,hz)` · `DNA.B(n)` n박→초
- `E.out/in/inOut/expoOut/back/smooth/snap` · `E.bez(x1,y1,x2,y2)` · `DNA.easeFn`

## 5. 사운드
`work/sound.json`: `{"bed":"pulse|ambient|none","bpm":120,"key":"A","minor":true,"gain":-6,"music":"source/곡.mp3","events":[[전역초,"종류",dB]]}`
효과음: whoosh swoosh pop click tick snap thump impact riser chime ding type glitch sparkle paper. 보이는 동작마다 하나, 정점 직전 0.5~2초 정적 → 정점에 가장 큰 소리.
내레이션(edge-tts ko-KR-SunHiNeural 여 / ko-KR-InJoonNeural 남, 또는 녹음) → `tts.mjs P` → `scene.mjs captions P`(자막 장면) → 음악 자동 덕킹. 대본 없는 녹음은 `npx hyperframes transcribe`.
소리는 못 들으니 LUFS·이벤트 수만 보고하고 들어보라고 한다.

## 6. 연출 최소 기준
3초 안에 훅 · 2~4초마다 새로운 것 + 홀드 한 번 · 끝은 처음의 변형 · 강조색은 한 의미 · 중요한 것 ≥100px, 글자 ≥28px(1080 기준, 더 작으면 장식용만) · 글자 유지 ≥ (글자수÷7+1.2)초 · 금지: 그라데이션 위 가운데 제목, 전부 페이드인, 의미 없는 파티클, 로고만 나오는 엔딩.
**품질 기준**(스토리보드 vs card.png, 레퍼런스와 같은 밀도인가): 요소·레이어 수 · 동시 움직임(배경 흐름·입자·UI·미세 흔들림·캐릭터 생명감) · 깊이(전경·중경·배경, 패럴랙스) · 전환 방식(하드컷·페이드는 레퍼런스가 그럴 때만). 미달이면 검토 전 보강, 못 한 것은 '자신 없는 점'에.

## 7. 검수 (make.mjs)
- 검사 오류 0 · 검은/빈 구간이 의도인지 · LUFS −14±2 · qc.jpg: 피사체가 작거나 잘림, 글자가 피사체를 가림, 같은 색 위 같은 색 · 시그니처가 보이는가.
- **게이트**(`gate.mjs`, HyperFrames 검사 다음, `--check` 도): 위반 = 효과 id·파일·줄 + 해결 3가지(근거 추가 2.2 / brief "효과 지정"+③ 행 / 호출 제거). 근거가 없으면 제거가 기본, ③ 은 사용자가 원할 때만.
- **모션 검수**(`motion-qc.mjs`, 렌더 뒤, 초안 제외): `work/motion-qc.json` + `work/qc-motion.png`(효과 행마다 위 레퍼런스·아래 우리 영상). ✔ 계획한 자리 · ✗ 없음 · ? 눈 확인 · ⚠ 계획에 없는 ② 신호, 딱딱한 움직임(등속·급정지 → `MH.move`·스프링).

## 8. 저작권
레퍼런스는 문법만. jasonzhu.ai/X 작품은 제작자 소유(허락 없음). lemo 데모 CC BY 4.0, animate MIT, Pretendard OFL, flubber MIT, opentype.js MIT. 사용자 사진·음악은 권리가 있을 때만.
