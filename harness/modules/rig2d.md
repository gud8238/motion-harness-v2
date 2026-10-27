# rig2d — 2D 캐릭터 (mh-rig.js)

## 고르기
레퍼런스 캐릭터가 몸통 1개 + 단순 눈·입 도형 → **코드**(`MH.rig.actor(svg|ctx, design)`). 윤곽선·명암·질감이 그림체 → **파츠 시트**(`actor(target, rigJson)`, `kind:'parts'`). 둘 다 같은 동작 목록·pose 를 쓴다. 판정은 소스 점검 표에 적는다.

## design (코드)
`body{shape,w,h,r,color}` shape=roundRect|blob|capsule · `eyes{shape,gap,size,y,color}` dot|oval|line|arc|arcDown|star · `mouth{shape,w,y}` none|line|smile|open|o · `cheeks` · `limbs[{at,len,w,angle}]` · `extras[{d,fill,part}]`

## 동작 `[t, name, opts]`
- blink 깜빡임 · look {x,y} 시선 -1..1 · face 표정(idle|happy|sweat|squint|star|sad|surprise)
- squash/stretch {amt|x,y} 다음 변형까지 유지, {x:1,y:1} 복귀 · hop {to,h} · walk {to,steps}
- talk {dur} 입 6Hz · nod · shake · enter/exit {from|to: below|above|left|right|scale}
- grow {fill:'screen'} 화면 채움(몸통 짧은 변이 대각선 덮음) · anchor {to:'screen'|'world'}

## 파츠 시트 프롬프트 (영문, 사용자가 GPT 에 붙여 넣음)
```
Character parts sheet of <character>, transparent background, every part on the same scale grid, each part separated by at least 10% empty space: 1 body (no arms, no face), eyes open, eyes closed, 7 mouths labeled by mood (idle, happy, sweat, squint, star, sad, surprise), arms and legs as separate pieces. No pivot marks, no guides. no text, no watermark, no logo. <고정 스타일 문구>
```
받은 시트는 파츠별 PNG 로 잘라 `assets/actors/<이름>/` 에 둔다.

## rig.json (assets/actors/<이름>.json)
```json
{"kind":"parts","size":[400,320],"eyesClosed":"eyes_closed","talkMouth":"mouth_open",
"parts":[{"name":"body","src":"assets/actors/hero/body.png","size":[400,320],"pivot":[200,160],"parent":null,"at":[0,0],"z":10},
{"name":"limb0","src":"assets/actors/hero/arm.png","pivot":[30,10],"parent":"body","at":[-190,20],"z":5},
{"name":"eyes_open","src":"assets/actors/hero/eyes_open.png","pivot":[80,30],"parent":"body","at":[0,-40],"z":20}],
"faces":{"idle":{"eyes":"eyes_open","mouth":"mouth_smile"}}}
```
좌표는 이미지 px. `pivot` = 이미지 안 회전 중심, `at` = 부모 pivot 기준 위치(루트는 몸통 중심), `z` 클수록 위, 루트 `size` 필수. 표정이 가리킨 눈·입 파츠만 보이고(없는 표정은 idle), 깜빡임은 `eyesClosed`, talk 는 `talkMouth`, 땀은 `sweat` 파츠, 시선은 `lookPx`(기본 6)만큼 이동. 팔다리는 `limb0`, `limb1`… 이름(또는 `limbs:[…]`). 어긋나면 pivot/at 을 고치고, 안 되면 코드 캐릭터로 전환하고 알린다.
