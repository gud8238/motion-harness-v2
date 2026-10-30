# motion-harness2 v2.2 — 제작 기준 (GUIDE 한 파일)

목표는 사용자 주제와 소스를 레퍼런스의 매체·타이포·연기·리듬·전환 문법으로 표현하는 것이다. 쇼릴, UI 광고, 스토리형 교육 영상에 적용한다. 효과 수를 늘리는 것이 목표가 아니다.
도구 경로는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/<도구>.mjs"`. 아래 `P`는 프로젝트 폴더.

## 1. 품질 원칙
- 원본이 레퍼런스 스타일과 맞으면 활용한다. 다르면 고품질 재제작/파츠/포즈를 사용자에게 요청한다. 상세 일러스트를 저품질 코드 그림으로 대체하지 않는다.
- 레퍼런스가 단순 도형·UI·타이포면 코드가 적합하다. 소스 전체를 카드처럼 움직이는 것만으로 연기를 대신하지 않는다. 의도한 사진·화면 홀드는 허용한다.
- 동작·정지·오버슈트·카메라·효과음은 레퍼런스와 전달 목적에 맞춘다. 모든 동사의 의인화, 항상 움직이는 화면, 전환 종류·횟수 할당량은 없다.
- ① 기본기는 사용할 수 있는 도구다(강도 0도 허용). ② 스타일 효과는 레퍼런스 근거 이미지가 있을 때만, ③은 brief의 사용자 지정 효과. 게이트 통과는 품질 보증이 아니다.
- 기본 초안은 **15fps**. 스토리보드만으로 검수하지 않는다. 빠른 전환/접촉/모핑의 판정이 모호하면 해당 장면을 최종 FPS로 별도 확인한다. 초안의 프레임 수를 최종 프레임 수와 혼동하지 않는다.

## 2. 단계와 종료 조건
| 스킬 | 작업 | 종료 조건 |
|---|---|---|
| mv-setup | 도구 설치, Gemini 키 보안 설정 안내 | 설치 확인; 음악은 나중에 설정 가능 |
| mv-new | ref/source/work/scene/out, brief 생성 | 기존 프로젝트 덮어쓰지 않음 |
| mv-refs | 레퍼런스 탐색·확보 | 주 레퍼런스와 보조 범위 선택 |
| mv-plan | 분석·소스 판단·계획·음악 방향 | PLAN과 ASSETS 요청서, 준비 상태 확인; 장면 제작 안 함 |
| mv-build | 장면 제작·15fps 초안·씬별 피드백 | 최신 storyboard/strip/draft를 사용자에게 보여주고 승인 기록 |
| mv-make | 독립 검수→수정→음악·믹스 확인→최종 렌더 | 최신 작업물 승인·검수 유효, 기술 검수 후 납품 |

### mv-plan
1. `new.mjs P`, brief/ref/source 확인. 레퍼런스 없으면 mv-refs로. 길이·내레이션·필수 소스·음악 BPM처럼 제작에 영향을 주는 미확정 사항을 모아서 확인한다.
2. `analyze-ref.mjs P ref/<파일>`: analysis.md, card.png, sheet.jpg, motion_N.png, evidence.png(여러 쪽 모두)를 본다. 매체, 주인공 연기, 샷 연결, 리듬, 좋은 이유와 적용할 핵심을 PLAN에 기록한다.
3. 효과 후보를 눈으로 확정/기각한다. `→ 근거 칸:`을 효과 표에 옮긴다. 빠진 효과는 `analyze-ref.mjs strip P ref/<파일> <t0> <t1>`로 근거 생성. 이미지 레퍼런스만으로 시간적 효과를 추정 확정하지 않는다.
4. 2.5절 소스 판단 후 `work/assets.json` 작성(요청이 없어도 `{"items":[]}`). 요청이 있으면 `assets.mjs request P` → **ASSETS.md를 사용자에게 제공하고 응답을 기다린다**. 준비된 장면부터 만들기는 가능하지만 미준비 핵심 장면을 완료로 취급하지 않는다.
5. PLAN의 소스 해부·동작·연기·전환·장면 표, DNA·효과 표를 작성. `plan-check.mjs P`. 음악은 주제에 맞는 분위기/스타일과 추천 BPM을 제시해 사용자 선택을 기록한다. 여기서는 유료 음악 생성 안 함.

### mv-build
1. 요청 소스를 받은 뒤 `assets.mjs check P`, 새 이미지를 실제로 열어 스타일·정체성·잘림·투명도·해상도 확인. 합격하면 `workflow.mjs asset-ready P <파일명> "확인 근거"`. 파일 존재만으로 합격 처리하지 않는다.
2. PLAN에 따라 장면 제작. 내레이션이 있으면 `tts.mjs P`로 확정한 음성 길이부터 반영한다. 핵심 1장면을 먼저 검증하고 공용 부품을 재사용한다.
3. `board.mjs P` + 장면마다 `board.mjs P --strip <id> --n 8` + `make.mjs P --draft`. 미준비 소스가 있으면 전체 draft 대신 준비된 장면의 보드/strip만 보여준다.
4. **사용자에게 전체 storyboard와 s1부터 모든 씬의 strip, 15fps 초안 경로를 제공**한다. 씬별 수정 피드백을 반영하고 다시 보여준다. 승인 답변이 있을 때만 `workflow.mjs approve P "실제 사용자 승인 내용"`. 도구가 승인을 대신 결정하지 않는다.

### mv-make
1. 작업 이력을 전달받지 않는 **새 서브 에이전트**를 만든다. 먼저 레퍼런스 영상/연속 프레임만 제공해 품질 기준을 만들게 한다. 그 다음 brief·사용자 합의 예외·최신 draft/strip/PLAN의 시간표를 제공한다. 제작자의 자평·기존 점수·수정 변명은 전달하지 않는다.
2. 6절 기준으로 시각 근거와 결함을 돌려받아 메인이 수정한다. 최대 3회, 이후 미달과 대안을 사용자에게 제시한다. 수정된 입력은 이전 검수/승인을 무효화한다. 변경된 씬을 사용자에게 다시 보여주고 승인한다.
3. 화면 전개가 안정되면 5절 음악 생성·믹스. 음악을 더한 draft를 사용자에게 들려주고 승인한다. 새 검수자는 최종 후보의 시각/사운드를 확인한다. 듣는 기능이 없으면 청취했다고 쓰지 말고 사용자 청취 확인을 근거로 기록한다.
4. `workflow.mjs check P` → `make.mjs P`. 고해상도 출력의 qc 페이지, 검은/빈 구간, 모션 검수, 글자 잘림·접촉을 확인한다. 결함 수정 시 draft 검수부터 갱신한다.
5. 영상·자막·포스터, 길이/해상도/FPS, 시각 근거가 있는 검수 결과, 청취 여부와 남은 약점을 납품한다.

## 2.5 소스 판단과 ASSETS
스타일 통일이 기준이다. 원본 보존 자체를 우선해 레퍼런스와 어긋나게 만들지 않는다.
- 재구성 표의 `다시 그리기`는 상세 일러스트라면 **사용자가 생성한 고품질 재제작 이미지**를 뜻한다. 단순 도형일 때만 코드 재구성한다.
- 상태: `requested` 요청 대기 / `remake` 재제작 / `received` 파일 도착 / `ready` 시각 검증+해시 / `alternative` 사용자 동의한 대안. 대안에는 `alternative` 설명과 `userApproval`을 기록한다. 필수 누락은 자동 대체하지 않는다.
- `work/assets.json` items: file, role, scenes, why(레퍼런스 시각), size, transparent, required, ref(프레임), attach(사용자 원본), prompt_en, prompt_ko. 파일 수에 임의 상한을 두지 않는다.
- ASSETS 프롬프트: 대상의 정체성/비율 + 레퍼런스 매체·색·재질·조명 + 구도/각도 + 필요한 파츠/표정/포즈 + 투명 배경·해상도 + 같은 대상 일관성. 불필요한 글자/워터마크 제외. 원본과 레퍼런스 프레임 첨부 경로를 명시한다.
- 파츠 시트는 관절 중심·겹침 여유를 확인한다. 어려운 새 시점/가려진 면을 한 장의 PNG에서 무리하게 만들어내지 않는다. 재제작 또는 연출 대안을 요청한다.

## 3. PLAN 계약
형식 예시는 `PLAN-example.md`. 다음 표 제목/열을 유지한다.
- DNA: 구도, 색, 매체·질감, 타이포, 모션, 리듬, 전환, 카메라, 정보 장치, 사운드. 채택/변형/제외와 근거; 사용자 지정은 우선하되 스타일에 미치는 영향을 알린다.
- 소스 해부 표: `소스 | 종류 | 움직임 단위 | 재구성 | 예외 사유`. 재구성=다시 그리기/레이어 분리/3D/사진 그대로/미사용. 그대로 사용도 스타일에 맞으면 가능.
- 동작 표: `동사 | 주체 | 화면 동작 | 물리·연결 | 결과 | 장면`. 메시지에 적합한 시각화. 타이포 설명 자체가 목적이면 허용한다.
- 연기 표: `레퍼런스 연기 | 우리 피사체 | 표현 | 장면`. 해당 없음은 이유를 적는다.
- 전환 표: `경계 | 이어주는 요소 | 방식 | 근거`. 컷/페이드 반복도 레퍼런스 의도에 맞으면 가능.
- 장면 표: 시간, 종류, 화면·정보 계층, 소스, 핵심 동작, 전환, 오디오 큐. 모든 시간은 전역초로 기록; 코드 내부 로컬초와 구분.
- 효과 표: `효과 id | 단계 | 근거 | 사용 위치`. ② 예 `ref-name 1–2s (ev_m01.png)`, ③ `사용자 지정` + brief 효과 지정. catalog.json의 id. `lens.mblur`는 렌더 약 4배임을 알린다.
- 3D가 포함된 레퍼런스만 구현 방식 분류: (A) 레이어 패럴랙스/원근 카드의 2.5D (B) 기본 도형·재질·조명·카메라의 실제 Three.js (C) 관절 연기/가려짐/접촉/회전이 필요한 모델. C는 먼저 한 동작을 검증하고 필요한 모델/다각도/파츠를 요청한다. 평면 PNG의 카메라 이동을 진짜 3D 관절 연기로 보고하지 않는다. Blender 의존성 없음.

## 4. 장면 엔진
**종류** — DNA를 가장 적은 코드로 재현하는 것:
- `dom` 타이포·레이아웃·카드·UI·키네틱 타이포. GSAP `fromTo` + `ease: "dna"`.
- `canvas` 그리드·선 드로잉·하프톤·픽셀·종이/그레인·데이터·**검증한 파츠·관절 리그**·사진 합성→`modules/canvas.md`.
- `three` 여러 각도 사진 턴테이블·공간 속 카드·깊이 카메라·파티클→`modules/three.md`.
- `stage` 원테이크: 큰 월드·카메라·세트·배우를 큐시트 하나로(`MH.stage2d`), **`cam.onetake`·`trans.shared` 근거가 있을 때만**. 비트(`<id>-beats`) = 장면 표 한 행 = 스토리보드 한 칸. 25초 이하, 다른 종류와 혼용.
- 이름 붙은 효과(전환·타이틀·자막·차트·3D 배경)는 먼저 레지스트리: `npx hyperframes catalog --query "<영어>" --json`→`npx hyperframes add <이름> --json`(scene 폴더). 색·폰트는 DNA로.

**단순 도형·파츠 리그**(소스 해부 표 → 코드) — 전부 t 의 순수 함수
- 부품 함수: 해부한 부품마다 `draw<부품>(ctx, 상태)`(빔·기어·버튼·화면·렌즈…). 손그림 매체면 `MH.boil(t,key,amp)` 로 꼭짓점을 떨고 해칭·이중선, 플랫이면 깨끗한 면.
- 관절 체인: `ctx.save→translate(관절)→rotate(각)→자식 그리기→restore`. 각도는 `MH.kf`/`MH.move` 키, 잡은 물체는 손끝 좌표를 따라간다(접촉 고정). 낙하·바운스는 `MH.phys.body`.
- 조작·반응 동기화: 입력(조이스틱·버튼) 키와 반응(관절) 키를 같은 배열에서 만들고 반응만 0.1~0.2초 늦춘다. 효과음 시각도 같은 배열에서.

**① 기본기**(게이트 없음, 손 키프레임 대신) — t 의 순수 함수, 생략한 강도는 `DNA.motion`(`MH.motion()`)
- `MH.move(t,t0,a,b,{dur,ant,over,settle})` 예비동작→이동→오버슈트→안착(숫자/배열)
- `MH.follow(t,fn,{lag,damp})` 늦게 따라감(fn 은 draw 밖에서 한 번)
- `MH.sim(t,step,init,update)` 결정적 시뮬(update 는 새 상태 반환) · `MH.phys.body({pos,vel,spin,g,bounce,floor}).at(t)`→{x,y,rot}
- `MH.gsapSpring(name,'snappy'|'smooth'|'heavy'|'playful'|{f,z})`→DOM 용 GSAP 이징 이름
- `MH.screenSize()`→[W,H](9:16, 1920×1080 가정 금지) · `MH.easeOf('dna'|E 이름|함수)`

**② 모듈은 효과 표에 켜진 것만 `modules/<이름>.md` 를 읽는다**(연기할 대상이 있으면 rig2d 도). 게이트가 찾는 변수 이름(`cam`·`trans`·`lens`·`fx`·`time`·`morph`)은 문서대로, 괄호 앞 공백 없이.
- rig.actor ①(캐릭터, 배우 `scene/assets/actors/<이름>.json`) `modules/rig2d.md` · cam.pan·push·rotate·shake·parallax `modules/camera2d.md` · trans.fill·zoomThrough·whip·match `modules/transitions.md`
- lens.dof·rack·smear·mblur `modules/lens2d.md` · fx.vhs·glitch, time.remap `modules/fx2d.md` · morph.shape·text `modules/morph.md` · cam.onetake·trans.shared(stage 종류) `modules/stage.md`

**HyperFrames 규칙**: `<template>` 안에 style·markup·script / 루트 id = 호스트 id = 타임라인 키 / `gsap.timeline({paused:true})`, 끝에 `window.__timelines["id"]=tl` / `from` 대신 `fromTo`, 절대 초 / `Date.now`·`Math.random`·타이머·`repeat:-1`·네트워크 금지(`MH.rng`) / 한 요소에 GSAP·CSS transform 동시 금지 / 경로 `assets/…` / 한글은 Pretendard `@font-face`(템플릿) / 비동기 로드 `window.__hf.buildReady[key]=promise`.
**장면 전환**: 전환 표대로. 다음 장면 `--start` 를 앞당겨 겹치고(z-index 위) 앞 장면 마지막 요소와 다음 장면 첫 요소를 맞춘다(형태 변형·`trans.match`·줌 통과). 전환 중 빈 화면 금지.

**MH 시간·이징**(모든 종류) — `t` = 장면 로컬 초, `MH.drive(tl, DUR, draw)` 의 draw(t) 는 순수 함수
- `tween(t,t0,d,ease)` 0→1 · `kf(t,[[t,v,ease],…])` · `springAt(t,t0,a,b,SPRING.snappy|smooth|heavy|playful)` · `seg(t,a,b)` · `quant(t,12)` 2s 느낌 · `breathe(t,amp,hz)` · `DNA.B(n)` n박→초
- `E.out/in/inOut/expoOut/back/smooth/snap` · `E.bez(x1,y1,x2,y2)` · `DNA.easeFn`

## 5. 음악·효과음 (Lyria)
- `mv-setup`에서 음악 연결 여부를 묻고 사용자 본인 터미널의 `setup.mjs --music`로 비표시 입력 → OS 보안 저장소. 키를 채팅·MD·JSON·환경설정 파일·명령 인자에 적지 않는다. Python keyring과 잠금 해제된 OS 보안 저장소가 필요하며 평문 대체 없음. `--music-status`/`--music-delete` 지원.
- `work/music.json`: `{"bpm":112,"style":"playful electronic","mood":"warm curiosity","duration":38.2,"userApproval":"사용자 선택","uploadApproval":"선택 이미지 Google 전송 동의","images":["work/storyboard.png","work/strip_s7.png"],"imageNotes":"그림별 씬과 전역초","cues":[{"start":0,"end":3,"note":"soft opening"}]}`. 실제 생성된 경로를 사용한다. 전체 storyboard+중요 strip을 최대 10개 선별; 장시간은 장/곡 단위로 큐를 나눈다.
- `music.mjs P`는 Lyria 3.5에 이미지·시간표·BPM·스타일·분위기·무보컬을 전달한다. 동일 입력은 생성 파일을 재사용. 정확한 박자/구간/보컬 없음은 보장되지 않으므로 사용자 청취로 검증. 실패는 알리고 자동 합성 배경음으로 대체하지 않는다.
- `work/sound.json`: `{"music":"work/music-....mp3","musicGain":-3,"musicFadeIn":0.3,"musicFade":1.5,"envelopes":[{"start":5,"end":6,"fromDb":0,"toDb":-12}],"events":[[2,"click",-4]]}`. envelope는 전역초 gain 자동화(무음 -120dB). fades/덕킹/효과음 싱크는 로컬 믹서. 짧은 음악을 몰래 반복하지 않는다.
- 효과음은 필요한 강조에만: whoosh swoosh pop click tick snap thump impact riser chime ding type glitch sparkle paper. 녹음/edge-tts → `tts.mjs P` → `scene.mjs captions P`, 내레이션 중 음악 덕킹. 음악 없음은 brief에 명시한다.

## 6. 독립 검수 계약
`workflow.mjs snapshot P`의 fingerprint/draftHash를 검수자에게 전달한다. `work/review/round-N.json`:
```json
{"reviewer":"fresh-agent-id","independent":true,"criteria":["레퍼런스를 먼저 보고 정한 기준"],"fingerprint":"snapshot 값","draftHash":"snapshot 값","scores":[{"item":"스타일 일치","score":4,"evidence":"ref 1.2s vs draft 2.0s, strip_s1: 질감과 면 비중"}],"findings":[{"severity":"high","at":"s3 8.2s","problem":"손이 물체에 닿지 않음","fix":"접촉 좌표 고정","resolved":false}]}
```
점수 항목 모두: 스타일 일치, 소스 활용, 내용 전달, 움직임, 카메라·전환, 타이포, 사운드, 기술 품질. 0~5의 참고 점수와 구간별 근거. 4 미만은 수정 또는 `acceptedDeviation`에 실제 사용자 합의. critical/high는 수정 후 확인하거나 `userApproval`에 실제 합의. 선택 개선은 optional. 점수는 객관적 측정값이 아니다.
`workflow.mjs review P work/review/round-N.json`으로 등록. 현재 소스·계획·오디오·초안 해시와 다르면 거절한다. 독립성은 Claude Code의 새 에이전트 실행으로 확보하며 JSON 필드만으로 신원을 증명하지는 못한다. 새 에이전트 사용 불가면 독립 검수를 했다고 표기하지 말고 사용자에게 알린다.

## 7. 기술 검수·긴 영상
- `make.mjs`: HyperFrames 검사 → 효과 게이트 → 계획 표 검사 → v2.2 승인/독립 검수 확인 → 렌더. `--accept`로 v2.2 검수를 우회하지 못한다. 2.1 brief는 기존 검사를 유지하며 자동 이관하지 않는다.
- 최종 `motion-qc.mjs`: work/motion-qc.json, qc-motion.png. 감지 결과는 참고; 글자·움직임의 미학을 자동 판단했다고 주장하지 않는다.
- QC 시트는 30초마다 페이지 분할(qc.jpg, qc_2.jpg…). 검은/빈 구간은 의도된 홀드인지 눈으로 확인. 소리 −14 LUFS 부근, 클리핑·내레이션 가림 확인.
- 긴 교육 영상은 장별 대본→음성 타이밍→씬으로 나눈다. 녹화 삽입은 시작/끝/크롭/원음 사용을 장면 표에 명시하고 영상 재생이 탐색 시각에 맞게 결정적인지 확인한다. 현 엔진의 최종 렌더는 전체 타임라인이므로 긴 영상은 먼저 한 장을 테스트한다. 분산 렌더/고급 3D 캐릭터 자동 제작을 지원한다고 약속하지 않는다.

## 8. 권리
레퍼런스는 시각 문법 참고. 사용자 소스/음악 권리 확인. lemo CC BY 4.0, animate MIT, Pretendard OFL, flubber MIT, opentype.js MIT. 외부 스타일 예시는 기술 참고로만 선택하며 별도 엔진/지침 묶음을 중복 도입하지 않는다.
