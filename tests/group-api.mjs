import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const port=30000+Math.floor(Math.random()*20000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,NODE_ENV:'test',DB_DRIVER:'memory',PORT:String(port)},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
async function post(body,token){const r=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
async function state(code,p){const r=await fetch(`${base}/api/room?code=${code}`,{headers:{'X-Room-Token':p.token}});const data=await r.json();assert.equal(r.status,200);return data;}
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 const a=await post({op:'create',name:'Alice'}),code=a.state.code,b=await post({op:'join',code,name:'Bob'}),c=await post({op:'join',code,name:'Chen'}),d=await post({op:'join',code,name:'Dana'}),e=await post({op:'join',code,name:'Eve'});
 const make=await post({op:'create_group',code,name:'线索',members:[b.state.me.id,c.state.me.id]},a.token),group=make.state.groups[0];assert.ok(group);
 await post({op:'chat',code,groupId:group.id,text:'group-only-before-invite'},a.token);
 const before=await state(code,d);assert.ok(before.chatActivity.some(x=>x.text.includes('Alice')&&x.text.includes('Bob')&&x.text.includes('Chen')));assert.ok(!JSON.stringify(before).includes('group-only-before-invite'));
 const reject=await fetch(`${base}/api/room`,{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':e.token},body:JSON.stringify({op:'chat',code,groupId:group.id,text:'unauthorized'})});assert.equal(reject.status,400);
 await post({op:'invite_group',code,groupId:group.id,members:[d.state.me.id]},b.token);const invited=await state(code,d);assert.ok(invited.groups.some(x=>x.id===group.id));assert.ok(!JSON.stringify(invited).includes('group-only-before-invite'));
 await post({op:'chat',code,groupId:group.id,text:'group-only-after-invite'},d.token);for(const member of [a,b,c,d])assert.ok((await state(code,member)).messages.some(m=>m.text==='group-only-after-invite'));
 const outsider=await state(code,e);assert.ok(!JSON.stringify(outsider).includes('group-only-after-invite'));assert.ok(outsider.chatActivity.some(x=>x.text.includes('Dana')));
 await post({op:'leave_group',code,groupId:group.id},b.token);assert.ok(!(await state(code,b)).groups.some(x=>x.id===group.id));
 const pairState=await post({op:'create_group',code,name:'双人',members:[e.state.me.id]},a.token),pair=pairState.state.groups.find(x=>x.name==='双人');assert.ok(pair&&pair.members.length===2);
 await post({op:'chat',code,groupId:pair.id,text:'two-player-only'},e.token);
 assert.ok((await state(code,a)).messages.some(m=>m.text==='two-player-only'));assert.ok(!JSON.stringify(await state(code,d)).includes('two-player-only'));
 await post({op:'invite_group',code,groupId:pair.id,members:[d.state.me.id]},a.token);assert.ok(!JSON.stringify(await state(code,d)).includes('two-player-only'));
 assert.ok(!logs.includes('group-only-before-invite'));assert.ok(!logs.includes('group-only-after-invite'));assert.ok(!logs.includes('two-player-only'));
 console.log('PASS: HTTP group creation, visibility to nonmembers, invitation without history leak, shared messages and leave.');
}finally{child.kill('SIGTERM');}
