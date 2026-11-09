import assert from 'node:assert/strict';
import {newGame,joinGame,perform,view} from '../server-dist/game.js';
const OUT=new Set(['butler','drunk','recluse','saint']);
async function fixture(roles){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<roles.length;i++)joinGame(g,`P${i}`);await perform(g,host.token,'start',{});
 g.players.forEach((p,i)=>{p.role=roles[i];p.drunkRole=null;p.alive=true;p.usedSlayer=false;p.ghostVote=true;});g.events=[];g.privateEvents={};g.actions={};g.poisonedId=null;g.butlerMasterId=null;g.phase='night';g.round=1;g.night={cursor:0,nonce:crypto.randomUUID(),protectedId:null,deathId:null};
 return {g,p:g.players,host};
}
// Base outsider counts; a Baron setup adds two more. Every run must still have
// exactly one Imp and no duplicate characters.
const DEMONS=new Set(['imp','fanggu','nodashii']);const baronRuns=[0,0];const demonRuns=new Map();
for(const [n,count] of [[5,0],[6,1],[7,1],[8,1],[9,2]])for(let run=0;run<60;run++){
 const {g,p:host}=newGame('ABC234','P0');for(let i=1;i<n;i++)joinGame(g,`P${i}`);await perform(g,host.token,'start',{});
 const hasBaron=g.players.some(p=>p.role==='baron');if(hasBaron)baronRuns[0]++;
 const demonRole=g.players.find(p=>DEMONS.has(p.role))?.role;demonRuns.set(demonRole,(demonRuns.get(demonRole)||0)+1);
 assert.equal(g.players.filter(p=>OUT.has(p.role)).length,Math.min(count+(hasBaron?2:0)+(demonRole==='fanggu'?1:0),4));
 assert.equal(g.players.filter(p=>DEMONS.has(p.role)).length,1);
 const shown=g.players.map(p=>p.role==='drunk'?p.drunkRole:p.role);assert.equal(new Set(shown).size,n);
 const drunk=g.players.find(p=>p.role==='drunk');if(drunk){const self=view(g,drunk.token);assert.equal(self.me.roleKey,drunk.drunkRole);assert.notEqual(self.me.roleKey,'drunk');assert.ok(!JSON.stringify(self).includes('drunkRole'));}
}
assert.ok(baronRuns[0]>0,'多次开局应出现男爵配置');
for(const d of DEMONS)assert.ok((demonRuns.get(d)||0)>0,`三种恶魔都应出现（${[...demonRuns].map(([k,v])=>`${k}:${v}`).join(' ')}）`);
console.log(`PASS: outsider setup across ${baronRuns[0]} Baron runs; demons ${[...demonRuns].map(([k,v])=>`${k}:${v}`).join(' ')}`);
// The Butler chooses anyone except themselves and the choice is private.
{
 const {g,p,host}=await fixture(['butler','imp','poisoner','empath','monk','soldier']);g.night.cursor=8;
 assert.equal(view(g,p[0].token).me.canAct,true);await assert.rejects(()=>perform(g,p[0].token,'night_action',{targets:[p[0].id]}),/其他玩家/);
 await perform(g,p[0].token,'night_action',{targets:[p[1].id]});await perform(g,host.token,'advance_night',{ai:{}});assert.equal(g.phase,'day');
 assert.equal(view(g,p[0].token).me.butlerMasterId,p[1].id);assert.equal(view(g,p[2].token).me.butlerMasterId,null);
}
async function ballot(g,p,host,{poisoned=false,dead=false,masterYes=false}={}){
 g.phase='day';g.ballot={nominator:p[2].id,nominee:p[1].id,votes:{[p[0].id]:true,[p[1].id]:masterYes,[p[2].id]:true,[p[3].id]:false,[p[4].id]:false,[p[5].id]:false}};g.butlerMasterId=p[1].id;g.poisonedId=poisoned?p[0].id:null;if(dead)p[0].alive=false;
 await perform(g,host.token,'close_vote',{});return g.events.at(-1).text;
}
for(const [opts,expected] of [[{},1],[{masterYes:true},3],[{poisoned:true},2],[{dead:true},2]]){
 const {g,p,host}=await fixture(['butler','imp','poisoner','empath','monk','soldier']);const text=await ballot(g,p,host,opts);assert.ok(text.includes(`获得 ${expected} 票`),text);if(opts.dead)assert.equal(p[0].ghostVote,false);
}
// Saint execution loses only if their ability is active. Night deaths do not trigger the ability.
for(const poisoned of [false,true]){
 const {g,p,host}=await fixture(['empath','saint','imp','poisoner','monk','soldier']);g.phase='day';g.leader={id:p[1].id,votes:4,tie:false};g.poisonedId=poisoned?p[1].id:null;
 await perform(g,host.token,'end_day',{});assert.equal(g.phase,poisoned?'night':'ended');if(!poisoned)assert.equal(g.winner,'邪恶阵营');
}
{
 const {g,p,host}=await fixture(['empath','saint','imp','poisoner','monk','soldier']);g.round=2;g.night.cursor=4;g.actions[p[2].id]=[p[1].id];await perform(g,host.token,'advance_night',{});assert.equal(p[1].alive,false);assert.notEqual(g.phase,'ended');
}
// Drunk gets their fake role and unreliable information, never the real character.
{
 const {g,p,host}=await fixture(['drunk','recluse','imp','poisoner','monk','soldier']);p[0].drunkRole='empath';g.night.cursor=5;
 const old=globalThis.fetch;globalThis.fetch=async(_url,req)=>{const body=JSON.parse(req.body);if(!body.messages[1].content.includes('候选信息：'))return Response.json({choices:[{message:{content:'天亮了。'}}]});assert.match(body.messages[0].content,/受到干扰/);const options=body.messages[1].content.split('候选信息：')[1].split('。请选择一条。')[0].split(' | ');return Response.json({choices:[{message:{content:options[0]}}]});};
 try{await perform(g,host.token,'advance_night',{ai:{key:'mock-key-123',region:'aliyun'}});}finally{globalThis.fetch=old;}
 assert.equal(view(g,p[0].token).me.roleKey,'empath');assert.match(view(g,p[0].token).privateEvents[0].text,/邪恶人数为 [012]/);assert.equal(view(g,p[1].token).privateEvents.length,0);
}
// A Drunk who thinks they are Monk cannot protect, a fake Soldier is not immune, and a fake Slayer cannot kill.
{
 const {g,p,host}=await fixture(['drunk','imp','poisoner','empath','soldier','monk']);p[5].role='investigator';p[0].drunkRole='monk';g.round=2;g.night.cursor=1;
 await perform(g,p[0].token,'night_action',{targets:[p[3].id]});await perform(g,host.token,'advance_night',{});assert.equal(g.night.protectedId,null);
}
{
 const {g,p,host}=await fixture(['drunk','imp','poisoner','empath','monk','investigator']);p[0].drunkRole='soldier';g.round=2;g.night.cursor=4;g.actions[p[1].id]=[p[0].id];await perform(g,host.token,'advance_night',{});assert.equal(p[0].alive,false);
}
{
 const {g,p,host}=await fixture(['drunk','imp','poisoner','empath','monk','soldier']);p[0].drunkRole='slayer';g.phase='day';await perform(g,p[0].token,'slayer',{target:p[1].id});assert.equal(p[1].alive,true);assert.equal(p[0].usedSlayer,true);
}
// Recluse registration varies; poison removes that misleading registration.
for(const poisoned of [false,true]){
 const seen=new Set();
 for(let run=0;run<60;run++){
  const {g,p,host}=await fixture(['fortune','recluse','imp','poisoner','monk','soldier']);g.redHerringId=null;g.night.cursor=6;g.actions[p[0].id]=[p[1].id,p[5].id];g.poisonedId=poisoned?p[1].id:null;
  await perform(g,host.token,'advance_night',{});seen.add(view(g,p[0].token).privateEvents[0].text.endsWith('是。')?'yes':'no');
 }
 assert.ok(seen.has('no'));assert.equal(seen.has('yes'),!poisoned);
}
// Complete first nights for many fresh multi-player setups, including random
// combinations of Butler, Drunk and all three Minions.
for(const n of [6,8,9])for(let run=0;run<35;run++){
 const {g,p:host}=newGame('ABC234','A0');for(let i=1;i<n;i++)joinGame(g,`A${i}`);await perform(g,host.token,'start',{});
 let steps=0;
 while(g.phase==='night'&&steps++<30){
  const hostView=view(g,host.token);
  if(hostView.nightProgress.readyToAdvance){await perform(g,host.token,'advance_night',{});continue;}
  const actor=g.players.find(x=>view(g,x.token).me.canAct&&!view(g,x.token).me.actionSubmitted);assert.ok(actor,'night stuck');
  const role=view(g,actor.token).me.roleKey;const others=g.players.filter(x=>x.id!==actor.id);
  const targets=role==='fortune'?[actor.id,others[0].id]:[others[0].id];
  await perform(g,actor.token,'night_action',{targets});
 }
 assert.equal(g.phase,'day');assert.ok(steps<30);const butler=g.players.find(x=>x.role==='butler');
 if(butler){assert.ok(g.butlerMasterId);assert.equal(view(g,butler.token).me.butlerMasterId,g.butlerMasterId);}
 for(const x of g.players)if(x!==butler)assert.equal(view(g,x.token).me.butlerMasterId,null);
}
console.log('PASS: outsider setup, hidden Drunk identity and inactive fake abilities, Butler selection and voting, Saint execution, Recluse registration and poison.');
