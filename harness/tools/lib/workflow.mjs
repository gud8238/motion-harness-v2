import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const read = f => {try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
export const hash = x => createHash('sha256').update(x).digest('hex');
export const fileHash = f => hash(fs.readFileSync(f));
export const isV22 = p => fs.existsSync(path.join(p,'brief.md')) && fs.readFileSync(path.join(p,'brief.md'),'utf8').includes('<!-- quality: 2.2 -->');
export function localFile(p,rel){
  if(typeof rel!=='string'||!rel||path.isAbsolute(rel))throw Error('프로젝트 내부 상대 경로가 필요합니다');
  const root=fs.realpathSync(p), f=path.resolve(root,rel);
  if(!f.startsWith(root+path.sep)||!fs.realpathSync(f).startsWith(root+path.sep))throw Error('프로젝트 외부 경로 금지');
  if(!fs.statSync(f).isFile())throw Error('파일이 필요합니다');return f;
}
export function fingerprint(p){
  const h=createHash('sha256');
  function walk(rel){const f=path.join(p,rel);if(!fs.existsSync(f))return;if(fs.lstatSync(f).isSymbolicLink())throw Error('프로젝트 입력 심볼릭 링크 금지');
    if(fs.statSync(f).isDirectory()){for(const n of fs.readdirSync(f).sort())walk(path.join(rel,n));return;}
    const data=fs.readFileSync(f);
    h.update(rel.replaceAll(path.sep,'/'));h.update(data);
  }
  for(const r of ['brief.md','source','ref','scene','work/PLAN.md','work/assets.json','work/narration.timing.json','work/sound.json','work/music.json','work/music-result.json'])walk(r);
  const music=read(path.join(p,'work/sound.json'))?.music; if(music) {h.update(music);h.update(fs.readFileSync(localFile(p,music)));}
  return h.digest('hex');
}
export function validateAssets(p,a){
  if(!a||!Array.isArray(a.items))return ['work/assets.json 에 items (없으면 빈 배열)가 필요합니다'];
  const errors=[];
  for(const i of a.items){if(i.required===false)continue;
    if(i.status==='alternative' && i.userApproval && i.alternative)continue;
    try{const f=localFile(p,'source/'+(i.found||i.file));if(i.status!=='ready'||i.reviewedHash!==fileHash(f))throw Error();}
    catch{errors.push(`${i.file}: 소스 없음/재제작 대기/시각 확인 필요`);}
  }return errors;
}
export const REVIEW_ITEMS=['스타일 일치','소스 활용','내용 전달','움직임','카메라·전환','타이포','사운드','기술 품질'];
export function validateReview(r){
  if(!r)return ['독립 검수 없음'];const errors=[];
  if(!r.reviewer||r.independent!==true||!r.criteria?.length)errors.push('새 검수 에이전트와 레퍼런스 선행 기준 필요');
  for(const item of REVIEW_ITEMS){const s=r.scores?.find(x=>x.item===item);if(!s||!Number.isFinite(s.score)||s.score<0||s.score>5||!s.evidence)errors.push(`${item}: 0~5 점수와 시각 근거 필요`);else if(s.score<4 && !s.acceptedDeviation)errors.push(`${item}: 4 미만 — 수정 또는 사용자 합의 필요`);}
  if(!Array.isArray(r.findings))errors.push('findings 배열 필요');
  for(const f of r.findings||[])if(['critical','high'].includes(f.severity)&&!f.resolved&&!f.userApproval)errors.push('미해결 중요 결함');
  return errors;
}
export function snapshot(p){const draft=path.join(p,'out/draft.mp4');if(!fs.existsSync(draft))throw Error('15fps draft.mp4 먼저 생성');return {fingerprint:fingerprint(p),draftHash:fileHash(draft)};}
export function checkFinal(p){
 const errors=validateAssets(p,read(path.join(p,'work/assets.json')));
 const brief=fs.existsSync(path.join(p,'brief.md'))?fs.readFileSync(path.join(p,'brief.md'),'utf8'):'';
 if(/^- 음악:.*Lyria/im.test(brief) && !read(path.join(p,'work/sound.json'))?.music)errors.push('Lyria 음악이 요청되었지만 믹스에 음악 파일이 없습니다');
 let s;try{s=snapshot(p);}catch(e){return [...errors,e.message];}
 const rendered=read(path.join(p,'work/draft-state.json'));
 if(!rendered||rendered.fingerprint!==s.fingerprint||rendered.draftHash!==s.draftHash)errors.push('현재 소스의 초안을 다시 렌더하세요');
 for(const [file,label] of [['approval.json','사용자 초안 승인'],['review.json','독립 검수']]){const x=read(path.join(p,'work',file));if(!x||x.fingerprint!==s.fingerprint||x.draftHash!==s.draftHash)errors.push(`${label}이 없거나 이전 작업물 기준입니다`);if(file==='review.json')errors.push(...validateReview(x));else if(!x?.userApproval)errors.push('사용자 승인 근거 필요');}
 return errors;
}
