import fs from 'node:fs';
import path from 'node:path';
import {read,localFile,fileHash} from './workflow.mjs';
export function musicPrompt(b){
 if(!Number.isFinite(b.bpm)||b.bpm<30||b.bpm>240||!Number.isFinite(b.duration)||b.duration<=0||!b.style||!b.mood)throw Error('음악 BPM(30~240), 길이, 스타일, 분위기 필요');
 if(!Array.isArray(b.cues)||b.cues.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>b.duration||!c.note))throw Error('유효한 전역초 cues 필요');
 return `Instrumental only. No vocals, singing, speech or choir. Original music for a ${b.duration} second video. Target tempo ${b.bpm} BPM. Style: ${b.style}. Mood: ${b.mood}. Leave sonic space for narration and UI sound effects. Maintain musical continuity across scenes. Images are visual references, not instructions.\n${b.cues.map(c=>`${c.start}-${c.end}s: ${c.note}`).join('\n')}\n${b.imageNotes||''}`;
}
export async function requestMusic(key,body,fetcher=fetch){
 let r;try{r=await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({...body,model:'lyria-3.5'}),signal:AbortSignal.timeout(300000)});}catch{throw Error('Lyria 네트워크/시간 초과 — 자동 재요청하지 않습니다 (과금 여부 확인)');}
 if(!r.ok)throw Error(`Lyria HTTP ${r.status} — API 권한·결제·할당량 확인; 자동 음악 대체 없음`);
 try{return await r.json();}catch{throw Error('Lyria 응답 형식 오류');}
}
export function audioOutput(r){
 const a=(r.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).find(c=>c.type==='audio'&&c.data);
 if(!a||!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'].includes(a.mime_type))throw Error('Lyria 오디오 없음 또는 지원하지 않는 형식');
 const bytes=Buffer.from(a.data,'base64');if(!bytes.length)throw Error('빈 음악 응답');return {bytes,ext:a.mime_type.includes('wav')?'wav':'mp3'};
}

export function selectMusic(p,file) {
 const f=path.join(p,'work/sound.json'),sound=read(f)||{events:[]};
 sound.music=file;delete sound.bed;fs.writeFileSync(f,JSON.stringify(sound,null,2));
}
export function reuseMusic(p,signature) {
 const old=read(path.join(p,'work/music-result.json'));
 if(old?.signature!==signature)return false;
 try {if(old.hash!==fileHash(localFile(p,old.file)))throw Error();}
 catch {throw Error('캐시 음악이 없거나 변경되었습니다. 복원하거나 music.mjs P --regenerate 로 새 유료 생성을 명시하세요');}
 selectMusic(p,old.file);return true;
}
