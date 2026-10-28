# three — three.js 장면 (MH3, v1 그대로)

`scene.mjs add P <id> three --dur …` → 템플릿에 턴테이블 예시가 들어 있다. 3D 는 그 장면이 3D 일 이유가 있을 때만: 여러 각도 사진 턴테이블, 공간 속 사진 카드, 깊이 있는 카메라 이동, 파티클.
draw(t)마다 오브젝트·카메라를 t 로 정하고 `s.render()` — 이전 프레임 상태에 의존하지 않는다. 사진은 `MH.load` 로 불러 `buildReady` 에 등록(템플릿 참고).

## MH3 (three.js r159, window.MH3)
- `s=MH3.stage(canvasId,{bg,fov,exposure,fog,shadows})` · `MH3.lights(scene,{key,rim,keyI,rimI})` · `MH3.contactShadow(scene,{r,opacity})` · `MH3.floor(scene,{color})`
- `MH3.turntable([{img,angle},…],{h})` → `.set(각도)` : 여러 각도 사진을 교차시켜 도는 것처럼(±90° 범위, 배경 제거 이미지). `scene.add(tt.group)`
- `MH3.photoCard(img,{h,margin,color})` 종이 판 위 사진 · `MH3.textPlane(글,{size,weight,color,height})` · `MH3.orbit(camera,{target,radius,height,angle,fov})`
- `MH3.points(n,seed,{spread,size,color,opacity,add})`(둥근 점, add=가산 혼합) · `MH3.glow({color,size,opacity})` 후광 · `MH3.bgRadial(안,밖)` 방사형 배경 · `MH3.tex(이미지)`
- 카메라 이동은 `MH3.orbit` 을 t 의 함수로(예: `radius: 7.2 - MH.E.inOut(t / DUR)`), 회전 각도는 `MH.kf`·`DNA.easeFn`.
