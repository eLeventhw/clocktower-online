import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view,ROLE_INFO} from '../server-dist/game.js';
import {createPublicEventTracker} from '../server-dist/voiceEvents.js';

async function fixture(roles){
 const {g,p}=newGame('ABC234','P0');const players=[p];for(let i=1;i<roles.length;i++)players.push(joinGame(g,`P${i}`));
 await perform(g,p.token,'start',{});g.players.forEach((q,i)=>q.role=roles[i]);g.privateEvents={};g.events=[];g.poisonedId=null;g.pendingDemonId=null;
 return {g,players,host:p};
}
const advance=(g,h,ai={})=>perform(g,h.token,'advance_night',{ai});
const action=(g,p,targets)=>perform(g,p.token,'night_action',{targets:targets.map(q=>q.id)});

// Poisoner -> Spy -> first-night information -> Fortune Teller, with no public role disclosure.
{
 const {g,players:p,host}=await fixture(['poisoner','spy','washerwoman','investigator','chef','empath','fortune','imp']);
 const states=p.map(q=>view(g,q.token));assert.equal(states.filter(s=>s.me.canAct).length,1);assert.equal(states[0].me.canAct,true);assert.equal(states[6].me.canAct,false);assert.equal(states[0].nightProgress.readyToAdvance,false);
 await assert.rejects(()=>action(g,p[6],[p[0],p[7]]),/还没有轮到/);
 await assert.rejects(()=>advance(g,p[1]),/只有房主/);
 await action(g,p[0],[p[2]]);assert.equal(view(g,host.token).nightProgress.readyToAdvance,true);
 let calls=0;const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_url,request)=>{calls++;const body=JSON.parse(request.body);const prompt=body.messages[1].content;assert.ok(!prompt.includes(p[0].token));let result='钟声响起，黎明到来。';if(prompt.includes('可用选项：'))result=prompt.split('可用选项：')[1].split('。请选择一个选项。')[0].split(' | ')[0];return new Response(JSON.stringify({choices:[{message:{content:result}}]}),{status:200,headers:{'Content-Type':'application/json'}})};
 try{
  const ai={key:'mock-key-1234',region:'beijing',model:'qwen-plus'};
  await advance(g,host,ai);assert.equal(g.phase,'night');assert.equal(view(g,p[6].token).me.canAct,true);assert.equal(view(g,p[0].token).me.canAct,false);
  const spyView=view(g,p[1].token);assert.ok(spyView.privateEvents.some(n=>n.text.includes('魔典：')));assert.ok(!view(g,p[0].token).privateEvents.some(n=>n.text.includes('魔典：')));
  for(const s of p.map(q=>view(g,q.token))){assert.ok(s.players.every(q=>!('role' in q)));assert.ok(!('poisonedId' in s));assert.ok(!JSON.stringify(s).includes(p[0].token));}
  assert.ok(view(g,p[2].token).privateEvents.some(n=>n.text.startsWith('线索：')));assert.ok(view(g,p[3].token).privateEvents.some(n=>n.text.startsWith('线索：')));
  await action(g,p[6],[p[0],p[7]]);await advance(g,host,ai);assert.equal(g.phase,'day');assert.match(view(g,p[6].token).privateEvents.at(-1).text,/存在恶魔：是/);assert.equal(calls,2);assert.equal(g.agent,'Qwen');
 }finally{globalThis.fetch=originalFetch;}
}

// Scarlet Woman takes over when the Demon dies with at least five alive;
// the successor is informed at the next night's Scarlet Woman step, before the Imp acts.
{
 const {g,players:p,host}=await fixture(['slayer','imp','scarlet','empath','monk']);g.phase='day';
 await perform(g,p[0].token,'slayer',{target:p[1].id});assert.equal(p[1].alive,false);assert.equal(p[2].role,'imp');assert.equal(view(g,p[2].token).me.roleKey,'scarlet');assert.equal(g.phase,'day');
 await perform(g,host.token,'end_day',{});assert.equal(g.round,2);await advance(g,host);assert.equal(view(g,p[4].token).me.canAct,true);
 await action(g,p[4],[p[0]]);await advance(g,host);assert.equal(view(g,p[2].token).me.roleKey,'imp');assert.ok(view(g,p[2].token).privateEvents.some(n=>n.text.includes('变为小恶魔')));assert.equal(view(g,p[2].token).me.canAct,true);
 await action(g,p[2],[p[0]]);await advance(g,host);assert.equal(g.phase,'day');assert.equal(p[0].alive,true); // Monk protection
}
for(const condition of ['four_alive','poisoned']){
 const {g,players:p}=await fixture(['slayer','imp','scarlet','empath','monk']);g.phase='day';if(condition==='four_alive')p[4].alive=false;else g.poisonedId=p[2].id;
 await perform(g,p[0].token,'slayer',{target:p[1].id});assert.equal(g.phase,'ended');assert.equal(g.winner,'善良阵营');assert.equal(p[2].role,'scarlet');
}

// A night death changes the internal rules immediately but is not publicly visible until dawn.
{
 const {g,players:p,host}=await fixture(['poisoner','monk','imp','fortune','empath']);g.phase='day';await perform(g,host.token,'end_day',{});await advance(g,host);
 await action(g,p[0],[p[4]]);await advance(g,host);await action(g,p[1],[p[3]]);await advance(g,host);
 await action(g,p[2],[p[4]]);await advance(g,host);assert.equal(p[4].alive,false);assert.equal(g.phase,'night');
 for(const q of p)assert.equal(view(g,q.token).players.find(x=>x.id===p[4].id).alive,true);
 assert.equal(view(g,p[3].token).me.canAct,true);await action(g,p[3],[p[0],p[2]]);await advance(g,host);assert.equal(g.phase,'day');assert.equal(view(g,host.token).players.find(x=>x.id===p[4].id).alive,false);
}

// Existing rooms use their original simultaneous night flow, not the new ordered scheduler.
{
 const {g,players:p,host}=await fixture(['poisoner','fortune','imp','chef','empath']);delete g.rulesVersion;delete g.night;
 assert.equal(view(g,p[0].token).nightProgress.mode,'legacy');assert.equal(view(g,p[1].token).me.canAct,true);
 await action(g,p[0],[p[4]]);await action(g,p[1],[p[0],p[2]]);await perform(g,host.token,'resolve_night',{ai:{}});assert.equal(g.phase,'day');
}

// Voice event selection only consumes the public event array and never replays old events.
{
 const track=createPublicEventTracker();assert.deepEqual(track({code:'A',events:[{id:'1',text:'old'}],privateEvents:[{id:'secret',text:'秘密身份'}]}),[]);
 const next=track({code:'A',events:[{id:'1',text:'old'},{id:'2',text:'天亮了'}],privateEvents:[{id:'secret2',text:'魔典'}],messages:[{text:'私聊'}]});assert.deepEqual(next,[{id:'2',text:'天亮了'}]);
 assert.deepEqual(track({code:'A',events:[{id:'1',text:'old'},{id:'2',text:'天亮了'}]}),[]);assert.deepEqual(track({code:'B',events:[{id:'3',text:'existing'}]}),[]);
}
assert.equal(ROLE_INFO.spy.team,'邪恶');assert.equal(ROLE_INFO.scarlet.team,'邪恶');assert.equal(ROLE_INFO.washerwoman.team,'善良');
console.log('PASS: ordered nights; first-night information; Spy privacy; poisoned Qwen choice (mock); Scarlet Woman succession thresholds; hidden night death; legacy rooms; public-only voice event queue.');
