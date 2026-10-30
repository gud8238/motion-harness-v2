import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fingerprint, validateAssets, validateReview, checkFinal} from '../../harness/tools/lib/workflow.mjs';
const fixture=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'mh22-'));for(const d of ['work','scene','source','out','ref'])fs.mkdirSync(path.join(p,d));fs.writeFileSync(path.join(p,'scene/index.html'),'scene');return p;};
test('asset readiness requires inspected file hash; missing does not become code fallback',()=>{const p=fixture();try{assert.equal(validateAssets(p,{items:[{file:'x.png',required:true,status:'ready'}]}).length,1);fs.writeFileSync(path.join(p,'source/x.png'),'image');assert.equal(validateAssets(p,{items:[{file:'x.png',required:true,status:'requested'}]}).length,1);}finally{fs.rmSync(p,{recursive:true});}});
test('fingerprint changes for source/brief/plan but not review reports',()=>{const p=fixture();try{const a=fingerprint(p);fs.writeFileSync(path.join(p,'work/review.json'),'{}');assert.equal(a,fingerprint(p));fs.writeFileSync(path.join(p,'source/a.png'),'new');assert.notEqual(a,fingerprint(p));}finally{fs.rmSync(p,{recursive:true});}});
test('review rejects missing evidence, out-of-range score and unresolved major issues',()=>{assert.ok(validateReview({scores:[{item:'style',score:99}],findings:[]}).length);assert.ok(validateReview({scores:[{item:'style',score:4,evidence:'0-1s'}],findings:[{severity:'high',resolved:false}]}).length);});
test('final blocked without matching draft approval and independent review',()=>{const p=fixture();try{assert.ok(checkFinal(p).length);}finally{fs.rmSync(p,{recursive:true});}});

import {snapshot,REVIEW_ITEMS,fileHash,localFile} from '../../harness/tools/lib/workflow.mjs';
function approved(p){
 fs.writeFileSync(path.join(p,'out/draft.mp4'),'draft');fs.writeFileSync(path.join(p,'work/assets.json'),'{"items":[]}');
 const s=snapshot(p),r={...s,reviewer:'fresh-reviewer',independent:true,criteria:['reference-first'],scores:REVIEW_ITEMS.map(item=>({item,score:4,evidence:'reference 0.5s / draft 0.8s'})),findings:[]};
 for(const [name,data]of [['draft-state',s],['approval',{...s,userApproval:'approved latest'}],['review',r]])fs.writeFileSync(path.join(p,`work/${name}.json`),JSON.stringify(data));
 assert.deepEqual(checkFinal(p),[]);
}
test('valid approval becomes stale when audio element changes',()=>{const p=fixture();try{fs.writeFileSync(path.join(p,'scene/index.html'),'<audio id="mh-mix" data-volume="1"></audio>');approved(p);fs.writeFileSync(path.join(p,'scene/index.html'),'<audio id="mh-mix" data-volume="0"></audio>');assert.ok(checkFinal(p).length);}finally{fs.rmSync(p,{recursive:true});}});
for(const file of ['scene/index.html','source/actor.png','work/PLAN.md','brief.md','out/draft.mp4'])test(`approval invalidates after ${file} edit`,()=>{const p=fixture();try{approved(p);fs.writeFileSync(path.join(p,file),'changed');assert.ok(checkFinal(p).length);}finally{fs.rmSync(p,{recursive:true});}});
test('asset hash and external music bytes are checked',()=>{const p=fixture();try{const f=path.join(p,'source/a.png');fs.writeFileSync(f,'old');const assets={items:[{file:'a.png',status:'ready',reviewedHash:fileHash(f)}]};assert.deepEqual(validateAssets(p,assets),[]);fs.writeFileSync(f,'new');assert.equal(validateAssets(p,assets).length,1);fs.writeFileSync(path.join(p,'work/sound.json'),JSON.stringify({music:'source/a.png'}));approved(p);fs.writeFileSync(f,'music edit');assert.ok(checkFinal(p).length);}finally{fs.rmSync(p,{recursive:true});}});
test('path traversal and symlink image uploads rejected',()=>{const p=fixture();try{assert.throws(()=>localFile(p,'../outside.png'));fs.symlinkSync(import.meta.filename,path.join(p,'source/link'));assert.throws(()=>localFile(p,'source/link'));}finally{fs.rmSync(p,{recursive:true});}});
