import assert from 'node:assert/strict';
import {perform,view} from '../server-dist/game.js';
// A room document written by the previous release: nine-role pool, simultaneous
// night, no rulesVersion/night/chat fields. Loading it must never re-deal roles.
const stored={code:'OLD234',hostId:'p1',phase:'night',round:1,poisonedId:null,
 players:[
  {id:'p1',token:'tok-host',name:'A',role:'chef',alive:true,ghostVote:true,usedSlayer:false},
  {id:'p2',token:'tok-2',name:'B',role:'empath',alive:true,ghostVote:true,usedSlayer:false},
  {id:'p3',token:'tok-3',name:'C',role:'poisoner',alive:true,ghostVote:true,usedSlayer:false},
  {id:'p4',token:'tok-4',name:'D',role:'imp',alive:true,ghostVote:true,usedSlayer:false},
  {id:'p5',token:'tok-5',name:'E',role:'soldier',alive:true,ghostVote:true,usedSlayer:false}],
 actions:{},events:[{id:'e1',text:'游戏开始。夜幕降临，请查看你的秘密身份。',at:Date.now()}],privateEvents:{},messages:[],
 ballot:null,nominated:[],nominators:[],leader:null,readyDay:[],lastExecuted:null,winner:null,agent:'规则主持'};
const snapshot=JSON.stringify(stored);
const g=JSON.parse(snapshot);const roleOf=id=>g.players.find(p=>p.id===id).role;

// The legacy room keeps its own night mode and its own identities.
for(const p of g.players){
 const s=view(g,p.token);
 assert.equal(s.nightProgress.mode,'legacy');
 assert.equal(s.me.roleKey,p.role);
 assert.ok(s.players.every(q=>!('role' in q)));
}
assert.equal(view(g,'tok-host').nightProgress.mode,'legacy');
// A started room cannot be re-started, so roles can never be dealt twice.
await assert.rejects(()=>perform(g,'tok-host','start',{}),/游戏已经开始/);
await assert.rejects(()=>perform(g,'tok-host','advance_night',{}),/当前不能推进夜间/);

// Only the legacy eligible roles act, and the simultaneous flow still resolves.
const acting=g.players.filter(p=>view(g,p.token).me.canAct).map(p=>p.role).sort();
assert.deepEqual(acting,['poisoner']);
await perform(g,'tok-3','night_action',{targets:['p2']});
await perform(g,'tok-host','resolve_night',{ai:{}});
assert.equal(g.phase,'day');
assert.equal(g.rulesVersion,undefined,'a legacy room must not be upgraded in place');
assert.equal(g.night,undefined);
assert.deepEqual(g.players.map(p=>p.role),['chef','empath','poisoner','imp','soldier']);

// Legacy private messaging keeps working, including the one-to-one filter.
await perform(g,'tok-host','chat',{text:'老房间的悄悄话',to:'p2'});
assert.equal(view(g,'tok-2').messages.length,1);
assert.equal(view(g,'tok-5').messages.length,0);
await perform(g,'tok-host','chat',{text:'老房间的公开消息'});
assert.ok(view(g,'tok-5').messages.some(m=>m.text==='老房间的公开消息'));

// A legacy room already in day 2 with a live ballot survives a reload unchanged.
const day={...JSON.parse(snapshot),phase:'day',round:2,lastExecuted:'p5',
 players:JSON.parse(snapshot).players.map(p=>p.id==='p5'?{...p,alive:false}:p),
 ballot:{nominator:'p1',nominee:'p4',votes:{'p1':true,'p2':true}},leader:null};
await perform(day,'tok-host','close_vote',{});
assert.equal(day.leader.votes,2);
assert.equal(day.phase,'day');
assert.deepEqual(day.players.map(p=>p.role),['chef','empath','poisoner','imp','soldier']);
await perform(day,'tok-host','end_day',{});
assert.ok(['night','ended'].includes(day.phase));
if(day.phase==='night')assert.equal(day.night,undefined,'legacy rooms keep the simultaneous night');
console.log('PASS: previously stored rooms keep their assigned roles, simultaneous night, chat and voting; no in-place re-deal or rules upgrade.');
