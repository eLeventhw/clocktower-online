import assert from 'node:assert/strict';
import {newGame,joinGame,synthesizePublicVoice,attachPublicVoice,downloadPublicVoice,view} from '../server-dist/game.js';
import {createReadyVoiceTracker} from '../server-dist/voiceEvents.js';

const {g,p:host}=newGame('ABC234','Host');const guest=joinGame(g,'Guest');const event=g.events[0];
g.privateEvents[guest.id]=[{id:'private-id',text:'秘密身份：小恶魔',at:Date.now()}];
g.messages.push({id:'message-id',from:host.id,to:guest.id,text:'悄悄话',at:Date.now()});
const key='mock-api-key-123456', config={key,region:'aliyun'};let calls=0;
const originalFetch=globalThis.fetch;
const validUrl='http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav?Signature=private-signature';
let outputUrl=validUrl;
try{
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.equal(url,'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  assert.equal(opts.headers.Authorization,`Bearer ${key}`);const body=JSON.parse(opts.body);
  assert.equal(body.model,'qwen3-tts-flash');assert.equal(body.input.voice,'Cherry');assert.equal(body.input.language_type,'Chinese');assert.equal(body.input.text,event.text);
  assert.ok(!JSON.stringify(body).includes('秘密身份'));assert.ok(!JSON.stringify(body).includes('悄悄话'));
  return Response.json({output:{audio:{url:outputUrl,expires_at:Math.floor(Date.now()/1000)+3600}}});
 };
 await assert.rejects(()=>synthesizePublicVoice(g,guest.token,event.id,config,'Cherry'),/只有房主/);
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,'private-id',config,'Cherry'),/公开事件不存在/);
 assert.equal(calls,0);
 const speech=await synthesizePublicVoice(g,host.token,event.id,config,'Cherry');assert.equal(calls,1);assert.ok(speech.url.startsWith('https://'));
 assert.ok(!JSON.stringify(g).includes(key));attachPublicVoice(g,host.token,event.id,speech);
 assert.equal(attachPublicVoice(g,host.token,event.id,speech),false);assert.equal((await synthesizePublicVoice(g,host.token,event.id,config,'Cherry')).url,speech.url);assert.equal(calls,1);
 for(const player of [host,guest]){const publicView=view(g,player.token);assert.equal(publicView.events[0].voice.ready,true);const json=JSON.stringify(publicView);assert.ok(!json.includes('private-signature'));assert.ok(!json.includes(key));}
 globalThis.fetch=async(url,opts)=>{assert.ok(url.startsWith('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/'));assert.equal(opts.redirect,'manual');return new Response(new Uint8Array([82,73,70,70]),{headers:{'content-type':'audio/wav'}});};
 const audio=await downloadPublicVoice(g,guest.token,event.id);assert.deepEqual([...audio.bytes],[82,73,70,70]);assert.equal(audio.mime,'audio/wav');
 await assert.rejects(()=>downloadPublicVoice(g,'invalid',event.id),/身份凭证/);
 await assert.rejects(()=>downloadPublicVoice(g,guest.token,'private-id'),/公开事件不存在/);
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1'}});
 await assert.rejects(()=>downloadPublicVoice(g,guest.token,event.id),/无法读取/);
 globalThis.fetch=async()=>new Response('x',{headers:{'content-type':'text/html'}});
 await assert.rejects(()=>downloadPublicVoice(g,guest.token,event.id),/语音格式/);
 globalThis.fetch=async()=>new Response('x',{headers:{'content-length':String(9*1024*1024),'content-type':'audio/wav'}});
 await assert.rejects(()=>downloadPublicVoice(g,guest.token,event.id),/语音文件过大/);
 globalThis.fetch=async()=>new Response(new Uint8Array(8*1024*1024+1),{headers:{'content-type':'audio/wav'}});
 await assert.rejects(()=>downloadPublicVoice(g,guest.token,event.id),/语音文件过大/);
 delete event.voice;outputUrl='http://127.0.0.1:8080/secret';
 globalThis.fetch=async()=>Response.json({output:{audio:{url:outputUrl,expires_at:Math.floor(Date.now()/1000)+3600}}});
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,event.id,config,'Cherry'),/语音地址不受支持/);
 outputUrl='http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.test/audio.wav';
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,event.id,config,'Cherry'),/语音地址不受支持/);
 const tracker=createReadyVoiceTracker();tracker.reset({code:'A',events:[{id:'old',text:'old'}]});
 assert.deepEqual(tracker.next({code:'A',events:[{id:'old',text:'old',voice:{ready:true,expiresAt:Date.now()+1000}},{id:'new',text:'天亮了'}]}),[]);
 const ready=tracker.next({code:'A',events:[{id:'new',text:'天亮了',voice:{ready:true,expiresAt:Date.now()+1000}}],privateEvents:[{id:'private-id',text:'秘密'}]});
 assert.deepEqual(ready.map(e=>e.id),['new']);assert.deepEqual(tracker.next({code:'A',events:[{id:'new',text:'天亮了',voice:{ready:true,expiresAt:Date.now()+1000}}]}),[]);
 assert.deepEqual(tracker.next({code:'B',events:[{id:'existing',text:'existing',voice:{ready:true,expiresAt:Date.now()+1000}}]}),[]);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: Qwen TTS request, public-only source, host authorization, voice reuse, URL privacy, HTTPS and SSRF restrictions, bounded audio proxy, late-arriving audio.');
