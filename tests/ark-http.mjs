// End-to-end check of the metered Volcengine Ark path over the real HTTP server.
// tests/mock-ark.mjs replaces only https://ark.cn-beijing.volces.com/api/v3/chat/completions,
// so a wrong key or an unknown model ID fails exactly like the live service.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=30000+Math.floor(Math.random()*20000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','./tests/mock-ark.mjs','server/index.mjs'],{env:{...process.env,NODE_ENV:'test',DB_DRIVER:'memory',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const KEY='ark-metered-test-key-9f3c';
async function call(body,token){const r=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
async function ok(body,token){const j=await call(body,token);if(j.status!==200)throw new Error(j.error);return j;}
async function state(code,token){const r=await fetch(`${base}/api/room?code=${code}`,{headers:{'X-Room-Token':token}});return r.json();}
const ai=extra=>({key:KEY,provider:'ark',model:'doubao-seed-2-1-lite-260915',...extra});
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 const host=await ok({op:'create',name:'Host'}),code=host.state.code;
 const guest=await ok({op:'join',code,name:'Guest'});

 // 1. A metered key plus a model ID drives the storyteller, and the room records
 //    which provider actually answered.
 const first=await ok({op:'narrate',code,ai:ai()},host.token);
 assert.equal(first.state.agent,'火山方舟');
 assert.match(first.state.events.at(-1).text,/^说书人：雾从钟楼漫下来/);

 // 2. Inference access-point IDs (ep-…) are accepted as a model identifier too.
 const second=await ok({op:'narrate',code,ai:ai({model:'ep-20261103-abcdef'})},host.token);
 assert.equal(second.state.events.filter(e=>e.text.startsWith('说书人：')).length,2);

 // 3. Live-style failures surface as readable 400s, never as a 500 or a stack trace.
 const badKey=await call({op:'narrate',code,ai:ai({key:'sk-dashscope-looking-key'})},host.token);
 assert.equal(badKey.status,400);assert.match(badKey.error,/火山方舟 API 返回 401/);assert.ok(!badKey.error.includes('sk-dashscope-looking-key'));
 const badModel=await call({op:'narrate',code,ai:ai({model:'doubao-does-not-exist'})},host.token);
 assert.equal(badModel.status,400);assert.match(badModel.error,/火山方舟 API 返回 404/);
 // The exact bug the host hit: the dotted shorthand 404s, and the error must name the
 // real ID format instead of leaving them guessing.
 const dotted=await call({op:'narrate',code,ai:ai({model:'doubao-seed-2.1-lite'})},host.token);
 assert.equal(dotted.status,400);assert.match(dotted.error,/InvalidEndpointOrModel.NotFound/);assert.match(dotted.error,/doubao-seed-2-1-lite-260915/);
 const noModel=await call({op:'narrate',code,ai:ai({model:''})},host.token);
 assert.equal(noModel.status,400);assert.match(noModel.error,/请填写有效的火山方舟模型 ID/);
 const shortKey=await call({op:'narrate',code,ai:ai({key:'abc'})},host.token);
 assert.equal(shortKey.status,400);assert.match(shortKey.error,/请填写有效的 火山方舟 API Key/);

 // 4. The standalone probe lets the host verify the configuration before a game.
 const probe=await call({op:'test_ai',ai:ai()});
 assert.equal(probe.status,200);assert.equal(probe.provider,'火山方舟');assert.equal(probe.model,'doubao-seed-2-1-lite-260915');assert.match(probe.sample,/雾从钟楼/);
 const probeBad=await call({op:'test_ai',ai:ai({model:'doubao-seed-2.1-lite'})});
 assert.equal(probeBad.status,400);assert.match(probeBad.error,/doubao-seed-2-1-lite-260915/);
 assert.ok(!JSON.stringify(probe).includes(KEY),'probe must not echo the key');

 // 5. Only the host may spend the key, and voice stays on the DashScope provider.
 const guestNarrate=await call({op:'narrate',code,ai:ai()},guest.token);
 assert.equal(guestNarrate.status,400);assert.match(guestNarrate.error,/只有房主/);
 const eventId=host.state.events[0].id;
 const arkVoice=await call({op:'generate_voice',code,eventId,ai:ai(),voice:'Cherry'},host.token);
 assert.equal(arkVoice.status,400);assert.match(arkVoice.error,/豆包语音 Key/);

 // 6. The key lives only in the request body: no view and no log line carries it.
 for(const player of [host,guest]){
  const room=await state(code,player.token);
  assert.ok(!JSON.stringify(room).includes(KEY),'room view must not echo the API key');
  assert.equal(room.agent,'火山方舟');
 }
 assert.ok(!logs.includes(KEY),'server logs must not contain the API key');
 assert.ok(!logs.includes('sk-dashscope-looking-key'));
 console.log('PASS: Ark metered key narrates end to end, rejects bad keys/models with readable 400s, refuses voice, and never echoes the key into views or logs.');
}finally{child.kill('SIGTERM');}
