import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=30000+Math.floor(Math.random()*20000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','./tests/mock-tts.mjs','server/index.mjs'],{env:{...process.env,NODE_ENV:'test',DB_DRIVER:'memory',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
async function post(body,token){const r=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
async function state(code,token){const r=await fetch(`${base}/api/room?code=${code}`,{headers:{'X-Room-Token':token}});return r.json();}
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 const host=await post({op:'create',name:'Host'}),code=host.state.code,eventId=host.state.events[0].id;
 const firstGuest=await post({op:'join',code,name:'Guest'});
 const generation=post({op:'generate_voice',code,eventId,ai:{key:'mock-key-12345',region:'aliyun'},voice:'Cherry'},host.token);
 await new Promise(r=>setTimeout(r,120));const secondGuest=await post({op:'join',code,name:'Guest2'});
 const result=await generation;assert.equal(result.state.players.length,3);assert.ok(result.state.events[0].voice.ready);assert.ok(!JSON.stringify(result).includes('hidden-test-signature'));
 assert.equal((logs.match(/MOCK_TTS_CALL/g)||[]).length,1,'CAS retry must not synthesize twice');
 for(const u of [host,firstGuest,secondGuest]){
  const room=await state(code,u.token);assert.ok(room.events[0].voice.ready);assert.ok(!JSON.stringify(room).includes('hidden-test-signature'));
  const response=await fetch(`${base}/api/room?code=${code}&voice=${eventId}`,{headers:{'X-Room-Token':u.token}});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/wav');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[82,73,70,70]);
 }
 const denied=await fetch(`${base}/api/room?code=${code}&voice=${eventId}`,{headers:{'X-Room-Token':'invalid'}});assert.equal(denied.status,400);
 await post({op:'generate_voice',code,eventId,ai:{key:'mock-key-12345',region:'aliyun'},voice:'Cherry'},host.token);assert.equal((logs.match(/MOCK_TTS_CALL/g)||[]).length,1);
 assert.ok(!logs.includes('mock-key-12345'));assert.ok(!logs.includes('hidden-test-signature'));
 console.log('PASS: Qwen audio shared with authenticated players, CAS conflict retried without a second synthesis, signed URL/key absent from views and logs.');
}finally{child.kill('SIGTERM');}
