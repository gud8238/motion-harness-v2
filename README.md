# Motion Harness 2 — v2.2

Claude Code에서 레퍼런스의 매체·타이포·리듬·연기·전환을 분석해 사용자 주제의 모션그래픽을 만드는 플러그인입니다. HyperFrames + GSAP/Canvas/Three.js를 사용하며, Blender는 필요하지 않습니다.

## 설치·업데이트

Node 22+, ffmpeg, git가 필요합니다. 음악 연결에는 Python 3 + `keyring`, OS 보안 저장소가 추가로 필요합니다.

```bash
claude plugin marketplace add gud8238/motion-harness-v2
claude plugin install motion-harness2@motion-harness2
```

기존 설치 업데이트:
```bash
claude plugin marketplace update motion-harness2
claude plugin update motion-harness2@motion-harness2
```
Claude Code를 재시작하고 `/motion-harness2:mv-setup`을 실행하세요. 일반 도구는 `~/.motion-harness2`에 설치됩니다. 음악 키 설정은 사용자의 본인 터미널에서 안내된 실제 플러그인 경로로 실행합니다.

```bash
python -m pip install keyring
node "<플러그인 경로>/harness/tools/setup.mjs" --music
```
키는 화면에 표시되지 않는 입력으로 받으며 macOS Keychain / Windows Credential Manager / Linux Secret Service에 저장합니다. 채팅에 키를 붙여넣지 마세요. 프로젝트·코드·Markdown·평문 설정 파일에는 저장하지 않습니다. 지원되는 보안 저장소가 없으면 평문 저장으로 대체하지 않습니다. `--music-status`는 설정 유무만 확인하고, `--music-delete`는 저장된 키를 삭제합니다. 설정 과정은 Google API 연결을 확인하며, 실제 Lyria 모델 권한·결제·생성은 음악 제작 시 확인합니다.

**v1 과 나란히 설치할 수 있습니다.** v1은 `motion-harness`, v2는 `motion-harness2` 이름을 사용합니다.

## 단계별 역할

| v2 | v1 | 하는 일 |
|---|---|---|
| `/motion-harness2:mv-setup` | `/motion-harness:mv-setup` | 도구 설치·키 연결 여부 확인과 보안 설정 안내 |
| `/motion-harness2:mv-new` | `/motion-harness:mv-new` | 프로젝트와 brief 생성. 기존 파일은 보존 |
| `/motion-harness2:mv-refs` | `/motion-harness:mv-refs` | 레퍼런스 탐색·선택 |
| `/motion-harness2:mv-plan` | `/motion-harness:mv-plan` | 레퍼런스 분석, 소스 적합성 판단, ASSETS 생성 프롬프트, 계획과 음악 방향 |
| `/motion-harness2:mv-build` | — | 장면 구현, **15fps 초안 + storyboard + 씬별 strip**, 사용자 수정·승인 |
| `/motion-harness2:mv-make` | `/motion-harness:mv-make` | **새 에이전트 비교 검수·수정**, 음악·믹스 청취 확인 후 고품질 렌더·최종 검수 |

영상 하나당 폴더 하나: `ref/`에 레퍼런스, `source/`에 이미지·녹음을 넣습니다. 스킬 인자에 하위 프로젝트명을 지정할 수 있습니다. 기본은 현재 폴더입니다. 사용자가 검토하는 `work/storyboard`와 `strip_s번호` 흐름은 유지됩니다.

## 2.1 → 2.2 변경

| 부분 | 2.1 | 2.2 |
|---|---|---|
| 계획 | 분석부터 장면·초안까지 한 단계 | mv-plan / mv-build로 분리 |
| 이미지 | 매체 일치를 위한 코드 재구성, 누락 시 대체 | 스타일에 맞는 원본 활용, 불일치/누락은 ASSETS로 재제작 요청. 상세 이미지의 저품질 코드 대체 금지 |
| 초안 | 15fps·씬별 strip | 유지. 빠른 동작만 필요 시 최종 FPS 확인 |
| 품질 검수 | 제작자 채점, 핵심 항목 만점 강제 | 새 검수자가 레퍼런스 기준으로 비교, 시각 근거·중요 결함 중심 |
| 최신성 | 이전 점수표 재사용 가능 | 소스·계획·오디오·초안 변경 시 승인/검수 해시 불일치로 최종 렌더 차단 |
| 음악 | 반복적인 합성 비트/패드 | Lyria 3.5 이미지·구간 큐 기반 생성, 로컬 페이드·덕킹·효과음 믹스 |
| 지침 | 강제 동작·전환 횟수·만점 기준 | 레퍼런스/내용 중심으로 정리, 제작 GUIDE 한 파일 |
| 2.5D/3D | 기존 엔진 | 필요한 장면만 2.5D/기본 3D/모델 연기로 구분. 엔진 교체 없음 |
| 긴 영상 | 큰 QC 한 장 | 30초 단위 QC 페이지, 자막 종료가 다음 자막과 겹치지 않도록 제한 |

개선 효과는 누락 방지·이미지 품질 유지·검수 근거입니다. 대신 소스 재제작 대기, 추가 승인·검수 시간, 음악 API 비용/대기와 OS 보안 저장소 설정이 필요합니다. 고급 3D 캐릭터 리깅·완전한 장편 자동 편집·레퍼런스와 동급 품질을 자동 보장하지 않습니다. 실제로 보고 들은 범위만 검수 결과에 기록합니다.

## 음악

`mv-plan`에서 분위기·스타일·추천 BPM을 확인하고, 화면 피드백 반영 후 `mv-make`에서 생성합니다. 전체 storyboard와 주요 strip 최대 10장, 각 이미지의 씬/전역초, 구간별 전개를 Lyria에 전달합니다. Google에 보낼 이미지는 사용자에게 알립니다. 원본 이미지 폴더 전체를 일괄 업로드하지 않습니다.

생성 음악은 같은 입력에서 캐시를 재사용합니다. 보컬 없음/정확한 BPM/초 단위 전환은 프롬프트만으로 보장되지 않아 청취 확인과 로컬 편집이 필요합니다. 실패 시 옛 합성음으로 자동 대체하지 않습니다. 내레이션/효과음은 유지합니다. [공식 Lyria API 문서](https://ai.google.dev/gemini-api/docs/music-generation).

## v2.1로 돌아가기

이전 버전 **2.1.0-alpha.1**, 커밋 `4410c33dacb19f8a44b2bdcf314f55674a575a3b`는 [archive/v2.1](https://github.com/gud8238/motion-harness-v2/tree/archive/v2.1)에 보존되어 있습니다. v2.2가 기존 영상 프로젝트를 자동 변환하지 않습니다. 새 v2.2 프로젝트를 2.1로 열 때 검수 계약이 다르므로 작업 폴더 사본을 사용하세요.

가장 명확한 복귀 방법은 고정된 소스를 로컬에서 실행하는 것입니다:
```bash
git clone --branch archive/v2.1 https://github.com/gud8238/motion-harness-v2.git motion-harness-v2.1
git -C motion-harness-v2.1 checkout 4410c33dacb19f8a44b2bdcf314f55674a575a3b
claude plugin disable motion-harness2@motion-harness2
claude --plugin-dir /절대경로/motion-harness-v2.1
```
Windows에서는 해당 폴더의 실제 절대경로를 따옴표로 감싸 사용합니다. v2.2 복귀 시 로컬 플러그인 옵션 없이 시작하고 `claude plugin enable motion-harness2@motion-harness2`를 실행하세요. v2.1에는 Lyria 연동이 없으며 기존 합성 음악은 이 보존 버전에서 사용할 수 있습니다.

## 구성·검증

제작 기준: [harness/GUIDE.md](harness/GUIDE.md). 스킬 파일은 해당 단계로 안내합니다. 모듈 문서는 선택한 API만 참고합니다.

- runtime: mh.js, mh-rig.js, mh-cam.js, mh-lens.js, mh-fx.js, mh-morph.js, mh-stage.js, mh-three.js
- gate (3단계 게이트), plan-check (계획 검사·채점표 합격선) — 2.1 호환, motion-qc (모션 검수)
- v2.2: workflow(소스 준비·승인·검수 최신성), credentials(OS 보안 저장소), music(Lyria), audio(믹스)
- `npm ci && npm test`. 실제 Gemini 키 없이 네트워크 모의 테스트를 수행하며, 실제 음악 생성·모든 OS 보안 저장소의 실행 검증과 구분합니다.

MIT. 라이브러리: flubber MIT, opentype.js MIT, Pretendard SIL OFL. 레퍼런스 작품의 권리는 원저작자에게 있습니다.
