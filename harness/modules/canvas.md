# canvas — 캔버스 장면 (MH, v1 그대로)

`scene.mjs add P <id> canvas --dur …` → 템플릿의 `draw(t)` 를 채운다. `t` 는 장면 로컬 초, draw(t) 는 순수 함수(이전 프레임에 의존하지 않음). `MH.drive(tl, DUR, draw)` 가 시크마다 부른다. `const { ctx, W, H } = MH.stage("<id>-cv")`.
시간·이징(`tween`·`kf`·`springAt`·`seg`·`E`·`DNA.B`)과 ① 기본기(`MH.move` 등)는 GUIDE 4절.

## 그리기
- `MH.clear(ctx,색)` · `rr/circle/line(ctx,pts,{w,color,p})`(p = 그려진 비율, 선 드로잉 애니메이션)
- `txt(ctx,글,x,y,{size,weight,color,align,tracking,maxW})` · `txtIn(ctx,글,x,y,p,{mode:'rise'|'chars'|'words'|'type'|'clip'})`
- `img(ctx,이름,cx,cy,w,h,{fit,r,rot,alpha})`(중심 기준) · `withCam(ctx,{x,y,z,r},fn)`

## 질감 (analyze-ref 측정값 그대로)
`gradient(ctx,{stops,angle|type:'radial'})` · `paper(ctx,{amount,fiber,scale})` · `grain(ctx,t,{amount,rate})` · `vignette(ctx,W,H,a)`

## 사진·전환
- `MH.load({이름:{src:'assets/source/x.jpg',cutout:true,tol:20}})` → Promise (단색 배경 플러드필 제거). `buildReady` 에 등록(템플릿 주석 참고).
- 장면 안 전환: `MH.trans(ctx,'wipe'|'push'|'iris'|'zoom'|'blinds'|'flash',A,B,p,{dir,bar})` + 오프스크린 `MH.layer(W,H)`

## 결정적 난수
`rng(seed)` · `hash(n,m)` · `noise(x)` · `noise2(x,y)` · `boil(t,key,amp)` (손그림 떨림). `Math.random` 금지.
