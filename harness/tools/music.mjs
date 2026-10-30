import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {read,hash,fileHash,localFile} from './lib/workflow.mjs';
import {musicPrompt,requestMusic,audioOutput,selectMusic,reuseMusic} from './lib/lyria.mjs';
const p=path.resolve(process.argv[2]||'.'), w=path.join(p,'work');
try{
 const b=read(path.join(w,'music.json'));if(!b?.userApproval)throw Error('work/music.json: 사용자 BPM·스타일 승인 필요');
 if(!Array.isArray(b.images)||b.images.length>10||!b.images.length)throw Error('storyboard와 대표 strip 이미지 1~10개 필요');
 const input=[{type:'text',text:musicPrompt(b)+'\nImage order: '+b.images.map((x,i)=>`${i+1}: ${path.basename(x)}`).join('; ')}];
 for(const rel of b.images){const f=localFile(p,rel),ext=path.extname(f).toLowerCase();const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];if(!mime||fs.statSync(f).size>8*1024*1024)throw Error('이미지는 PNG/JPEG/WebP, 각 8MB 이하');input.push({type:'image',mime_type:mime,data:fs.readFileSync(f).toString('base64')});}
 const signature=hash(JSON.stringify({model:'lyria-3.5',input}));
 if(!process.argv.includes('--regenerate') && reuseMusic(p,signature)){console.log('✔ 동일 시각자료·큐 음악 재사용');process.exit(0);}
 if(!b.uploadApproval)throw Error('선택 이미지와 큐를 Google에 전송하는 사용자 동의 필요 (music.json uploadApproval)');
 const here=path.dirname(fileURLToPath(import.meta.url));let key;
 for(const py of ['python3','python','py']){const r=spawnSync(py,['-c','from credentials import read_key; import sys; sys.stdout.write(read_key())'],{cwd:here,encoding:'utf8',timeout:15000,windowsHide:true});if(r.status===0&&r.stdout){key=r.stdout;break;}}
 if(!key)throw Error('OS 보안 저장소의 Gemini 키 없음 — mv-setup --music 안내');
 const response=await requestMusic(key,{input});key=undefined;
 const {bytes,ext}=audioOutput(response),rel=`work/music-${signature.slice(0,12)}.${ext}`;
 fs.writeFileSync(path.join(p,rel),bytes,{mode:0o600});
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path.join(p,rel)],{encoding:'utf8'});
 const duration=Number(JSON.parse(probe.stdout||'{}').format?.duration);if(!(duration>0))throw Error('생성 음악 디코딩 실패');
 fs.writeFileSync(path.join(w,'music-result.json'),JSON.stringify({signature,file:rel,hash:hash(bytes),duration,targetDuration:b.duration,needsListening:true},null,2));
 selectMusic(p,rel);
 console.log(`✔ 음악 ${duration.toFixed(1)}s 저장. 보컬·템포·전개 청취 후 믹스/검수하세요. 부족한 길이는 자동 반복하지 않습니다.`);
}catch(e){console.error(e.message);process.exitCode=1;}
