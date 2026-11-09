import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const port=30000+Math.floor(Math.random()*20000);
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,NODE_ENV:'test',DB_DRIVER:'memory',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;
async function request(body,token){const r=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j;}
async function get(code,token){const r=await fetch(`${base}/api/room?code=${code}`,{headers:{'X-Room-Token':token}});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
// New rooms use the ordered night scheduler: the host advances stage by stage.
async function playNight(code,users,host){
 for(let step=0;step<40;step++){
  const current=await get(code,host.token);
  if(current.phase!=='night')return current;
  if(current.nightProgress.mode!=='ordered')throw new Error('new rooms must use the ordered night flow');
  if(current.nightProgress.readyToAdvance){await request({op:'advance_night',code,ai:{}},host.token);continue;}
  const states=[];for(const u of users)states.push({u,s:await get(code,u.token)});
  const actor=states.find(x=>x.s.me.canAct&&!x.s.me.actionSubmitted);assert.ok(actor,'ordered night stalled with no actor');
  const others=actor.s.players.filter(p=>p.id!==actor.s.me.id);
  const targets=actor.s.me.roleKey==='fortune'?[actor.s.me.id,others[0].id]:[others[0].id];
  await request({op:'night_action',code,targets},actor.u.token);
 }
 throw new Error('night did not finish');
}
try{
 let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(base);if(r.ok){assert.match(await r.text(),/钟楼纪事/);ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw new Error(`Server did not start: ${logs}`);
 const html=await readFile('web-build/index.html','utf8');const boot=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(boot,'sharecode-aware bootstrap missing');const added=[];const context={location:{search:'?sharecode=TEST123&room=ABC234',origin:'https://example.test'},URL,URLSearchParams,document:{createElement(tag){return{tag}},head:{appendChild(el){added.push(el)}}}};vm.runInNewContext(boot[1],context);assert.equal(added.length,2);for(const x of added){const u=new URL(x.href||x.src);assert.equal(u.searchParams.get('sharecode'),'TEST123');assert.ok(u.pathname.startsWith('/assets/'));}
 const host=await request({op:'create',name:'Host'}), code=host.state.code;const users=[host];
 for(let i=2;i<=5;i++)users.push(await request({op:'join',code,name:`P${i}`}));
 const invalid=await fetch(`${base}/api/room?code=${code}`,{headers:{'X-Room-Token':'invalid'}});assert.equal(invalid.status,400);
 const started=await request({op:'start',code},host.token);assert.equal(started.state.phase,'night');
 const states=[];for(const u of users)states.push(await get(code,u.token));
 for(const s of states){assert.ok(s.me.role);assert.ok(s.players.every(p=>!('role' in p)));assert.ok(!JSON.stringify(s).includes(users[0].token));}
 // At most one player may act at a time in a new room; a stage with no actor is skipped.
 assert.ok(states.filter(s=>s.me.canAct).length<=1);
 const morning=await playNight(code,users,host);assert.equal(morning.phase,'day');
 assert.equal(morning.day.stage,'whisper','白天从私聊环节开始');
 const recipient=states[1].me.id;await request({op:'chat',code,text:'only first two players',to:recipient},host.token);
 assert.equal((await get(code,users[1].token)).messages.length,1);assert.equal((await get(code,users[2].token)).messages.length,0);
 // Whispers close, the speeches run, then free discussion opens nominations.
 await request({op:'end_whisper',code},host.token);
 for(let i=0;i<6;i++){const s=await get(code,host.token);if(s.day.stage!=='speech')break;await request({op:'end_speech',code},host.token);}
 assert.equal((await get(code,host.token)).day.stage,'discussion');
 const target=states[4].me.id;await request({op:'nominate',code,target},host.token);
 // A nomination is a statement, a defense, then a timed vote. The host can press either
 // beat for a player who has not clicked yet.
 assert.equal((await get(code,host.token)).ballot.stage,'accuse');
 await request({op:'advance_ballot',code},host.token);
 await request({op:'advance_ballot',code},host.token);
 assert.equal((await get(code,host.token)).ballot.stage,'vote');
 // The server closes the ballot as soon as the last eligible voter has voted, in that
 // same request; the host button stays as an override.
 let lastVote=null;for(const u of users)lastVote=await request({op:'vote',code,yes:true},u.token);
 assert.equal(lastVote.state.ballot,null,'ballot closes itself once everyone voted');
 assert.equal(lastVote.state.leader.votes,5);
 const finished=await request({op:'end_day',code},host.token);assert.ok(['night','ended'].includes(finished.state.phase));
 console.log('PASS: built frontend, create/join, identity isolation, ordered 5-player night, private chat, nomination, voting, day transition.');
}finally{child.kill('SIGTERM');}
