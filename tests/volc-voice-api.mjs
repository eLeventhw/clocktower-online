import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=30000+Math.floor(Math.random()*20000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','./tests/mock-volc.mjs','server/index.mjs'],{env:{...process.env,NODE_ENV:'test',DB_DRIVER:'memory',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const VOICE_KEY='ark-test-speech-key-0123456789';
async function post(body,token){const r=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 const host=await post({op:'create',name:'Host'}),code=host.state.code,eventId=host.state.events[0].id;
 const guest=await post({op:'join',code,name:'Guest'});
 const ai={provider:'ark',model:'doubao-seed-2-1-lite-260915',voiceKey:VOICE_KEY,speaker:'zh_female_vv_uranus_bigtts'};
 const missing=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':host.token},body:JSON.stringify({op:'generate_voice',code,eventId,ai:{provider:'ark',model:'x'}})});
 assert.equal(missing.status,400);assert.match((await missing.json()).error,/豆包语音 Key/);
 const generation=post({op:'generate_voice',code,eventId,ai},host.token);
 await new Promise(r=>setTimeout(r,120));await post({op:'join',code,name:'Guest2'});
 const result=await generation;
 assert.ok(result.state.events[0].voice.ready);
 assert.equal((logs.match(/MOCK_VOLC_CALL/g)||[]).length,1,'CAS retry must not synthesize twice');
 for(const player of [host,guest]){
  const room=await fetch(`${base}/api/room?code=${code}`,{headers:{'X-Room-Token':player.token}}).then(r=>r.json());
  assert.ok(!JSON.stringify(room).includes(VOICE_KEY),'speech key must not reach the client');
  assert.ok(!JSON.stringify(room).includes('MP3:'),'audio bytes must stay server-side');
  const audio=await fetch(`${base}/api/room?code=${code}&voice=${eventId}`,{headers:{'X-Room-Token':player.token}});
  assert.equal(audio.status,200);
  assert.equal(audio.headers.get('content-type'),'audio/mpeg');
  assert.equal(audio.headers.get('cache-control'),'private, no-store');
  const text=Buffer.from(await audio.arrayBuffer()).toString();
  assert.ok(text.startsWith('MP3:zh_female_vv_uranus_bigtts:'),text);
 }
 const denied=await fetch(`${base}/api/room?code=${code}&voice=${eventId}`,{headers:{'X-Room-Token':'invalid'}});
 assert.equal(denied.status,400);
 // The one-shot probe answers "does my voice key actually speak" without a game event.
 const probe=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'test_voice',ai})});
 assert.equal(probe.status,200);
 const probed=await probe.json();
 assert.equal(probed.provider,'火山方舟');assert.equal(probed.speaker,'zh_female_vv_uranus_bigtts');
 assert.equal(probed.mime,'audio/mpeg');assert.ok(probed.data.length>0);
 const badProbe=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'test_voice',ai:{...ai,voiceKey:'short'}})});
 assert.equal(badProbe.status,400);assert.match((await badProbe.json()).error,/豆包语音 Key/);
 const failedProbe=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'test_voice',ai:{...ai,voiceKey:'ark-wrong-key-000000000'}})});
 assert.equal(failedProbe.status,400);assert.match((await failedProbe.json()).error,/豆包语音接口返回 401/);
 const badKey=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':host.token},body:JSON.stringify({op:'generate_voice',code,eventId:result.state.events.at(-1).id,ai:{...ai,voiceKey:'ark-wrong-key-000000000'}})});
 assert.equal(badKey.status,400);assert.match((await badKey.json()).error,/豆包语音接口返回 401/);
 assert.ok(!logs.includes(VOICE_KEY),'server logs must not contain the speech key');
 console.log('PASS: Ark rooms synthesize through Volcengine speech, share mp3 with authenticated players, and keep both key and audio out of client payloads and logs.');
}finally{child.kill('SIGTERM');}
