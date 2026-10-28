# Motion Harness 2

레퍼런스 영상(mp4·프롬프트·라이브러리 스타일)과 내 이미지(여러 각도 사진)로 **레퍼런스 스타일이 빠짐없이 반영된** 짧은 모션그래픽 영상을 만드는 Claude Code 플러그인. [motion-harness v1](https://github.com/gud8238/motion-harness-v1) 의 모든 기능에 **움직임의 자연스러움**(캐릭터 연기·원테이크 카메라·모핑·렌즈 효과)을 더한 v2 입니다.

- **렌더 엔진**: [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML → MP4, 프레임 단위 결정적 렌더)
- **장면 4종**: DOM/GSAP(타이포·레이아웃) · 캔버스(절차적 그래픽·질감·사진 합성) · three.js(멀티뷰 사진 3D 턴테이블) · **무대(stage)**(큰 월드 위 원테이크 카메라·세트·캐릭터) — 한 영상 안에서 섞어 씀
- **레퍼런스 라이브러리**: [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) 59개 스타일 · [animate](https://github.com/cth9191/animate) 7개 스타일 · [awesome-opus-5.5-video](https://github.com/zhuyansen/awesome-opus-5.5-video) / [jasonzhu.ai](https://jasonzhu.ai/en/prompts/claude-opus-5-5) 2,143개 작품
- **가볍게**: 세션마다 항상 붙는 비용은 스킬 소개문 약 700토큰뿐, 작업 중에는 필요한 문서만(효과 표에 켜진 모듈 문서만) 읽고, 품질에 필요한 코드는 브라우저 런타임에 아낌없이

## v2 에서 새로 생긴 것

| 기능 | 하는 일 |
|---|---|
| **효과 근거표** | `analyze-ref` 가 레퍼런스에서 카메라 이동·심도·모션 블러·채움 전환·모핑·VHS 등의 후보를 찾아 `evidence.png` 한 장(구간 프레임 strip)으로 보여 줌. 놓친 효과는 `analyze-ref strip` 으로 근거 추가 |
| **3단계 게이트** | ① 기본기(자연스러운 움직임)는 항상 · ② 스타일 효과는 레퍼런스 근거 이미지가 있을 때만 · ③ brief.md "효과 지정"에 적은 효과는 근거 없이. 제작 전에 `gate` 가 장면 코드를 검사해 근거 없는 효과를 막음 |
| **① 기본기 런타임** | 예비동작·오버슈트·안착(`MH.move`), 따라가기(`MH.follow`), 스프링, 탄도·튕김 물리, 결정적 시뮬레이션. 강도는 레퍼런스에서 측정 |
| **2D 캐릭터** | 단순한 캐릭터는 코드로 그리고, 일러스트형은 파츠 시트(생성 프롬프트 제공)로 — 깜빡임·시선·표정·점프·늘어남·걷기·말하기, 장면을 넘어 같은 캐릭터 |
| **2D 카메라·연결 전환** | 팬·줌·회전·흔들림·패럴랙스, 화면 채움·줌 통과·휙 넘김·매치 컷 |
| **렌즈** | 심도·초점 이동·요소 스미어, 렌더 단계 모션 블러(렌더 시간 약 4배) |
| **특수효과·모핑** | VHS·글리치·시간 되감기, 도형·글자 윤곽 모핑(예: 두 눈 → 로고의 `oo`) |
| **모션 검수** | 렌더 뒤 같은 감지기로 효과가 계획한 자리에 나왔는지 ✔/✗, 딱딱한 움직임 경고, 레퍼런스와 위아래로 붙인 `qc-motion.png` |

검토는 v1 과 같이 **스토리보드 정지 이미지**로 합니다(저해상도 미리보기 영상은 만들지 않음). 이미지가 부족하면 목록·생성 프롬프트를 주고 기다리는 **소스 점검**도 v1 그대로입니다.

## 설치 (PC에서 한 번)

필요: **Node 22 이상**, **ffmpeg**, **git** (선택: 한국어 TTS용 Python + `pip install edge-tts`)

```bash
claude plugin marketplace add gud8238/motion-harness-v2
claude plugin install motion-harness2@motion-harness2
```
그다음 Claude Code 안에서 한 번:
```
/motion-harness2:mv-setup
```
설치물(Node 패키지·모핑 라이브러리·레퍼런스 라이브러리·한글 폰트)은 `~/.motion-harness2` 에 들어갑니다 (Chromium 별도). 모든 영상 프로젝트가 같이 쓰는 도구 저장소라 작업 폴더가 아닌 곳에 설치되는 것이 정상이고, 컴퓨터마다 한 번이면 됩니다.
업데이트: `claude plugin update motion-harness2@motion-harness2` 후 `/motion-harness2:mv-setup --update`

**v1 과 나란히 설치할 수 있습니다.** 플러그인 이름(`motion-harness` / `motion-harness2`)·설치 폴더(`~/.motion-harness` / `~/.motion-harness2`)·명령어 접두사가 달라 서로 덮어쓰지 않습니다. 새 프로젝트의 `brief.md` 맨 위에는 `<!-- harness: v2 -->` 가 들어가 v2 프로젝트임을 표시하고(자연어 요청 때 v2 스킬을 고르는 기준), v1 프로젝트(효과 표 없음)도 v2 에서 그대로 렌더됩니다.

## 사용

**영상 하나 = 폴더 하나.** 예를 들어 바탕화면에 폴더를 만들고 레퍼런스와 이미지를 미리 넣어 둡니다.

```
바탕화면/motion-video2/      ← 이 폴더를 Claude Code 로 연다
  ref/      레퍼런스 mp4 (·이미지·프롬프트)
  source/   영상에 쓸 이미지 (여러 각도 사진, 음악·녹음도 가능)
```

명령어 이름은 v1 과 같고 **접두사만 다릅니다**.

| v2 | v1 | 하는 일 |
|---|---|---|
| `/motion-harness2:mv-new` | `/motion-harness:mv-new` | 지금 폴더를 프로젝트로 준비 — ref/·source/ 확인, `brief.md`(효과 지정 칸 포함)·`scene/`·`work/`·`out/` 생성, source 동기화. 세로 영상은 `--size 9:16` (1:1, 4:5 도 가능) |
| `/motion-harness2:mv-refs` | `/motion-harness:mv-refs` | 레퍼런스가 없을 때: 주제·이미지에 맞는 후보 4~6개를 영상 재생 페이지로 추천 |
| `/motion-harness2:mv-plan` | `/motion-harness:mv-plan` | 레퍼런스 측정 → **근거표 확정** → **소스 점검**(부족한 이미지·캐릭터 파츠 시트가 있으면 목록·생성 프롬프트를 주고 "이미지 추가 완료"를 기다림) → 스타일 DNA + 효과 표 → 장면/무대 코드 → 스토리보드 → **검토 요청** ("바로 만들어"를 붙이면 기다리지 않음) |
| `/motion-harness2:mv-make` | `/motion-harness:mv-make` | 검사·**게이트** → 렌더 → 검수·**모션 검수** → `out/<폴더이름>.mp4`. 수정: `/motion-harness2:mv-make 2번 장면 더 빠르게` |

mv-new 는 여러 번 실행해도 안전합니다 — source/ 에 이미지를 추가·교체했으면 다시 실행해 동기화하세요 (mv-plan·mv-make 도 시작할 때 동기화합니다). 자연어로 "이 레퍼런스처럼 만들어줘"라고 해도 mv-plan 이 동작합니다(v2 프로젝트이거나 v2 를 언급할 때).

**여러 영상을 한 폴더에서 관리하려면** 이름을 붙입니다: `/motion-harness2:mv-new 모션1` → `모션1/` 하위 폴더가 프로젝트가 되고, 이후 명령에도 `모션1` 을 붙입니다.

**레퍼런스에 없는 효과를 꼭 넣고 싶으면** `brief.md` 의 "효과 지정"에 적습니다(예: `VHS 화면`, `화면 채움 전환`, `모션 블러`).

## 레퍼런스 스타일을 빠짐없이 옮기는 방법

1. **측정** — `analyze-ref` 가 레퍼런스를 숫자와 카드 1장으로: 컷·평균 샷·움직임 곡선, 팔레트 HEX·강조색, **질감**(노이즈 세기, 그레인이 움직이는지/종이처럼 고정인지, 그라데이션 방향·세기, 비네트), 템포, 원본 해상도 질감 확대, 움직임 피크 연속 프레임, 움직임 강도(예비동작·오버슈트·정지).
2. **효과 근거표** — 감지기 후보를 `evidence.png` 로 보고 확정·기각. 확정한 효과만 `work/PLAN.md` 의 효과 표에 근거 이미지와 함께 적힌다.
3. **스타일 DNA** — 매번 같은 11개 항목(구도·색·질감·타이포·모션·리듬·전환·카메라·정보장치·사운드·소스처리)을 측정값으로 채우고 항목마다 채택/변형/제외. 반영률 8/10 미만이면 다시.
4. **소스 점검** — 레퍼런스 화면을 이루는 요소(배경·캐릭터 포즈·오브젝트·그래픽)를 내 소스와 맞춰 보고, 코드로는 느낌이 살지 않는 이미지만 `work/ASSETS.md` 로 요청 (파일 이름·규격·첨부할 레퍼런스 프레임·영문 생성 프롬프트). 캐릭터는 코드로 그릴지 파츠 시트를 받을지 판정해 표에 표시.
5. **시그니처 무브** — 그 레퍼런스다운 동작 2~5개를 모두 장면에 배정.
6. **주 레퍼런스 1개** — 여러 개를 주면 하나가 기준, 나머지는 지정한 항목만.
7. **색은 고정 아님** — 기본은 레퍼런스 팔레트, brief 의 "색 지정"에 적으면(예: 배경 남색 #1B2A4A) 그것이 우선.

## 구성

```
.claude-plugin/   plugin.json · marketplace.json
skills/           mv-setup · mv-new · mv-refs · mv-plan · mv-make
harness/
  GUIDE.md        기준 문서 (순서·DNA·효과 표 틀·엔진 API·사운드·검수)
  catalog.json    효과 카탈로그 (id·단계·모듈·게이트가 찾는 호출·감지기·한국어 표현)
  modules/        효과 표에 켜진 것만 읽는 문서: rig2d · camera2d · transitions · lens2d · fx2d · morph · stage (+ canvas · three)
  runtime/        mh.js (캔버스 도구 + ① 기본기) · mh-rig.js (2D 캐릭터) · mh-cam.js (2D 카메라·전환)
                  mh-lens.js (심도·초점·스미어) · mh-fx.js (VHS·글리치·시간 재매핑) · mh-morph.js (모핑)
                  mh-stage.js (무대 모드) · mh-three.js (three.js 도구)
  template/       HyperFrames 프로젝트 · 장면 템플릿(dom/canvas/three/stage)
  tools/          setup · new · refs · analyze-ref · assets · scene · board · audio · tts · compare · make
                  gate (3단계 게이트) · motion-qc (모션 검수)
  PLAN-example.md 계획서가 채워진 모습 (효과 표·무대 비트 포함, 형식 참고)
```

## 참고
- HyperFrames **커넥터(claude.ai)** 는 호스팅 편집용이라 Claude Code 에서는 영상 생성·렌더가 막혀 있습니다. 이 플러그인은 같은 엔진을 **로컬 CLI** 로 씁니다. 완성 후 직접 손보려면 프로젝트의 `scene/` 폴더에서 `npx hyperframes preview`.
- HyperFrames 의 배경 제거(`remove-background`)는 **인물 전용 모델**입니다. 제품·사물 사진은 단색 배경에서 찍으면 내장 배경 제거가 동작합니다.
- 한국어 TTS 는 edge-tts(인터넷 필요). 직접 녹음도 가능.
- 3D 캐릭터·3D 후처리(보케·블룸)는 다음 단계(3D 트랙)에서 다룹니다. 지금 three.js 장면은 v1 과 같습니다.

## 라이선스
코드 MIT. 레퍼런스 라이브러리는 각 원저작자 라이선스(lemo-opuscar 데모 CC BY 4.0, animate MIT, awesome 목록의 작품은 각 제작자 소유 — 스타일 문법만 참고). Pretendard SIL OFL 1.1, flubber MIT, opentype.js MIT, three.js MIT, GSAP 표준 라이선스, HyperFrames Apache-2.0.
