// User approval must originate in conversation; this tool records, never invents it.
import fs from 'node:fs';
import path from 'node:path';
import {fingerprint,fileHash,read,localFile,snapshot,checkFinal,validateReview} from './lib/workflow.mjs';
const [cmd,dir='.',...args]=process.argv.slice(2), p=path.resolve(dir), w=path.join(p,'work');
const save=(n,x)=>{fs.mkdirSync(w,{recursive:true});fs.writeFileSync(path.join(w,n),JSON.stringify(x,null,2));};
try{
 if(cmd==='asset-ready'){const a=read(path.join(w,'assets.json')),i=a?.items?.find(x=>x.file===args[0]);if(!i)throw Error('요청 소스 없음');if(!args[1])throw Error('스타일·잘림·투명도·해상도 확인 메모 필요');i.reviewedHash=fileHash(localFile(p,'source/'+(i.found||i.file)));i.status='ready';i.visualReview=args[1];save('assets.json',a);}
 else if(cmd==='approve'){if(!args[0])throw Error('실제 사용자 승인 문구 필요');const s=snapshot(p),d=read(path.join(w,'draft-state.json'));if(d?.fingerprint!==s.fingerprint||d?.draftHash!==s.draftHash)throw Error('초안 재생성 필요');save('approval.json',{...s,userApproval:args[0]});}
 else if(cmd==='review'){const r=read(localFile(p,args[0]));const e=validateReview(r);if(e.length)throw Error(e.join('\n'));const s=snapshot(p);if(r.fingerprint!==s.fingerprint||r.draftHash!==s.draftHash)throw Error('검수 대상 해시 불일치');save('review.json',r);}
 else if(cmd==='snapshot')console.log(JSON.stringify(snapshot(p),null,2));
 else if(cmd==='check'){const e=checkFinal(p);if(e.length)throw Error(e.join('\n'));console.log('✔ 최종 제작 조건 통과');}
 else throw Error('workflow.mjs asset-ready|approve|snapshot|review|check <P> [인자]');
}catch(e){console.error(e.message);process.exitCode=1;}
