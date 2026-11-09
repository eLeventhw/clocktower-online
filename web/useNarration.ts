'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {createPublicEventTracker,createReadyVoiceTracker,type VoicedNotice} from './voiceEvents';

type PublicGame={code:string;me:{host:boolean};events:(VoicedNotice&{at:number})[]}|null;
type Ai={key:string;region:string;model:string;provider?:string;voiceKey?:string;speaker?:string;voiceKeyReady?:boolean};
type AudioItem={code:string;id:string};
const SILENCE='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
// Device speech synthesis needs no key, so a room with an Ark key still gets a voice.
const canSpeak=()=>typeof window!=='undefined'&&'speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined';
function pickChineseVoice(){
 const voices=window.speechSynthesis.getVoices();
 return voices.find(v=>/^zh[-_]?(CN|Hans)/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang))||null;
}

/** Public-event Qwen TTS; keys stay in the host tab and audio is shared by the server. */
export function useNarration(game:PublicGame,token:string,ai:Ai,apiUrl:(path:string)=>string){
 const [enabled,setEnabled]=useState(false),[generating,setGenerating]=useState(false);
 const [voice,setVoice]=useState('Cherry'),[voiceError,setVoiceError]=useState(''),[blocked,setBlocked]=useState(false);
 const [queueTick,setQueueTick]=useState(0),[generationTick,setGenerationTick]=useState(0);
 const [localEnabled,setLocalEnabled]=useState(false),[voiceTest,setVoiceTest]=useState(''),[testing,setTesting]=useState(false);
 const localRef=useRef(false),localTracker=useRef(createPublicEventTracker());
 const listenRef=useRef(false),epoch=useRef(0),audio=useRef<HTMLAudioElement|null>(null),objectUrl=useRef('');
 const audioBusy=useRef(false),audioQueue=useRef<AudioItem[]>([]),generationBusy=useRef(0),generationQueue=useRef<AudioItem[]>([]);
 const retriedEvents=useRef<Set<string>>(new Set());
 const MAX_PARALLEL_GEN=3;
 const publicTracker=useRef(createPublicEventTracker()),readyTracker=useRef(createReadyVoiceTracker());
 const clearAudio=useCallback(()=>{if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current.pause();audio.current.src='';audio.current=null;}if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current='';}},[]);
 // Device speech can drop utterances when several events land in the same tick (a Slayer
 // claim, the death and the result arrive together), so read them strictly one by one.
 const speechQueue=useRef<string[]>([]),speaking=useRef(false);
 const pumpSpeech=useCallback(()=>{
  if(speaking.current||!speechQueue.current.length)return;
  if(!canSpeak()){speechQueue.current=[];return;}
  const clean=speechQueue.current.shift()!;speaking.current=true;
  const utterance=new SpeechSynthesisUtterance(clean);
  utterance.lang='zh-CN';utterance.rate=1;utterance.pitch=1;
  // Some engines expose voice objects that cannot be assigned; never let that
  // break the whole utterance.
  try{const chosen=pickChineseVoice();if(chosen)utterance.voice=chosen;}catch{}
  const next=()=>{speaking.current=false;pumpSpeech();};
  utterance.onend=next;
  utterance.onerror=(e:any)=>{const code=String(e?.error||'');if(code==='not-allowed')setVoiceError('浏览器阻止了朗读，请再点一次「开启本机朗读」。');else if(code&&code!=='interrupted'&&code!=='canceled')setVoiceError(`本机朗读失败：${code}`);next();};
  window.speechSynthesis.speak(utterance);
 },[]);
 const speak=useCallback((text:string)=>{
  if(!canSpeak())return;
  const clean=text.replace(/^说书人：/,'').trim();if(!clean)return;
  speechQueue.current.push(clean);pumpSpeech();
 },[pumpSpeech]);
 const toggleLocal=useCallback(()=>{
  if(!canSpeak()){setVoiceError('当前浏览器不支持本机朗读，请换用 Chrome、Edge 或 Safari。');return;}
  if(localRef.current){localRef.current=false;setLocalEnabled(false);speechQueue.current=[];speaking.current=false;try{window.speechSynthesis.cancel();}catch{}setVoiceError('');return;}
  // Prime the tracker so enabling never reads the backlog aloud, and speak once from
  // the click gesture so iOS unlocks playback and the player hears it worked.
  localTracker.current=createPublicEventTracker();localTracker.current(game);
  localRef.current=true;setLocalEnabled(true);setVoiceError('');
  speak('说书人已就位，之后的公开事件我会念给你听。');
 },[game,speak]);
 const toggle=useCallback(()=>{
  if(listenRef.current){listenRef.current=false;epoch.current++;audioQueue.current=[];audioBusy.current=false;clearAudio();setBlocked(false);setEnabled(false);setVoiceError('');return;}
  // Attempt playback from the user gesture; some mobile browsers still require
  // the explicit resume button for later asynchronous audio.
  const silent=new Audio(SILENCE);void silent.play().catch(()=>{});
  readyTracker.current.reset(game);listenRef.current=true;setEnabled(true);setVoiceError('');
 },[game,clearAudio]);
 const toggleGeneration=useCallback(()=>{
  if(generating){generationQueue.current=[];generationBusy.current=0;setGenerating(false);setVoiceError('');return;}
  if(!game?.me.host){setVoiceError('只有房主可以开启房间语音生成。');return;}
  const speechKey=ai.provider==='ark'?(String(ai.voiceKey||'').trim()||(ai.voiceKeyReady?'server-default':'')):ai.key.trim();
  if(!speechKey){setVoiceError(ai.provider==='ark'?'请先在设置里填写豆包语音 Key（语音接口专用，与文字 Key 不通用）。':'请先在说书人设置中填写 Qwen API Key。');return;}
  // Mark all existing text as observed, so enabling never generates backlog.
  publicTracker.current=createPublicEventTracker();publicTracker.current(game);
  // Turning on generation is almost always followed by wanting to hear it, and this
  // is still inside the click gesture so mobile browsers unlock playback.
  if(!listenRef.current){readyTracker.current.reset(game);listenRef.current=true;setEnabled(true);}
  setVoiceError('');setGenerating(true);
 },[game,generating,ai.key,ai.provider,ai.voiceKey]);
 // Speaks a fixed sentence through the real speech API and plays it back, so a bad
 // voice key is reported here instead of staying silent through a whole game.
 const testVoice=useCallback(async()=>{
  if(testing)return;
  setTesting(true);setVoiceTest('正在合成测试语音…');setVoiceError('');
  try{
   const response=await fetch(apiUrl('/api/room'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'test_voice',ai:{key:ai.key,region:ai.region,provider:ai.provider,model:ai.model,voiceKey:ai.voiceKey,speaker:ai.speaker},voice})});
   const data:any=await response.json().catch(()=>({}));
   if(!response.ok||typeof data?.data!=='string'||!data.data)throw new Error(data?.error||'语音测试失败');
   const binary=atob(data.data);const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const src=URL.createObjectURL(new Blob([bytes],{type:data.mime||'audio/mpeg'}));
   const element=new Audio(src);
   element.onended=()=>URL.revokeObjectURL(src);
   await element.play().then(()=>setVoiceTest(`语音正常：${data.provider||''} · ${data.speaker||''}`)).catch(()=>{URL.revokeObjectURL(src);setVoiceTest('语音已合成，但浏览器阻止了播放，请再点一次「测试语音」或检查设备音量。');});
  }catch(e){setVoiceTest('');setVoiceError(e instanceof Error?e.message:'语音测试失败');}
  finally{setTesting(false);}
 },[testing,apiUrl,ai,voice]);
 useEffect(()=>{
  const fresh=localTracker.current(game);
  if(localRef.current&&fresh.length)for(const e of fresh)speak(e.text);
 },[game?.code,game?.events,speak]);
 useEffect(()=>{
  const next=publicTracker.current(game);
  if(generating&&game?.me.host&&next.length){for(const e of next)generationQueue.current.push({code:game.code,id:e.id});setGenerationTick(x=>x+1);}
 },[game?.code,game?.events,generating,game?.me.host]);
 useEffect(()=>{
  if(!generating||generationBusy.current>=MAX_PARALLEL_GEN||!game?.me.host||!token)return;
  const item=generationQueue.current.shift();if(!item)return;
  if(item.code!==game.code){setGenerationTick(x=>x+1);return;}
  generationBusy.current++;
  void (async()=>{
   try{
    const response=await fetch(apiUrl('/api/room'),{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':token},body:JSON.stringify({op:'generate_voice',code:item.code,eventId:item.id,ai:{key:ai.key,region:ai.region,provider:ai.provider,model:ai.model,voiceKey:ai.voiceKey,speaker:ai.speaker},voice})});
    const data:any=await response.json();if(!response.ok)throw new Error(data?.error||'语音合成失败');
   }catch(e){
    // A single hiccup (rate limit, timeout, flaky network) must not silence the rest of the
    // game: retry that one event once, and only give up on a repeat failure.
    if(!retriedEvents.current.has(item.id)){
     retriedEvents.current.add(item.id);
     generationQueue.current.unshift(item);
    }else{
     generationQueue.current=[];generationBusy.current=0;setGenerating(false);setVoiceError(e instanceof Error?e.message:'语音合成失败');
    }
   }
   finally{generationBusy.current--;setGenerationTick(x=>x+1);}
  })();
 },[generationTick,generating,game?.code,game?.me.host,token,ai,voice,apiUrl]);
 useEffect(()=>{
  const next=readyTracker.current.next(game);
  if(listenRef.current&&game&&next.length){for(const e of next)audioQueue.current.push({code:game.code,id:e.id});setQueueTick(x=>x+1);}
 },[game?.code,game?.events]);
 useEffect(()=>{
  if(!enabled||audioBusy.current||!token||!game)return;
  const item=audioQueue.current.shift();if(!item)return;
  if(item.code!==game.code){setQueueTick(x=>x+1);return;}
  audioBusy.current=true;const startEpoch=epoch.current;
  const done=()=>{if(startEpoch!==epoch.current)return;clearAudio();setBlocked(false);audioBusy.current=false;setQueueTick(x=>x+1);};
  void (async()=>{
   try{
    const response=await fetch(apiUrl(`/api/room?code=${encodeURIComponent(item.code)}&voice=${encodeURIComponent(item.id)}`),{headers:{'X-Room-Token':token},cache:'no-store'});
    if(!response.ok){let message='语音读取失败';try{const data:any=await response.json();message=data?.error||message;}catch{}throw new Error(message);}
    const blob=await response.blob();if(startEpoch!==epoch.current||!listenRef.current)return;
    const src=URL.createObjectURL(blob);objectUrl.current=src;const element=new Audio(src);audio.current=element;
    element.onended=done;element.onerror=()=>{setVoiceError('语音播放失败，请检查设备。');done();};
    try{await element.play();}catch{setBlocked(true);setVoiceError('浏览器暂停了自动播放，请点击继续播放。');}
   }catch(e){if(startEpoch===epoch.current){setVoiceError(e instanceof Error?e.message:'语音播放失败');done();}}
  })();
 },[queueTick,enabled,game?.code,token,apiUrl,clearAudio]);
 const resume=useCallback(()=>{const element=audio.current;if(!element)return;void element.play().then(()=>{setBlocked(false);setVoiceError('');}).catch(()=>setVoiceError('请检查浏览器的声音与自动播放权限。'));},[]);
 const speechKey=ai.provider==='ark'?(String(ai.voiceKey||'').trim()||(ai.voiceKeyReady?'server-default':'')):ai.key.trim();
 useEffect(()=>{if(generating&&(!game?.me.host||!speechKey)){generationQueue.current=[];setGenerating(false);if(game?.me.host)setVoiceError('语音 Key 已清除，房间语音生成已停止。');}},[game?.code,game?.me.host,speechKey,generating]);
 useEffect(()=>()=>{epoch.current++;clearAudio();localRef.current=false;speechQueue.current=[];speaking.current=false;try{if(canSpeak())window.speechSynthesis.cancel();}catch{}},[clearAudio]);
 return {enabled,generating,voice,setVoice,voiceError,toggle,toggleGeneration,blocked,resume,localEnabled,toggleLocal,localSupported:canSpeak(),testVoice,voiceTest,testing};
}
