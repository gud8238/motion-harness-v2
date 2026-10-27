# rig2d — 2D 캐릭터

## 고르기
레퍼런스 캐릭터가 몸통 1개 + 단순 눈·입 도형 → **코드**(`MH.rig.actor(svg|ctx, design)`). 윤곽선·명암·질감이 그림체 → **파츠 시트**(`actor(target, rigJson)`, `kind:'parts'`). 동작 목록은 공통. 판정은 소스 점검 표에 기록.

## design (코드)
`body{shape,w,h,r,color}` roundRect|blob|capsule · `eyes{shape,gap,size,y,color}` dot|oval|line|arc|arcDown|star · `mouth{shape,w,y}` none|line|smile|open|o · `limbs[{at,len,w,angle}]` · `extras[{d,fill}]`

## 동작 `[t, name, opts]`
- blink · look {x,y} -1..1 · face idle|happy|sweat|squint|star|sad|surprise
- squash/stretch {amt|x,y} 유지, {x:1,y:1} 복귀 · hop {to,h} · walk {to,steps}
- talk {dur} · nod · shake · enter/exit {from|to: below|above|left|right|scale}
- grow {fill:'screen'} 몸통이 화면을 덮음 · anchor {to:'screen'|'world'}

## 파츠 시트 프롬프트
`<CHARACTER>`·`<STYLE SUFFIX>` 를 DNA·레퍼런스로 채워 보여 준다(GPT 에 그대로 붙임).
```
Parts sheet of <CHARACTER> for 2D animation. Transparent background, all parts on the same scale grid, at least 10% of the canvas width of empty space between parts. Body (no arms, legs or face); eyes open; eyes closed; 7 mouths arranged left to right in this order: idle, happy, sweat, squint, star, sad, surprise; limbs in this order: arm L, arm R, leg L, leg R. No pivot marks, no guides, do NOT draw any labels or text. no text, no watermark, no logo. <STYLE SUFFIX>
```
파츠별 PNG 는 `assets/actors/<이름>/` 에. 팔다리: limb0 팔L · limb1 팔R · limb2 다리L · limb3 다리R.

## rig.json (assets/actors/<이름>.json)
```json
{"kind":"parts","eyesClosed":"eyes_closed","talkMouth":"mouth_open","parts":[
{"name":"body","src":"assets/actors/h/body.png","size":[400,320],"pivot":[200,160],"parent":null,"z":10},
{"name":"eyes_open","src":"assets/actors/h/eo.png","size":[160,60],"pivot":[80,30],"parent":"body","at":[0,-40],"z":20},
{"name":"eyes_closed","src":"assets/actors/h/ec.png","size":[160,60],"pivot":[80,30],"parent":"body","at":[0,-40],"z":20},
{"name":"mouth_smile","src":"assets/actors/h/ms.png","size":[90,50],"pivot":[45,25],"parent":"body","at":[0,50],"z":20},
{"name":"mouth_open","src":"assets/actors/h/mo.png","size":[90,70],"pivot":[45,35],"parent":"body","at":[0,55],"z":20}],
"faces":{"idle":{"eyes":"eyes_open","mouth":"mouth_smile"}}}
```
좌표는 이미지 px. `size` 는 모든 파츠에(루트 = 몸통 크기). `pivot` 필수 = 이미지 안 회전 중심, `at` = 부모 pivot 기준(루트는 몸통 중심, 기본 0,0), `z` 클수록 위. 이름 유일, 루트 하나. faces 가 가리킨 눈·입만 보임(없는 표정=idle), 깜빡임 `eyesClosed`, talk `talkMouth`, 땀 `sweat` 파츠. 팔다리는 `limb0`…(또는 `limbs:[…]`). 어긋나면 pivot/at 수정, 안 되면 코드로 전환·알림. `MH.rig.load('이름')` 은 이미지까지 기다리고, 이미지가 실패해도 끝난다(그 파츠만 숨김·경고, 이미지별 buildReady 는 실패).
