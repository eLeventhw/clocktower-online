// The table is kept in sync by a server-sent event stream, not by a poll loop: a write
// fans out to every connected player immediately.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=30000+Math.floor(Math.random()*20000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,NODE_ENV:'test',DB_DRIVER:'memory',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
async function post(body,token){const r=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
function open(code,token){
 const controller=new AbortController();const frames=[];
 const ready=fetch(`${base}/api/room/stream?code=${code}`,{headers:{'X-Room-Token':token},signal:controller.signal}).then(async response=>{
  return {response,reader:response.body.getReader()};
 });
 const pump=async()=>{
  const {response,reader}=await ready;const decoder=new TextDecoder();let buffer='';
  for(;;){const {done,value}=await reader.read();if(done)return;buffer+=decoder.decode(value,{stream:true});let index;
   while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);const line=frame.split('\n').find(part=>part.startsWith('data: '));if(!line)continue;try{frames.push(JSON.parse(line.slice(6)));}catch{}}}
 };
 const pumping=pump().catch(()=>{});
 const until=async(predicate,what)=>{
  const started=Date.now();
  for(;;){const hit=frames.find(predicate);if(hit)return hit;if(Date.now()-started>2000)throw new Error(`timed out waiting for ${what} (frames=${frames.length})`);await new Promise(r=>setTimeout(r,10));}
 };
 return {ready,until,close:()=>{controller.abort();return pumping;}};
}
try{
 let up=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(up,logs);
 const host=await post({op:'create',name:'Host'}),code=host.state.code;
 const guest=await post({op:'join',code,name:'Guest'});

 const stream=open(code,guest.token);
 const first=await stream.ready;
 assert.equal(first.response.status,200);
 assert.match(first.response.headers.get('content-type')||'',/text\/event-stream/);
 const initial=await stream.until(()=>true,'the initial snapshot');
 assert.equal(initial.players.length,2);
 assert.equal(initial.me.name,'Guest');

 // A write by another player arrives as a push, with no polling request from the guest.
 await post({op:'chat',code,text:'夜色很深'},host.token);
 const pushed=await stream.until(frame=>frame.messages?.some(message=>message.text==='夜色很深'),'the pushed chat message');
 assert.equal(pushed.me.name,'Guest');
 assert.equal(pushed.code,code);
 stream.close();

 // The stream is authenticated exactly like the room endpoint.
 const bad=await fetch(`${base}/api/room/stream?code=${code}`,{headers:{'X-Room-Token':'nope'}});
 assert.equal(bad.status,400);
 assert.match((await bad.json()).error,/身份凭证/);
 const missing=await fetch(`${base}/api/room/stream?code=ZZZZZZ`,{headers:{'X-Room-Token':guest.token}});
 assert.equal(missing.status,400);

 // The client learns which provider and voice are configured without seeing any key.
 const config=await (await fetch(`${base}/api/config`)).json();
 assert.equal(config.hasTextKey,false,'test servers never load .env');
 assert.match(config.speaker,/lingling_uranus_bigtts/);
 assert.ok(!JSON.stringify(config).toLowerCase().includes('ark-'));
 console.log('PASS: room state is pushed over SSE (initial snapshot + instant fan-out), the stream enforces the room token, and /api/config exposes defaults without keys.');
}finally{child.kill('SIGTERM');}
