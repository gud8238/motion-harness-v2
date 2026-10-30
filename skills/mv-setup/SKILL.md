---
name: mv-setup
description: motion-harness2 설치·업데이트 (Node 패키지, HyperFrames, 모핑용 flubber·opentype.js, 레퍼런스 라이브러리, 한글 폰트). 컴퓨터마다 처음 한 번, 또는 도구가 "setup 을 먼저 실행"이라고 할 때.
disable-model-invocation: true
---

`node "${CLAUDE_PLUGIN_ROOT}/harness/tools/setup.mjs" $ARGUMENTS` 를 실행한다 (업데이트는 `--update`).
5~10분 걸릴 수 있으니 timeout 을 넉넉히(600000) 준다. 실패한 항목이 있으면 그 줄의 설치 명령(Node 22+, ffmpeg, git)을 사용자에게 그대로 알려주고 멈춘다.
끝나면 짧게: 설치 위치(~/.motion-harness2)는 **모든 영상 프로젝트가 같이 쓰는 도구 저장소**라 작업 폴더가 아닌 곳에 설치된 것이 정상이고 컴퓨터마다 한 번이면 된다는 것, 다음은 지금 연 영상 작업 폴더(ref/·source/ 를 넣어 둔 폴더)에서 `/motion-harness2:mv-new` (세로 영상이면 `--size 9:16`) → `/motion-harness2:mv-plan`.

음악 연결을 지금 할지/나중에 할지 사용자에게 묻는다. 키 자체를 채팅으로 요청하지 않는다.
- 사용자의 **본인 터미널**에서 `python -m pip install keyring` 후 `node "<실제 플러그인 경로>/harness/tools/setup.mjs" --music` 실행을 안내한다. 실제 경로를 제공하되 비밀값은 명령에 넣지 않는다.
- 비표시 입력으로 OS Keychain/Windows Credential Manager/Linux Secret Service에 저장한다. 보안 저장소 부재는 평문 저장 없이 실패한다.
- `setup.mjs --music-status`는 설정 유무만, `--music-delete`는 저장된 키 삭제. Google API 연결은 설정 시 확인, Lyria 사용 권한/과금은 실제 생성 시 확인한다.
- 채팅에 키를 보냈으면 값을 되풀이하지 말고 Google에서 폐기/재발급하도록 안내한다.
