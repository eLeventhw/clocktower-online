import assert from 'node:assert/strict';
import {newGame,joinGame,synthesizePublicVoice,attachPublicVoice,downloadPublicVoice,probeVoice,view} from '../server-dist/game.js';

// Volcengine speech (openspeech.bytedance.com) is a separate product from Ark model
// inference: line-delimited JSON in, base64 mp3 chunks out, its own X-Api-Key.
const ENDPOINT='https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
const voiceKey='ark-test-speech-key-0123456789';
const {g,p:host}=newGame('VOLC23','Host');const guest=joinGame(g,'Guest');const event=g.events[0];
const config={provider:'ark',voiceKey,speaker:'zh_female_vv_uranus_bigtts'};
const chunk=Buffer.from([1,2,3,4]);
const lines=`${JSON.stringify({code:0,data:chunk.toString('base64')})}\n${JSON.stringify({code:0,data:Buffer.from([5,6]).toString('base64')})}\n${JSON.stringify({code:20000000})}\n`;
const originalFetch=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.equal(url,ENDPOINT);
  assert.equal(opts.headers['X-Api-Key'],voiceKey);
  assert.equal(opts.headers['X-Api-Resource-Id'],'seed-tts-2.0');
  assert.equal(opts.headers.Authorization,undefined,'speech never uses the text bearer key');
  const body=JSON.parse(opts.body);
  assert.equal(body.req_params.text,event.text);
  assert.equal(body.req_params.speaker,'zh_female_vv_uranus_bigtts');
  assert.equal(body.req_params.audio_params.format,'mp3');
  assert.equal(body.req_params.audio_params.sample_rate,24000);
  return new Response(lines,{headers:{'content-type':'application/json'}});
 };
 await assert.rejects(()=>synthesizePublicVoice(g,guest.token,event.id,config),/只有房主/);
 assert.equal(calls,0);
 const speech=await synthesizePublicVoice(g,host.token,event.id,config);
 assert.equal(calls,1);assert.equal(speech.mime,'audio/mpeg');assert.ok(speech.data);assert.ok(!('url' in speech));
 assert.ok(speech.expiresAt>Date.now());
 // A text-only key is never accepted for speech, and the speech key never lands in the room.
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,event.id,{provider:'ark',voiceKey:''}),/请填写有效的豆包语音 Key/);
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,event.id,{provider:'ark',voiceKey:'short'}),/请填写有效的豆包语音 Key/);
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,event.id,{provider:'ark',voiceKey,speaker:'BAD SPEAKER!'}),/音色 ID 格式无效/);
 assert.ok(attachPublicVoice(g,host.token,event.id,speech));
 assert.equal(attachPublicVoice(g,host.token,event.id,speech),false);
 assert.ok(!JSON.stringify(g).includes(voiceKey),'speech key must not be stored in the room');
 const audio=await downloadPublicVoice(g,guest.token,event.id);
 assert.deepEqual([...audio.bytes],[1,2,3,4,5,6]);assert.equal(audio.mime,'audio/mpeg');
 for(const player of [host,guest]){
  const publicView=view(g,player.token);
  assert.equal(publicView.events[0].voice.ready,true);
  const json=JSON.stringify(publicView);
  assert.ok(!json.includes(voiceKey));assert.ok(!json.includes(chunk.toString('base64')),'audio bytes stay server-side');
 }
 // The one-shot probe proves the voice key speaks without touching any room state.
 const before=g.events.length;const beforeVoice=g.events.filter(e=>e.voice).length;
 // The probe speaks its own fixed sentence, so the strict event-text mock is swapped
 // for one that only checks the request shape and returns the same audio.
 const successFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{assert.equal(opts.headers['X-Api-Key'],voiceKey);assert.ok(JSON.parse(opts.body).req_params.text.length>0);return new Response(lines,{headers:{'content-type':'application/json'}});};
 const probe=await probeVoice(config);
 assert.equal(probe.provider,'火山方舟');assert.equal(probe.speaker,'zh_female_vv_uranus_bigtts');
 assert.equal(probe.mime,'audio/mpeg');assert.equal(Buffer.from(probe.data,'base64').length,6);
 assert.equal(g.events.length,before);assert.equal(g.events.filter(e=>e.voice).length,beforeVoice);
 await assert.rejects(()=>probeVoice({provider:'ark',voiceKey:''}),/请填写有效的豆包语音 Key/);
 globalThis.fetch=successFetch;
 // Upstream failures surface with the provider's own wording.
 globalThis.fetch=async()=>new Response('{"code":45000000,"message":"quota exceeded"}',{headers:{'content-type':'application/json'}});
 const second=newGame('VOLC24','H2');g.events.push({id:'second-event',text:'天亮了。',at:Date.now()});
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,'second-event',config),/豆包语音返回错误 45000000/);
 globalThis.fetch=async()=>new Response(JSON.stringify({code:45000030,message:'acquire failed err:call ark get status code:403'}),{headers:{'content-type':'application/json'}});
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,'second-event',config),/Agent Plan 语音抵扣未开启/);
 globalThis.fetch=async()=>new Response('{}',{status:401});
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,'second-event',config),/豆包语音接口返回 401/);
 globalThis.fetch=async()=>new Response(JSON.stringify({code:20000000}),{headers:{'content-type':'application/json'}});
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,'second-event',config),/豆包语音未返回音频/);
 globalThis.fetch=async()=>{throw new Error('offline');};
 await assert.rejects(()=>synthesizePublicVoice(g,host.token,'second-event',config),/无法连接豆包语音接口/);
 assert.ok(!JSON.stringify(second).includes(voiceKey));
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: Volcengine speech uses X-Api-Key + seed-tts-2.0, decodes base64 chunks, serves mp3 with auth, keeps bytes and the speech key out of room views, and reports upstream errors.');
